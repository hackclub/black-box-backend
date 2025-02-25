import { createHash } from 'crypto';
import { sql } from 'bun';

// Constants
const MAX_TEXT_SIZE = 128 * 1024; // 128KB in bytes

// Create table if it doesn't exist
async function initializeDatabase() {
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS permagen (
        permacode TEXT PRIMARY KEY,
        hash TEXT NOT NULL,
        txt TEXT NOT NULL
      )
    `;
    
    // Check if index exists before creating it
    const indexExists = await sql`
      SELECT 1 FROM pg_indexes WHERE indexname = 'idx_hash'
    `;
    
    if (indexExists.length === 0) {
      await sql`
        CREATE INDEX idx_hash ON permagen(hash)
      `;
    }
    
    console.log('Database initialized successfully');
  } catch (error) {
    console.error('Error initializing database:', error);
  }
}

// Initialize database
initializeDatabase();

// Rate limiting implementation
const rateLimits = {
  requests: {}, // IP -> [timestamp1, timestamp2, ...]
  lastCleanup: Date.now(),
};

// Clean up old rate limit entries every 10 minutes
const CLEANUP_INTERVAL = 10 * 60 * 1000; // 10 minutes
const RATE_LIMIT = 30; // 30 requests per minute
const RATE_WINDOW = 60 * 1000; // 1 minute in milliseconds

function checkRateLimit(ip) {
  const now = Date.now();
  
  // Clean up old entries if needed
  if (now - rateLimits.lastCleanup > CLEANUP_INTERVAL) {
    for (const ip in rateLimits.requests) {
      rateLimits.requests[ip] = rateLimits.requests[ip].filter(
        timestamp => now - timestamp < RATE_WINDOW
      );
      
      // Remove empty arrays
      if (rateLimits.requests[ip].length === 0) {
        delete rateLimits.requests[ip];
      }
    }
    rateLimits.lastCleanup = now;
  }
  
  // Initialize if this is a new IP
  if (!rateLimits.requests[ip]) {
    rateLimits.requests[ip] = [];
  }
  
  // Filter to only include requests within the rate window
  rateLimits.requests[ip] = rateLimits.requests[ip].filter(
    timestamp => now - timestamp < RATE_WINDOW
  );
  
  // Check if rate limit is exceeded
  if (rateLimits.requests[ip].length >= RATE_LIMIT) {
    return false;
  }
  
  // Add current request timestamp
  rateLimits.requests[ip].push(now);
  return true;
}

// Generate a 6-character hex color code
function generateColorCode() {
  // Generate a random 6-character hex string (0-9, a-f)
  const hexChars = '0123456789abcdef';
  let colorCode = '';
  
  for (let i = 0; i < 6; i++) {
    const randomIndex = Math.floor(Math.random() * hexChars.length);
    colorCode += hexChars[randomIndex];
  }
  
  return colorCode;
}

// Handle POST /permagen
async function handlePostPermagen(req) {
  try {
    // Get raw text from request
    const txt = await req.text();
    
    // Check text size
    const textSizeInBytes = new TextEncoder().encode(txt).length;
    if (textSizeInBytes > MAX_TEXT_SIZE) {
      return new Response(
        JSON.stringify({
          error: 'Text size exceeds the maximum limit of 128KB',
          sizeInBytes: textSizeInBytes,
          maxSizeInBytes: MAX_TEXT_SIZE
        }),
        { 
          status: 413, // Payload Too Large
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }
    
    // Hash the text
    const hash = createHash('sha256').update(txt).digest('hex');
    
    // Check if hash exists in database
    const existingEntry = await sql`
      SELECT permacode FROM permagen WHERE hash = ${hash}
    `;
    
    if (existingEntry.length > 0) {
      return new Response(
        JSON.stringify({
          permacode: existingEntry[0].permacode,
          exists: true
        }),
        { 
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }
    
    // Generate new color code as permacode
    let permacode;
    let existingPermacode;
    
    // Keep generating until we find an unused color code
    do {
      permacode = generateColorCode();
      existingPermacode = await sql`
        SELECT 1 FROM permagen WHERE permacode = ${permacode}
      `;
    } while (existingPermacode.length > 0);
    
    // Save to database
    await sql`
      INSERT INTO permagen (permacode, hash, txt) 
      VALUES (${permacode}, ${hash}, ${txt})
    `;
    
    return new Response(
      JSON.stringify({
        permacode,
        exists: false
      }),
      { 
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  } catch (error) {
    console.error('Error in POST /permagen:', error);
    return new Response(
      `Error: ${error.message}`,
      { 
        status: 500,
        headers: { 'Content-Type': 'text/plain' }
      }
    );
  }
}

// Handle GET /:permacode
async function handleGetPermacode(permacode) {
  try {
    // Get text from database
    const entry = await sql`
      SELECT txt FROM permagen WHERE permacode = ${permacode}
    `;
    
    if (entry.length === 0) {
      return new Response(
        'Permacode not found',
        { 
          status: 404,
          headers: { 'Content-Type': 'text/plain' }
        }
      );
    }
    
    return new Response(
      entry[0].txt,
      {
        status: 200,
        headers: { 'Content-Type': 'text/plain' }
      }
    );
  } catch (error) {
    console.error('Error in GET /:permacode:', error);
    return new Response(
      `Error: ${error.message}`,
      { 
        status: 500,
        headers: { 'Content-Type': 'text/plain' }
      }
    );
  }
}

// Create HTTP server
const server = Bun.serve({
  port: process.env.PORT || 3000,
  async fetch(req) {
    const url = new URL(req.url);
    const method = req.method;
    
    // Add CORS headers to all responses
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': '*',
      'Access-Control-Expose-Headers': '*',
      'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Max-Age': '86400',
    };
    
    // Handle preflight requests
    if (method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: corsHeaders
      });
    }
    
    // Get client IP for rate limiting
    const ip = req.headers.get('x-forwarded-for') || 'unknown-ip';
    
    // Check rate limit
    if (!checkRateLimit(ip)) {
      return new Response(
        'Rate limit exceeded. Try again later.',
        { 
          status: 429,
          headers: { 
            'Content-Type': 'text/plain',
            ...corsHeaders
          }
        }
      );
    }
    
    // Route handling
    if (method === 'POST' && url.pathname === '/permagen') {
      const response = await handlePostPermagen(req);
      // Add CORS headers to the response
      for (const [key, value] of Object.entries(corsHeaders)) {
        response.headers.set(key, value);
      }
      return response;
    } 
    else if (method === 'GET' && url.pathname.startsWith('/')) {
      // Extract permacode from the path (remove leading slash)
      const permacode = url.pathname.substring(1);
      
      // Skip if the path is empty or has additional segments
      if (!permacode || permacode.includes('/')) {
        return new Response(
          'Not Found',
          { 
            status: 404,
            headers: { 
              'Content-Type': 'text/plain',
              ...corsHeaders
            }
          }
        );
      }
      
      const response = await handleGetPermacode(permacode);
      // Add CORS headers to the response
      for (const [key, value] of Object.entries(corsHeaders)) {
        response.headers.set(key, value);
      }
      return response;
    }
    
    // Handle 404
    return new Response(
      'Not Found',
      { 
        status: 404,
        headers: { 
          'Content-Type': 'text/plain',
          ...corsHeaders
        }
      }
    );
  },
});

console.log(`🚀 Server is running at ${server.hostname}:${server.port}`);

