# Permagen HTTP Server

A simple HTTP server built with Bun that provides endpoints for generating and retrieving permanent codes for text content.

## Features

- Hash-based text storage
- Permanent color code generation (6-character hex codes)
- Rate limiting (30 requests per minute per IP)
- No CORS limitations (accepts requests from any origin)
- PostgreSQL database using Bun's built-in SQL client
- Maximum text size of 128KB

## Endpoints

### POST /permagen

Receives raw text, hashes it, and returns a permanent color code.

- If the hash already exists in the database, returns the existing color code
- If the hash doesn't exist, generates a new 6-character hex color code and saves it to the database
- If the text exceeds 128KB, the request is rejected with a 413 Payload Too Large status

**Request:**
- Body: Raw text content (maximum 128KB)

**Response:**
```json
{
  "permacode": "ff5e2a",
  "exists": true|false
}
```

The `permacode` is a 6-character hex color code (0-9, a-f) that can be used directly as a CSS color value.

**Error Response (if text exceeds 128KB):**
```json
{
  "error": "Text size exceeds the maximum limit of 128KB",
  "sizeInBytes": 131072,
  "maxSizeInBytes": 131072
}
```

### GET /:permacode

Returns the text content associated with the given color code.

**Request:**
- URL parameter: 6-character hex color code directly in the root path
- Example: `GET /ff5e2a`

**Response:**
- If found: Raw text content (Content-Type: text/plain)
- If not found: 404 status with "Permacode not found" message

## Setup and Running

### Local Development

1. Set up environment variables:
   Create a `.env` file with your PostgreSQL connection string:
   ```
   DATABASE_URL="postgres://username:password@hostname:port/database"
   ```
   Bun's SQL client will automatically use this environment variable.

2. Install dependencies:
   ```
   bun install
   ```

3. Run the server:
   ```
   bun start
   ```

   For development with auto-reload:
   ```
   bun dev
   ```

The server will run on port 3000 by default, or you can set a custom port using the PORT environment variable.

### Docker Deployment

You can also run the application using Docker:

1. Build the Docker image:
   ```
   docker build -t permagen-server .
   ```

2. Run the container:
   ```
   docker run -p 3000:3000 -e DATABASE_URL="postgres://username:password@hostname:port/database" permagen-server
   ```

   Note: When running in Docker, make sure the PostgreSQL server is accessible from the container. If you're running PostgreSQL locally, you might need to use the host network or specify the host IP instead of localhost.

   For example, if your PostgreSQL is running on your host machine, you might need to use:
   ```
   docker run -p 3000:3000 -e DATABASE_URL="postgres://username:password@host.docker.internal:5432/database" permagen-server
   ``` 