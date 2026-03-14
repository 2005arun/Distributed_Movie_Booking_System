const { Pool } = require('pg');
const { v4: uuidv4 } = require('uuid');

/**
 * Database Configuration
 * Supports two modes:
 * 1. DATABASE_URL (for cloud providers like Neon, Supabase, etc.)
 * 2. Individual DB_* variables (for local Docker PostgreSQL)
 */
const DB_CONFIG = process.env.DATABASE_URL
    ? {
        connectionString: process.env.DATABASE_URL,
        ssl: {
            rejectUnauthorized: false, // Required for Neon and most cloud providers
        },
        max: 20,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 10000,
    }
    : {
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT || '5432'),
        database: process.env.DB_NAME || 'movieticket',
        user: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD || 'postgres',
        max: 20,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 5000,
    };

let _pool = null;
let _dbWrapper = null;

/**
 * Convert SQLite-style `?` placeholders to PostgreSQL `$1, $2, ...`
 */
function convertPlaceholders(sql) {
    let idx = 0;
    return sql.replace(/\?/g, () => `$${++idx}`);
}

/**
 * Create a wrapper around a pg Pool or Client that provides
 * a simple async API: db.get(), db.all(), db.run()
 */
function createWrapper(poolOrClient) {
    return {
        async get(sql, ...params) {
            const pgSql = convertPlaceholders(sql);
            const flatParams = params.flat();
            const result = await poolOrClient.query(pgSql, flatParams);
            return result.rows[0] || null;
        },
        async all(sql, ...params) {
            const pgSql = convertPlaceholders(sql);
            const flatParams = params.flat();
            const result = await poolOrClient.query(pgSql, flatParams);
            return result.rows;
        },
        async run(sql, ...params) {
            const pgSql = convertPlaceholders(sql);
            const flatParams = params.flat();
            const result = await poolOrClient.query(pgSql, flatParams);
            return { changes: result.rowCount };
        },
        async exec(sql) {
            await poolOrClient.query(sql);
        },
        /**
         * Run a function inside a PostgreSQL transaction.
         * Usage: await db.transaction(async (tx) => { await tx.run(...); })
         */
        async transaction(fn) {
            const client = await _pool.connect();
            try {
                await client.query('BEGIN');
                const tx = createWrapper(client);
                const result = await fn(tx);
                await client.query('COMMIT');
                return result;
            } catch (err) {
                await client.query('ROLLBACK');
                throw err;
            } finally {
                client.release();
            }
        },
        pool: _pool,
    };
}

async function getDB() {
    if (_dbWrapper) return _dbWrapper;

    _pool = new Pool(DB_CONFIG);

    // Test connection
    const client = await _pool.connect();
    client.release();

    _dbWrapper = createWrapper(_pool);

    // Initialize schema and seed
    await initSchema(_dbWrapper);
    console.log('✅ Database connected (PostgreSQL)');

    return _dbWrapper;
}

