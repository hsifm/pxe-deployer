# ─────────────────────────────────────────────────────────────────────────────
# Stage 1: Build the React app
# ─────────────────────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies (cached layer if package.json unchanged)
COPY package*.json ./
RUN npm ci --frozen-lockfile

# Copy source and build
COPY . .
RUN npm run build

# Verify the build produced expected output
RUN test -f dist/index.html || (echo "ERROR: dist/index.html not found — build failed" && exit 1)
RUN test -d dist/assets   || (echo "ERROR: dist/assets not found — build failed" && exit 1)

# ─────────────────────────────────────────────────────────────────────────────
# Stage 2: Serve with nginx (production)
# ─────────────────────────────────────────────────────────────────────────────
FROM nginx:1.25-alpine

# Remove default nginx config
RUN rm /etc/nginx/conf.d/default.conf

# Copy custom nginx config and built app
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/dist /usr/share/nginx/html

# Validate nginx config
RUN nginx -t

EXPOSE 80

# Health check — nginx returns 200 on /
HEALTHCHECK --interval=15s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -qO- http://localhost:80/ > /dev/null || exit 1

CMD ["nginx", "-g", "daemon off;"]
