// In-memory Redis replacement — no external Redis required
// Implements the same API used across services

class MemoryStore {
    constructor() {
        this.store = new Map();
        this.expiry = new Map();
        console.log('✅ In-memory cache initialized (Redis replacement)');
    }

    async get(key) {
        this._checkExpiry(key);
        return this.store.get(key) || null;
    }

    async set(key, value, ...args) {
        // Handle SET key value NX EX ttl
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

// Singleton
let _instance = null;
function createRedis() {
    if (!_instance) _instance = new MemoryStore();
    return _instance;
}

module.exports = { createRedis };
