const express = require('express');
const { uuidv4 } = require('../../../shared/db');
const { authMiddleware, adminMiddleware } = require('../../../shared/auth-middleware');

module.exports = (db, redis, logger) => {
    const router = express.Router();

    // ==================== LIST SHOWS ====================
    router.get('/shows', async (req, res) => {
        try {
            const { movie_id, location_id, date } = req.query;

            let sql = `
        SELECT s.*, m.title as movie_title, m.poster_url, m.duration_minutes, m.genre, m.language,
               sc.name as screen_name, sc.total_seats,
               t.name as theater_name, t.id as theater_id,
               l.city, l.id as location_id
        FROM shows s
        JOIN movies m ON s.movie_id = m.id
        JOIN screens sc ON s.screen_id = sc.id
        JOIN theaters t ON sc.theater_id = t.id
        JOIN locations l ON t.location_id = l.id
        WHERE s.is_active = true AND s.start_time > NOW()
      `;
            const params = [];

            if (movie_id) { sql += ' AND s.movie_id = ?'; params.push(movie_id); }
            if (location_id) { sql += ' AND t.location_id = ?'; params.push(location_id); }
            if (date) {
                sql += ' AND s.start_time::date = ?::date';
                params.push(date);
            }

            sql += ' ORDER BY s.start_time';
            const shows = await db.all(sql, ...params);

            // Group by theater
            const grouped = {};
            for (const show of shows) {
                if (!grouped[show.theater_id]) {
                    grouped[show.theater_id] = {
                        theater_id: show.theater_id,
                        theater_name: show.theater_name,
                        city: show.city,
                        shows: [],
                    };
                }
                grouped[show.theater_id].shows.push(show);
            }

            res.json({ shows, grouped: Object.values(grouped) });
        } catch (err) {
            logger.error('List shows error:', err.message);
            res.status(500).json({ error: err.message });
        }
    });

    // ==================== GET SEAT LAYOUT ====================
    router.get('/shows/:id/seats', async (req, res) => {
        try {
            const { id } = req.params;

            const show = await db.get(`
        SELECT s.*, m.title as movie_title, m.id as movie_id, sc.name as screen_name, t.name as theater_name
        FROM shows s
        JOIN movies m ON s.movie_id = m.id
        JOIN screens sc ON s.screen_id = sc.id
        JOIN theaters t ON sc.theater_id = t.id
        WHERE s.id = ?
      `, id);

            if (!show) return res.status(404).json({ error: 'Show not found' });

            // Get all seats for this screen
            const seats = await db.all('SELECT * FROM seats WHERE screen_id = ? ORDER BY row_label, seat_number', show.screen_id);

            // Get booked seats
            const bookedSeats = await db.all(`
        SELECT bs.seat_id FROM booking_seats bs
        JOIN bookings b ON bs.booking_id = b.id
        WHERE bs.show_id = ? AND b.status IN ('PENDING', 'CONFIRMED')
      `, id);
            const bookedIds = new Set(bookedSeats.map(s => s.seat_id));

            // Check locks (in-memory cache)
            const lockedIds = new Set();
            for (const seat of seats) {
                const locked = await redis.get(`seat:${id}:${seat.id}`);
                if (locked) lockedIds.add(seat.id);
            }

            // Build layout
            const seatLayout = seats.map(seat => ({
                ...seat,
                price: (show.base_price * seat.price_multiplier).toFixed(2),
                status: bookedIds.has(seat.id) ? 'booked' : lockedIds.has(seat.id) ? 'locked' : 'available',
            }));

            const rows = {};
            for (const seat of seatLayout) {
                if (!rows[seat.row_label]) rows[seat.row_label] = [];
                rows[seat.row_label].push(seat);
            }

            res.json({
                show,
                seatLayout,
                rows,
                summary: {
                    total: seats.length,
                    available: seatLayout.filter(s => s.status === 'available').length,
                    booked: seatLayout.filter(s => s.status === 'booked').length,
                    locked: seatLayout.filter(s => s.status === 'locked').length,
                },
            });
        } catch (err) {
            logger.error('Seat layout error:', err.message);
            res.status(500).json({ error: err.message });
        }
    });

    // ==================== CREATE SHOW (Admin) ====================
    router.post('/shows', authMiddleware, adminMiddleware, async (req, res) => {
        try {
            const { movie_id, screen_id, start_time, end_time, base_price } = req.body;
            if (!movie_id || !screen_id || !start_time || !end_time || !base_price) {
                return res.status(400).json({ error: 'All fields required' });
            }
            const id = uuidv4();
            await db.run('INSERT INTO shows (id, movie_id, screen_id, start_time, end_time, base_price) VALUES (?,?,?,?,?,?)',
                id, movie_id, screen_id, start_time, end_time, base_price
            );
            const show = await db.get('SELECT * FROM shows WHERE id = ?', id);
            res.status(201).json(show);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // ==================== THEATERS ====================
    router.get('/theaters', async (req, res) => {
        try {
            const { location_id } = req.query;
            let sql = 'SELECT t.*, l.city, l.state FROM theaters t JOIN locations l ON t.location_id = l.id';
            const params = [];
            if (location_id) { sql += ' WHERE t.location_id = ?'; params.push(location_id); }
            sql += ' ORDER BY t.name';
            res.json(await db.all(sql, ...params));
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    return router;
};
