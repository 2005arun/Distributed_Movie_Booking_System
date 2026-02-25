FROM node:20-alpine

RUN apk add --no-cache python3 make g++

WORKDIR /app
RUN mkdir -p /app/data

COPY shared/ ./shared/
RUN cd shared && npm install --production

COPY services/payment-service/package*.json ./services/payment-service/
RUN cd services/payment-service && npm install --production
COPY services/payment-service/ ./services/payment-service/

WORKDIR /app/services/payment-service
EXPOSE 3005
HEALTHCHECK --interval=30s --timeout=10s --retries=3 CMD wget -qO- http://localhost:3005/health || exit 1
CMD ["node", "server.js"]
