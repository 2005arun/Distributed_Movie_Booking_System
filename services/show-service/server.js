const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const { getDB } = require('../../shared/db');
const { createRedis } = require('../../shared/redis');
const { errorHandler } = require('../../shared/error-handler');
const { createLogger } = require('../../shared/logger');
const showRoutes = require('./routes/shows');

const app = express();
const PORT = process.env.PORT || 3003;
const logger = createLogger('show-service');
const db = getDB();
const redis = createRedis();

app.use(helmet());
app.use(cors({ origin: '*', credentials: true }));
app.use(express.json());
app.use(morgan('dev'));

app.get('/health', (req, res) => {
    res.json({ status: 'healthy', service: 'show-service', timestamp: new Date().toISOString() });
});

app.use('/', showRoutes(db, redis, logger));
app.use(errorHandler);

app.listen(PORT, () => {
    logger.info(`🎬 Show Service running on http://localhost:${PORT}`);
});

module.exports = app;
