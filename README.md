# 🎬 CineBook — Distributed Movie Ticket Booking System

Production-grade microservices architecture for movie ticket booking.

## Architecture

```
Users → Load Balancer → API Gateway (port 3000)
                           ├── Auth Service (3001)
                           ├── Movie Service (3002)
                           ├── Show Service (3003)
                           ├── Booking Service (3004)
                           ├── Payment Service (3005)
                           ├── Ticket Service (3006)
                           └── Notification Service (3007)
                       Infrastructure:
                           ├── PostgreSQL (5432)
                           ├── Redis (6379)
                           └── Kafka (9092)
```

## Quick Start

### With Docker (Recommended)
```bash
docker-compose up --build
```
- Frontend: http://localhost:5173
- API Gateway: http://localhost:3000
- Admin: admin@movieticket.com / admin123

### Local Development
1. Start infrastructure:
```bash
docker-compose up postgres redis kafka zookeeper
```
2. Install dependencies:
```bash
# Install all service dependencies
npm run install:all
```
3. Start services (each in a separate terminal):
```bash
npm run dev:gateway    # API Gateway on :3000
npm run dev:auth       # Auth Service on :3001
npm run dev:movie      # Movie Service on :3002
npm run dev:show       # Show Service on :3003
npm run dev:booking    # Booking Service on :3004
npm run dev:payment    # Payment Service on :3005
npm run dev:ticket     # Ticket Service on :3006
npm run dev:notification # Notification on :3007
```
4. Start frontend:
```bash
cd frontend && npm run dev
```

## Key Features

### Concurrency Protection (3-Layer)
1. **Redis Lock** — `SET seat:showId:seatId userId NX EX 300`
2. **DB SeatLock Table** — Fallback if Redis crashes
3. **UNIQUE Constraint** — `booking_seats(show_id, seat_id)` — Final safety net

### Payment Safety
- **Idempotent** — `UNIQUE(booking_id)` on payments table
- **Webhook-only confirmation** — Never trust client redirect
- **Signature verification** — HMAC SHA256
- **Duplicate webhook protection** — Check status before processing
- **Idempotent refunds** — Check `refund_reference` before processing

### Scalability
- Stateless microservices (horizontal scaling)
- Redis cluster for caching + distributed locks
- Kafka for async processing (tickets, notifications)
- PostgreSQL read replicas for heavy reads
- Rate limiting on API Gateway (token bucket)

## Tech Stack
| Layer | Technology |
|-------|-----------|
| Backend | Node.js, Express.js |
| Frontend | React, Vite |
| Database | PostgreSQL 16 |
| Cache | Redis 7 |
| Queue | Apache Kafka |
| Auth | JWT + OAuth (Google) |
| Container | Docker, Docker Compose |
| Gateway | http-proxy-middleware |

## API Endpoints

| Route | Service | Description |
|-------|---------|-------------|
| POST /api/auth/signup | Auth | Register user |
| POST /api/auth/login | Auth | Login |
| GET /api/movies/movies | Movie | List movies |
| GET /api/shows/shows | Show | List shows |
| GET /api/shows/shows/:id/seats | Show | Seat layout |
| POST /api/bookings/bookings/lock-seats | Booking | Lock seats |
| POST /api/bookings/bookings | Booking | Create booking |
| POST /api/payments/payments/initiate | Payment | Start payment |
| POST /api/payments/payments/webhook | Payment | Webhook |
| GET /api/tickets/tickets/:bookingId | Ticket | Get ticket + QR |

## Database Schema
14+ tables with critical constraints:
- `UNIQUE(show_id, seat_id)` on `booking_seats` — prevents double booking
- `UNIQUE(booking_id)` on `payments` — payment idempotency
- `UNIQUE(transaction_reference)` on `payments` — payment uniqueness
- `UNIQUE(show_id, seat_id)` on `seat_locks` — lock uniqueness
