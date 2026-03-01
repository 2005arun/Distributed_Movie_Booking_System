# 🎬 CineBook — Distributed Movie Ticket Booking System

A production-ready, scalable movie ticket booking platform built using **microservices architecture** with real-time seat locking, async event processing, and email notifications.

---

## 🏗️ System Architecture

```
Client (Web/Mobile)
        │
        ▼
Edge Load Balancer (Nginx)
        │
        ▼
API Gateway Cluster (N instances)
        │
        ▼
Internal Load Balancer (Nginx)
        │
        ▼
┌───────┬───────┬───────┬───────┬───────┬───────┬───────┐
│ Auth  │ Movie │ Show  │Booking│Payment│Ticket │Notif  │
│Service│Service│Service│Service│Service│Service│Service│
└───────┴───────┴───────┴───────┴───────┴───────┴───────┘
        │                               │
        ▼                               ▼
   PostgreSQL                      RabbitMQ
 (Primary + Replica)           (Message Queue)
```

---

## 🔧 Tech Stack

| Layer | Technology |
|-------|------------|
| **Frontend** | React.js + Vite + Tailwind CSS |
| **API Gateway** | Node.js (Express) |
| **Microservices** | Node.js (7 services) |
| **Database** | PostgreSQL 16 |
| **Message Queue** | RabbitMQ |
| **Authentication** | JWT + Google OAuth |
| **Payment** | Razorpay Integration |
| **Email** | Brevo SMTP API |
| **Containerization** | Docker |
| **Load Balancing** | Nginx |

---

## 🎯 Microservices

| # | Service | Port | Responsibility |
|---|---------|------|----------------|
| 1 | **Auth Service** | 3001 | User signup, login, JWT tokens, Google OAuth |
| 2 | **Movie Service** | 3002 | Movie catalog, search by city/genre/language |
| 3 | **Show Service** | 3003 | Theaters, screens, showtimes, seat catalog |
| 4 | **Booking Service** | 3004 | Seat locking (10-min TTL), booking creation |
| 5 | **Payment Service** | 3005 | Razorpay integration, idempotent transactions |
| 6 | **Ticket Service** | 3006 | QR code generation, ticket issuance |
| 7 | **Notification Service** | 3007 | Email notifications via Brevo API |
| 8 | **API Gateway** | 3000 | Request routing, JWT validation, rate limiting |
| 9 | **Frontend** | 5173 | React UI |

---

## 🐳 Docker Images

| Container | Image | Version |
|-----------|-------|---------|
| PostgreSQL | `postgres` | 16-alpine |
| RabbitMQ | `rabbitmq` | 3-management-alpine |
| Auth Service | `arun498/auth-service` | 3.9 |
| Movie Service | `arun498/movie-service` | 3.9 |
| Show Service | `arun498/show-service` | 3.9 |
| Booking Service | `arun498/booking-service` | 3.9 |
| Payment Service | `arun498/payment-service` | 3.9 |
| Ticket Service | `arun498/ticket-service` | 3.9 |
| Notification Service | `arun498/notification-service` | 3.9 |
| API Gateway | `arun498/api-gateway` | 3.9 |
| Frontend | `arun498/frontend` | 3.9 |

---

## 🚀 Quick Start

### Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) installed and running
- Git installed

### Option 1: Production Mode (Recommended)

```bash
# Clone the repository
git clone https://github.com/2005arun/Distributed_Movie_Booking_System.git
cd Distributed_Movie_Booking_System

# Start all 11 containers
docker compose up -d

# Wait 30 seconds for initialization

# Access the application
# Frontend:    http://localhost:5173
# API Gateway: http://localhost:3000
# RabbitMQ:    http://localhost:15672 (guest/guest)
```

### Option 2: Development Mode

```bash
# Start PostgreSQL & RabbitMQ only
docker compose up -d postgres rabbitmq

# Wait 15 seconds for database initialization

# Install dependencies
npm install

# Start all backend services
node start-all.js

# In a new terminal, start frontend
cd frontend
npm run dev
```

---

## 🌐 Access Points

| Service | URL | Credentials |
|---------|-----|-------------|
| **Frontend** | http://localhost:5173 | — |
| **API Gateway** | http://localhost:3000 | — |
| **RabbitMQ Dashboard** | http://localhost:15672 | guest / guest |
| **PostgreSQL** | localhost:5432 | postgres / postgres |

### Test Login

```
Email:    admin@movieticket.com
Password: admin123
```

---

## 📊 Database Schema

### Tables (14 Total)

```
USERS ──< REFRESH_TOKENS
USERS ──< BOOKINGS ──< BOOKING_SEATS
USERS ──< NOTIFICATIONS

LOCATIONS ──< THEATERS ──< SCREENS ──< SEATS
                                   ──< SHOWS

MOVIES ──< SHOWS ──< SEAT_LOCKS
                 ──< BOOKINGS

BOOKINGS ──── PAYMENTS (1:1)
BOOKINGS ──── TICKETS (1:1)
```

### Key Tables

| Table | Purpose |
|-------|---------|
| `users` | User accounts with OAuth support |
| `movies` | Movie catalog with TMDB posters |
| `theaters` → `screens` → `seats` | Theater hierarchy |
| `shows` | Movie showtimes with pricing |
| `seat_locks` | Temporary locks with 10-min TTL |
| `bookings` → `booking_seats` | Booking with multiple seats |
| `payments` | Idempotent payment records |
| `tickets` | QR code tickets |
| `notifications` | Email/SMS audit log |

