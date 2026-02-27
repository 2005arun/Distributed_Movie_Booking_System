const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const nodemailer = require('nodemailer');
const { Resend } = require('resend');
const { getDB, uuidv4 } = require('../../shared/db');
const { createKafkaClient, createConsumer } = require('../../shared/kafka');
const { connectRabbitMQ, consumeFromQueue } = require('../../shared/rabbitmq');
const { authMiddleware } = require('../../shared/auth-middleware');
const { errorHandler } = require('../../shared/error-handler');
const { createLogger } = require('../../shared/logger');

const app = express();
const PORT = process.env.PORT || 3007;
const logger = createLogger('notification-service');
let db = null;

// Email providers
let resendClient = null;
let brevoApiKey = null;
let emailTransporter = null; // nodemailer fallback
let emailProvider = 'none'; // 'brevo' | 'resend' | 'smtp' | 'ethereal' | 'local' | 'none'

// Brevo HTTP API helper (works on any network, sends to ANY email)
function sendViaBrevo(apiKey, fromEmail, fromName, toEmail, toName, subject, htmlContent) {
    return new Promise((resolve) => {
        const https = require('https');
        const postData = JSON.stringify({
            sender: { name: fromName, email: fromEmail },
            to: [{ email: toEmail, name: toName || toEmail }],
            subject,
            htmlContent,
        });
        const req = https.request({
            hostname: 'api.brevo.com',
            path: '/v3/smtp/email',
            method: 'POST',
            headers: {
                'api-key': apiKey,
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData),
            },
        }, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    if (res.statusCode >= 200 && res.statusCode < 300) {
                        resolve({ success: true, messageId: json.messageId });
                    } else {
                        resolve({ success: false, error: json.message || data, code: json.code });
                    }
                } catch {
                    resolve({ success: false, error: data });
                }
            });
        });
        req.on('error', (err) => resolve({ success: false, error: err.message }));
        req.write(postData);
        req.end();
    });
}

async function initEmail() {
    // Priority 1: Brevo (HTTP-based, sends to ANY email, 300/day free)
    const brevoKey = process.env.BREVO_API_KEY;
    if (brevoKey && brevoKey.startsWith('xkeysib-')) {
        brevoApiKey = brevoKey;
        emailProvider = 'brevo';
        logger.info('\u{1F4E7} Email configured via Brevo (HTTP API — any recipient, 300/day free)');
        return;
    }

    // Priority 2: Resend (HTTP-based, works on any network)
    const resendApiKey = process.env.RESEND_API_KEY;
    if (resendApiKey && resendApiKey.startsWith('re_')) {
        try {
            resendClient = new Resend(resendApiKey);
            emailProvider = 'resend';
            logger.info('\u{1F4E7} Email configured via Resend (HTTP API)');
            return;
        } catch (err) {
            logger.warn(`\u{1F4E7} Resend init failed: ${err.message}`);
        }
    }

    // Priority 2: SMTP (Gmail, etc.)
    const smtpHost = process.env.SMTP_HOST;
    const smtpUser = process.env.SMTP_USER;
    const smtpPass = process.env.SMTP_PASS;
    if (smtpHost && smtpUser && smtpPass && smtpUser !== 'your-email@gmail.com') {
        emailTransporter = nodemailer.createTransport({
            host: smtpHost,
            port: parseInt(process.env.SMTP_PORT || '587'),
            secure: false,
            auth: { user: smtpUser, pass: smtpPass },
            connectionTimeout: 10000,
            greetingTimeout: 10000,
            socketTimeout: 10000,
        });
        try {
            await emailTransporter.verify();
            emailProvider = 'smtp';
            logger.info(`\u{1F4E7} Email configured and verified via ${smtpHost} (${smtpUser})`);
            return;
        } catch (err) {
            logger.warn(`\u{1F4E7} SMTP verify failed: ${err.message} — trying fallbacks`);
            emailTransporter = null;
        }
    }

    // Priority 3: Ethereal (demo)
    try {
        const testAccount = await nodemailer.createTestAccount();
        emailTransporter = nodemailer.createTransport({
            host: 'smtp.ethereal.email',
            port: 587,
            secure: false,
            auth: { user: testAccount.user, pass: testAccount.pass },
            connectionTimeout: 5000,
            greetingTimeout: 5000,
            socketTimeout: 5000,
        });
        await emailTransporter.verify();
        emailProvider = 'ethereal';
        logger.info(`\u{1F4E7} Demo email active \u2014 View sent emails at: https://ethereal.email`);
        logger.info(`\u{1F4E7} Demo credentials: ${testAccount.user} / ${testAccount.pass}`);
        return;
    } catch (err) {
        logger.warn('\u{1F4E7} Ethereal email unavailable');
    }

    // Priority 4: Local JSON capture
    emailTransporter = nodemailer.createTransport({ jsonTransport: true });
    emailProvider = 'local';
    logger.warn('\u{1F4E7} Using local JSON transport (emails captured locally, not sent)');
}

