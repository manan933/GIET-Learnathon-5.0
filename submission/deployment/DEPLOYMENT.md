# Deployment Guide — HostelGrievance

## 1. Quick Start (Local Node.js)

### Prerequisites
- Node.js v20+ or v22+
- npm v10+

### Step-by-Step Execution:
```bash
# 1. Install dependencies
npm install

# 2. Reset and seed the local SQLite database
npm run db:reset

# 3. Start the application (Frontend + API concurrently)
npm run dev:all
```

The application will be accessible at:
- **Frontend UI**: `http://localhost:5173/`
- **Backend API**: `http://127.0.0.1:3001/` (proxied via `/api` by Vite)

---

## 2. Production Build & Execution

```bash
# 1. Build the production SvelteKit client
npm run build

# 2. Run API server in production mode
NODE_ENV=production HOSTEL_API_PORT=3001 tsx src/server/index.ts

# 3. Serve the preview build
npm run preview
```

---

## 3. Docker Deployment

### Build Container:
```bash
docker build -t hostelgrievance:latest -f submission/deployment/Dockerfile .
```

### Run Container:
```bash
docker run -d \
  --name hostelgrievance \
  -p 5173:5173 \
  -p 3001:3001 \
  -v hostel-data:/app/data \
  -v hostel-uploads:/app/uploads \
  hostelgrievance:latest
```

---

## 4. Verification & Testing

Execute the automated test suite:
```bash
npm test
```

Execute TypeScript typecheck:
```bash
npm run typecheck
```
