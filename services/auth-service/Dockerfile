FROM node:20-alpine

WORKDIR /app

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
