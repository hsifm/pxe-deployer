#!/usr/bin/env bash
# =============================================================================
# export-docker.sh — PXE Deployer production export script
#
# Runs on your dev/build machine (macOS or Linux with Docker).
# Performs full test suite, builds the Docker image, health-tests it,
# then exports a self-contained offline archive ready for Ubuntu 24.
#
# Usage:
#   chmod +x export-docker.sh
#   ./export-docker.sh
#   ./export-docker.sh --tag v1.2.3   # optional version tag
# =============================================================================

set -euo pipefail

# ── Colours ───────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'

# ── Helpers ───────────────────────────────────────────────────────────────────
step()  { echo -e "\n${CYAN}${BOLD}▶ $*${NC}"; }
ok()    { echo -e "  ${GREEN}✔ $*${NC}"; }
warn()  { echo -e "  ${YELLOW}⚠ $*${NC}"; }
die()   { echo -e "\n${RED}${BOLD}✘ FATAL: $*${NC}\n"; exit 1; }

hr()    { echo -e "${BLUE}────────────────────────────────────────────────────────${NC}"; }

# ── Config ────────────────────────────────────────────────────────────────────
IMAGE_NAME="pxe-deployer"
TAG="${1:-latest}"
# Allow --tag v1.2.3 syntax
if [[ "${1:-}" == "--tag" ]]; then TAG="${2:-latest}"; fi

VERSION="${TAG}"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
EXPORT_DIR="pxe-deployer-export-${TIMESTAMP}"
ARCHIVE_NAME="pxe-deployer-docker-${VERSION}-${TIMESTAMP}.tar.gz"
TEST_PORT=18080
TEST_CONTAINER="pxe-deployer-test-${TIMESTAMP}"

