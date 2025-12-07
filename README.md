# Lefty – Surplus Food Marketplace

[![Backend Tests](https://github.com/NicksonCheng/Lefty_backend/actions/workflows/test.yml/badge.svg)](https://github.com/NicksonCheng/Lefty_backend/actions/workflows/test.yml)

A platform connecting users with restaurants to rescue surplus food at discounted prices, reducing food waste while saving money.

## 🚀 How to Run

### Prerequisites

- Docker & Docker Compose
- Node.js 18+ (for local development)
- MySQL 8.0+
- Redis (optional, for performance optimization)

### Docker Setup (Recommended)

```bash
# Navigate to project root
cd /Users/nihaocheng/Desktop/Sideproject/Lefty

# Start all services (Docker, Nginx, MySQL, Node.js)
docker compose up -d --build

# Services will be available at:
# - Frontend: http://localhost:8081
# - Backend API: http://localhost:3000
# - Nginx Proxy: http://localhost:80
# - MySQL: localhost:3306
```

### Service Architecture

```
nginx (Port 80/443)
  ├── Frontend (Port 8081)
  ├── Backend API (Port 3000)
  │   ├── Node.js Server x3 (Load Balanced)
  │   ├── MySQL Database
  │   └── Redis Cache
  └── Health Checks
```

### Local Development (Without Docker)

```bash
# Backend
cd backend
npm install
npm run dev

# Frontend
cd lefty-app
npm install
npm start
```

### Stop Services

```bash
docker compose down

# Clean up volumes
docker compose down -v
```

---

## 📊 Redis Performance Testing

Test Environment: 5,000 merchants / 25,000 meal boxes / 20km search radius

| Range(km) | Records | No Cache(ms) | First Cache(ms) | Cache Hit(ms) | Speedup   |
| --------- | ------- | ------------ | --------------- | ------------- | --------- |
| 3.0       | 200     | 262.0        | 549.0           | 168.0         | 1.56x     |
| 5.0       | 200     | 325.7        | 405.0           | 65.0          | 5.01x     |
| 10.0      | 200     | 374.3        | 536.0           | 70.0          | 5.35x     |
| 15.0      | 200     | 421.3        | 535.0           | 61.0          | 6.91x     |
| 20.0      | 200     | 535.0        | 777.0           | 66.0          | **8.11x** |

**Key Findings**:

- 🚀 **Larger search radius = Better Redis advantage** (1.56x → 8.11x)
- ⚡ **20km range**: MySQL takes 535ms, Redis only **66ms**
- 📈 **Search range impact**: Performance gap increases significantly with distance
- 💾 **Cache stability**: Hit time consistent at 61-168ms

**Best Performance**: 20km range with **8.11x speedup**

---

## 🖼️ AWS S3 Image Storage

### Overview

- **Frontend** uploads images directly to AWS S3 bucket
- **Backend** stores S3 image URLs in MySQL database
- **Database** retrieves and displays images via stored URLs

### Flow

```
Frontend (Image Upload)
    ↓
AWS S3 (Image Storage)
    ↓
Backend API (Store S3 URL)
    ↓
MySQL Database (URL Storage)
    ↓
Frontend Display (Load from URL)
```

### Database Schema

```sql
CREATE TABLE mealbox (
  id INT PRIMARY KEY AUTO_INCREMENT,
  merchant_id INT NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  img_url VARCHAR(500),  -- S3 URL stored here
  original_price DECIMAL(10, 2),
  discount_price DECIMAL(10, 2),
  quantity INT,
  pickup_time_start TIME,
  pickup_time_end TIME,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (merchant_id) REFERENCES merchant(id)
);
```

### Example URL

```
https://lefty-mealbox-images.s3.ap-southeast-2.amazonaws.com/merchants/123/mealboxes/0/1733600123456-abc123.jpg
```

---

## 🔄 GitHub CI/CD

### Automated Workflows

```
┌─ GitHub Push
└─ Trigger Actions
   ├─ Run Tests (Jest/Mocha)
   ├─ Lint Code (ESLint)
   ├─ Build Docker Image
   ├─ Push to Registry
   └─ Deploy to Production (Render/Vercel)
```

### Current Setup

- **Backend Testing**: Automated on every push to `master`
- **Build Pipeline**: Docker image building & optimization
- **Deployment Targets**:
  - Backend: [Render](https://render.com)
  - Frontend: [Vercel](https://vercel.com)

### Workflow Files

Located in `.github/workflows/`:

- `test.yml` - Run tests and lint
- `build.yml` - Build Docker images
- `deploy.yml` - Deploy to production

### View CI/CD Status

- Backend: [![Backend Tests](https://github.com/NicksonCheng/Lefty_backend/actions/workflows/test.yml/badge.svg)](https://github.com/NicksonCheng/Lefty_backend/actions/workflows/test.yml)
- Check Actions tab: https://github.com/NicksonCheng/Lefty_backend/actions

---

## 📚 Project Structure

```
Lefty/
├── backend/                 # Express.js API Server
│   ├── src/
│   │   ├── server.ts       # Main entry point
│   │   ├── db.ts           # Database connection
│   │   ├── routes/         # API endpoints
│   │   ├── services/       # Business logic
│   │   ├── repositories/   # Database queries
│   │   └── middleware/     # Auth, validation, etc.
│   ├── tests/              # Test files
│   └── Dockerfile
├── lefty-app/              # Expo React Native Frontend
│   ├── src/
│   │   ├── screens/        # Screen components
│   │   ├── services/       # S3 upload service
│   │   ├── api/            # API client
│   │   └── contexts/       # Auth context
│   └── app.json            # Expo config
├── nginx/                  # Nginx proxy config
├── mysql-init/             # Database initialization
├── docker-compose.yml      # Multi-container orchestration
└── README.md

```

## 🔗 Related Repositories

- [Frontend (Expo React Native)](./lefty-app)
- [Backend API (Express.js)](https://github.com/NicksonCheng/Lefty_backend)

## 📝 License

MIT License - See LICENSE file for details
