FROM node:20-alpine

RUN apk add --no-cache python3 make g++

WORKDIR /app
RUN mkdir -p /app/data

COPY shared/ ./shared/
RUN cd shared && npm install --production

COPY services/show-service/package*.json ./services/show-service/
RUN cd services/show-service && npm install --production
COPY services/show-service/ ./services/show-service/

WORKDIR /app/services/show-service
EXPOSE 3003
HEALTHCHECK --interval=30s --timeout=10s --retries=3 CMD wget -qO- http://localhost:3003/health || exit 1
CMD ["node", "server.js"]
