const Database = require('better-sqlite3');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const DB_PATH = path.join(__dirname, '..', 'data', 'movieticket.db');

// Ensure data directory exists
const fs = require('fs');
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

let _db = null;

function getDB() {
    if (!_db) {
        _db = new Database(DB_PATH);
        _db.pragma('journal_mode = WAL');
        _db.pragma('foreign_keys = ON');
        initSchema(_db);
        console.log('✅ Database connected (SQLite)');
    }
    return _db;
}

function initSchema(db) {
    db.exec(`
    -- Users
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT,
      name TEXT NOT NULL,
      phone TEXT,
      oauth_provider TEXT,
      oauth_id TEXT,
      role TEXT DEFAULT 'user' CHECK (role IN ('user', 'admin')),
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    -- Locations
    CREATE TABLE IF NOT EXISTS locations (
      id TEXT PRIMARY KEY,
      city TEXT NOT NULL,
      state TEXT NOT NULL,
      country TEXT NOT NULL DEFAULT 'India',
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- Theaters
    CREATE TABLE IF NOT EXISTS theaters (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      address TEXT,
      location_id TEXT NOT NULL REFERENCES locations(id),
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    -- Screens
    CREATE TABLE IF NOT EXISTS screens (
      id TEXT PRIMARY KEY,
      theater_id TEXT NOT NULL REFERENCES theaters(id),
      name TEXT NOT NULL,
      total_seats INTEGER NOT NULL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- Movies
    CREATE TABLE IF NOT EXISTS movies (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      genre TEXT,
      duration_minutes INTEGER NOT NULL,
      language TEXT DEFAULT 'English',
      rating REAL DEFAULT 0,
      poster_url TEXT,
      trailer_url TEXT,
      release_date TEXT,
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    -- Shows
    CREATE TABLE IF NOT EXISTS shows (
      id TEXT PRIMARY KEY,
      movie_id TEXT NOT NULL REFERENCES movies(id),
      screen_id TEXT NOT NULL REFERENCES screens(id),
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      base_price REAL NOT NULL,
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- Seats
    CREATE TABLE IF NOT EXISTS seats (
      id TEXT PRIMARY KEY,
      screen_id TEXT NOT NULL REFERENCES screens(id),
      row_label TEXT NOT NULL,
      seat_number INTEGER NOT NULL,
      seat_type TEXT DEFAULT 'regular' CHECK (seat_type IN ('regular', 'premium', 'vip')),
      price_multiplier REAL DEFAULT 1.00,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(screen_id, row_label, seat_number)
    );

    -- Seat Locks
    CREATE TABLE IF NOT EXISTS seat_locks (
      id TEXT PRIMARY KEY,
      show_id TEXT NOT NULL REFERENCES shows(id),
      seat_id TEXT NOT NULL REFERENCES seats(id),
      user_id TEXT NOT NULL REFERENCES users(id),
      booking_id TEXT,
      locked_at TEXT DEFAULT (datetime('now')),
      expires_at TEXT NOT NULL,
      UNIQUE(show_id, seat_id)
    );

    -- Bookings
    CREATE TABLE IF NOT EXISTS bookings (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      show_id TEXT NOT NULL REFERENCES shows(id),
      status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'CONFIRMED', 'CANCELLED', 'EXPIRED', 'REFUNDED')),
      total_amount REAL NOT NULL,
      seat_count INTEGER NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    -- Booking Seats (CRITICAL: prevents double booking)
    CREATE TABLE IF NOT EXISTS booking_seats (
      id TEXT PRIMARY KEY,
      booking_id TEXT NOT NULL REFERENCES bookings(id),
      show_id TEXT NOT NULL REFERENCES shows(id),
      seat_id TEXT NOT NULL REFERENCES seats(id),
      price REAL NOT NULL,
      UNIQUE(show_id, seat_id)
    );

    -- Payments
    CREATE TABLE IF NOT EXISTS payments (
      id TEXT PRIMARY KEY,
      booking_id TEXT NOT NULL REFERENCES bookings(id) UNIQUE,
      user_id TEXT NOT NULL REFERENCES users(id),
      amount REAL NOT NULL,
      currency TEXT DEFAULT 'INR',
      status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PROCESSING', 'SUCCESS', 'FAILED', 'REFUNDED', 'CHARGEBACK')),
      gateway TEXT DEFAULT 'razorpay',
      gateway_order_id TEXT,
      gateway_payment_id TEXT,
      transaction_reference TEXT UNIQUE,
      refund_reference TEXT,
      failure_reason TEXT,
      webhook_received_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    -- Tickets
    CREATE TABLE IF NOT EXISTS tickets (
      id TEXT PRIMARY KEY,
      booking_id TEXT NOT NULL REFERENCES bookings(id) UNIQUE,
      user_id TEXT NOT NULL REFERENCES users(id),
      qr_code TEXT NOT NULL,
      ticket_data TEXT NOT NULL,
      status TEXT DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'USED', 'INVALIDATED')),
      issued_at TEXT DEFAULT (datetime('now'))
    );

    -- Notifications
    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      type TEXT NOT NULL,
      channel TEXT DEFAULT 'email' CHECK (channel IN ('email', 'sms', 'push')),
      subject TEXT,
      message TEXT NOT NULL,
      metadata TEXT,
      status TEXT DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'SENT', 'FAILED')),
      sent_at TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- Refresh Tokens
    CREATE TABLE IF NOT EXISTS refresh_tokens (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);

    // Seed data if empty
    const movieCount = db.prepare('SELECT COUNT(*) as count FROM movies').get();
    if (movieCount.count === 0) {
        seedData(db);
    }
}

function seedData(db) {
    const bcrypt = require('bcrypt');

    // Locations
    const locations = [
        { id: 'loc-001', city: 'Mumbai', state: 'Maharashtra', country: 'India' },
        { id: 'loc-002', city: 'Delhi', state: 'Delhi', country: 'India' },
        { id: 'loc-003', city: 'Bangalore', state: 'Karnataka', country: 'India' },
        { id: 'loc-004', city: 'Chennai', state: 'Tamil Nadu', country: 'India' },
        { id: 'loc-005', city: 'Hyderabad', state: 'Telangana', country: 'India' },
    ];
    const insertLoc = db.prepare('INSERT OR IGNORE INTO locations (id, city, state, country) VALUES (?, ?, ?, ?)');
    for (const l of locations) insertLoc.run(l.id, l.city, l.state, l.country);

    // Theaters
    const theaters = [
        { id: 'th-001', name: 'PVR Phoenix', address: 'Lower Parel, Mumbai', location_id: 'loc-001' },
        { id: 'th-002', name: 'INOX Nariman Point', address: 'Nariman Point, Mumbai', location_id: 'loc-001' },
        { id: 'th-003', name: 'PVR Select City', address: 'Saket, Delhi', location_id: 'loc-002' },
        { id: 'th-004', name: 'INOX Forum', address: 'Koramangala, Bangalore', location_id: 'loc-003' },
        { id: 'th-005', name: 'SPI Palazzo', address: 'Anna Nagar, Chennai', location_id: 'loc-004' },
    ];
    const insertTh = db.prepare('INSERT OR IGNORE INTO theaters (id, name, address, location_id) VALUES (?, ?, ?, ?)');
    for (const t of theaters) insertTh.run(t.id, t.name, t.address, t.location_id);

    // Screens
    const screens = [
        { id: 'sc-001', theater_id: 'th-001', name: 'Screen 1 - IMAX', total_seats: 120 },
        { id: 'sc-002', theater_id: 'th-001', name: 'Screen 2 - 4DX', total_seats: 80 },
        { id: 'sc-003', theater_id: 'th-002', name: 'Screen 1', total_seats: 100 },
        { id: 'sc-004', theater_id: 'th-003', name: 'Screen 1 - Dolby', total_seats: 150 },
        { id: 'sc-005', theater_id: 'th-004', name: 'Screen 1', total_seats: 100 },
    ];
    const insertSc = db.prepare('INSERT OR IGNORE INTO screens (id, theater_id, name, total_seats) VALUES (?, ?, ?, ?)');
    for (const s of screens) insertSc.run(s.id, s.theater_id, s.name, s.total_seats);

    // Movies
    const movies = [
        { id: 'mv-001', title: 'Inception', description: 'A thief who enters the dreams of others to steal secrets from their subconscious.', genre: 'Sci-Fi', duration_minutes: 148, language: 'English', rating: 8.8, release_date: '2024-01-15' },
        { id: 'mv-002', title: 'The Dark Knight', description: 'Batman faces the Joker, a criminal mastermind who wants to plunge Gotham into anarchy.', genre: 'Action', duration_minutes: 152, language: 'English', rating: 9.0, release_date: '2024-02-20' },
        { id: 'mv-003', title: 'Interstellar', description: 'A team of explorers travel through a wormhole in space to ensure humanity\'s survival.', genre: 'Sci-Fi', duration_minutes: 169, language: 'English', rating: 8.6, release_date: '2024-03-10' },
        { id: 'mv-004', title: 'RRR', description: 'A fictional story about two Indian revolutionaries, Alluri Sitarama Raju and Komaram Bheem.', genre: 'Action', duration_minutes: 187, language: 'Telugu', rating: 8.0, release_date: '2024-04-01' },
        { id: 'mv-005', title: 'Jawan', description: 'A man is driven by a personal vendetta to rectify the wrongs in society.', genre: 'Action', duration_minutes: 169, language: 'Hindi', rating: 7.5, release_date: '2024-05-15' },
        { id: 'mv-006', title: 'Oppenheimer', description: 'The story of J. Robert Oppenheimer and the creation of the atomic bomb.', genre: 'Drama', duration_minutes: 180, language: 'English', rating: 8.5, release_date: '2024-06-20' },
    ];
    const insertMv = db.prepare('INSERT OR IGNORE INTO movies (id, title, description, genre, duration_minutes, language, rating, release_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
    for (const m of movies) insertMv.run(m.id, m.title, m.description, m.genre, m.duration_minutes, m.language, m.rating, m.release_date);

    // Seats for each screen
    const seatConfig = {
        'sc-001': { rows: 'ABCDEFGHIJ', perRow: 12 },
        'sc-002': { rows: 'ABCDEFGH', perRow: 10 },
        'sc-003': { rows: 'ABCDEFGHIJ', perRow: 10 },
        'sc-004': { rows: 'ABCDEFGHIJKLMNO', perRow: 10 },
        'sc-005': { rows: 'ABCDEFGHIJ', perRow: 10 },
    };
    const insertSeat = db.prepare('INSERT OR IGNORE INTO seats (id, screen_id, row_label, seat_number, seat_type, price_multiplier) VALUES (?, ?, ?, ?, ?, ?)');

    for (const [screenId, config] of Object.entries(seatConfig)) {
        const rows = config.rows.split('');
        for (let ri = 0; ri < rows.length; ri++) {
            const r = rows[ri];
            let seatType = 'regular';
            let priceMult = 1.0;
            if (ri < Math.ceil(rows.length * 0.2)) { seatType = 'vip'; priceMult = 1.5; }
            else if (ri < Math.ceil(rows.length * 0.5)) { seatType = 'premium'; priceMult = 1.25; }
            for (let s = 1; s <= config.perRow; s++) {
                insertSeat.run(`seat-${screenId}-${r}${s}`, screenId, r, s, seatType, priceMult);
            }
        }
    }

    // Shows (future dates)
    const shows = [
        { id: 'sh-001', movie_id: 'mv-001', screen_id: 'sc-001', start_time: '2026-03-01T10:00:00', end_time: '2026-03-01T12:30:00', base_price: 350 },
        { id: 'sh-002', movie_id: 'mv-001', screen_id: 'sc-001', start_time: '2026-03-01T14:00:00', end_time: '2026-03-01T16:30:00', base_price: 400 },
        { id: 'sh-003', movie_id: 'mv-002', screen_id: 'sc-002', start_time: '2026-03-01T11:00:00', end_time: '2026-03-01T13:30:00', base_price: 300 },
        { id: 'sh-004', movie_id: 'mv-003', screen_id: 'sc-003', start_time: '2026-03-01T15:00:00', end_time: '2026-03-01T17:50:00', base_price: 280 },
        { id: 'sh-005', movie_id: 'mv-004', screen_id: 'sc-004', start_time: '2026-03-01T18:00:00', end_time: '2026-03-01T21:10:00', base_price: 320 },
        { id: 'sh-006', movie_id: 'mv-005', screen_id: 'sc-005', start_time: '2026-03-01T20:00:00', end_time: '2026-03-01T22:50:00', base_price: 300 },
        { id: 'sh-007', movie_id: 'mv-006', screen_id: 'sc-001', start_time: '2026-03-01T19:00:00', end_time: '2026-03-01T22:00:00', base_price: 450 },
        { id: 'sh-008', movie_id: 'mv-002', screen_id: 'sc-004', start_time: '2026-03-02T10:00:00', end_time: '2026-03-02T12:30:00', base_price: 350 },
        { id: 'sh-009', movie_id: 'mv-003', screen_id: 'sc-001', start_time: '2026-03-02T14:00:00', end_time: '2026-03-02T16:50:00', base_price: 380 },
    ];
    const insertShow = db.prepare('INSERT OR IGNORE INTO shows (id, movie_id, screen_id, start_time, end_time, base_price) VALUES (?, ?, ?, ?, ?, ?)');
    for (const s of shows) insertShow.run(s.id, s.movie_id, s.screen_id, s.start_time, s.end_time, s.base_price);

    // Admin user (password: admin123)
    const hash = bcrypt.hashSync('admin123', 10);
    db.prepare('INSERT OR IGNORE INTO users (id, email, password_hash, name, role) VALUES (?, ?, ?, ?, ?)').run(
        'admin-001', 'admin@movieticket.com', hash, 'System Admin', 'admin'
    );

    console.log('✅ Database seeded with movies, theaters, seats, shows, and admin user');
}

module.exports = { getDB, uuidv4 };
