const express = require('express');
const crypto = require('crypto');
const { uuidv4 } = require('../../../shared/db');
const { authMiddleware } = require('../../../shared/auth-middleware');
const { renderGatewayPage } = require('../gateway-template');

const WEBHOOK_SECRET = process.env.PAYMENT_WEBHOOK_SECRET || 'webhook_secret_2024';
const TICKET_SERVICE_URL = process.env.TICKET_SERVICE_URL || 'http://localhost:3006';
const NOTIFICATION_SERVICE_URL = process.env.NOTIFICATION_SERVICE_URL || 'http://localhost:3007';

module.exports = (db, redis, logger) => {
    const router = express.Router();

    // ==================== INITIATE PAYMENT ====================
    router.post('/payments/initiate', authMiddleware, async (req, res) => {
        try {
            const { booking_id } = req.body;
            const userId = req.user.id;

            if (!booking_id) return res.status(400).json({ error: 'booking_id required' });

            const booking = await db.get('SELECT * FROM bookings WHERE id = ?', booking_id);
            if (!booking) return res.status(404).json({ error: 'Booking not found' });
            if (booking.user_id !== userId) return res.status(403).json({ error: 'Access denied' });
            if (booking.status !== 'PENDING') {
                return res.status(400).json({ error: `Booking status is ${booking.status}` });
            }

            // Idempotency check
            const existing = await db.get('SELECT * FROM payments WHERE booking_id = ?', booking_id);
            if (existing) {
                if (existing.status === 'SUCCESS') return res.json({ payment: existing, message: 'Payment already completed' });
                if (existing.status === 'PROCESSING') return res.json({ payment: existing, message: 'Payment being processed' });
                if (existing.status === 'FAILED') {
                    await db.run('DELETE FROM payments WHERE id = ?', existing.id);
                }
            }

            const paymentId = uuidv4();
            const transRef = `TXN-${Date.now()}-${paymentId.slice(0, 8)}`;
            const orderId = `ORD-${booking_id.slice(0, 8)}-${Date.now()}`;

            await db.run(`INSERT INTO payments (id, booking_id, user_id, amount, status, transaction_reference, gateway_order_id, gateway) 
                  VALUES (?, ?, ?, ?, 'PROCESSING', ?, ?, 'razorpay')`,
                paymentId, booking_id, userId, booking.total_amount, transRef, orderId
            );

            const payment = await db.get('SELECT * FROM payments WHERE id = ?', paymentId);

            logger.info(`Payment initiated: ${paymentId} for booking ${booking_id}`);
            res.status(201).json({
                payment,
                gateway_config: {
                    order_id: orderId,
                    amount: booking.total_amount * 100,
                    currency: 'INR',
                    key: 'rzp_test_demo',
                },
            });
        } catch (err) {
            logger.error('Initiate payment error:', err.message);
            res.status(500).json({ error: err.message });
        }
    });

    // ==================== WEBHOOK ====================
    router.post('/payments/webhook', async (req, res) => {
        try {
            const { gateway_order_id, gateway_payment_id, status, amount } = req.body;
            logger.info(`🔔 WEBHOOK CALLED: order=${gateway_order_id}, status=${status}, rabbitConnected=${req.isRabbitConnected ? req.isRabbitConnected() : 'NO_FUNC'}`);

            const payment = await db.get('SELECT * FROM payments WHERE gateway_order_id = ?', gateway_order_id);
            if (!payment) return res.status(404).json({ error: 'Payment not found' });

            // Duplicate webhook protection
            if (payment.status === 'SUCCESS') {
                return res.json({ message: 'Payment already confirmed' });
            }

            // Amount verification
            if (amount && parseFloat(amount) !== parseFloat(payment.amount)) {
                return res.status(400).json({ error: 'Amount mismatch' });
            }

            if (status === 'SUCCESS' || status === 'captured') {
                // Update payment
                await db.run("UPDATE payments SET status = 'SUCCESS', gateway_payment_id = ?, webhook_received_at = NOW(), updated_at = NOW() WHERE id = ?",
                    gateway_payment_id, payment.id
                );

                // Confirm booking
                await db.run("UPDATE bookings SET status = 'CONFIRMED', updated_at = NOW() WHERE id = ?", payment.booking_id);

                // Release locks
                const bookingSeats = await db.all('SELECT * FROM booking_seats WHERE booking_id = ?', payment.booking_id);
                const booking = await db.get('SELECT * FROM bookings WHERE id = ?', payment.booking_id);
                await db.run('DELETE FROM seat_locks WHERE booking_id = ?', payment.booking_id);

                for (const bs of bookingSeats) {
                    await redis.del(`seat_lock:${booking.show_id}:${bs.seat_id}`);
                }

                // Publish events
                if (req.kafkaProducer) {
                    await req.kafkaProducer.send('booking.confirmed', [
                        { key: payment.booking_id, value: { booking_id: payment.booking_id, user_id: payment.user_id, payment_id: payment.id } },
                    ]);
                }

                // Webhook: auto-generate ticket via ticket service
                try {
                    const ticketRes = await fetch(`${TICKET_SERVICE_URL}/tickets/internal/generate`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ booking_id: payment.booking_id }),
                    });
                    if (ticketRes.ok) logger.info(`Webhook -> Ticket generated for booking ${payment.booking_id}`);
                    else logger.warn(`Webhook -> Ticket generation returned ${ticketRes.status}`);
                } catch (err) {
                    logger.error(`Webhook -> Ticket generation failed: ${err.message}`);
                }

                // Webhook: send confirmation email via notification service (through RabbitMQ)
                if (req.isRabbitConnected && req.isRabbitConnected()) {
                    try {
                        await req.publishToQueue('payment.success', {
                            booking_id: payment.booking_id,
                            user_id: payment.user_id,
                            payment_id: payment.id,
                            amount: payment.amount,
                            timestamp: new Date().toISOString(),
                        });
                        logger.info(`Webhook -> Published payment.success to RabbitMQ for booking ${payment.booking_id}`);
                    } catch (err) {
                        logger.error(`Webhook -> RabbitMQ publish failed: ${err.message}, falling back to HTTP`);
                        // Fallback to direct HTTP call
                        try {
                            const notifRes = await fetch(`${NOTIFICATION_SERVICE_URL}/notifications/internal/booking-confirmed`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ booking_id: payment.booking_id, user_id: payment.user_id }),
                            });
                            if (notifRes.ok) logger.info(`Webhook -> Notification sent (HTTP fallback) for booking ${payment.booking_id}`);
                            else logger.warn(`Webhook -> Notification returned ${notifRes.status} (HTTP fallback)`);
                        } catch (httpErr) {
                            logger.error(`Webhook -> Notification HTTP fallback also failed: ${httpErr.message}`);
                        }
                    }
                } else {
                    // RabbitMQ not connected — use direct HTTP
                    try {
                        const notifRes = await fetch(`${NOTIFICATION_SERVICE_URL}/notifications/internal/booking-confirmed`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ booking_id: payment.booking_id, user_id: payment.user_id }),
                        });
                        if (notifRes.ok) logger.info(`Webhook -> Notification sent (direct HTTP) for booking ${payment.booking_id}`);
                        else logger.warn(`Webhook -> Notification returned ${notifRes.status}`);
                    } catch (err) {
                        logger.error(`Webhook -> Notification failed: ${err.message}`);
                    }
                }

                logger.info(`Payment SUCCESS: ${payment.id}, booking ${payment.booking_id} CONFIRMED`);
            } else if (status === 'FAILED' || status === 'failed') {
                await db.run("UPDATE payments SET status = 'FAILED', failure_reason = ?, updated_at = NOW() WHERE id = ?",
                    req.body.error_reason || 'Payment failed', payment.id
                );
                await db.run("UPDATE bookings SET status = 'CANCELLED', updated_at = NOW() WHERE id = ?", payment.booking_id);

                const bookingSeats = await db.all('SELECT * FROM booking_seats WHERE booking_id = ?', payment.booking_id);
                const booking = await db.get('SELECT * FROM bookings WHERE id = ?', payment.booking_id);
                await db.run('DELETE FROM seat_locks WHERE booking_id = ?', payment.booking_id);
                await db.run('DELETE FROM booking_seats WHERE booking_id = ?', payment.booking_id);

                for (const bs of bookingSeats) {
                    await redis.del(`seat_lock:${booking.show_id}:${bs.seat_id}`);
                }

                logger.info(`Payment FAILED: ${payment.id}`);
            }

            res.json({ status: 'ok' });
        } catch (err) {
            logger.error('Webhook error:', err.message);
            res.status(500).json({ error: err.message });
        }
    });

    // ==================== SIMULATE PAYMENT ====================
    router.post('/payments/simulate', authMiddleware, async (req, res) => {
        try {
            const { booking_id, success = true } = req.body;

            const payment = await db.get('SELECT * FROM payments WHERE booking_id = ?', booking_id);
            if (!payment) return res.status(404).json({ error: 'Payment not found. Initiate first.' });

            // Directly call webhook logic internally
            const webhookPayload = {
                gateway_order_id: payment.gateway_order_id,
                gateway_payment_id: `SIM-${Date.now()}`,
                status: success ? 'SUCCESS' : 'FAILED',
                amount: payment.amount,
            };

            // Process internally
            const mockReq = { body: webhookPayload, kafkaProducer: req.kafkaProducer };
            const mockRes = {
                json: (data) => res.json({ message: `Payment ${success ? 'succeeded' : 'failed'} (simulated)`, ...data }),
                status: (code) => ({ json: (data) => res.status(code).json(data) }),
            };

            // Inline webhook processing
            if (payment.status === 'SUCCESS') {
                return res.json({ message: 'Payment already confirmed' });
            }

            if (success) {
                await db.run("UPDATE payments SET status = 'SUCCESS', gateway_payment_id = ?, webhook_received_at = NOW(), updated_at = NOW() WHERE id = ?",
                    webhookPayload.gateway_payment_id, payment.id
                );
                await db.run("UPDATE bookings SET status = 'CONFIRMED', updated_at = NOW() WHERE id = ?", payment.booking_id);
                await db.run('DELETE FROM seat_locks WHERE booking_id = ?', payment.booking_id);

                const bookingSeats = await db.all('SELECT * FROM booking_seats WHERE booking_id = ?', payment.booking_id);
                const booking = await db.get('SELECT * FROM bookings WHERE id = ?', payment.booking_id);
                for (const bs of bookingSeats) {
                    await redis.del(`seat_lock:${booking.show_id}:${bs.seat_id}`);
                }

                if (req.kafkaProducer) {
                    await req.kafkaProducer.send('booking.confirmed', [
                        { key: payment.booking_id, value: { booking_id: payment.booking_id, user_id: payment.user_id, payment_id: payment.id } },
                    ]);
                }

                logger.info(`Payment simulated SUCCESS for booking ${booking_id}`);
                res.json({ message: 'Payment succeeded (simulated)', status: 'ok' });
            } else {
                await db.run("UPDATE payments SET status = 'FAILED', updated_at = NOW() WHERE id = ?", payment.id);
                await db.run("UPDATE bookings SET status = 'CANCELLED', updated_at = NOW() WHERE id = ?", payment.booking_id);
                await db.run('DELETE FROM booking_seats WHERE booking_id = ?', payment.booking_id);
                res.json({ message: 'Payment failed (simulated)', status: 'ok' });
            }
        } catch (err) {
            logger.error('Simulate error:', err.message);
            res.status(500).json({ error: err.message });
        }
    });

    // ==================== GET PAYMENT STATUS ====================
    router.get('/payments/:bookingId', authMiddleware, async (req, res) => {
        try {
            const payment = await db.get('SELECT * FROM payments WHERE booking_id = ?', req.params.bookingId);
            if (!payment) return res.status(404).json({ error: 'Payment not found' });
            if (payment.user_id !== req.user.id && req.user.role !== 'admin') {
                return res.status(403).json({ error: 'Access denied' });
            }
            res.json(payment);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // ==================== REFUND ====================
    router.post('/payments/refund', authMiddleware, async (req, res) => {
        try {
            const { booking_id } = req.body;
            const payment = await db.get('SELECT * FROM payments WHERE booking_id = ?', booking_id);
            if (!payment) return res.status(404).json({ error: 'Payment not found' });
            if (payment.status !== 'SUCCESS') return res.status(400).json({ error: 'Can only refund successful payments' });
            if (payment.refund_reference) return res.json({ message: 'Refund already processed', refund_reference: payment.refund_reference });

            const refundRef = `REFUND-${Date.now()}-${uuidv4().slice(0, 8)}`;

            await db.transaction(async (tx) => {
                await tx.run("UPDATE payments SET status = 'REFUNDED', refund_reference = ?, updated_at = NOW() WHERE id = ?", refundRef, payment.id);
                await tx.run("UPDATE bookings SET status = 'REFUNDED', updated_at = NOW() WHERE id = ?", booking_id);
                await tx.run("UPDATE tickets SET status = 'INVALIDATED' WHERE booking_id = ?", booking_id);
                await tx.run('DELETE FROM booking_seats WHERE booking_id = ?', booking_id);
            });

            logger.info(`Refund: ${refundRef} for booking ${booking_id}`);
            res.json({ message: 'Refund processed', refund_reference: refundRef });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // ==================== PAYMENT GATEWAY PAGE ====================
    router.get('/payments/gateway/:orderId', async (req, res) => {
        try {
            const payment = await db.get('SELECT * FROM payments WHERE gateway_order_id = ?', req.params.orderId);
            if (!payment) return res.status(404).send('<h1>Payment not found</h1>');

            // Already paid? Redirect to callback
            if (payment.status === 'SUCCESS') {
                const cb = req.query.callback;
                if (cb) return res.redirect(cb + '?status=success');
                return res.send('<h1>Payment already completed</h1>');
            }

            // Get booking info for display
            const booking = await db.get(`
                SELECT b.*, m.title as movie_title FROM bookings b
                JOIN shows s ON b.show_id = s.id
                JOIN movies m ON s.movie_id = m.id WHERE b.id = ?
            `, payment.booking_id);

            res.setHeader('Content-Type', 'text/html');
            res.send(renderGatewayPage({
                orderId: payment.gateway_order_id,
                amount: payment.amount,
                movieTitle: booking?.movie_title || 'Movie Ticket',
                bookingId: payment.booking_id,
                callbackUrl: req.query.callback || '',
            }));
        } catch (err) {
            logger.error('Gateway page error:', err.message);
            res.status(500).send('<h1>Error loading payment page</h1>');
        }
    });

    return router;
};
