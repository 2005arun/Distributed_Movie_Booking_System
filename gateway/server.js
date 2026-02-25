const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const { createProxyMiddleware } = require('http-proxy-middleware');

const app = express();
const PORT = process.env.PORT || 3000;

// Service URLs
const services = {
    auth: process.env.AUTH_SERVICE_URL || 'http://localhost:3001',
    movie: process.env.MOVIE_SERVICE_URL || 'http://localhost:3002',
    show: process.env.SHOW_SERVICE_URL || 'http://localhost:3003',
    booking: process.env.BOOKING_SERVICE_URL || 'http://localhost:3004',
    payment: process.env.PAYMENT_SERVICE_URL || 'http://localhost:3005',
    ticket: process.env.TICKET_SERVICE_URL || 'http://localhost:3006',
    notification: process.env.NOTIFICATION_SERVICE_URL || 'http://localhost:3007',
};

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: '*', credentials: true }));
app.use(morgan('dev'));

// Rate limiting
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 5000, message: { error: 'Too many requests' } });
app.use(limiter);

// Health
app.get('/health', (req, res) => {
    res.json({ status: 'healthy', service: 'api-gateway', services: Object.keys(services) });
});

app.get('/api/health/all', async (req, res) => {
    const results = {};
    for (const [name, url] of Object.entries(services)) {
        try {
            const response = await fetch(`${url}/health`);
            results[name] = await response.json();
        } catch {
            results[name] = { status: 'down' };
        }
    }
    res.json(results);
});

// Proxy config
const proxy = (target, pathRewrite) => createProxyMiddleware({
    target,
    changeOrigin: true,
    pathRewrite,
    timeout: 30000,
    onError: (err, req, res) => {
        console.error(`Proxy error → ${target}: ${err.message}`);
        res.status(502).json({ error: `Service unavailable: ${err.message}` });
    },
});

// Route proxies
app.use('/api/auth', proxy(services.auth, { '^/api/auth': '' }));
app.use('/api/movies', proxy(services.movie, { '^/api/movies': '/movies' }));
app.use('/api/locations', proxy(services.movie, { '^/api/locations': '/locations' }));
app.use('/api/shows', proxy(services.show, { '^/api/shows': '/shows' }));
app.use('/api/theaters', proxy(services.show, { '^/api/theaters': '/theaters' }));
app.use('/api/bookings', proxy(services.booking, { '^/api/bookings': '/bookings' }));
app.use('/api/payments', proxy(services.payment, { '^/api/payments': '/payments' }));
app.use('/api/tickets', proxy(services.ticket, { '^/api/tickets': '/tickets' }));
app.use('/api/notifications', proxy(services.notification, { '^/api/notifications': '/notifications' }));

app.use((req, res) => res.status(404).json({ error: 'Route not found' }));

app.listen(PORT, () => {
    console.log(`\n🚀 API Gateway running on http://localhost:${PORT}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('  /api/auth/*       → Auth Service');
    console.log('  /api/movies/*     → Movie Service');
    console.log('  /api/locations/*  → Movie Service');
    console.log('  /api/shows/*      → Show Service');
    console.log('  /api/theaters/*   → Show Service');
    console.log('  /api/bookings/*   → Booking Service');
    console.log('  /api/payments/*   → Payment Service');
    console.log('  /api/tickets/*    → Ticket Service');
    console.log('  /api/notifications/* → Notification Service');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
});
