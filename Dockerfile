FROM oven/bun:1.2.3 as base

# Set working directory
WORKDIR /app

# Copy package.json
COPY package.json .

# Install dependencies
# apt
RUN apt-get update && \
  apt-get install -y --no-install-recommends ca-certificates git python3 xz-utils && \
  apt-get clean && \
  rm -rf /var/lib/apt/lists/*
# emsdk
RUN git clone https://github.com/emscripten-core/emsdk.git
RUN cd emsdk && \
  ./emsdk install latest && \
  ./emsdk activate latest
# bun
RUN bun install --production

# Copy application code
COPY . .

# Set environment variables
ENV PORT=3000
ENV NODE_ENV=production
ENV PATH=/app/emsdk:/app/emsdk/upstream/emscripten:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:/usr/local/bun-node-fallback-bin
ENV EMSDK=/app/emsdk
ENV EMSDK_NODE=/app/emsdk/node/20.18.0_64bit/bin/node

# Expose the port
EXPOSE 3000

# Start the application
CMD ["bun", "run", "index.js"]