app.use(helmet());
app.use(cors({ origin: '*', credentials: true }));
app.use(express.json());
app.use(morgan('dev'));

app.get('/health', (req, res) => {
    res.json({ status: 'healthy', service: 'notification-service', timestamp: new Date().toISOString() });
});

app.get('/notifications', async (req, res) => {
    try {
        const { user_id, limit = 20 } = req.query;
        let sql = 'SELECT * FROM notifications';
        const params = [];
        if (user_id) { sql += ' WHERE user_id = ?'; params.push(user_id); }
        sql += ' ORDER BY created_at DESC LIMIT ?';
        params.push(parseInt(limit));
        res.json(await db.all(sql, ...params));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Explicit notification creation after successful payment
app.post('/notifications/booking-confirmed', authMiddleware, async (req, res) => {
    try {
        const { booking_id } = req.body;
        const user_id = req.user.id;
        if (!booking_id) return res.status(400).json({ error: 'booking_id required' });
        const result = await handleBookingConfirmed({ booking_id, user_id });
        res.json({ message: 'Notification sent', ...(result || {}) });
    } catch (err) {
        logger.error('Notification endpoint error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// Get email notification status for a booking
app.get('/notifications/booking/:bookingId', async (req, res) => {
    try {
        const { bookingId } = req.params;
        const notification = await db.get(
            "SELECT * FROM notifications WHERE type = 'BOOKING_CONFIRMED' AND metadata LIKE ? ORDER BY created_at DESC LIMIT 1",
            `%"booking_id":"${bookingId}"%`
        );

        if (!notification) {
            return res.json({ email_sent: false, message: 'No notification found for this booking' });
        }

        let meta = {};
        try { meta = JSON.parse(notification.metadata || '{}'); } catch {}

        res.json({
            email_sent: notification.status === 'SENT',
            email_sent_to: meta.email_sent_to || null,
            subject: notification.subject,
            status: notification.status,
            sent_at: notification.sent_at,
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Internal endpoint for service-to-service calls (webhook-triggered, no user auth)
app.post('/notifications/internal/booking-confirmed', async (req, res) => {
    try {
        const { booking_id, user_id } = req.body;
        if (!booking_id || !user_id) return res.status(400).json({ error: 'booking_id and user_id required' });
        const result = await handleBookingConfirmed({ booking_id, user_id });
        logger.info(`Internal: Notification processed for booking ${booking_id}`);
        res.json({ message: 'Notification sent', ...(result || {}) });
    } catch (err) {
        logger.error('Internal notification error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

app.use(errorHandler);

async function handleBookingConfirmed(message) {
    const { booking_id, user_id } = message;

    const booking = await db.get(`
    SELECT b.*, m.title as movie_title, s.start_time, sc.name as screen_name, t.name as theater_name
    FROM bookings b
    JOIN shows s ON b.show_id = s.id
    JOIN movies m ON s.movie_id = m.id
    JOIN screens sc ON s.screen_id = sc.id
    JOIN theaters t ON sc.theater_id = t.id
    WHERE b.id = ?
  `, booking_id);

    if (!booking) return { email_sent: false };

    const seats = await db.all(`
    SELECT se.row_label, se.seat_number FROM booking_seats bs
    JOIN seats se ON bs.seat_id = se.id WHERE bs.booking_id = ?
  `, booking_id);

    const seatStr = seats.map(s => `${s.row_label}${s.seat_number}`).join(', ');
    const showTime = new Date(booking.start_time).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });

    // Look up user email
    const user = await db.get('SELECT email, name FROM users WHERE id = ?', user_id);
    const userEmail = user?.email || null;

    // Save notification to DB with PENDING status (will update after email attempt)
    const notifId = uuidv4();
    const notifSubject = `Booking Confirmed: ${booking.movie_title}`;
    const notifMessage = `Your booking for ${booking.movie_title} is confirmed.\nTheater: ${booking.theater_name}\nScreen: ${booking.screen_name}\nTime: ${showTime}\nSeats: ${seatStr}\nAmount: \u20B9${booking.total_amount}`;
    await db.run(`INSERT INTO notifications (id, user_id, type, channel, subject, message, metadata, status, sent_at)
    VALUES (?, ?, 'BOOKING_CONFIRMED', 'email', ?, ?, ?, 'PENDING', NOW()) ON CONFLICT (id) DO NOTHING`,
        notifId, user_id,
        notifSubject, notifMessage,
        JSON.stringify({ booking_id, movie: booking.movie_title, seats: seatStr, email_sent_to: userEmail })
    );

    // Send email
    let emailResult = { email_sent: false, email_sent_to: userEmail };
    if (user?.email && (brevoApiKey || resendClient || emailTransporter)) {
        try {
            const emailSubject = `\u{1F3AC} Booking Confirmed: ${booking.movie_title} \u2014 ${showTime}`;
            const emailHtml = `<div style="font-family:'Segoe UI',Arial,sans-serif;max-width:600px;margin:0 auto;background:#1a1a2e;color:#fff;border-radius:12px;overflow:hidden">
  <div style="background:linear-gradient(135deg,#e94560,#0f3460);padding:30px;text-align:center">
    <h1 style="margin:0;font-size:28px">\u{1F3AC} CineBook</h1>
    <p style="margin:8px 0 0;opacity:.9">Booking Confirmation</p>
  </div>
  <div style="padding:30px">
    <h2 style="color:#4ade80;margin-top:0">\u2705 Booking Confirmed!</h2>
    <p>Hi ${user.name || 'there'},</p>
    <p>Your movie ticket booking has been confirmed:</p>
    <div style="background:rgba(255,255,255,.05);border-radius:8px;padding:20px;margin:20px 0">
      <table style="width:100%;border-collapse:collapse">
        <tr><td style="padding:8px 0;color:#9ca3af">Movie</td><td style="padding:8px 0;font-weight:600;text-align:right">${booking.movie_title}</td></tr>
        <tr><td style="padding:8px 0;color:#9ca3af">Theater</td><td style="padding:8px 0;text-align:right">${booking.theater_name}</td></tr>
        <tr><td style="padding:8px 0;color:#9ca3af">Screen</td><td style="padding:8px 0;text-align:right">${booking.screen_name}</td></tr>
        <tr><td style="padding:8px 0;color:#9ca3af">Show Time</td><td style="padding:8px 0;text-align:right">${showTime}</td></tr>
        <tr><td style="padding:8px 0;color:#9ca3af">Seats</td><td style="padding:8px 0;font-weight:600;text-align:right">${seatStr}</td></tr>
        <tr><td style="padding:8px 0;color:#9ca3af">Amount Paid</td><td style="padding:8px 0;font-weight:600;color:#4ade80;text-align:right">\u20B9${booking.total_amount}</td></tr>
        <tr><td style="padding:8px 0;color:#9ca3af">Booking ID</td><td style="padding:8px 0;text-align:right;font-size:12px">${booking_id}</td></tr>
      </table>
    </div>
    <p style="color:#9ca3af;font-size:14px">Show your ticket QR code at the theater entrance. Enjoy the movie! \u{1F37F}</p>
  </div>
  <div style="background:rgba(255,255,255,.03);padding:20px;text-align:center;font-size:12px;color:#6b7280">
    <p style="margin:0">CineBook \u2014 Movie Ticket Booking System</p>
  </div>
</div>`;

            if (emailProvider === 'brevo' && brevoApiKey) {
                // Send via Brevo HTTP API (any recipient, 300/day free)
                const senderEmail = process.env.BREVO_SENDER_EMAIL || process.env.SMTP_USER || 'noreply@cinebook.com';
                const brevoResult = await sendViaBrevo(brevoApiKey, senderEmail, 'CineBook', user.email, user.name, emailSubject, emailHtml);
                if (brevoResult.success) {
                    logger.info(`\u{1F4E7} Email sent via Brevo to ${user.email} (messageId: ${brevoResult.messageId})`);
                    emailResult = { email_sent: true, email_sent_to: userEmail, transport: 'brevo', id: brevoResult.messageId };
                } else {
                    logger.error(`\u{1F4E7} Brevo error: ${brevoResult.error}`);
                    emailResult = { email_sent: false, email_sent_to: userEmail, error: brevoResult.error };
                }
            } else if (emailProvider === 'resend' && resendClient) {
                // Send via Resend HTTP API (works on any network)
                const fromAddr = process.env.RESEND_FROM || 'CineBook <onboarding@resend.dev>';
                const { data, error } = await resendClient.emails.send({
                    from: fromAddr,
                    to: [user.email],
                    subject: emailSubject,
                    html: emailHtml,
                });
                if (error) {
                    logger.error(`\u{1F4E7} Resend error: ${JSON.stringify(error)}`);
                    emailResult = { email_sent: false, email_sent_to: userEmail, error: error.message };
                } else {
                    logger.info(`\u{1F4E7} Email sent via Resend to ${user.email} (id: ${data?.id})`);
                    emailResult = { email_sent: true, email_sent_to: userEmail, transport: 'resend', id: data?.id };
                }
            } else if (emailTransporter) {
                // Send via nodemailer (SMTP/Ethereal/JSON)
                const fromAddr = process.env.SMTP_USER || 'noreply@cinebook.com';
                const info = await emailTransporter.sendMail({
                    from: `"CineBook" <${fromAddr}>`,
                    to: user.email,
                    subject: emailSubject,
                    html: emailHtml,
                });

                const previewUrl = nodemailer.getTestMessageUrl(info);
                if (previewUrl) {
                    logger.info(`\u{1F4E7} Email preview: ${previewUrl}`);
                    emailResult = { email_sent: true, email_sent_to: userEmail, preview_url: previewUrl, transport: 'ethereal' };
                } else if (info.message) {
                    logger.info(`\u{1F4E7} Email captured locally for ${user.email}`);
                    emailResult = { email_sent: true, email_sent_to: userEmail, transport: 'local' };
                } else {
                    emailResult = { email_sent: true, email_sent_to: userEmail, transport: 'smtp' };
                }
            }
            logger.info(`\u{1F4E7} Confirmation email processed for ${user.email} via ${emailProvider}`);
        } catch (err) {
            logger.error(`\u{1F4E7} Email send failed: ${err.message || err}`);
        }
    } else {
        logger.warn(`\u{1F4E7} No email provider available (provider=${emailProvider}) or user email not found (email=${userEmail})`);
        emailResult = { email_sent: false, email_sent_to: userEmail };
    }

    // Update notification status based on actual email result
    const finalStatus = emailResult.email_sent ? 'SENT' : 'FAILED';
    await db.run('UPDATE notifications SET status = ?, metadata = ? WHERE id = ?',
        finalStatus,
        JSON.stringify({ booking_id, movie: booking.movie_title, seats: seatStr, email_sent_to: userEmail, transport: emailResult.transport || null }),
        notifId
    );

    logger.info(`Notification ${finalStatus} for booking ${booking_id} (provider: ${emailProvider}, to: ${userEmail})`);
    return emailResult;
}

async function handleBookingCancelled(message) {
    const { booking_id, user_id } = message;

    await db.run(`INSERT INTO notifications (id, user_id, type, channel, subject, message, metadata, status, sent_at)
    VALUES (?, ?, 'BOOKING_CANCELLED', 'email', 'Booking Cancelled', ?, ?, 'SENT', NOW())`,
        uuidv4(), user_id,
        `Your booking ${booking_id} has been cancelled.`,
        JSON.stringify({ booking_id })
    );

    logger.info(`Cancellation notification for booking ${booking_id}`);
}

async function initKafka() {
    try {
        const kafka = createKafkaClient('notification-service');
        await createConsumer(kafka, 'notification-group', ['booking.confirmed', 'booking.cancelled'], async (topic, message) => {
            if (topic === 'booking.confirmed') await handleBookingConfirmed(message);
            else if (topic === 'booking.cancelled') await handleBookingCancelled(message);
        });
    } catch (err) {
        logger.warn('Kafka unavailable:', err.message);
    }
}

async function initRabbitMQ() {
    try {
        await connectRabbitMQ({ logger });
        logger.info('\u{1F430} RabbitMQ connected — setting up consumers...');

        // Consume payment success messages from RabbitMQ queue
        await consumeFromQueue('payment.success', async (message) => {
            logger.info(`\u{1F430} Received payment.success from RabbitMQ: booking ${message.booking_id}`);
            try {
                const result = await handleBookingConfirmed(message);
                logger.info(`\u{1F430} Notification processed via RabbitMQ for booking ${message.booking_id}`, result || {});
            } catch (err) {
                logger.error(`\u{1F430} Failed to process payment.success for booking ${message.booking_id}: ${err.message}`);
                throw err; // Will cause nack
            }
        });

        logger.info('\u{1F430} RabbitMQ consumer active — listening on queue: payment.success');
    } catch (err) {
        logger.warn(`RabbitMQ unavailable — falling back to Kafka/HTTP: ${err.message}`);
    }
}

// CRITICAL: initEmail() MUST complete BEFORE initRabbitMQ() starts consuming,
// otherwise messages arrive before email provider is ready (brevoApiKey is null).
async function startService() {
    // Step 0: Initialize database
    db = await getDB();

    // Step 1: Initialize email provider FIRST
    await initEmail();
    logger.info(`📧 Email provider ready: ${emailProvider} (brevoApiKey=${!!brevoApiKey}, resendClient=${!!resendClient}, transporter=${!!emailTransporter})`);

    // Step 2: Now connect to message queues (they will start consuming immediately)
    await Promise.all([initKafka(), initRabbitMQ()]);

    // Step 3: Start HTTP server
    app.listen(PORT, () => {
        logger.info(`\u{1F4E9} Notification Service running on http://localhost:${PORT}`);
    });
}

startService();

module.exports = app;
