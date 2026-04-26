#!/usr/bin/env bash
# =============================================================================
# download-netboot-images.sh
# Downloads vmlinuz + initrd for each supported OS.
# Images are served over HTTP by pxe-files and fetched by GRUB during install.
#
# Run after setup-pxe.sh. Requires internet access.
# =============================================================================

set -euo pipefail

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'
ok()   { echo -e "  ${GREEN}✔ $*${NC}"; }
warn() { echo -e "  ${YELLOW}⚠ $*${NC}"; }
step() { echo -e "\n${CYAN}${BOLD}▶ $*${NC}"; }

PXE_ROOT="${PXE_ROOT:-/srv/pxe}"
IMG_ROOT="${PXE_ROOT}/http/images"

dl() {
  local url="$1" dest="$2"
  if [[ -f "${dest}" ]]; then
    ok "$(basename "${dest}") already present"
  else
    echo "  Downloading $(basename "${dest}") …"
    curl -fL --progress-bar "${url}" -o "${dest}"
    ok "$(basename "${dest}") downloaded"
  fi
}

# ── Ubuntu 22.04 ──────────────────────────────────────────────────────────────
step "Ubuntu 22.04 LTS (Jammy) netboot"
mkdir -p "${IMG_ROOT}/ubuntu-22.04"
BASE="http://archive.ubuntu.com/ubuntu/dists/jammy/main/installer-amd64/current/legacy-images/netboot/ubuntu-installer/amd64"
dl "${BASE}/linux"   "${IMG_ROOT}/ubuntu-22.04/vmlinuz"
dl "${BASE}/initrd.gz" "${IMG_ROOT}/ubuntu-22.04/initrd"

# ── Ubuntu 24.04 ──────────────────────────────────────────────────────────────
step "Ubuntu 24.04 LTS (Noble) netboot"
mkdir -p "${IMG_ROOT}/ubuntu-24.04"
BASE24="http://archive.ubuntu.com/ubuntu/dists/noble/main/installer-amd64/current/legacy-images/netboot/ubuntu-installer/amd64"
dl "${BASE24}/linux"     "${IMG_ROOT}/ubuntu-24.04/vmlinuz"
dl "${BASE24}/initrd.gz" "${IMG_ROOT}/ubuntu-24.04/initrd"

# ── Debian 12 ─────────────────────────────────────────────────────────────────
step "Debian 12 (Bookworm) netboot"
mkdir -p "${IMG_ROOT}/debian-12"
DEB="http://deb.debian.org/debian/dists/bookworm/main/installer-amd64/current/images/netboot/debian-installer/amd64"
dl "${DEB}/linux"   "${IMG_ROOT}/debian-12/vmlinuz"
dl "${DEB}/initrd.gz" "${IMG_ROOT}/debian-12/initrd"

# ── Rocky Linux 9 ─────────────────────────────────────────────────────────────
step "Rocky Linux 9 netboot"
mkdir -p "${IMG_ROOT}/rocky-9"
ROCKY="https://dl.rockylinux.org/pub/rocky/9/BaseOS/x86_64/os/images/pxeboot"
dl "${ROCKY}/vmlinuz"   "${IMG_ROOT}/rocky-9/vmlinuz"
dl "${ROCKY}/initrd.img" "${IMG_ROOT}/rocky-9/initrd.img"

# Create a symlink so GRUB config can use initrd.img
ln -sf initrd.img "${IMG_ROOT}/rocky-9/initrd" 2>/dev/null || true

echo ""
echo -e "${GREEN}${BOLD}All netboot images downloaded to ${IMG_ROOT}/${NC}"
echo ""
ls -lh "${IMG_ROOT}"/*/vmlinuz 2>/dev/null || true
echo ""
echo -e "${YELLOW}Note: For Rocky Linux, full packages are served from a local mirror or the internet.${NC}"
echo -e "${YELLOW}Edit the kickstart config's 'inst.repo' line to point to your mirror.${NC}"
echo ""
