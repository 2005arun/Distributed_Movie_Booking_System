FROM node:20-alpine

# Install build tools for better-sqlite3 native compilation
RUN apk add --no-cache python3 make g++

WORKDIR /app

# Create data directory for SQLite
RUN mkdir -p /app/data

# Copy and install shared module
COPY shared/ ./shared/
RUN cd shared && npm install --production

# Copy and install service
COPY services/auth-service/package*.json ./services/auth-service/
RUN cd services/auth-service && npm install --production

COPY services/auth-service/ ./services/auth-service/

WORKDIR /app/services/auth-service

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=10s --retries=3 CMD wget -qO- http://localhost:3001/health || exit 1

CMD ["node", "server.js"]
