const API_BASE = '/api';

class ApiService {
    constructor() {
        this.token = localStorage.getItem('accessToken');
    }

    setToken(token) {
        this.token = token;
        if (token) {
            localStorage.setItem('accessToken', token);
        } else {
            localStorage.removeItem('accessToken');
        }
    }

    getToken() {
        return this.token || localStorage.getItem('accessToken');
    }

    async request(url, options = {}) {
        const headers = { 'Content-Type': 'application/json', ...options.headers };
        const token = this.getToken();
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const response = await fetch(`${API_BASE}${url}`, { ...options, headers });

        // Don't intercept 401 for auth endpoints — let the actual error propagate
        const isAuthEndpoint = url.startsWith('/auth/login') || url.startsWith('/auth/signup') || url.startsWith('/auth/google') || url.startsWith('/auth/refresh');

        if (response.status === 401 && !isAuthEndpoint) {
            // Try to refresh token
            const refreshed = await this.refreshToken();
            if (refreshed) {
                headers['Authorization'] = `Bearer ${this.getToken()}`;
                return fetch(`${API_BASE}${url}`, { ...options, headers });
            }
            this.logout();
            window.location.href = '/login';
            throw new Error('Session expired');
        }

        return response;
    }

    async get(url) {
        const res = await this.request(url);
        if (!res.ok) throw new Error((await res.json()).error || 'Request failed');
        return res.json();
    }

    async post(url, data) {
        const res = await this.request(url, { method: 'POST', body: JSON.stringify(data) });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Request failed');
        return json;
    }

    async put(url, data) {
        const res = await this.request(url, { method: 'PUT', body: JSON.stringify(data) });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Request failed');
        return json;
    }

    async delete(url) {
        const res = await this.request(url, { method: 'DELETE' });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Request failed');
        return json;
    }

    // Auth
    async signup(data) {
        const result = await this.post('/auth/signup', data);
        this.setToken(result.accessToken);
        localStorage.setItem('refreshToken', result.refreshToken);
        localStorage.setItem('user', JSON.stringify(result.user));
        return result;
    }

    async login(data) {
        const result = await this.post('/auth/login', data);
        this.setToken(result.accessToken);
        localStorage.setItem('refreshToken', result.refreshToken);
        localStorage.setItem('user', JSON.stringify(result.user));
        return result;
    }

    async googleAuth(credential) {
        const result = await this.post('/auth/google-auth', { credential });
        this.setToken(result.accessToken);
        localStorage.setItem('refreshToken', result.refreshToken);
        localStorage.setItem('user', JSON.stringify(result.user));
        return result;
    }

    async refreshToken() {
        try {
            const refreshToken = localStorage.getItem('refreshToken');
            if (!refreshToken) return false;
            const res = await fetch(`${API_BASE}/auth/refresh`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ refreshToken }),
            });
            if (!res.ok) return false;
            const data = await res.json();
            this.setToken(data.accessToken);
            localStorage.setItem('refreshToken', data.refreshToken);
            return true;
        } catch {
            return false;
        }
    }

    logout() {
        this.setToken(null);
        localStorage.removeItem('refreshToken');
        localStorage.removeItem('user');
    }

    getUser() {
        try {
            return JSON.parse(localStorage.getItem('user'));
        } catch {
            return null;
        }
    }

    isLoggedIn() {
        return !!this.getToken() && !!this.getUser();
    }
}

export const api = new ApiService();
export default api;
