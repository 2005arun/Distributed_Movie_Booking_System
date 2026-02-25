const winston = require('winston');

const createLogger = (serviceName) => {
    return winston.createLogger({
        level: process.env.LOG_LEVEL || 'info',
        format: winston.format.combine(
            winston.format.timestamp(),
            winston.format.errors({ stack: true }),
            process.env.NODE_ENV === 'production'
                ? winston.format.json()
                : winston.format.combine(
                    winston.format.colorize(),
                    winston.format.printf(({ timestamp, level, message, service, ...meta }) => {
                        const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
                        return `${timestamp} [${service}] ${level}: ${message}${metaStr}`;
                    })
                )
        ),
        defaultMeta: { service: serviceName },
        transports: [new winston.transports.Console()],
    });
};

module.exports = { createLogger };
