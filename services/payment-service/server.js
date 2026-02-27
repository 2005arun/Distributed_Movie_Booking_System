const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const { getDB } = require('../../shared/db');
const { createRedis } = require('../../shared/redis');
const { createKafkaClient, createProducer } = require('../../shared/kafka');
const { connectRabbitMQ, publishToQueue, isConnected: isRabbitConnected } = require('../../shared/rabbitmq');
const { errorHandler } = require('../../shared/error-handler');
const { createLogger } = require('../../shared/logger');
const paymentRoutes = require('./routes/payments');

const app = express();
const PORT = process.env.PORT || 3005;
const logger = createLogger('payment-service');
const redis = createRedis();

let kafkaProducer = null;

async function initKafka() {
    try {
        const kafka = createKafkaClient('payment-service');
        kafkaProducer = await createProducer(kafka);
    } catch (err) {
        logger.warn('Kafka unavailable:', err.message);
    }
}

async function initRabbitMQ() {
    try {
        await connectRabbitMQ({ logger });
        logger.info('🐰 RabbitMQ ready for publishing');
    } catch (err) {
        logger.warn(`RabbitMQ unavailable — will fall back to direct HTTP: ${err.message}`);
    }
}

app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
            fontSrc: ["'self'", "https://fonts.gstatic.com"],
            connectSrc: ["'self'", "http://localhost:*"],
            imgSrc: ["'self'", "data:"],
        },
    },
}));
app.use(cors({ origin: '*', credentials: true }));
app.use(express.json());
app.use(morgan('dev'));

app.get('/health', (req, res) => {
    res.json({ status: 'healthy', service: 'payment-service', timestamp: new Date().toISOString() });
});

async function start() {
    const db = await getDB();

    app.use('/', (req, res, next) => {
        req.kafkaProducer = kafkaProducer;
        req.publishToQueue = publishToQueue;
        req.isRabbitConnected = isRabbitConnected;
        next();
    }, paymentRoutes(db, redis, logger));

    app.use(errorHandler);

    await Promise.all([initKafka(), initRabbitMQ()]);
    app.listen(PORT, () => {
        logger.info(`💳 Payment Service running on http://localhost:${PORT}`);
    });
}

start().catch(err => {
    logger.error('Failed to start payment-service:', err.message);
    process.exit(1);
});

module.exports = app;
