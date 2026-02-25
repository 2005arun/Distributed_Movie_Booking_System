FROM node:20-alpine

WORKDIR /app

COPY gateway/package*.json ./gateway/
RUN cd gateway && npm install --production
COPY gateway/ ./gateway/

WORKDIR /app/gateway
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=10s --retries=3 CMD wget -qO- http://localhost:3000/health || exit 1
CMD ["node", "server.js"]
