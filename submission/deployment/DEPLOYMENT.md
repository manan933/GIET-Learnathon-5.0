# Deployment Guide — HostelGrievance

> **🌐 Live Production Deployment**: [https://giet-learnathon-5-0.onrender.com](https://giet-learnathon-5-0.onrender.com)

---

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

## 2. Deploying to Render.com (Persistent SQLite Storage)

### Method A: 1-Click Blueprint (Recommended)
1. Go to [dashboard.render.com](https://dashboard.render.com/) -> **New** -> **Blueprint**.
2. Connect your GitHub repository (`GIET-Learnathon-5.0`).
3. Render will automatically read `render.yaml` and configure:
   - **Build Command**: `npm ci --include=dev && npm run build`
   - **Start Command**: `npm start`
   - **Persistent Disk**: Mounted at `/var/data` (1 GB)
   - **Environment Variables**:
     - `HOSTEL_DB_PATH`: `/var/data/hostel.db`
     - `HOSTEL_UPLOADS_DIR`: `/var/data/uploads`

### Method B: Manual Web Service + Persistent Disk
1. In Render Dashboard, click **New** -> **Web Service**.
2. Select your repository.
3. Settings:
   - **Runtime**: `Node`
   - **Build Command**: `npm ci --include=dev && npm run build`
   - **Start Command**: `npm start`
4. Attach Persistent Disk:
   - Go to **Disks** tab -> **Add Disk**
   - **Name**: `hostel-data`
   - **Mount Path**: `/var/data`
   - **Size**: `1 GB`
5. Environment Variables:
   - `NODE_ENV`: `production`
   - `HOSTEL_API_PORT`: `3001`
   - `HOSTEL_DB_PATH`: `/var/data/hostel.db`
   - `HOSTEL_UPLOADS_DIR`: `/var/data/uploads`
6. Click **Save Changes**.

---

## 3. Production Build & Local Execution

```bash
# 1. Build the production SvelteKit client
npm run build

# 2. Start production preview & API server
npm start
```

---

## 4. Docker Deployment

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

## 5. Verification & Testing

Execute the automated test suite:
```bash
npm test
```

Execute TypeScript typecheck:
```bash
npm run typecheck
```