# Trap: clean up test container on any failure
cleanup() {
  if docker ps -q --filter "name=${TEST_CONTAINER}" 2>/dev/null | grep -q .; then
    echo -e "\n${YELLOW}Cleaning up test container…${NC}"
    docker stop "${TEST_CONTAINER}" >/dev/null 2>&1 || true
    docker rm   "${TEST_CONTAINER}" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

# ── Banner ────────────────────────────────────────────────────────────────────
hr
echo -e "${BOLD}  PXE Deployer — Production Export Pipeline${NC}"
echo -e "  Image: ${CYAN}${IMAGE_NAME}:${TAG}${NC}"
echo -e "  Date:  ${TIMESTAMP}"
hr

# ── 1. Prerequisites check ────────────────────────────────────────────────────
step "1/9  Checking prerequisites"

command -v node   >/dev/null 2>&1 || die "node is not installed (need Node 18+)"
command -v npm    >/dev/null 2>&1 || die "npm is not installed"
command -v docker >/dev/null 2>&1 || die "docker is not installed"
command -v curl   >/dev/null 2>&1 || die "curl is not installed"

NODE_VER=$(node --version)
NPM_VER=$(npm --version)
DOCKER_VER=$(docker --version | awk '{print $3}' | tr -d ',')

ok "node    ${NODE_VER}"
ok "npm     ${NPM_VER}"
ok "docker  ${DOCKER_VER}"

docker info >/dev/null 2>&1 || die "Docker daemon is not running — start Docker and retry"
ok "Docker daemon is running"

# ── 2. Clean workspace ────────────────────────────────────────────────────────
step "2/9  Cleaning previous build artifacts"

rm -rf dist dist-ssr
ok "Cleaned dist/"

# ── 3. Install dependencies ───────────────────────────────────────────────────
step "3/9  Installing npm dependencies (npm ci)"

npm ci --frozen-lockfile
ok "Dependencies installed ($(find node_modules -maxdepth 1 -type d | wc -l | tr -d ' ') packages)"

# ── 4. TypeScript type check ──────────────────────────────────────────────────
step "4/9  TypeScript type check"

npm run build 2>&1 | tee /tmp/pxe-build.log | grep -E "^(src/|dist/|✓|error)" || true

# Check for TS errors in the log
if grep -qiE "error TS[0-9]+" /tmp/pxe-build.log 2>/dev/null; then
  echo ""
  grep -E "error TS[0-9]+" /tmp/pxe-build.log | head -20
  die "TypeScript errors found — fix them before exporting"
fi
ok "TypeScript check passed — no type errors"

# ── 5. Verify build output ────────────────────────────────────────────────────
step "5/9  Verifying build output"

test -f dist/index.html   || die "dist/index.html missing"
test -d dist/assets       || die "dist/assets/ missing"
test -f dist/sw.js        || die "dist/sw.js missing (PWA service worker)"

ASSET_COUNT=$(find dist/assets -type f | wc -l | tr -d ' ')
DIST_SIZE=$(du -sh dist | cut -f1)

ok "dist/index.html present"
ok "dist/assets/ contains ${ASSET_COUNT} files"
ok "dist/sw.js (service worker) present"
ok "Total build size: ${DIST_SIZE}"

# Check JS chunks exist
JS_COUNT=$(find dist/assets -name "*.js" | wc -l | tr -d ' ')
[[ ${JS_COUNT} -gt 3 ]] || warn "Expected multiple JS chunks (code splitting), found ${JS_COUNT}"
ok "${JS_COUNT} JavaScript chunks (code splitting active)"

# ── 6. Build Docker image ─────────────────────────────────────────────────────
step "6/9  Building Docker image: ${IMAGE_NAME}:${TAG}"

docker build \
  --tag "${IMAGE_NAME}:${TAG}" \
  --tag "${IMAGE_NAME}:latest" \
  --label "build.timestamp=${TIMESTAMP}" \
  --label "build.version=${VERSION}" \
  --no-cache \
  .

IMAGE_SIZE=$(docker image inspect "${IMAGE_NAME}:${TAG}" --format='{{.Size}}' | \
  awk '{printf "%.1f MB", $1/1024/1024}')

ok "Image built: ${IMAGE_NAME}:${TAG}"
ok "Image size: ${IMAGE_SIZE}"

# ── 7. Run container & health tests ──────────────────────────────────────────
step "7/9  Running container health tests (port ${TEST_PORT})"

# Start the container
docker run -d \
  --name "${TEST_CONTAINER}" \
  --publish "${TEST_PORT}:80" \
  "${IMAGE_NAME}:${TAG}" >/dev/null

ok "Container started: ${TEST_CONTAINER}"

# Wait for nginx to be ready (up to 15 seconds)
echo "  Waiting for nginx to be ready…"
READY=false
for i in $(seq 1 15); do
  if curl -sf "http://localhost:${TEST_PORT}/health" >/dev/null 2>&1; then
    READY=true; break
  fi
  sleep 1
done
[[ ${READY} == true ]] || die "Container did not become healthy within 15 seconds"
ok "nginx health endpoint responded"

# Test: index.html returns 200
HTTP_STATUS=$(curl -so /dev/null -w "%{http_code}" "http://localhost:${TEST_PORT}/")
[[ ${HTTP_STATUS} == "200" ]] || die "GET / returned HTTP ${HTTP_STATUS} (expected 200)"
ok "GET /  → HTTP 200"

# Test: SPA fallback — deep routes return 200 (not 404)
for ROUTE in /servers /os-profiles /deployments /discovery /boot-menu /settings; do
  STATUS=$(curl -so /dev/null -w "%{http_code}" "http://localhost:${TEST_PORT}${ROUTE}")
  [[ ${STATUS} == "200" ]] || die "SPA route ${ROUTE} returned HTTP ${STATUS} (expected 200)"
  ok "GET ${ROUTE}  → HTTP 200 (SPA fallback OK)"
done

# Test: service worker present and served
SW_STATUS=$(curl -so /dev/null -w "%{http_code}" "http://localhost:${TEST_PORT}/sw.js")
[[ ${SW_STATUS} == "200" ]] || die "Service worker /sw.js returned HTTP ${SW_STATUS}"
ok "GET /sw.js  → HTTP 200 (PWA service worker present)"

# Test: static asset caching headers
CACHE_HEADER=$(curl -sI "http://localhost:${TEST_PORT}/sw.js" | grep -i "cache-control" | head -1)
echo "  Cache-Control (sw.js): ${CACHE_HEADER}" | tr -d '\r'

# Test: gzip is active
GZIP=$(curl -sI --compressed "http://localhost:${TEST_PORT}/" | grep -i "content-encoding" | head -1)
if echo "${GZIP}" | grep -qi "gzip"; then
  ok "Gzip compression active"
else
  warn "Gzip header not detected — check nginx config"
fi

# Test: Docker health check agrees
echo "  Waiting for Docker health check…"
sleep 5
HEALTH=$(docker inspect --format='{{.State.Health.Status}}' "${TEST_CONTAINER}" 2>/dev/null || echo "none")
if [[ "${HEALTH}" == "healthy" ]]; then
  ok "Docker HEALTHCHECK → healthy"
else
  warn "Docker HEALTHCHECK status: ${HEALTH} (may need more time)"
fi

# Stop and remove test container
docker stop "${TEST_CONTAINER}" >/dev/null
docker rm   "${TEST_CONTAINER}" >/dev/null
ok "Test container removed"

# ── 8. Export Docker image as tar ─────────────────────────────────────────────
step "8/9  Exporting Docker image to tar"

mkdir -p "${EXPORT_DIR}"
IMAGE_TAR="${EXPORT_DIR}/pxe-deployer-image.tar"

echo "  Saving image (this may take a moment)…"
docker save "${IMAGE_NAME}:${TAG}" -o "${IMAGE_TAR}"
ok "Image saved: ${IMAGE_TAR}"

# ── 9. Create deployment archive ──────────────────────────────────────────────
step "9/9  Assembling deployment archive"

# Copy deployment files
cp docker-compose.yml "${EXPORT_DIR}/"
cp deploy/install.sh  "${EXPORT_DIR}/"
chmod +x "${EXPORT_DIR}/install.sh"

# Write a version info file
cat > "${EXPORT_DIR}/VERSION" <<EOF
PXE Deployer
Version:    ${VERSION}
Built:      ${TIMESTAMP}
Image:      ${IMAGE_NAME}:${TAG}
Node:       ${NODE_VER}
EOF

# Write a quick-start README
cat > "${EXPORT_DIR}/QUICKSTART.md" <<'EOF'
# PXE Deployer — Offline Installation

## Prerequisites on the Ubuntu 24 server
- Docker Engine installed (≥ 24.x) — see install.sh comments if not installed
- Port 8080 open on the firewall (or change PXE_UI_PORT in docker-compose.yml)

## Install

Transfer the archive to your server, then:

```bash
tar -xzf pxe-deployer-docker-*.tar.gz
cd pxe-deployer-export-*/
chmod +x install.sh
sudo ./install.sh
```

The web UI will be available at: http://<server-ip>:8080

## Change the port

Edit docker-compose.yml and set `PXE_UI_PORT` before running install.sh,
or set it as an environment variable:

```bash
PXE_UI_PORT=9090 sudo -E ./install.sh
```

## Update

Re-run the export script to produce a new archive, transfer, and re-run install.sh.

## Status & logs

```bash
sudo docker compose -f /opt/pxe-deployer/docker-compose.yml ps
sudo docker compose -f /opt/pxe-deployer/docker-compose.yml logs -f
```

## Stop / Start

```bash
sudo systemctl stop  pxe-deployer
sudo systemctl start pxe-deployer
```
EOF

# Bundle everything into a single tar.gz
tar -czf "${ARCHIVE_NAME}" "${EXPORT_DIR}/"
ARCHIVE_SIZE=$(du -sh "${ARCHIVE_NAME}" | cut -f1)

# Clean up the staging directory
rm -rf "${EXPORT_DIR}"

# ── Summary ───────────────────────────────────────────────────────────────────
hr
echo ""
echo -e "${GREEN}${BOLD}  ✔ Export complete!${NC}"
echo ""
echo -e "  Archive:  ${CYAN}${BOLD}${ARCHIVE_NAME}${NC}"
echo -e "  Size:     ${ARCHIVE_SIZE}"
echo ""
echo -e "${BOLD}  Transfer to your Ubuntu 24 server:${NC}"
echo ""
echo -e "  ${YELLOW}scp ${ARCHIVE_NAME} user@your-server:/tmp/${NC}"
echo ""
echo -e "${BOLD}  Then on the server:${NC}"
echo ""
echo -e "  ${YELLOW}cd /tmp"
echo -e "  tar -xzf ${ARCHIVE_NAME}"
echo -e "  cd pxe-deployer-export-*/"
echo -e "  chmod +x install.sh"
echo -e "  sudo ./install.sh${NC}"
echo ""
echo -e "  UI will be available at: ${CYAN}http://<server-ip>:8080${NC}"
echo ""
hr
