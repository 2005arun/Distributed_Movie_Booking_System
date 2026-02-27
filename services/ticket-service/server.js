const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const QRCode = require('qrcode');
const crypto = require('crypto');
const { getDB, uuidv4 } = require('../../shared/db');
const { createKafkaClient, createConsumer } = require('../../shared/kafka');
const { authMiddleware } = require('../../shared/auth-middleware');
const { errorHandler } = require('../../shared/error-handler');
const { createLogger } = require('../../shared/logger');

const app = express();
const PORT = process.env.PORT || 3006;
const logger = createLogger('ticket-service');
let db = null;

app.use(helmet());
app.use(cors({ origin: '*', credentials: true }));
app.use(express.json());
app.use(morgan('dev'));

app.get('/health', (req, res) => {
    res.json({ status: 'healthy', service: 'ticket-service', timestamp: new Date().toISOString() });
});

// GET TICKET
app.get('/tickets/:bookingId', authMiddleware, async (req, res) => {
    try {
        const ticket = await db.get('SELECT * FROM tickets WHERE booking_id = ?', req.params.bookingId);
        if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
        if (ticket.user_id !== req.user.id && req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Access denied' });
        }
        ticket.ticket_data = JSON.parse(ticket.ticket_data || '{}');
        res.json(ticket);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GENERATE TICKET (manual)
app.post('/tickets/generate', authMiddleware, async (req, res) => {
    try {
        const { booking_id } = req.body;
        const ticket = await generateTicket(db, booking_id, logger);
        res.status(201).json(ticket);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Internal endpoint for service-to-service calls (webhook-triggered, no user auth)
app.post('/tickets/internal/generate', async (req, res) => {
    try {
        const { booking_id } = req.body;
        if (!booking_id) return res.status(400).json({ error: 'booking_id required' });
        const ticket = await generateTicket(db, booking_id, logger);
        logger.info(`Internal: Ticket generated for booking ${booking_id}`);
        res.status(201).json({ success: true, ticket_id: ticket.id });
    } catch (err) {
        logger.error('Internal ticket generation error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

app.use(errorHandler);

// TICKET GENERATION
async function generateTicket(db, bookingId, logger) {
    // Idempotent
    const existing = await db.get('SELECT * FROM tickets WHERE booking_id = ?', bookingId);
    if (existing) {
        existing.ticket_data = JSON.parse(existing.ticket_data || '{}');
        return existing;
    }

    const booking = await db.get(`
    SELECT b.*, m.title as movie_title, s.start_time, s.end_time,
           sc.name as screen_name, t.name as theater_name
    FROM bookings b
    JOIN shows s ON b.show_id = s.id
    JOIN movies m ON s.movie_id = m.id
    JOIN screens sc ON s.screen_id = sc.id
    JOIN theaters t ON sc.theater_id = t.id
    WHERE b.id = ?
  `, bookingId);

    if (!booking) throw new Error('Booking not found');

    const seats = await db.all(`
    SELECT se.row_label, se.seat_number, se.seat_type, bs.price
    FROM booking_seats bs JOIN seats se ON bs.seat_id = se.id
    WHERE bs.booking_id = ?
  `, bookingId);

    const ticketData = {
        booking_id: booking.id,
        movie: booking.movie_title,
        theater: booking.theater_name,
        screen: booking.screen_name,
        show_time: booking.start_time,
        seats: seats.map(s => `${s.row_label}${s.seat_number}`).join(', '),
        total: booking.total_amount,
    };

    const qrData = JSON.stringify({
        id: bookingId,
        movie: booking.movie_title,
        seats: ticketData.seats,
        verification: crypto.createHash('sha256').update(`${bookingId}-${booking.user_id}`).digest('hex').slice(0, 16),
    });

    const qrCode = await QRCode.toDataURL(qrData, { width: 300, margin: 2 });

    const ticketId = uuidv4();
    await db.run('INSERT INTO tickets (id, booking_id, user_id, qr_code, ticket_data) VALUES (?, ?, ?, ?, ?)',
        ticketId, bookingId, booking.user_id, qrCode, JSON.stringify(ticketData)
    );

    logger.info(`Ticket generated for booking ${bookingId}`);
    return { id: ticketId, booking_id: bookingId, user_id: booking.user_id, qr_code: qrCode, ticket_data: ticketData };
}

async function initKafka() {
    db = await getDB();
    try {
        const kafka = createKafkaClient('ticket-service');
        await createConsumer(kafka, 'ticket-group', ['booking.confirmed'], async (topic, message) => {
            if (topic === 'booking.confirmed') {
                logger.info(`Generating ticket for booking ${message.booking_id}`);
                try {
                    await generateTicket(db, message.booking_id, logger);
                } catch (err) {
                    logger.error(`Ticket generation failed: ${err.message}`);
                }
            }
        });
    } catch (err) {
        logger.warn('Kafka unavailable:', err.message);
    }
}

initKafka().then(() => {
    app.listen(PORT, () => {
        logger.info(`🎫 Ticket Service running on http://localhost:${PORT}`);
    });
});

module.exports = app;
