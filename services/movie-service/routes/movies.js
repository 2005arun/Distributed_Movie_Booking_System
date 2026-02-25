const express = require('express');
const { uuidv4 } = require('../../../shared/db');
const { authMiddleware, adminMiddleware } = require('../../../shared/auth-middleware');

module.exports = (db, redis, logger) => {
    const router = express.Router();

    // ==================== LIST MOVIES ====================
    router.get('/movies', async (req, res) => {
        try {
            const { location_id, genre, language, search, page = 1, limit = 20 } = req.query;
            const offset = (page - 1) * limit;

            // Check cache
            const cacheKey = `movies:${JSON.stringify(req.query)}`;
            const cached = await redis.get(cacheKey);
            if (cached) return res.json(JSON.parse(cached));

            let sql = 'SELECT * FROM movies WHERE is_active = 1';
            const params = [];

            if (genre) { sql += ' AND genre = ?'; params.push(genre); }
            if (language) { sql += ' AND language = ?'; params.push(language); }
            if (search) { sql += ' AND title LIKE ?'; params.push(`%${search}%`); }

            if (location_id) {
                sql += ` AND id IN (
          SELECT DISTINCT m.id FROM movies m
          JOIN shows s ON m.id = s.movie_id
          JOIN screens sc ON s.screen_id = sc.id
          JOIN theaters t ON sc.theater_id = t.id
          WHERE t.location_id = ? AND s.is_active = 1 AND s.start_time > datetime('now')
        )`;
                params.push(location_id);
            }

            const countSql = sql.replace('SELECT *', 'SELECT COUNT(*) as count');
            const { count } = db.prepare(countSql).get(...params);

            sql += ' ORDER BY release_date DESC LIMIT ? OFFSET ?';
            params.push(parseInt(limit), parseInt(offset));
            const movies = db.prepare(sql).all(...params);

            const result = {
                movies,
                pagination: { page: Number(page), limit: Number(limit), total: count, totalPages: Math.ceil(count / limit) },
            };

            await redis.setex(cacheKey, 300, JSON.stringify(result));
            res.json(result);
        } catch (err) {
            logger.error('List movies error:', err.message);
            res.status(500).json({ error: err.message });
        }
    });

    // ==================== GET MOVIE ====================
    router.get('/movies/:id', async (req, res) => {
        try {
            const { id } = req.params;
            const cacheKey = `movie:${id}`;
            const cached = await redis.get(cacheKey);
            if (cached) return res.json(JSON.parse(cached));

            const movie = db.prepare('SELECT * FROM movies WHERE id = ? AND is_active = 1').get(id);
            if (!movie) return res.status(404).json({ error: 'Movie not found' });

            const shows = db.prepare(`
        SELECT s.*, sc.name as screen_name, sc.total_seats, t.name as theater_name, l.city, l.state
        FROM shows s
        JOIN screens sc ON s.screen_id = sc.id
        JOIN theaters t ON sc.theater_id = t.id
        JOIN locations l ON t.location_id = l.id
        WHERE s.movie_id = ? AND s.is_active = 1 AND s.start_time > datetime('now')
        ORDER BY s.start_time
      `).all(id);

            const result = { ...movie, shows };
            await redis.setex(cacheKey, 300, JSON.stringify(result));
            res.json(result);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // ==================== CREATE MOVIE (Admin) ====================
    router.post('/movies', authMiddleware, adminMiddleware, (req, res) => {
        try {
            const { title, description, genre, duration_minutes, language, rating, poster_url, trailer_url, release_date } = req.body;
            if (!title || !duration_minutes) return res.status(400).json({ error: 'Title and duration required' });

            const id = uuidv4();
            db.prepare('INSERT INTO movies (id, title, description, genre, duration_minutes, language, rating, poster_url, trailer_url, release_date) VALUES (?,?,?,?,?,?,?,?,?,?)').run(
                id, title, description, genre, duration_minutes, language || 'English', rating || 0, poster_url, trailer_url, release_date
            );

            const movie = db.prepare('SELECT * FROM movies WHERE id = ?').get(id);
            logger.info(`Movie created: ${title}`);
            res.status(201).json(movie);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // ==================== LOCATIONS ====================
    router.get('/locations', async (req, res) => {
        try {
            const cacheKey = 'locations:all';
            const cached = await redis.get(cacheKey);
            if (cached) return res.json(JSON.parse(cached));

            const locations = db.prepare('SELECT * FROM locations ORDER BY city').all();
            await redis.setex(cacheKey, 3600, JSON.stringify(locations));
            res.json(locations);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    return router;
};
