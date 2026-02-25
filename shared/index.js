const { getDB, uuidv4 } = require('./db');
const { createRedis } = require('./redis');
const { createKafkaClient, createProducer, createConsumer } = require('./kafka');
const { connectRabbitMQ, publishToQueue, consumeFromQueue, isConnected: isRabbitConnected, closeRabbitMQ } = require('./rabbitmq');
const { authMiddleware, adminMiddleware, optionalAuth } = require('./auth-middleware');
const { createLogger } = require('./logger');
const { errorHandler, AppError } = require('./error-handler');

module.exports = {
    getDB,
    uuidv4,
    createRedis,
    createKafkaClient,
    createProducer,
    createConsumer,
    connectRabbitMQ,
    publishToQueue,
    consumeFromQueue,
    isRabbitConnected,
    closeRabbitMQ,
    authMiddleware,
    adminMiddleware,
    optionalAuth,
    createLogger,
    errorHandler,
    AppError,
};