---

## 🔄 Booking Flow

```
1️⃣ User Login → JWT token issued
2️⃣ Browse Movies → Filter by city/genre
3️⃣ Select Show & Seats → View availability
4️⃣ Lock Seats → 10-min TTL (prevents conflicts)
5️⃣ Create Booking → Status: pending
6️⃣ Process Payment → Razorpay → RabbitMQ
7️⃣ Confirm Booking → Async via RabbitMQ
8️⃣ Generate Ticket → QR code created
9️⃣ Send Email → Brevo API → User inbox
```

---

## 📨 Message Queue Flow

```
Payment Service ──(payment.success)──▶ RabbitMQ
                                           │
Booking Service ◀──────────────────────────┘
        │
        └──(booking.confirmed)──▶ RabbitMQ
                                      │
Ticket Service ◀──────────────────────┘
        │
        └──(ticket.issued)──▶ RabbitMQ
                                  │
Notification Service ◀────────────┘
        │
        └──▶ Brevo API ──▶ User Email
```

---

## ⚡ Edge Cases Handled

| Edge Case | Solution |
|-----------|----------|
| **Same seat selected by 2 users** | `UNIQUE(show_id, seat_id)` on seat_locks |
| **Payment double-click** | `UNIQUE(booking_id)` on payments (idempotency) |
| **Seat lock expires** | `expires_at` column + periodic cleanup |
| **Service failure** | RabbitMQ retries + Dead Letter Queue |
| **Email fails** | Retry queue with exponential backoff |
| **Token expiry** | Refresh token rotation (15min + 7d) |

---

## 🛑 Stop & Cleanup

```bash
# Stop all containers
docker compose down

# Stop and remove volumes (clears database)
docker compose down -v

# Remove all images
docker rmi $(docker images -q)
```

---

## 📁 Project Structure

```
booking_movie_ticket/
├── frontend/                 # React frontend
│   ├── src/
│   └── Dockerfile
├── gateway/                  # API Gateway
│   ├── src/
│   └── Dockerfile
├── services/
│   ├── auth-service/         # Authentication
│   ├── movie-service/        # Movie catalog
│   ├── show-service/         # Shows & theaters
│   ├── booking-service/      # Bookings & seat locks
│   ├── payment-service/      # Payment processing
│   ├── ticket-service/       # Ticket generation
│   └── notification-service/ # Email notifications
├── docker-compose.yml        # Docker orchestration
├── start-all.js              # Development startup script
└── README.md
```

---

## 🔐 Environment Variables

Create `.env` file in root directory:

```env
# Database
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres
POSTGRES_DB=cinebook

# RabbitMQ
RABBITMQ_URL=amqp://guest:guest@localhost:5672

# JWT
JWT_SECRET=your-super-secret-key
JWT_EXPIRES_IN=15m
REFRESH_TOKEN_EXPIRES_IN=7d

# Google OAuth
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret

# Razorpay
RAZORPAY_KEY_ID=your-razorpay-key
RAZORPAY_KEY_SECRET=your-razorpay-secret

# Brevo (Email)
BREVO_API_KEY=your-brevo-api-key
BREVO_SENDER_EMAIL=noreply@cinebook.com
```

---

## 🧪 API Endpoints

### Auth Service (`:3001`)
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/signup` | User registration |
| POST | `/api/auth/login` | User login |
| POST | `/api/auth/refresh` | Refresh token |
| POST | `/api/auth/google` | Google OAuth |
| POST | `/api/auth/logout` | Logout |

### Movie Service (`:3002`)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/movies` | List all movies |
| GET | `/api/movies/:id` | Get movie details |
| GET | `/api/movies?city=` | Filter by city |

### Show Service (`:3003`)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/shows` | List all shows |
| GET | `/api/shows/:id` | Get show details |
| GET | `/api/shows/:id/seats` | Get seat availability |

### Booking Service (`:3004`)
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/bookings/lock` | Lock seats |
| POST | `/api/bookings` | Create booking |
| GET | `/api/bookings/:id` | Get booking details |
| GET | `/api/bookings/user/:userId` | User's bookings |

### Payment Service (`:3005`)
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/payments/initiate` | Initiate payment |
| POST | `/api/payments/confirm` | Confirm payment |
| GET | `/api/payments/:id` | Payment status |

### Ticket Service (`:3006`)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/tickets/:id` | Get ticket details |
| GET | `/api/tickets/booking/:bookingId` | Get ticket by booking |

---

## 📈 Scaling

### Horizontal Scaling
```bash
# Scale API Gateway to 3 instances
docker compose up -d --scale api-gateway=3

# Scale any service
docker compose up -d --scale auth-service=3
```

### Database Scaling
- **Primary**: All writes
- **Read Replicas**: Read-heavy queries
- **Future**: Sharding by city/theater_id

---

## 🤝 Contributing

1. Fork the repository
2. Create feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open Pull Request
---

## 👤 Author
- Docker Hub: [arun498](https://hub.docker.com/u/arun498)
---

**#Microservices #NodeJS #React #PostgreSQL #RabbitMQ #Docker #SystemDesign #DistributedSystems**
