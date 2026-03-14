// Redis client with in-memory fallback for gradual migration
// Uses ioredis when REDIS_URL is available, otherwise falls back to in-memory cache

const Redis = require('ioredis');

// ==================== IN-MEMORY FALLBACK ====================
class MemoryStore {
    constructor() {
        this.store = new Map();
        this.expiry = new Map();
        console.log('⚠️  Using in-memory cache (Redis not available — fallback mode)');
    }

    async get(key) {
        this._checkExpiry(key);
        return this.store.get(key) || null;
    }

    async set(key, value, ...args) {
        let nx = false;
        let ttl = null;
        for (let i = 0; i < args.length; i++) {
            if (args[i] === 'NX') nx = true;
            if (args[i] === 'EX' && args[i + 1]) ttl = parseInt(args[i + 1]);
        }
        if (nx) {
            this._checkExpiry(key);
            if (this.store.has(key)) return null;
        }
        this.store.set(key, value);
        if (ttl) this.expiry.set(key, Date.now() + ttl * 1000);
        return 'OK';
    }

    async setex(key, ttl, value) {
        this.store.set(key, value);
        this.expiry.set(key, Date.now() + ttl * 1000);
        return 'OK';
    }

    async del(key) {
        this.store.delete(key);
        this.expiry.delete(key);
        return 1;
    }

    async keys(pattern) {
        this._cleanExpired();
        const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
        return [...this.store.keys()].filter(k => regex.test(k));
    }

    async exists(key) {
        this._checkExpiry(key);
        return this.store.has(key) ? 1 : 0;
    }

    async quit() {
        this.store.clear();
        this.expiry.clear();
    }

    _checkExpiry(key) {
        const exp = this.expiry.get(key);
        if (exp && Date.now() > exp) {
            this.store.delete(key);
            this.expiry.delete(key);
        }
    }

    _cleanExpired() {
        const now = Date.now();
        for (const [key, exp] of this.expiry) {
            if (now > exp) {
                this.store.delete(key);
                this.expiry.delete(key);
            }
        }
    }
}

// ==================== REDIS CLIENT FACTORY ====================
let _instance = null;

function createRedis() {
    if (_instance) return _instance;

    const redisUrl = process.env.REDIS_URL;

    if (redisUrl) {
        try {
            const client = new Redis(redisUrl, {
                maxRetriesPerRequest: 3,
                retryStrategy(times) {
                    if (times > 5) {
                        console.error('❌ Redis: Max retries reached, giving up reconnect');
                        return null; // stop retrying
                    }
                    const delay = Math.min(times * 200, 2000);
                    console.log(`🔄 Redis: Retry #${times} in ${delay}ms...`);
                    return delay;
                },
                connectTimeout: 10000,
                lazyConnect: false,
            });

            client.on('connect', () => {
                console.log('✅ Redis connected successfully');
            });

            client.on('ready', () => {
                console.log('✅ Redis ready to accept commands');
            });

            client.on('error', (err) => {
                console.error('❌ Redis error:', err.message);
            });

            client.on('close', () => {
                console.warn('⚠️  Redis connection closed');
            });

            client.on('reconnecting', (delay) => {
                console.log(`🔄 Redis reconnecting in ${delay}ms...`);
            });

            _instance = client;
            return client;
        } catch (err) {
            console.error(`❌ Redis initialization failed: ${err.message}`);
            console.log('⬇️  Falling back to in-memory cache');
            _instance = new MemoryStore();
            return _instance;
        }
    } else {
        console.log('ℹ️  No REDIS_URL set — using in-memory cache');
        _instance = new MemoryStore();
        return _instance;
    }
}

module.exports = { createRedis };
