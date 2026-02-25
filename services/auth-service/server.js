const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const { getDB } = require('../../shared/db');
const { errorHandler } = require('../../shared/error-handler');
const { createLogger } = require('../../shared/logger');
const authRoutes = require('./routes/auth');

const app = express();
const PORT = process.env.PORT || 3001;
const logger = createLogger('auth-service');
const db = getDB();

app.use(helmet());
app.use(cors({ origin: '*', credentials: true }));
app.use(express.json());
app.use(morgan('dev'));

app.get('/health', (req, res) => {
    res.json({ status: 'healthy', service: 'auth-service', timestamp: new Date().toISOString() });
});

app.use('/', authRoutes(db, logger));
app.use(errorHandler);

app.listen(PORT, () => {
    logger.info(`🔐 Auth Service running on http://localhost:${PORT}`);
});

module.exports = app;
