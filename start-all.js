const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// Load .env file if it exists
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    for (const line of envContent.split('\n')) {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#')) {
            const idx = trimmed.indexOf('=');
            if (idx > 0) {
                const key = trimmed.slice(0, idx).trim();
                const val = trimmed.slice(idx + 1).trim();
                if (!process.env[key]) process.env[key] = val;
            }
        }
    }
}

const services = [
    { name: 'Auth Service', port: 3001, dir: 'services/auth-service' },
    { name: 'Movie Service', port: 3002, dir: 'services/movie-service' },
    { name: 'Show Service', port: 3003, dir: 'services/show-service' },
    { name: 'Booking Service', port: 3004, dir: 'services/booking-service' },
    { name: 'Payment Service', port: 3005, dir: 'services/payment-service' },
    { name: 'Ticket Service', port: 3006, dir: 'services/ticket-service' },
    { name: 'Notification Service', port: 3007, dir: 'services/notification-service' },
    { name: 'API Gateway', port: 3000, dir: 'gateway' },
];

const ROOT = __dirname;
const children = [];

console.log('\n╔══════════════════════════════════════════════════╗');
console.log('║   🎬 CineBook - Movie Ticket Booking System     ║');
console.log('║   Starting all microservices...                  ║');
console.log('╚══════════════════════════════════════════════════╝\n');

for (const svc of services) {
    const cwd = path.join(ROOT, svc.dir);
    const extraEnv = {};
    if (svc.name === 'Notification Service') {
        extraEnv.BREVO_API_KEY = process.env.BREVO_API_KEY || '';
        extraEnv.BREVO_SENDER_EMAIL = process.env.BREVO_SENDER_EMAIL || '';
        extraEnv.RESEND_API_KEY = process.env.RESEND_API_KEY || '';
        extraEnv.SMTP_HOST = process.env.SMTP_HOST || 'smtp.gmail.com';
        extraEnv.SMTP_PORT = process.env.SMTP_PORT || '587';
        extraEnv.SMTP_USER = process.env.SMTP_USER || '';
        extraEnv.SMTP_PASS = process.env.SMTP_PASS || '';
    }
    const child = spawn('node', ['server.js'], {
        cwd,
        env: { ...process.env, PORT: String(svc.port), ...extraEnv },
        stdio: ['pipe', 'pipe', 'pipe'],
    });

    child.stdout.on('data', (data) => {
        const lines = data.toString().trim().split('\n');
        for (const line of lines) {
            if (line.trim()) console.log(`[${svc.name}] ${line.trim()}`);
        }
    });

    child.stderr.on('data', (data) => {
        const lines = data.toString().trim().split('\n');
        for (const line of lines) {
            if (line.trim()) console.error(`[${svc.name}] ❌ ${line.trim()}`);
        }
    });

    child.on('error', (err) => {
        console.error(`[${svc.name}] Failed to start: ${err.message}`);
    });

    child.on('exit', (code) => {
        if (code !== 0 && code !== null) {
            console.error(`[${svc.name}] Exited with code ${code}`);
        }
    });

    children.push(child);
}

// Wait for services to start, then show summary
setTimeout(() => {
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('  ✅ All services started!');
    console.log('');
    console.log('  🌐 API Gateway:  http://localhost:3000');
    console.log('  🖥️  Frontend:     http://localhost:5173 (run: cd frontend && npm run dev)');
    console.log('');
    console.log('  📝 Admin Login:  admin@movieticket.com / admin123');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}, 3000);

// Graceful shutdown
function shutdown() {
    console.log('\n🛑 Shutting down all services...');
    for (const child of children) {
        child.kill('SIGTERM');
    }
    setTimeout(() => process.exit(0), 2000);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
