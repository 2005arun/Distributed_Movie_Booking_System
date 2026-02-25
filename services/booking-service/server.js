const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const { getDB } = require('../../shared/db');
const { createRedis } = require('../../shared/redis');
const { createKafkaClient, createProducer } = require('../../shared/kafka');
const { errorHandler } = require('../../shared/error-handler');
const { createLogger } = require('../../shared/logger');
const bookingRoutes = require('./routes/bookings');

const app = express();
const PORT = process.env.PORT || 3004;
const logger = createLogger('booking-service');
const db = getDB();
const redis = createRedis();

let kafkaProducer = null;

async function initKafka() {
    try {
        const kafka = createKafkaClient('booking-service');
        kafkaProducer = await createProducer(kafka);
    } catch (err) {
        logger.warn('Kafka unavailable:', err.message);
    }
}

app.use(helmet());
app.use(cors({ origin: '*', credentials: true }));
app.use(express.json());
app.use(morgan('dev'));

app.get('/health', (req, res) => {
    res.json({ status: 'healthy', service: 'booking-service', timestamp: new Date().toISOString() });
});

app.use('/', (req, res, next) => {
    req.kafkaProducer = kafkaProducer;
    next();
}, bookingRoutes(db, redis, logger));

app.use(errorHandler);

// Clean expired locks every 60s
setInterval(() => {
    try {
        const deleted = db.prepare("DELETE FROM seat_locks WHERE expires_at < datetime('now')").run();
        if (deleted.changes > 0) logger.info(`Cleaned ${deleted.changes} expired seat locks`);
    } catch (err) {
        logger.error('Lock cleanup failed:', err.message);
    }
}, 60000);

initKafka().then(() => {
    app.listen(PORT, () => {
        logger.info(`🎟️ Booking Service running on http://localhost:${PORT}`);
    });
});

module.exports = app;
