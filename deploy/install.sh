#!/usr/bin/env bash
# =============================================================================
# install.sh — PXE Deployer offline installer for Ubuntu 24 LTS
#
# Run this on the target server AFTER extracting the export archive.
# Requires: Docker Engine (installed by this script if missing)
#
# Usage:
#   chmod +x install.sh
#   sudo ./install.sh
#   sudo PXE_UI_PORT=9090 ./install.sh   # custom port
# =============================================================================

set -euo pipefail

# ── Colours ───────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'

step() { echo -e "\n${CYAN}${BOLD}▶ $*${NC}"; }
ok()   { echo -e "  ${GREEN}✔ $*${NC}"; }
warn() { echo -e "  ${YELLOW}⚠ $*${NC}"; }
die()  { echo -e "\n${RED}${BOLD}✘ FATAL: $*${NC}\n"; exit 1; }

# ── Config ────────────────────────────────────────────────────────────────────
IMAGE_NAME="pxe-deployer"
IMAGE_TAG="latest"
CONTAINER_NAME="pxe-deployer"
INSTALL_DIR="/opt/pxe-deployer"
SERVICE_NAME="pxe-deployer"
PXE_UI_PORT="${PXE_UI_PORT:-8080}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ── Must be root ──────────────────────────────────────────────────────────────
[[ ${EUID} -eq 0 ]] || die "Please run as root: sudo ./install.sh"

echo ""
echo -e "${BOLD}══════════════════════════════════════════════${NC}"
echo -e "${BOLD}  PXE Deployer — Offline Installer${NC}"
echo -e "${BOLD}══════════════════════════════════════════════${NC}"
echo ""

# ── 1. System info ────────────────────────────────────────────────────────────
step "1/7  System check"

OS_ID=$(. /etc/os-release && echo "${ID}")
OS_VERSION=$(. /etc/os-release && echo "${VERSION_ID}")

ok "OS: ${OS_ID} ${OS_VERSION}"

if [[ "${OS_ID}" != "ubuntu" ]]; then
  warn "This script is designed for Ubuntu. Proceeding anyway — manual steps may be needed."
fi

# ── 2. Install Docker if missing ──────────────────────────────────────────────
step "2/7  Checking Docker"

if command -v docker >/dev/null 2>&1; then
  DOCKER_VER=$(docker --version | awk '{print $3}' | tr -d ',')
  ok "Docker already installed: ${DOCKER_VER}"
else
  warn "Docker not found — installing Docker Engine from apt…"
  echo "  (Requires internet access for package downloads)"

  apt-get update -qq
  apt-get install -y -qq ca-certificates curl gnupg lsb-release

  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
    | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  chmod a+r /etc/apt/keyrings/docker.gpg

  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "${VERSION_CODENAME}") stable" \
    > /etc/apt/sources.list.d/docker.list

  apt-get update -qq
  apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-compose-plugin

  systemctl enable --now docker
  ok "Docker Engine installed and started"
fi

docker info >/dev/null 2>&1 || die "Docker daemon is not running"
ok "Docker daemon is running"

# ── 3. Load Docker image ──────────────────────────────────────────────────────
step "3/7  Loading Docker image from archive"

IMAGE_TAR="${SCRIPT_DIR}/pxe-deployer-image.tar"
[[ -f "${IMAGE_TAR}" ]] || die "Image file not found: ${IMAGE_TAR}"

echo "  Loading image (may take 30–60 seconds)…"
docker load -i "${IMAGE_TAR}"

# Verify image loaded
docker image inspect "${IMAGE_NAME}:${IMAGE_TAG}" >/dev/null 2>&1 \
  || die "Image ${IMAGE_NAME}:${IMAGE_TAG} not found after loading"

IMAGE_SIZE=$(docker image inspect "${IMAGE_NAME}:${IMAGE_TAG}" \
  --format='{{.Size}}' | awk '{printf "%.1f MB", $1/1024/1024}')
ok "Image loaded: ${IMAGE_NAME}:${IMAGE_TAG} (${IMAGE_SIZE})"

# ── 4. Stop any existing instance ────────────────────────────────────────────
step "4/7  Stopping previous instance (if any)"

if docker ps -q --filter "name=^${CONTAINER_NAME}$" 2>/dev/null | grep -q .; then
  docker stop "${CONTAINER_NAME}" >/dev/null
  docker rm   "${CONTAINER_NAME}" >/dev/null
  ok "Previous container stopped and removed"
else
  ok "No previous container running"
fi

# ── 5. Install files & docker-compose.yml ────────────────────────────────────
step "5/7  Installing to ${INSTALL_DIR}"

