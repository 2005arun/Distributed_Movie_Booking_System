FROM node:20-alpine

WORKDIR /app

COPY shared/ ./shared/
RUN cd shared && npm install --production

COPY services/booking-service/package*.json ./services/booking-service/
RUN cd services/booking-service && npm install --production
COPY services/booking-service/ ./services/booking-service/

WORKDIR /app/services/booking-service
EXPOSE 3004
HEALTHCHECK --interval=30s --timeout=10s --retries=3 CMD wget -qO- http://localhost:3004/health || exit 1
CMD ["node", "server.js"]
