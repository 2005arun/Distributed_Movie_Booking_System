const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { uuidv4 } = require('../../../shared/db');
const { authMiddleware } = require('../../../shared/auth-middleware');

const JWT_SECRET = process.env.JWT_SECRET || 'mtbs_jwt_super_secret_key_2024';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'mtbs_jwt_refresh_secret_key_2024';

module.exports = (db, logger) => {
    const router = express.Router();

    // ==================== SIGNUP ====================
    router.post('/signup', async (req, res) => {
        try {
            const { email, password, name, phone } = req.body;
            if (!email || !password || !name) {
                return res.status(400).json({ error: 'Email, password, and name are required' });
            }
            if (password.length < 6) {
                return res.status(400).json({ error: 'Password must be at least 6 characters' });
            }

            const existing = await db.get('SELECT id FROM users WHERE email = ?', email);
            if (existing) {
                return res.status(409).json({ error: 'Email already registered' });
            }

            const passwordHash = await bcrypt.hash(password, 10);
            const id = uuidv4();

            await db.run('INSERT INTO users (id, email, password_hash, name, phone) VALUES (?, ?, ?, ?, ?)', id, email, passwordHash, name, phone || null);

            const user = { id, email, name, role: 'user' };
            const tokens = await generateTokens(db, user);

            logger.info(`User signed up: ${email}`);
            res.status(201).json({ user, ...tokens });
        } catch (err) {
            logger.error('Signup error:', err.message);
            res.status(500).json({ error: err.message });
        }
    });

    // ==================== LOGIN ====================
    router.post('/login', async (req, res) => {
        try {
            const { email, password } = req.body;
            if (!email || !password) {
                return res.status(400).json({ error: 'Email and password are required' });
            }

            const user = await db.get('SELECT * FROM users WHERE email = ?', email);
            if (!user) {
                return res.status(401).json({ error: 'The User Email is not registered' });
            }

            const valid = await bcrypt.compare(password, user.password_hash);
            if (!valid) {
                return res.status(401).json({ error: 'Password is not matching' });
            }

            const userData = { id: user.id, email: user.email, name: user.name, role: user.role };
            const tokens = await generateTokens(db, userData);

            logger.info(`User logged in: ${email}`);
            res.json({ user: userData, ...tokens });
        } catch (err) {
            logger.error('Login error:', err.message);
            res.status(500).json({ error: err.message });
        }
    });

    // ==================== REFRESH TOKEN ====================
    router.post('/refresh', async (req, res) => {
        try {
            const { refreshToken } = req.body;
            if (!refreshToken) return res.status(400).json({ error: 'Refresh token required' });

            let decoded;
            try {
                decoded = jwt.verify(refreshToken, JWT_REFRESH_SECRET);
            } catch {
                return res.status(401).json({ error: 'Invalid refresh token' });
            }

            const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
            const stored = await db.get('SELECT * FROM refresh_tokens WHERE token_hash = ?', tokenHash);
            if (!stored) return res.status(401).json({ error: 'Refresh token not found' });

            await db.run('DELETE FROM refresh_tokens WHERE id = ?', stored.id);

            const user = await db.get('SELECT id, email, name, role FROM users WHERE id = ?', decoded.id);
            if (!user) return res.status(401).json({ error: 'User not found' });

            const tokens = await generateTokens(db, user);
            res.json(tokens);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // ==================== GOOGLE OAUTH ====================
    router.post('/google-auth', async (req, res) => {
        try {
            const { credential } = req.body;
            if (!credential) return res.status(400).json({ error: 'Credential required' });

            const googleUser = jwt.decode(credential);
            if (!googleUser?.email) return res.status(400).json({ error: 'Invalid credential' });

            let user = await db.get('SELECT id, email, name, role FROM users WHERE email = ?', googleUser.email);

            if (!user) {
                const id = uuidv4();
                await db.run('INSERT INTO users (id, email, name, oauth_provider, oauth_id) VALUES (?, ?, ?, ?, ?)',
                    id, googleUser.email, googleUser.name || googleUser.email.split('@')[0], 'google', googleUser.sub
                );
                user = { id, email: googleUser.email, name: googleUser.name || googleUser.email.split('@')[0], role: 'user' };
            }

            const tokens = await generateTokens(db, user);
            res.json({ user, ...tokens });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // ==================== GET ME ====================
    router.get('/me', authMiddleware, async (req, res) => {
        const user = await db.get('SELECT id, email, name, phone, role, created_at FROM users WHERE id = ?', req.user.id);
        if (!user) return res.status(404).json({ error: 'User not found' });
        res.json(user);
    });

    // ==================== LOGOUT ====================
    router.post('/logout', authMiddleware, async (req, res) => {
        await db.run('DELETE FROM refresh_tokens WHERE user_id = ?', req.user.id);
        res.json({ message: 'Logged out successfully' });
    });

    return router;
};

async function generateTokens(db, user) {
    const payload = { id: user.id, email: user.email, name: user.name, role: user.role };
    const accessToken = jwt.sign(payload, JWT_SECRET, { expiresIn: '15m' });
    const refreshToken = jwt.sign({ id: user.id }, JWT_REFRESH_SECRET, { expiresIn: '10d' });

    const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
    const expiresAt = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString();

    await db.run('INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)',
        uuidv4(), user.id, tokenHash, expiresAt
    );

    return { accessToken, refreshToken };
}