mkdir -p "${INSTALL_DIR}"

# Write docker-compose.yml with the chosen port
cat > "${INSTALL_DIR}/docker-compose.yml" <<EOF
version: "3.9"

services:
  pxe-deployer:
    image: ${IMAGE_NAME}:${IMAGE_TAG}
    container_name: ${CONTAINER_NAME}
    restart: unless-stopped
    ports:
      - "${PXE_UI_PORT}:80"
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://localhost:80/health"]
      interval: 15s
      timeout: 5s
      retries: 3
      start_period: 5s
EOF

ok "Installed ${INSTALL_DIR}/docker-compose.yml"

# Write version file
if [[ -f "${SCRIPT_DIR}/VERSION" ]]; then
  cp "${SCRIPT_DIR}/VERSION" "${INSTALL_DIR}/VERSION"
  ok "Version info saved"
fi

# ── 6. Create systemd service ─────────────────────────────────────────────────
step "6/7  Creating systemd service: ${SERVICE_NAME}"

cat > "/etc/systemd/system/${SERVICE_NAME}.service" <<EOF
[Unit]
Description=PXE Deployer Web UI
Documentation=https://github.com/pxe-deployer
After=docker.service network-online.target
Requires=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=${INSTALL_DIR}
ExecStart=/usr/bin/docker compose -f ${INSTALL_DIR}/docker-compose.yml up -d --remove-orphans
ExecStop=/usr/bin/docker compose -f ${INSTALL_DIR}/docker-compose.yml down
ExecReload=/usr/bin/docker compose -f ${INSTALL_DIR}/docker-compose.yml pull
TimeoutStartSec=120
TimeoutStopSec=30

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable "${SERVICE_NAME}"
ok "Systemd service created and enabled"

# ── 7. Start the service & final health check ─────────────────────────────────
step "7/7  Starting PXE Deployer"

systemctl start "${SERVICE_NAME}"
ok "Service started"

# Wait for the container to be healthy
echo "  Waiting for health check (up to 30 seconds)…"
HEALTHY=false
for i in $(seq 1 30); do
  STATUS=$(docker inspect --format='{{.State.Health.Status}}' \
    "${CONTAINER_NAME}" 2>/dev/null || echo "none")
  if [[ "${STATUS}" == "healthy" ]]; then
    HEALTHY=true; break
  fi
  if [[ "${STATUS}" == "unhealthy" ]]; then
    break
  fi
  sleep 1
done

if [[ "${HEALTHY}" == true ]]; then
  ok "Container is healthy"
else
  # Fall back to a direct HTTP check
  if curl -sf "http://localhost:${PXE_UI_PORT}/health" >/dev/null 2>&1; then
    ok "HTTP health check passed"
  else
    warn "Health check inconclusive — check logs with:"
    warn "  docker compose -f ${INSTALL_DIR}/docker-compose.yml logs"
  fi
fi

# Confirm a real page loads
HTTP=$(curl -so /dev/null -w "%{http_code}" "http://localhost:${PXE_UI_PORT}/" 2>/dev/null || echo "000")
if [[ "${HTTP}" == "200" ]]; then
  ok "GET http://localhost:${PXE_UI_PORT}/  → HTTP 200 ✔"
else
  warn "GET / returned HTTP ${HTTP} — the app may still be starting"
fi

# ── Summary ───────────────────────────────────────────────────────────────────
SERVER_IP=$(hostname -I | awk '{print $1}')

echo ""
echo -e "${GREEN}${BOLD}  ════════════════════════════════════════════════${NC}"
echo -e "${GREEN}${BOLD}  ✔  PXE Deployer installed successfully!${NC}"
echo -e "${GREEN}${BOLD}  ════════════════════════════════════════════════${NC}"
echo ""
echo -e "  Access the UI at:"
echo -e "  ${CYAN}${BOLD}http://${SERVER_IP}:${PXE_UI_PORT}${NC}"
echo ""
echo -e "  Useful commands:"
echo -e "  ${YELLOW}sudo systemctl status  ${SERVICE_NAME}${NC}"
echo -e "  ${YELLOW}sudo systemctl restart ${SERVICE_NAME}${NC}"
echo -e "  ${YELLOW}sudo systemctl stop    ${SERVICE_NAME}${NC}"
echo -e "  ${YELLOW}docker compose -f ${INSTALL_DIR}/docker-compose.yml logs -f${NC}"
echo ""
echo -e "  Install location:  ${INSTALL_DIR}"
echo -e "  Systemd service:   /etc/systemd/system/${SERVICE_NAME}.service"
echo ""
