FROM node:20-alpine

RUN apk add --no-cache python3 make g++

WORKDIR /app
RUN mkdir -p /app/data

COPY shared/ ./shared/
RUN cd shared && npm install --production

COPY services/movie-service/package*.json ./services/movie-service/
RUN cd services/movie-service && npm install --production
COPY services/movie-service/ ./services/movie-service/

WORKDIR /app/services/movie-service
EXPOSE 3002
HEALTHCHECK --interval=30s --timeout=10s --retries=3 CMD wget -qO- http://localhost:3002/health || exit 1
CMD ["node", "server.js"]
