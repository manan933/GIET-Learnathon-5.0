# Multi-stage production build for HostelGrievance
FROM node:22-alpine AS builder

WORKDIR /app

# Copy dependency definitions
COPY package*.json tsconfig*.json ./

# Install all dependencies including build tools for better-sqlite3
RUN apk add --no-cache python3 make g++ && \
    npm ci

# Copy source code
COPY . .

# Build frontend
RUN npm run build

# Production runtime stage
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV HOSTEL_API_PORT=3001
ENV HOSTEL_DB_PATH=/app/data/hostel.db
ENV HOSTEL_UPLOADS_DIR=/app/uploads

# Install runtime dependencies
RUN apk add --no-cache python3 make g++

COPY package*.json ./
RUN npm ci --omit=dev

# Copy built assets and server files
COPY --from=builder /app/build ./build
COPY --from=builder /app/src/server ./src/server
COPY --from=builder /app/data ./data
COPY --from=builder /app/uploads ./uploads
COPY tsconfig.server.json ./

# Create non-root user for principle of least privilege
RUN addgroup -S appgroup && adduser -S appuser -G appgroup && \
    mkdir -p /app/data /app/uploads && \
    chown -R appuser:appgroup /app

USER appuser

EXPOSE 3001 5173

CMD ["node", "--import", "tsx", "src/server/index.ts"]
