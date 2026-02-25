const errorHandler = (err, req, res, next) => {
    console.error('Unhandled Error:', err);

    if (err.type === 'entity.parse.failed') {
        return res.status(400).json({ error: 'Invalid JSON in request body' });
    }

    if (err.code === '23505') {
        // PostgreSQL unique violation
        return res.status(409).json({ error: 'Resource already exists', detail: err.detail });
    }

    if (err.code === '23503') {
        // PostgreSQL foreign key violation
        return res.status(400).json({ error: 'Referenced resource not found', detail: err.detail });
    }

    const statusCode = err.statusCode || err.status || 500;
    res.status(statusCode).json({
        error: err.message || 'Internal server error',
        ...(process.env.NODE_ENV !== 'production' && { stack: err.stack }),
    });
};

class AppError extends Error {
    constructor(message, statusCode = 500) {
        super(message);
        this.statusCode = statusCode;
        this.isOperational = true;
        Error.captureStackTrace(this, this.constructor);
    }
}

module.exports = { errorHandler, AppError };
