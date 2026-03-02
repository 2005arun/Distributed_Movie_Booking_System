FROM node:20-alpine

WORKDIR /app

COPY shared/ ./shared/
RUN cd shared && npm install --production

COPY services/ticket-service/package*.json ./services/ticket-service/
RUN cd services/ticket-service && npm install --production
COPY services/ticket-service/ ./services/ticket-service/

WORKDIR /app/services/ticket-service
EXPOSE 3006
HEALTHCHECK --interval=30s --timeout=10s --retries=3 CMD wget -qO- http://localhost:3006/health || exit 1
CMD ["node", "server.js"]