async function initSchema(db) {
    await db.exec(`
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
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );

    -- Locations
    CREATE TABLE IF NOT EXISTS locations (
      id TEXT PRIMARY KEY,
      city TEXT NOT NULL,
      state TEXT NOT NULL,
      country TEXT NOT NULL DEFAULT 'India',
      created_at TIMESTAMP DEFAULT NOW()
    );

    -- Theaters
    CREATE TABLE IF NOT EXISTS theaters (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      address TEXT,
      location_id TEXT NOT NULL REFERENCES locations(id),
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );

    -- Screens
    CREATE TABLE IF NOT EXISTS screens (
      id TEXT PRIMARY KEY,
      theater_id TEXT NOT NULL REFERENCES theaters(id),
      name TEXT NOT NULL,
      total_seats INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT NOW()
    );

    -- Movies
    CREATE TABLE IF NOT EXISTS movies (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      genre TEXT,
      duration_minutes INTEGER NOT NULL,
      language TEXT DEFAULT 'English',
      rating NUMERIC(3,1) DEFAULT 0,
      poster_url TEXT,
      trailer_url TEXT,
      release_date TEXT,
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );

    -- Shows
    CREATE TABLE IF NOT EXISTS shows (
      id TEXT PRIMARY KEY,
      movie_id TEXT NOT NULL REFERENCES movies(id),
      screen_id TEXT NOT NULL REFERENCES screens(id),
      start_time TIMESTAMP NOT NULL,
      end_time TIMESTAMP NOT NULL,
      base_price NUMERIC(10,2) NOT NULL,
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT NOW()
    );

    -- Seats
    CREATE TABLE IF NOT EXISTS seats (
      id TEXT PRIMARY KEY,
      screen_id TEXT NOT NULL REFERENCES screens(id),
      row_label TEXT NOT NULL,
      seat_number INTEGER NOT NULL,
      seat_type TEXT DEFAULT 'regular' CHECK (seat_type IN ('regular', 'premium', 'vip')),
      price_multiplier NUMERIC(4,2) DEFAULT 1.00,
      created_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(screen_id, row_label, seat_number)
    );

    -- Seat Locks
    CREATE TABLE IF NOT EXISTS seat_locks (
      id TEXT PRIMARY KEY,
      show_id TEXT NOT NULL REFERENCES shows(id),
      seat_id TEXT NOT NULL REFERENCES seats(id),
      user_id TEXT NOT NULL REFERENCES users(id),
      booking_id TEXT,
      locked_at TIMESTAMP DEFAULT NOW(),
      expires_at TIMESTAMP NOT NULL,
      UNIQUE(show_id, seat_id)
    );

    -- Bookings
    CREATE TABLE IF NOT EXISTS bookings (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      show_id TEXT NOT NULL REFERENCES shows(id),
      status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'CONFIRMED', 'CANCELLED', 'EXPIRED', 'REFUNDED')),
      total_amount NUMERIC(10,2) NOT NULL,
      seat_count INTEGER NOT NULL,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );

    -- Booking Seats (CRITICAL: prevents double booking)
    CREATE TABLE IF NOT EXISTS booking_seats (
      id TEXT PRIMARY KEY,
      booking_id TEXT NOT NULL REFERENCES bookings(id),
      show_id TEXT NOT NULL REFERENCES shows(id),
      seat_id TEXT NOT NULL REFERENCES seats(id),
      price NUMERIC(10,2) NOT NULL,
      UNIQUE(show_id, seat_id)
    );

    -- Payments
    CREATE TABLE IF NOT EXISTS payments (
      id TEXT PRIMARY KEY,
      booking_id TEXT NOT NULL REFERENCES bookings(id) UNIQUE,
      user_id TEXT NOT NULL REFERENCES users(id),
      amount NUMERIC(10,2) NOT NULL,
      currency TEXT DEFAULT 'INR',
      status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PROCESSING', 'SUCCESS', 'FAILED', 'REFUNDED', 'CHARGEBACK')),
      gateway TEXT DEFAULT 'razorpay',
      gateway_order_id TEXT,
      gateway_payment_id TEXT,
      transaction_reference TEXT UNIQUE,
      refund_reference TEXT,
      failure_reason TEXT,
      webhook_received_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );

    -- Tickets
    CREATE TABLE IF NOT EXISTS tickets (
      id TEXT PRIMARY KEY,
      booking_id TEXT NOT NULL REFERENCES bookings(id) UNIQUE,
      user_id TEXT NOT NULL REFERENCES users(id),
      qr_code TEXT NOT NULL,
      ticket_data TEXT NOT NULL,
      status TEXT DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'USED', 'INVALIDATED')),
      issued_at TIMESTAMP DEFAULT NOW()
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
      sent_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT NOW()
    );

    -- Refresh Tokens
    CREATE TABLE IF NOT EXISTS refresh_tokens (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TIMESTAMP NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);

    // Seed data if empty (check both movies and shows)
    const movieCount = await db.get('SELECT COUNT(*) as count FROM movies');
    const showCount = await db.get('SELECT COUNT(*) as count FROM shows');
    if (parseInt(movieCount.count) === 0 || parseInt(showCount.count) === 0) {
        await seedData(db);
    }
}

async function seedData(db) {
    const bcrypt = require('bcryptjs');

    // Locations
    const locations = [
        { id: 'loc-001', city: 'Mumbai', state: 'Maharashtra', country: 'India' },
        { id: 'loc-002', city: 'Delhi', state: 'Delhi', country: 'India' },
        { id: 'loc-003', city: 'Bangalore', state: 'Karnataka', country: 'India' },
        { id: 'loc-004', city: 'Chennai', state: 'Tamil Nadu', country: 'India' },
        { id: 'loc-005', city: 'Hyderabad', state: 'Telangana', country: 'India' },
    ];
    for (const l of locations) {
        await db.run('INSERT INTO locations (id, city, state, country) VALUES (?, ?, ?, ?) ON CONFLICT (id) DO NOTHING', l.id, l.city, l.state, l.country);
    }

    // Theaters
    const theaters = [
        { id: 'th-001', name: 'PVR Phoenix', address: 'Lower Parel, Mumbai', location_id: 'loc-001' },
        { id: 'th-002', name: 'INOX Nariman Point', address: 'Nariman Point, Mumbai', location_id: 'loc-001' },
        { id: 'th-003', name: 'PVR Select City', address: 'Saket, Delhi', location_id: 'loc-002' },
        { id: 'th-004', name: 'INOX Forum', address: 'Koramangala, Bangalore', location_id: 'loc-003' },
        { id: 'th-005', name: 'SPI Palazzo', address: 'Anna Nagar, Chennai', location_id: 'loc-004' },
    ];
    for (const t of theaters) {
        await db.run('INSERT INTO theaters (id, name, address, location_id) VALUES (?, ?, ?, ?) ON CONFLICT (id) DO NOTHING', t.id, t.name, t.address, t.location_id);
    }

    // Screens
    const screens = [
        { id: 'sc-001', theater_id: 'th-001', name: 'Screen 1 - IMAX', total_seats: 120 },
        { id: 'sc-002', theater_id: 'th-001', name: 'Screen 2 - 4DX', total_seats: 80 },
        { id: 'sc-003', theater_id: 'th-002', name: 'Screen 1', total_seats: 100 },
        { id: 'sc-004', theater_id: 'th-003', name: 'Screen 1 - Dolby', total_seats: 150 },
        { id: 'sc-005', theater_id: 'th-004', name: 'Screen 1', total_seats: 100 },
        { id: 'sc-006', theater_id: 'th-002', name: 'Screen 2 - IMAX', total_seats: 120 },
        { id: 'sc-007', theater_id: 'th-003', name: 'Screen 2 - 4DX', total_seats: 80 },
        { id: 'sc-008', theater_id: 'th-004', name: 'Screen 2 - Dolby', total_seats: 100 },
        { id: 'sc-009', theater_id: 'th-005', name: 'Screen 1 - IMAX', total_seats: 120 },
        { id: 'sc-010', theater_id: 'th-005', name: 'Screen 2', total_seats: 80 },
    ];
    for (const s of screens) {
        await db.run('INSERT INTO screens (id, theater_id, name, total_seats) VALUES (?, ?, ?, ?) ON CONFLICT (id) DO NOTHING', s.id, s.theater_id, s.name, s.total_seats);
    }

    // Movies (with TMDB poster URLs)
    const movies = [
        { id: 'mv-001', title: 'Inception', description: 'A thief who enters the dreams of others to steal secrets from their subconscious. As he is offered a chance to have his criminal record erased, he must accomplish the impossible — inception.', genre: 'Sci-Fi', duration_minutes: 148, language: 'English', rating: 8.8, release_date: '2024-01-15', poster_url: 'https://image.tmdb.org/t/p/w500/oYuLEt3zVCKq57qu2F8dT7NIa6f.jpg' },
        { id: 'mv-002', title: 'The Dark Knight', description: 'Batman faces the Joker, a criminal mastermind who plunges Gotham City into anarchy. With the help of Lt. Gordon and DA Harvey Dent, Batman must confront the chaos.', genre: 'Action', duration_minutes: 152, language: 'English', rating: 9.0, release_date: '2024-02-20', poster_url: 'https://image.tmdb.org/t/p/w500/qJ2tW6WMUDux911r6m7haRef0WH.jpg' },
        { id: 'mv-003', title: 'Interstellar', description: 'A team of explorers travel through a wormhole in space in an attempt to ensure humanity\'s survival as Earth becomes uninhabitable.', genre: 'Sci-Fi', duration_minutes: 169, language: 'English', rating: 8.6, release_date: '2024-03-10', poster_url: 'https://image.tmdb.org/t/p/w500/gEU2QniE6E77NI6lCU6MxlNBvIx.jpg' },
        { id: 'mv-004', title: 'RRR', description: 'A fictional story about two legendary Indian revolutionaries, Alluri Sitarama Raju and Komaram Bheem, and their fight against the British Raj.', genre: 'Action', duration_minutes: 187, language: 'Telugu', rating: 8.0, release_date: '2024-04-01', poster_url: 'https://image.tmdb.org/t/p/w500/nEufeZlyAOLqO2brrs0yeF1lgXO.jpg' },
        { id: 'mv-005', title: 'Jawan', description: 'A man is driven by a personal vendetta to rectify the wrongs in society, while being backed by a group of women who wish to do the same.', genre: 'Action', duration_minutes: 169, language: 'Hindi', rating: 7.5, release_date: '2024-05-15', poster_url: 'https://image.tmdb.org/t/p/w500/kF7I5ZQbh2iMb4SJb1C6sw6q2jf.jpg' },
        { id: 'mv-006', title: 'Oppenheimer', description: 'The story of J. Robert Oppenheimer and his role in the development of the atomic bomb during World War II, and the consequences that followed.', genre: 'Drama', duration_minutes: 180, language: 'English', rating: 8.5, release_date: '2024-06-20', poster_url: 'https://image.tmdb.org/t/p/w500/8Gxv8gSFCU0XGDykEGv7zR1n2ua.jpg' },
        { id: 'mv-007', title: 'Dune: Part Two', description: 'Paul Atreides unites with the Fremen to wage war against House Harkonnen, while trying to prevent a terrible future only he can foresee.', genre: 'Sci-Fi', duration_minutes: 166, language: 'English', rating: 8.4, release_date: '2024-07-01', poster_url: 'https://image.tmdb.org/t/p/w500/1pdfLvkbY9ohJlCjQH2CZjjYVvJ.jpg' },
        { id: 'mv-008', title: 'Spider-Man: No Way Home', description: 'Peter Parker seeks Doctor Strange\'s help to make the world forget he is Spider-Man, but the spell goes horribly wrong, opening the multiverse.', genre: 'Action', duration_minutes: 148, language: 'English', rating: 8.2, release_date: '2024-07-15', poster_url: 'https://image.tmdb.org/t/p/w500/1g0dhYtq4irTY1GPXvft6k4YLjm.jpg' },
        { id: 'mv-009', title: 'The Batman', description: 'When a sadistic serial killer begins murdering key political figures in Gotham, Batman is forced to investigate the city\'s hidden corruption.', genre: 'Action', duration_minutes: 176, language: 'English', rating: 7.8, release_date: '2024-08-01', poster_url: 'https://image.tmdb.org/t/p/w500/74xTEgt7R36Fpooo50r9T25onhq.jpg' },
        { id: 'mv-010', title: 'Avatar: The Way of Water', description: 'Jake Sully and Neytiri have formed a family and are doing everything to stay together. They must leave their home and explore the regions of Pandora.', genre: 'Sci-Fi', duration_minutes: 192, language: 'English', rating: 7.6, release_date: '2024-08-15', poster_url: 'https://image.tmdb.org/t/p/w500/t6HIqrRAclMCA60NsSmeqe9RmNV.jpg' },
        { id: 'mv-011', title: 'KGF: Chapter 2', description: 'Rocky, the kingpin of the Kolar gold mines, faces new threats from the government and a ruthless antagonist, Adheera.', genre: 'Action', duration_minutes: 168, language: 'Kannada', rating: 7.4, release_date: '2024-09-01', poster_url: 'https://image.tmdb.org/t/p/w500/khNVygolU0TxLIDWff5tQlAhZ23.jpg' },
        { id: 'mv-012', title: 'Pushpa: The Rise', description: 'A laborer rises through the ranks of a red sandalwood smuggling syndicate, leading to fierce conflicts with law enforcement.', genre: 'Action', duration_minutes: 179, language: 'Telugu', rating: 7.6, release_date: '2024-09-15', poster_url: 'https://image.tmdb.org/t/p/w500/h6Pd89ngvl9quPVsx3KoJlQsvk9.jpg' },
        { id: 'mv-013', title: 'Top Gun: Maverick', description: 'After more than 30 years of service, Pete "Maverick" Mitchell is where he belongs, pushing the envelope as a courageous test pilot.', genre: 'Action', duration_minutes: 130, language: 'English', rating: 8.3, release_date: '2024-10-01', poster_url: 'https://image.tmdb.org/t/p/w500/62HCnUTziyWcpDaBO2i1DX17ljH.jpg' },
        { id: 'mv-014', title: 'Everything Everywhere All at Once', description: 'An aging Chinese immigrant is swept up in an insane adventure, where she must connect with parallel universe versions of herself.', genre: 'Sci-Fi', duration_minutes: 139, language: 'English', rating: 8.0, release_date: '2024-10-15', poster_url: 'https://image.tmdb.org/t/p/w500/w3LxiVYdWWRvEVdn5RYq6jIqkb1.jpg' },
        { id: 'mv-015', title: 'Pathaan', description: 'An Indian spy takes on the leader of a group of mercenaries who have nefarious plans to target his homeland.', genre: 'Action', duration_minutes: 146, language: 'Hindi', rating: 6.8, release_date: '2024-11-01', poster_url: 'https://image.tmdb.org/t/p/w500/vkoYdFzpVjLwbP2eo1S8S5gUrEx.jpg' },
        { id: 'mv-016', title: 'Joker', description: 'In Gotham City, mentally troubled comedian Arthur Fleck is disregarded and mistreated by society. He then embarks on a downward spiral of revolution.', genre: 'Drama', duration_minutes: 122, language: 'English', rating: 8.4, release_date: '2024-11-15', poster_url: 'https://image.tmdb.org/t/p/w500/udDclJoHjfjb8Ekgsd4FDteOkCU.jpg' },
        { id: 'mv-017', title: 'Parasite', description: 'Greed and class discrimination threaten the newly formed symbiotic relationship between the wealthy Park family and the destitute Kim clan.', genre: 'Drama', duration_minutes: 132, language: 'Korean', rating: 8.5, release_date: '2024-12-01', poster_url: 'https://image.tmdb.org/t/p/w500/7IiTTgloJzvGI1TAYymCfbfl3vT.jpg' },
        { id: 'mv-018', title: 'Avengers: Endgame', description: 'After devastating events wiped out half of all life, the remaining Avengers must do what\'s necessary to undo Thanos\' actions and restore balance.', genre: 'Action', duration_minutes: 181, language: 'English', rating: 8.4, release_date: '2025-01-01', poster_url: 'https://image.tmdb.org/t/p/w500/or06FN3Dka5tukK1e9sl16pB3iy.jpg' },
        { id: 'mv-020', title: 'The Shawshank Redemption', description: 'Two imprisoned men bond over a number of years, finding solace and eventual redemption through acts of common decency.', genre: 'Drama', duration_minutes: 142, language: 'English', rating: 9.3, release_date: '2025-02-01', poster_url: 'https://image.tmdb.org/t/p/w500/q6y0Go1tsGEsmtFryDOJo3dEmqu.jpg' },
    ];
    for (const m of movies) {
        await db.run('INSERT INTO movies (id, title, description, genre, duration_minutes, language, rating, release_date, poster_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (id) DO NOTHING',
            m.id, m.title, m.description, m.genre, m.duration_minutes, m.language, m.rating, m.release_date, m.poster_url);
    }

    // Seats for each screen
    const seatConfig = {
        'sc-001': { rows: 'ABCDEFGHIJ', perRow: 12 },
        'sc-002': { rows: 'ABCDEFGH', perRow: 10 },
        'sc-003': { rows: 'ABCDEFGHIJ', perRow: 10 },
        'sc-004': { rows: 'ABCDEFGHIJKLMNO', perRow: 10 },
        'sc-005': { rows: 'ABCDEFGHIJ', perRow: 10 },
        'sc-006': { rows: 'ABCDEFGHIJ', perRow: 12 },
        'sc-007': { rows: 'ABCDEFGH', perRow: 10 },
        'sc-008': { rows: 'ABCDEFGHIJ', perRow: 10 },
        'sc-009': { rows: 'ABCDEFGHIJ', perRow: 12 },
        'sc-010': { rows: 'ABCDEFGH', perRow: 10 },
    };

    for (const [screenId, config] of Object.entries(seatConfig)) {
        const rows = config.rows.split('');
        for (let ri = 0; ri < rows.length; ri++) {
            const r = rows[ri];
            let seatType = 'regular';
            let priceMult = 1.0;
            if (ri < Math.ceil(rows.length * 0.2)) { seatType = 'vip'; priceMult = 1.5; }
            else if (ri < Math.ceil(rows.length * 0.5)) { seatType = 'premium'; priceMult = 1.25; }
            for (let s = 1; s <= config.perRow; s++) {
                await db.run('INSERT INTO seats (id, screen_id, row_label, seat_number, seat_type, price_multiplier) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT (id) DO NOTHING',
                    `seat-${screenId}-${r}${s}`, screenId, r, s, seatType, priceMult);
            }
        }
    }

    // Shows (future dates — multiple shows per movie across theaters)
    const shows = [
        // Inception — PVR Phoenix IMAX & INOX Nariman
        { id: 'sh-001', movie_id: 'mv-001', screen_id: 'sc-001', start_time: '2026-03-01T10:00:00', end_time: '2026-03-01T12:30:00', base_price: 350 },
        { id: 'sh-002', movie_id: 'mv-001', screen_id: 'sc-001', start_time: '2026-03-01T14:00:00', end_time: '2026-03-01T16:30:00', base_price: 400 },
        { id: 'sh-003', movie_id: 'mv-001', screen_id: 'sc-006', start_time: '2026-03-01T18:00:00', end_time: '2026-03-01T20:30:00', base_price: 320 },
        // The Dark Knight — PVR Phoenix 4DX & PVR Select Dolby
        { id: 'sh-004', movie_id: 'mv-002', screen_id: 'sc-002', start_time: '2026-03-01T11:00:00', end_time: '2026-03-01T13:30:00', base_price: 300 },
        { id: 'sh-005', movie_id: 'mv-002', screen_id: 'sc-004', start_time: '2026-03-02T10:00:00', end_time: '2026-03-02T12:30:00', base_price: 350 },
        // Interstellar — INOX Nariman & PVR Phoenix IMAX
        { id: 'sh-006', movie_id: 'mv-003', screen_id: 'sc-003', start_time: '2026-03-01T15:00:00', end_time: '2026-03-01T17:50:00', base_price: 280 },
        { id: 'sh-007', movie_id: 'mv-003', screen_id: 'sc-001', start_time: '2026-03-02T14:00:00', end_time: '2026-03-02T16:50:00', base_price: 380 },
        // RRR — PVR Select Dolby
        { id: 'sh-008', movie_id: 'mv-004', screen_id: 'sc-004', start_time: '2026-03-01T18:00:00', end_time: '2026-03-01T21:10:00', base_price: 320 },
        { id: 'sh-009', movie_id: 'mv-004', screen_id: 'sc-009', start_time: '2026-03-02T18:00:00', end_time: '2026-03-02T21:10:00', base_price: 280 },
        // Jawan — INOX Forum & SPI Palazzo
        { id: 'sh-010', movie_id: 'mv-005', screen_id: 'sc-005', start_time: '2026-03-01T20:00:00', end_time: '2026-03-01T22:50:00', base_price: 300 },
        { id: 'sh-011', movie_id: 'mv-005', screen_id: 'sc-009', start_time: '2026-03-01T14:00:00', end_time: '2026-03-01T16:50:00', base_price: 350 },
        // Oppenheimer — PVR Phoenix IMAX
        { id: 'sh-012', movie_id: 'mv-006', screen_id: 'sc-001', start_time: '2026-03-01T19:00:00', end_time: '2026-03-01T22:00:00', base_price: 450 },
        { id: 'sh-013', movie_id: 'mv-006', screen_id: 'sc-006', start_time: '2026-03-02T19:00:00', end_time: '2026-03-02T22:00:00', base_price: 380 },
        // Dune: Part Two — PVR Phoenix IMAX & INOX Nariman IMAX
        { id: 'sh-014', movie_id: 'mv-007', screen_id: 'sc-001', start_time: '2026-03-03T10:00:00', end_time: '2026-03-03T12:50:00', base_price: 400 },
        { id: 'sh-015', movie_id: 'mv-007', screen_id: 'sc-006', start_time: '2026-03-03T14:00:00', end_time: '2026-03-03T16:50:00', base_price: 380 },
        { id: 'sh-016', movie_id: 'mv-007', screen_id: 'sc-004', start_time: '2026-03-03T18:00:00', end_time: '2026-03-03T20:50:00', base_price: 350 },
        // Spider-Man: No Way Home — 4DX & Dolby
        { id: 'sh-017', movie_id: 'mv-008', screen_id: 'sc-002', start_time: '2026-03-03T11:00:00', end_time: '2026-03-03T13:30:00', base_price: 350 },
        { id: 'sh-018', movie_id: 'mv-008', screen_id: 'sc-007', start_time: '2026-03-03T15:00:00', end_time: '2026-03-03T17:30:00', base_price: 320 },
        // The Batman — PVR Select Dolby & SPI Palazzo IMAX
        { id: 'sh-019', movie_id: 'mv-009', screen_id: 'sc-004', start_time: '2026-03-04T10:00:00', end_time: '2026-03-04T13:00:00', base_price: 350 },
        { id: 'sh-020', movie_id: 'mv-009', screen_id: 'sc-009', start_time: '2026-03-04T15:00:00', end_time: '2026-03-04T18:00:00', base_price: 320 },
        // Avatar: The Way of Water — IMAX
        { id: 'sh-021', movie_id: 'mv-010', screen_id: 'sc-001', start_time: '2026-03-04T14:00:00', end_time: '2026-03-04T17:15:00', base_price: 450 },
        { id: 'sh-022', movie_id: 'mv-010', screen_id: 'sc-006', start_time: '2026-03-04T18:00:00', end_time: '2026-03-04T21:15:00', base_price: 400 },
        // KGF: Chapter 2 — INOX Forum & SPI Palazzo
        { id: 'sh-023', movie_id: 'mv-011', screen_id: 'sc-005', start_time: '2026-03-05T10:00:00', end_time: '2026-03-05T12:50:00', base_price: 300 },
        { id: 'sh-024', movie_id: 'mv-011', screen_id: 'sc-008', start_time: '2026-03-05T15:00:00', end_time: '2026-03-05T17:50:00', base_price: 280 },
        // Pushpa: The Rise — Multiple screens
        { id: 'sh-025', movie_id: 'mv-012', screen_id: 'sc-005', start_time: '2026-03-05T18:00:00', end_time: '2026-03-05T21:00:00', base_price: 280 },
        { id: 'sh-026', movie_id: 'mv-012', screen_id: 'sc-009', start_time: '2026-03-05T10:00:00', end_time: '2026-03-05T13:00:00', base_price: 320 },
        // Top Gun: Maverick — IMAX
        { id: 'sh-027', movie_id: 'mv-013', screen_id: 'sc-001', start_time: '2026-03-06T10:00:00', end_time: '2026-03-06T12:15:00', base_price: 380 },
        { id: 'sh-028', movie_id: 'mv-013', screen_id: 'sc-006', start_time: '2026-03-06T14:00:00', end_time: '2026-03-06T16:15:00', base_price: 350 },
        // Everything Everywhere — PVR Select & INOX Forum
        { id: 'sh-029', movie_id: 'mv-014', screen_id: 'sc-004', start_time: '2026-03-06T18:00:00', end_time: '2026-03-06T20:20:00', base_price: 300 },
        { id: 'sh-030', movie_id: 'mv-014', screen_id: 'sc-008', start_time: '2026-03-06T10:00:00', end_time: '2026-03-06T12:20:00', base_price: 280 },
        // Pathaan — Multiple screens
        { id: 'sh-031', movie_id: 'mv-015', screen_id: 'sc-002', start_time: '2026-03-07T10:00:00', end_time: '2026-03-07T12:30:00', base_price: 300 },
        { id: 'sh-032', movie_id: 'mv-015', screen_id: 'sc-003', start_time: '2026-03-07T15:00:00', end_time: '2026-03-07T17:30:00', base_price: 280 },
        // Joker — Dolby
        { id: 'sh-033', movie_id: 'mv-016', screen_id: 'sc-004', start_time: '2026-03-07T19:00:00', end_time: '2026-03-07T21:05:00', base_price: 350 },
        { id: 'sh-034', movie_id: 'mv-016', screen_id: 'sc-008', start_time: '2026-03-07T14:00:00', end_time: '2026-03-07T16:05:00', base_price: 280 },
        // Parasite — PVR Phoenix & SPI Palazzo
        { id: 'sh-035', movie_id: 'mv-017', screen_id: 'sc-003', start_time: '2026-03-08T18:00:00', end_time: '2026-03-08T20:15:00', base_price: 320 },
        { id: 'sh-036', movie_id: 'mv-017', screen_id: 'sc-010', start_time: '2026-03-08T14:00:00', end_time: '2026-03-08T16:15:00', base_price: 280 },
        // Avengers: Endgame — IMAX & 4DX
        { id: 'sh-037', movie_id: 'mv-018', screen_id: 'sc-001', start_time: '2026-03-08T10:00:00', end_time: '2026-03-08T13:05:00', base_price: 450 },
        { id: 'sh-038', movie_id: 'mv-018', screen_id: 'sc-002', start_time: '2026-03-08T15:00:00', end_time: '2026-03-08T18:05:00', base_price: 400 },
        { id: 'sh-039', movie_id: 'mv-018', screen_id: 'sc-009', start_time: '2026-03-08T18:00:00', end_time: '2026-03-08T21:05:00', base_price: 380 },
        // The Shawshank Redemption — PVR Phoenix IMAX & INOX Nariman
        { id: 'sh-042', movie_id: 'mv-020', screen_id: 'sc-001', start_time: '2026-03-09T18:00:00', end_time: '2026-03-09T20:25:00', base_price: 380 },
        { id: 'sh-043', movie_id: 'mv-020', screen_id: 'sc-003', start_time: '2026-03-09T14:00:00', end_time: '2026-03-09T16:25:00', base_price: 300 },
        { id: 'sh-044', movie_id: 'mv-020', screen_id: 'sc-010', start_time: '2026-03-09T10:00:00', end_time: '2026-03-09T12:25:00', base_price: 280 },
    ];
    for (const s of shows) {
        await db.run('INSERT INTO shows (id, movie_id, screen_id, start_time, end_time, base_price) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT (id) DO NOTHING',
            s.id, s.movie_id, s.screen_id, s.start_time, s.end_time, s.base_price);
    }

    // Admin user (password: admin123)
    const hash = bcrypt.hashSync('admin123', 10);
    await db.run('INSERT INTO users (id, email, password_hash, name, role) VALUES (?, ?, ?, ?, ?) ON CONFLICT (id) DO NOTHING',
        'admin-001', 'admin@movieticket.com', hash, 'System Admin', 'admin');

    console.log('✅ Database seeded with movies, theaters, seats, shows, and admin user');
}

module.exports = { getDB, uuidv4 };
