// Redis client with automatic in-memory fallback
// Uses ioredis when REDIS_URL is available AND reachable,
// otherwise seamlessly falls back to in-memory cache.
// Returns a proxy so all service references auto-switch on failure.

const Redis = require('ioredis');

// ==================== IN-MEMORY STORE ====================
class MemoryStore {
    constructor() {
        this.store = new Map();
        this.expiry = new Map();
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

// ==================== RESILIENT PROXY ====================
// Wraps Redis client + MemoryStore fallback.
// Every operation tries Redis first; if Redis is not ready or throws,
// it transparently falls back to the in-memory store.
// Services hold THIS proxy — so no stale references.

function createResilientProxy(redisClient, memoryStore) {
    const METHODS = ['get', 'set', 'setex', 'del', 'keys', 'exists'];
    const proxy = {};

    for (const method of METHODS) {
        proxy[method] = async (...args) => {
            // Only use Redis if connected & ready
            if (redisClient && redisClient.status === 'ready') {
                try {
                    return await redisClient[method](...args);
                } catch (err) {
                    // Redis command failed — use fallback silently
                    return await memoryStore[method](...args);
                }
            }
            // Redis not ready — use in-memory
            return await memoryStore[method](...args);
        };
    }

    proxy.quit = async () => {
        try { if (redisClient) await redisClient.quit(); } catch (e) { /* ignore */ }
        await memoryStore.quit();
    };

    // Expose status for debugging
    proxy.getStatus = () => {
        if (!redisClient) return 'memory-only';
        return redisClient.status === 'ready' ? 'redis' : 'memory-fallback';
    };

    return proxy;
}

// ==================== FACTORY ====================
let _instance = null;

function createRedis() {
    if (_instance) return _instance;

    const memoryStore = new MemoryStore();
    const redisUrl = process.env.REDIS_URL;

    if (!redisUrl) {
        console.log('ℹ️  No REDIS_URL set — using in-memory cache');
        _instance = createResilientProxy(null, memoryStore);
        return _instance;
    }

    // Try to create a real Redis client
    const isTLS = redisUrl.startsWith('rediss://');
    console.log(`🔗 Redis: Connecting to ${isTLS ? 'TLS' : 'plain'} Redis...`);

    try {
        const client = new Redis(redisUrl, {
            maxRetriesPerRequest: 1,       // fail fast per-request
            enableOfflineQueue: false,     // don't queue commands when disconnected
            retryStrategy(times) {
                if (times > 3) {
                    console.log('⚠️  Redis: Connection failed after 3 retries — using in-memory fallback');
                    return null; // stop reconnecting
                }
                const delay = Math.min(times * 1000, 3000);
                console.log(`🔄 Redis: Attempt ${times}/3 in ${delay}ms...`);
                return delay;
            },
            connectTimeout: 10000,         // 10s timeout for cloud Redis
            lazyConnect: false,
            tls: isTLS ? { rejectUnauthorized: false } : undefined,
        });

        client.on('connect', () => {
            console.log('✅ Redis connected successfully');
        });

        client.on('ready', async () => {
            console.log('✅ Redis ready — using Redis for caching');
            try {
                const pong = await client.ping();
                console.log(`🏓 Redis PING → ${pong}`);
            } catch (e) {
                console.error('❌ Redis PING failed:', e.message);
            }
        });

        client.on('error', (err) => {
            // Only log once per unique error to avoid spam
            if (!client._lastError || client._lastError !== err.message) {
                console.error('❌ Redis error:', err.message);
                client._lastError = err.message;
            }
        });

        client.on('close', () => {
            console.warn('⚠️  Redis disconnected — falling back to in-memory cache');
        });

        // Return the proxy — it auto-delegates to memory when Redis is down
        _instance = createResilientProxy(client, memoryStore);
        return _instance;
    } catch (err) {
        console.error(`❌ Redis init failed: ${err.message} — using in-memory cache`);
        _instance = createResilientProxy(null, memoryStore);
        return _instance;
    }
}

module.exports = { createRedis };
