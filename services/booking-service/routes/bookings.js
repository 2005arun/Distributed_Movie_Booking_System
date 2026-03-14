const express = require('express');
const { uuidv4 } = require('../../../shared/db');
const { authMiddleware } = require('../../../shared/auth-middleware');

const LOCK_TTL = 300; // 5 minutes

module.exports = (db, redis, logger) => {
    const router = express.Router();

    // ==================== LOCK SEATS ====================
    router.post('/bookings/lock-seats', authMiddleware, async (req, res) => {
        try {
            const { show_id, seat_ids } = req.body;
            const userId = req.user.id;

            if (!show_id || !seat_ids || !Array.isArray(seat_ids) || seat_ids.length === 0) {
                return res.status(400).json({ error: 'show_id and seat_ids array required' });
            }
            if (seat_ids.length > 10) {
                return res.status(400).json({ error: 'Maximum 10 seats per booking' });
            }

            const show = await db.get('SELECT * FROM shows WHERE id = ? AND is_active = true', show_id);
            if (!show) return res.status(404).json({ error: 'Show not found' });

            // LAYER 1: In-memory lock (Redis replacement)
            const lockedSeats = [];
            for (const seatId of seat_ids) {
                const lockKey = `seat_lock:${show_id}:${seatId}`;
                const result = await redis.set(lockKey, userId, 'NX', 'EX', LOCK_TTL);
                if (result === 'OK') {
                    lockedSeats.push(seatId);
                } else {
                    const holder = await redis.get(lockKey);
                    if (holder === userId) {
                        lockedSeats.push(seatId);
                    } else {
                        // Release all locks we just acquired
                        for (const id of lockedSeats) await redis.del(`seat:${show_id}:${id}`);
                        return res.status(409).json({ error: 'Some seats are already locked', failed_seat_id: seatId });
                    }
                }
            }

            // LAYER 2: DB SeatLock
            const expiresAt = new Date(Date.now() + LOCK_TTL * 1000).toISOString();

            for (const seatId of seat_ids) {
                // Check if already booked
                const existingBooking = await db.get(`
          SELECT bs.id FROM booking_seats bs
          JOIN bookings b ON bs.booking_id = b.id
          WHERE bs.show_id = ? AND bs.seat_id = ? AND b.status IN ('CONFIRMED', 'PENDING')
        `, show_id, seatId);

                if (existingBooking) {
                    for (const id of lockedSeats) await redis.del(`seat:${show_id}:${id}`);
                    return res.status(409).json({ error: 'Seat already booked', seat_id: seatId });
                }

                // Upsert lock - delete expired then insert
                await db.run("DELETE FROM seat_locks WHERE show_id = ? AND seat_id = ? AND expires_at < NOW()", show_id, seatId);
                try {
                    await db.run('INSERT INTO seat_locks (id, show_id, seat_id, user_id, expires_at) VALUES (?, ?, ?, ?, ?)',
                        uuidv4(), show_id, seatId, userId, expiresAt
                    );
                } catch (err) {
                    if (err.code === '23505') {
                        // Lock exists — check if it's ours
                        const existing = await db.get('SELECT user_id FROM seat_locks WHERE show_id = ? AND seat_id = ?', show_id, seatId);
                        if (existing && existing.user_id !== userId) {
                            for (const id of lockedSeats) await redis.del(`seat:${show_id}:${id}`);
                            return res.status(409).json({ error: 'Seat locked by another user', seat_id: seatId });
                        }
                        // It's our lock, update it
                        await db.run('UPDATE seat_locks SET expires_at = ? WHERE show_id = ? AND seat_id = ? AND user_id = ?',
                            expiresAt, show_id, seatId, userId
                        );
                    } else throw err;
                }
            }

            logger.info(`Seats locked: user=${userId}, show=${show_id}, seats=${seat_ids.join(',')}`);
            res.json({
                success: true,
                locked_seats: seat_ids.map(id => ({ seat_id: id, status: 'locked' })),
                expires_in: LOCK_TTL,
                expires_at: expiresAt,
            });
        } catch (err) {
            logger.error('Lock seats error:', err.message);
            res.status(500).json({ error: err.message });
        }
    });

    // ==================== CREATE BOOKING ====================
    router.post('/bookings', authMiddleware, async (req, res) => {
        try {
            const { show_id, seat_ids } = req.body;
            const userId = req.user.id;

            if (!show_id || !seat_ids || seat_ids.length === 0) {
                return res.status(400).json({ error: 'show_id and seat_ids required' });
            }

            // Verify locks
            for (const seatId of seat_ids) {
                const holder = await redis.get(`seat_lock:${show_id}:${seatId}`);
                if (holder !== userId) {
                    return res.status(409).json({ error: 'Seat lock expired. Please re-select.', seat_id: seatId });
                }
            }

            const show = await db.get('SELECT * FROM shows WHERE id = ?', show_id);
            const seats = await db.all(`SELECT * FROM seats WHERE id IN (${seat_ids.map(() => '?').join(',')})`, ...seat_ids);

            if (seats.length !== seat_ids.length) {
                return res.status(400).json({ error: 'Some seats not found' });
            }

            // Calculate total
            let totalAmount = 0;
            const seatPrices = seats.map(seat => {
                const price = parseFloat((show.base_price * seat.price_multiplier).toFixed(2));
                totalAmount += price;
                return { seat_id: seat.id, price };
            });

            const bookingId = uuidv4();

            // Transaction
            try {
                await db.transaction(async (tx) => {
                    await tx.run('INSERT INTO bookings (id, user_id, show_id, status, total_amount, seat_count) VALUES (?, ?, ?, ?, ?, ?)',
                        bookingId, userId, show_id, 'PENDING', totalAmount.toFixed(2), seat_ids.length
                    );
                    for (const sp of seatPrices) {
                        await tx.run('INSERT INTO booking_seats (id, booking_id, show_id, seat_id, price) VALUES (?, ?, ?, ?, ?)',
                            uuidv4(), bookingId, show_id, sp.seat_id, sp.price
                        );
                    }
                    for (const seatId of seat_ids) {
                        await tx.run('UPDATE seat_locks SET booking_id = ? WHERE show_id = ? AND seat_id = ? AND user_id = ?',
                            bookingId, show_id, seatId, userId
                        );
                    }
                });
            } catch (err) {
                if (err.code === '23505') {
                    return res.status(409).json({ error: 'Seat already booked by another user' });
                }
                throw err;
            }

            logger.info(`Booking created: ${bookingId}`);
            res.status(201).json({
                booking: {
                    id: bookingId,
                    user_id: userId,
                    show_id,
                    status: 'PENDING',
                    total_amount: totalAmount.toFixed(2),
                    seat_count: seat_ids.length,
                    seats: seatPrices,
                },
            });
        } catch (err) {
            logger.error('Create booking error:', err.message);
            res.status(500).json({ error: err.message });
        }
    });

    // ==================== USER'S BOOKINGS ====================
    // NOTE: This must be defined BEFORE /bookings/:id to avoid :id matching "user"
    router.get('/bookings/user/me', authMiddleware, async (req, res) => {
        try {
            const bookings = await db.all(`
        SELECT b.*, m.title as movie_title, m.poster_url,
               s.start_time, s.end_time,
               sc.name as screen_name, t.name as theater_name
        FROM bookings b
        JOIN shows s ON b.show_id = s.id
        JOIN movies m ON s.movie_id = m.id
        JOIN screens sc ON s.screen_id = sc.id
        JOIN theaters t ON sc.theater_id = t.id
        WHERE b.user_id = ?
        ORDER BY b.created_at DESC
      `, req.user.id);
            res.json(bookings);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // ==================== GET BOOKING ====================
    router.get('/bookings/:id', authMiddleware, async (req, res) => {
        try {
            const booking = await db.get(`
        SELECT b.*, m.title as movie_title, m.poster_url,
               s.start_time, s.end_time,
               sc.name as screen_name, t.name as theater_name
        FROM bookings b
        JOIN shows s ON b.show_id = s.id
        JOIN movies m ON s.movie_id = m.id
        JOIN screens sc ON s.screen_id = sc.id
        JOIN theaters t ON sc.theater_id = t.id
        WHERE b.id = ?
      `, req.params.id);

            if (!booking) return res.status(404).json({ error: 'Booking not found' });
            if (booking.user_id !== req.user.id && req.user.role !== 'admin') {
                return res.status(403).json({ error: 'Access denied' });
            }

            const seats = await db.all(`
        SELECT se.row_label, se.seat_number, se.seat_type, bs.price
        FROM booking_seats bs
        JOIN seats se ON bs.seat_id = se.id
        WHERE bs.booking_id = ?
      `, booking.id);

            const payment = await db.get('SELECT * FROM payments WHERE booking_id = ?', booking.id);
            const ticket = await db.get('SELECT * FROM tickets WHERE booking_id = ?', booking.id);

            res.json({ ...booking, seats, payment, ticket });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // ==================== CANCEL BOOKING ====================
    router.post('/bookings/:id/cancel', authMiddleware, async (req, res) => {
        try {
            const booking = await db.get('SELECT * FROM bookings WHERE id = ?', req.params.id);
            if (!booking) return res.status(404).json({ error: 'Booking not found' });
            if (booking.user_id !== req.user.id && req.user.role !== 'admin') {
                return res.status(403).json({ error: 'Access denied' });
            }
            if (booking.status === 'CANCELLED') return res.status(400).json({ error: 'Already cancelled' });

            const bookingSeats = await db.all('SELECT * FROM booking_seats WHERE booking_id = ?', booking.id);

            await db.transaction(async (tx) => {
                await tx.run("UPDATE bookings SET status = 'CANCELLED', updated_at = NOW() WHERE id = ?", booking.id);
                await tx.run('DELETE FROM seat_locks WHERE booking_id = ?', booking.id);
                await tx.run("UPDATE tickets SET status = 'INVALIDATED' WHERE booking_id = ?", booking.id);
                await tx.run('DELETE FROM booking_seats WHERE booking_id = ?', booking.id);
            });

            // Release in-memory locks
            for (const bs of bookingSeats) {
                await redis.del(`seat:${booking.show_id}:${bs.seat_id}`);
            }

            if (req.kafkaProducer) {
                await req.kafkaProducer.send('booking.cancelled', [
                    { key: booking.id, value: { booking_id: booking.id, user_id: booking.user_id } },
                ]);
            }

            logger.info(`Booking cancelled: ${booking.id}`);
            res.json({ message: 'Booking cancelled successfully' });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    return router;
};
