FROM node:20-alpine

WORKDIR /app

COPY shared/ ./shared/
RUN cd shared && npm install --production

COPY services/notification-service/package*.json ./services/notification-service/
RUN cd services/notification-service && npm install --production
COPY services/notification-service/ ./services/notification-service/

WORKDIR /app/services/notification-service
EXPOSE 3007
HEALTHCHECK --interval=30s --timeout=10s --retries=3 CMD wget -qO- http://localhost:3007/health || exit 1
CMD ["node", "server.js"]
