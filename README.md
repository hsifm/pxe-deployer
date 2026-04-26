# PXE Deployer

A web-based management system for deploying operating systems to bare-metal servers via PXE boot. Plug a server into the staging network, trigger a deployment from the UI, and the server installs itself unattended. Once complete, move it to the production datacenter.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [PXE Boot Flow](#pxe-boot-flow)
3. [Services](#services)
4. [Frontend Pages](#frontend-pages)
5. [State Management](#state-management)
6. [Backend API Reference](#backend-api-reference)
7. [File System Layout](#file-system-layout)
8. [Data Models](#data-models)
9. [Installer Config Generators](#installer-config-generators)
10. [Setup & Deployment](#setup--deployment)
11. [Configuration Reference](#configuration-reference)
12. [Technology Stack](#technology-stack)

---

## Architecture Overview

All four services run on a single Linux staging server inside Docker. They share the `/srv/pxe` volume, which holds the TFTP tree, HTTP files, and deployment state.

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Staging Server (e.g. 192.168.10.5)                                     │
│                                                                         │
│  ┌─────────────────┐  ┌─────────────────┐  ┌──────────────────────┐    │
│  │   pxe-ui        │  │   pxe-api        │  │   pxe-files          │    │
│  │   port 8080     │  │   port 3001      │  │   port 80            │    │
│  │   React SPA     │  │   Node.js/Express│  │   nginx              │    │
│  │   (nginx)       │  │   TypeScript     │  │   (kernel/initrd/    │    │
│  └────────┬────────┘  └────────┬─────────┘  │    installer configs)│    │
│           │ browser            │ writes      └──────────┬───────────┘    │
│           │ fetch              │ GRUB+config            │ HTTP           │
│           └────────────────────┘                        │               │
│                                                         │               │
│  ┌──────────────────────────────────────────────────────┘               │
│  │                                                                       │
│  │  ┌──────────────────────────────────────────────────────────────┐    │
│  │  │  /srv/pxe  (bind-mounted host volume)                        │    │
│  │  │                                                              │    │
│  │  │  tftp/                                                       │    │
│  │  │  ├── grubnetx64.efi          ← UEFI chainloader (TFTP)      │    │
│  │  │  └── grub/                                                   │    │
│  │  │      ├── grub.cfg            ← Default menu (boot from disk) │    │
│  │  │      └── grub.cfg-01-<mac>   ← Per-server install config     │    │
│  │  │                                                              │    │
│  │  │  http/                                                       │    │
│  │  │  ├── images/                                                 │    │
│  │  │  │   ├── ubuntu-22.04/  (vmlinuz + initrd)                  │    │
│  │  │  │   ├── ubuntu-24.04/                                       │    │
│  │  │  │   ├── debian-12/                                          │    │
│  │  │  │   └── rocky-9/                                            │    │
│  │  │  └── configs/                                                │    │
│  │  │      └── aa-bb-cc-dd-ee-ff.cfg  ← preseed / kickstart       │    │
│  │  │                                                              │    │
│  │  │  deployments.json              ← Deployment state            │    │
│  │  └──────────────────────────────────────────────────────────────┘    │
│  │                                                                       │
│  │  ┌──────────────────────────────────────────────────────────────┐    │
│  │  │  pxe-dnsmasq  (host network, opt-in --profile dnsmasq)       │    │
│  │  │  dnsmasq: DHCP range + TFTP next-server                      │    │
│  │  └──────────────────────────────────────────────────────────────┘    │
│  │                                                                       │
│  └───────────────────────────────────────────────────────────────────────┘
│                                                                         │
│  Staging NIC (eth1) ─────────────────────────────────────────────────── │
│                              │                                          │
│                        PXE Network switch                               │
│                              │                                          │
│                    ┌─────────┴────────┐                                 │
│                 [Server A]        [Server B]  …                         │
│                 bare metal        bare metal                            │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## PXE Boot Flow

Step-by-step sequence from power-on to installed OS:

```
Bare-metal server powers on
        │
        ▼
1. DHCP REQUEST broadcast on staging NIC
        │
        ▼ (dnsmasq)
2. DHCP OFFER:  IP=192.168.10.x
                next-server=192.168.10.5
                filename=grubnetx64.efi
        │
        ▼
3. TFTP: fetch grubnetx64.efi  (UEFI EFI bootloader)
        │
        ▼
4. GRUB scans TFTP for:
        grub/grub.cfg-01-<MAC-hyphenated>
        ─────────────────────────────────
        Found? → Use per-server install config
        Not found? → Use grub/grub.cfg (boot from local disk)
        │
        ▼ (per-MAC config found)
5. GRUB downloads via HTTP:
        http://192.168.10.5/images/<os>/vmlinuz
        http://192.168.10.5/images/<os>/initrd
        │
        ▼
6. Linux installer boots with kernel args:
        url=http://192.168.10.5/configs/aa-bb-cc-dd-ee-ff.cfg
        (Ubuntu/Debian: preseed URL)
        (Rocky/RHEL:   inst.ks=... URL)
        │
        ▼
7. Installer fetches preseed/kickstart config from pxe-files:
        http://192.168.10.5/configs/aa-bb-cc-dd-ee-ff.cfg
        │
        ▼
8. early_command / %pre section runs:
        curl -sf http://192.168.10.5:3001/api/callback/<mac>/started
        → API marks deployment status: installing
        → UI polling shows "Installing…"
        │
        ▼
9. Installer runs unattended:
        - Partitioning, formatting, base system install
        - Package installation
        - User creation, locale, timezone
        - Custom commands (pre/post/first-boot)
        - Agents (Puppet/Chef/Ansible/Salt)
        │
        ▼
10. late_command / %post section runs:
        curl -sf http://192.168.10.5:3001/api/callback/<mac>/completed
        → API marks deployment status: completed
        → API rewrites GRUB config to local-boot (exit)
        → UI polling shows "Done"
        │
        ▼
11. Server reboots → GRUB reads per-MAC config → "exit" → boots from disk
        │
        ▼
12. Server is ready — move to production datacenter
```

---

## Services

### pxe-ui — Management Interface
| | |
|---|---|
| Image | Built from `Dockerfile` (nginx:1.25-alpine) |
| Port | `8080` (configurable via `PXE_UI_PORT`) |
| Tech | React 19, TypeScript, Vite 6, Tailwind CSS v4 |

Single-page application served by nginx. All app state lives in the browser (Redux + localStorage). No server-side rendering.

---

### pxe-api — Backend API
| | |
|---|---|
| Image | Built from `backend/Dockerfile` (node:20-alpine) |
| Port | `3001` (configurable via `PXE_API_PORT`) |
| Tech | Node.js 20, Express 4, TypeScript 5 |
| Environment | `PXE_ROOT`, `API_HOST`, `PORT` |
| Volume | `/srv/pxe` (read+write) |

Responsible for:
- Writing installer configs and GRUB2 configs to `/srv/pxe`
- Persisting deployment records to `deployments.json`
- Receiving callbacks from the installer during install
- Sending Wake-on-LAN magic packets

---

### pxe-files — HTTP File Server
| | |
|---|---|
| Image | `nginx:1.25-alpine` |
| Port | `80` (configurable via `PXE_FILES_PORT`) |
| Config | `deploy/nginx-files.conf` |
| Volume | `/srv/pxe/http` (read-only) |

Serves OS kernels, initrds, and installer config files over plain HTTP. Directory listing enabled. Cache disabled for `/configs/` so the installer always gets the latest file.

---

### pxe-dnsmasq — DHCP + TFTP
| | |
|---|---|
| Image | `jpillora/dnsmasq` |
| Network | Host network mode (required for DHCP broadcast) |
| Config | `deploy/dnsmasq.conf` |
| Profile | `dnsmasq` (opt-in) |
| Capabilities | `NET_ADMIN`, `NET_RAW` |

Provides DHCP leases to bare-metal servers and TFTP service for the GRUB EFI binary. Must run on a host with a dedicated NIC on the staging network.

Start with:
```bash
docker compose --profile dnsmasq up -d pxe-dnsmasq
```

---

## Frontend Pages

### `/` — Dashboard
Live operations overview.
- Stat cards: total servers, active deployments, completed today, failed
- Live deploy banner: shows hostname + last log line for any in-progress deployment
- Success rate gauge (Recharts)
- OS distribution pie chart

### `/os-profiles` — OS Profiles
Library of supported operating systems.
- Cards for each OS (Ubuntu 22.04, Ubuntu 24.04, Debian 12, Rocky Linux 9, Windows Server 2025)
- Create / edit / delete profiles
- Each profile links to its configurations

### `/os-profiles/:id` — OS Detail
Two-tab view for a single OS profile:
- **Configurations tab** — deployment configs attached to this OS (preseed/kickstart/autounattend)
- **Servers tab** — servers currently assigned to this OS

### `/os-profiles/:osId/config/:configId` — Configuration Editor
Full editor for a deployment configuration. Tabs:
- **General** — name, description, locale, timezone, keyboard
- **Network** — DHCP or static IP, hostname template, DNS, NTP
- **Partitioning** — scheme (auto/LVM/custom), disk, partition sizes
- **Packages** — online packages + offline package file uploads (IndexedDB)
- **Commands** — bash/python/powershell scripts at pre-install/post-install/first-boot
- **Agents** — Puppet/Chef/Ansible/Salt/custom agent install
- **Preview** — generated preseed/kickstart/autounattend config text

Actions: Export as JSON, Import from JSON, unsaved-changes navigation guard.

### `/servers` — Server Inventory
Table of known servers.
- Columns: hostname, MAC, IP, OS, status, tags
- Add / edit / delete servers
- Bulk select → bulk assign OS or bulk delete
- CSV import
- Live log viewer modal (shows deployment log for a server)
- Launch Deploy Wizard for selected servers

### `/deploy` — Deploy Wizard
Four-step wizard:
1. **Select Targets** — Quick Add (MAC + hostname, no inventory required) or pick from inventory list
2. **Choose OS** — select OS profile
3. **Choose Config** — select deployment configuration; validates against OS family
4. **Execute** — real deployment: calls `POST /api/deploy` for each target, polls `GET /api/deployments/:id` every 4 seconds; shows live status per server

### `/discovery` — Network Discovery
- ARP scanner — shows hosts on the staging subnet
- DHCP lease table — lists active leases from dnsmasq
- Wake-on-LAN panel — send magic packet to any MAC

### `/deployments` — Deployment History
Full log archive.
- Stats: total, success rate, average duration
- Filter by status, OS, date range
- Expandable row → full log lines
- Export logs as text file

### `/gold-image` — OS Standards (Gold Image)
Define baseline OS standards applied after deployment:
- Security hardening (firewall, fail2ban, auditd, SSH key-only, etc.)
- Package baseline (install + remove lists)
- Local package repository configuration (offline mirror support)
- Custom post-install script
- SSH authorized keys

### `/boot-menu` — PXE Boot Menu
Manage PXE boot menu entries:
- Order entries
- Set default
- Preview generated `pxelinux.cfg` and GRUB2 config text

### `/settings` — Settings
Infrastructure configuration:
- TFTP server address + root
- DHCP server + interface
- File server URL + port
- PXE menu timeout
- **Backend API** card: enter `pxe-api` URL, click "Test Connection" → hits `GET /api/health`

---

## State Management

Redux Toolkit with redux-persist (localStorage). Seven slices:

| Slice | Key Data | Persisted |
|---|---|---|
| `osProfiles` | OS profile objects | Yes |
| `configurations` | Deployment configs (passwords stripped on persist) | Yes |
| `servers` | Server inventory | Yes |
| `deployments` | Deployment history (frontend simulation records) | Yes |
| `bootMenu` | Boot menu entries | Yes |
| `settings` | Infrastructure settings + `apiEndpoint` | Yes |
| `packageFiles` | Package file metadata (blobs in IndexedDB) | Yes |
| `goldImages` | Gold image standards | Yes |

**Password security:** A `createTransform` scrubs `rootPassword` and `adminPassword` from the `configurations` slice before any write to localStorage. Passwords are also stripped from JSON exports.

---

## Backend API Reference

Base URL: `http://<staging-server>:3001`

---

### `GET /api/health`
Health check. Returns service info.

**Response:**
```json
{
  "ok": true,
  "service": "pxe-deployer-api",
  "version": "1.0.0",
  "timestamp": "2026-04-26T12:00:00.000Z",
  "pxeRoot": "/srv/pxe",
  "apiHost": "192.168.10.5"
}
```

---

### `POST /api/deploy`
Trigger a deployment for one server.

**Request body:**
```json
{
  "mac": "aa:bb:cc:dd:ee:ff",
  "hostname": "server-01",
  "osProfileId": "ubuntu-22-04",
  "osFamily": "debian",
  "osName": "Ubuntu 22.04 LTS",
  "installerConfig": "# preseed content …",
  "kernelArgs": ""
}
```

**Side effects:**
1. Writes installer config → `/srv/pxe/http/configs/<mac>.cfg`
2. Writes GRUB2 boot config → `/srv/pxe/tftp/grub/grub.cfg-01-<mac>`
3. Creates a deployment record in `deployments.json`

**Response `201`:**
```json
{ "deploymentId": "dep-a1b2c3d4e5f6", "mac": "aa-bb-cc-dd-ee-ff", "status": "queued" }
```

---

### `DELETE /api/deploy/:mac`
Cancel a deployment. Removes both files and marks the record `cancelled`.

**Response `200`:**
```json
{ "ok": true }
```

---

### `POST /api/callback/:mac/:event`
Called by the installer via `curl` during installation. `event` is one of:

| Event | Action |
|---|---|
| `started` | Sets status → `installing`, appends log line |
| `completed` | Sets status → `completed`, rewrites GRUB to local-boot |
| `failed` | Sets status → `failed`, appends log line (optional `?reason=` query param) |

**Response `200`:**
```json
{ "ok": true }
```

---

### `GET /api/deployments`
List all deployment records.

**Response:**
```json
[
  {
    "id": "dep-a1b2c3d4e5f6",
    "mac": "aa-bb-cc-dd-ee-ff",
    "hostname": "server-01",
    "osProfileId": "ubuntu-22-04",
    "osName": "Ubuntu 22.04 LTS",
    "status": "completed",
    "startedAt": "2026-04-26T10:00:00.000Z",
    "updatedAt": "2026-04-26T10:28:00.000Z",
    "completedAt": "2026-04-26T10:28:00.000Z",
    "logs": ["[…] Deployment queued", "…"]
  }
]
```

---

### `GET /api/deployments/:id`
Get a single deployment record by ID. Same shape as above.

---

### `POST /api/wol`
Send a Wake-on-LAN magic packet.

**Request body:**
```json
{ "mac": "aa:bb:cc:dd:ee:ff", "broadcast": "192.168.10.255" }
```

**Response `200`:**
```json
{ "ok": true, "mac": "aa:bb:cc:dd:ee:ff" }
```

---

## File System Layout

```
/srv/pxe/
│
├── deployments.json          ← All deployment records (API state)
│
├── tftp/                     ← Served by dnsmasq TFTP
│   ├── grubnetx64.efi        ← GRUB2 UEFI chainloader (downloaded by setup-pxe.sh)
│   └── grub/
│       ├── grub.cfg          ← Default menu: "Boot from local disk"
│       └── grub.cfg-01-<mac> ← Per-server install config (written by pxe-api)
│
└── http/                     ← Served by pxe-files nginx on port 80
    ├── images/
    │   ├── ubuntu-22.04/
    │   │   ├── vmlinuz
    │   │   └── initrd
    │   ├── ubuntu-24.04/
    │   │   ├── vmlinuz
    │   │   └── initrd
    │   ├── debian-12/
    │   │   ├── vmlinuz
    │   │   └── initrd
    │   └── rocky-9/
    │       ├── vmlinuz
    │       └── initrd.img
    └── configs/
        └── aa-bb-cc-dd-ee-ff.cfg   ← Preseed/kickstart per server (written by pxe-api)
```

**GRUB per-MAC config filename convention:**
```
grub.cfg-01-<mac-with-hyphens>
```
Example: MAC `AA:BB:CC:DD:EE:FF` → file `grub.cfg-01-aa-bb-cc-dd-ee-ff`

The `01-` prefix is GRUB's hardware type prefix for Ethernet (type 1).

---

## Data Models

### OSProfile
```typescript
{
  id: string;           // e.g. "ubuntu-22-04"
  name: string;
  version: string;
  family: 'debian' | 'rhel' | 'windows';
  arch: 'x86_64' | 'aarch64';
  color: string;        // hex color for UI
  description: string;
  kernelArgs: string[];
}
```

### DeploymentConfig
```typescript
{
  id: string;
  osProfileId: string;
  name: string;
  configType: 'preseed' | 'kickstart' | 'autounattend' | 'cloud-init';
  network: {
    mode: 'dhcp' | 'static';
    hostnameTemplate: string;
    domain: string;
    dnsServers: string[];
    ntpServers: string[];
    ipAddress?: string;
    subnet?: string;
    gateway?: string;
  };
  partitions: {
    scheme: 'auto' | 'lvm' | 'custom';
    bootDisk: string;   // e.g. "/dev/sda"
    efiSize: string;    // e.g. "512M"
    swapSize: string;
    rootSize: string;
    useEFI: boolean;
  };
  locale: string;
  timezone: string;
  keyboard: string;
  rootPassword: string;    // never stored in localStorage or exported
  adminUser: string;
  adminPassword: string;   // never stored in localStorage or exported
  packages: string[];
  packageGroups: string[];
  packageFiles: string[];  // IDs → blobs in IndexedDB
  commands: Command[];     // pre-install / post-install / first-boot
  agents: Agent[];         // puppet / chef / ansible / salt / custom
}
```

### Server
```typescript
{
  id: string;
  hostname: string;
  macAddress: string;   // validated: xx:xx:xx:xx:xx:xx
  ipAddress: string;    // validated: IPv4
  osProfileId: string;
  configurationId: string;
  goldImageId?: string;
  status: 'pending' | 'deploying' | 'completed' | 'failed' | 'idle';
  tags: string[];
  cpuModel: string;
  ramGB: number;
  diskGB: number;
}
```

### DeploymentRecord (backend)
```typescript
{
  id: string;             // "dep-<12-char-hex>"
  mac: string;            // normalised with hyphens
  hostname: string;
  osProfileId: string;
  osName: string;
  status: 'queued' | 'installing' | 'completed' | 'failed' | 'cancelled';
  startedAt: string;      // ISO 8601
  updatedAt: string;
  completedAt?: string;
  logs: string[];         // timestamped log lines
}
```

### GoldImage
```typescript
{
  id: string;
  name: string;
  osTarget: 'debian' | 'rhel' | 'windows' | 'all';
  hardening: {
    disableRootSSH: boolean;
    sshKeyAuthOnly: boolean;
    enableFirewall: boolean;
    firewallAllowPorts: string[];
    disableServices: string[];
    enableFail2ban: boolean;
    enableAuditd: boolean;
    setPasswordPolicy: boolean;
  };
  packagesToInstall: string[];
  packagesToRemove: string[];
  repos: GoldImageRepo[];   // local mirror support
  sshAuthorizedKeys: string[];
  postInstallScript: string;
}
```

---

## Installer Config Generators

`src/lib/configGenerators.ts` generates the full installer config text. Called from both the Configuration Editor (preview) and the Deploy Wizard (sends to API).

### Function signatures
```typescript
generatePreseed(cfg: DeploymentConfig, cb?: CallbackOpts): string
generateKickstart(cfg: DeploymentConfig, cb?: CallbackOpts): string
generateAutounattend(cfg: DeploymentConfig): string
generateConfig(cfg: DeploymentConfig, osFamily: OSFamily, cb?: CallbackOpts): string
```

### CallbackOpts
```typescript
interface CallbackOpts {
  apiBase: string;  // e.g. "http://192.168.10.5:3001"
  mac: string;      // normalised: "aa-bb-cc-dd-ee-ff"
}
```

### Callback injection

**Preseed (Ubuntu / Debian):**
```
d-i preseed/early_command string \
  curl -sf http://192.168.10.5:3001/api/callback/aa-bb-cc-dd-ee-ff/started || true

d-i preseed/late_command string \
  in-target curl -sf http://192.168.10.5:3001/api/callback/aa-bb-cc-dd-ee-ff/completed || true && \
  in-target bash -c '<post-install commands>'
```

**Kickstart (Rocky / RHEL):**
```
%pre
curl -sf http://192.168.10.5:3001/api/callback/aa-bb-cc-dd-ee-ff/started || true
%end

%post
curl -sf http://192.168.10.5:3001/api/callback/aa-bb-cc-dd-ee-ff/completed || true
%end
```

---

## Setup & Deployment

### Prerequisites
- Linux server with Docker and Docker Compose v2
- Dedicated NIC on the staging VLAN (`eth1` by default)
- Internet access for initial image downloads

### Step 1 — Clone and configure
```bash
git clone <repo-url>
cd pxe-deployer
```

### Step 2 — Prepare the PXE directory
```bash
sudo bash deploy/setup-pxe.sh
# Or with explicit IP:
sudo API_HOST=192.168.10.5 bash deploy/setup-pxe.sh
```

This creates `/srv/pxe/`, downloads `grubnetx64.efi`, writes the default GRUB menu, and generates a `.env` file.

### Step 3 — Download OS netboot images
```bash
sudo bash deploy/download-netboot-images.sh
```

Downloads `vmlinuz` and `initrd` for Ubuntu 22.04, Ubuntu 24.04, Debian 12, and Rocky Linux 9 into `/srv/pxe/http/images/`.

### Step 4 — Edit DHCP config
Edit `deploy/dnsmasq.conf` to match your staging network:

```conf
interface=eth1                           # ← your staging NIC
dhcp-range=192.168.10.100,192.168.10.200,12h
dhcp-option=option:router,192.168.10.1
```

### Step 5 — Start services
```bash
# UI + API + file server
docker compose up -d

# Also start DHCP+TFTP
docker compose --profile dnsmasq up -d pxe-dnsmasq
```

### Step 6 — Connect the UI to the API
Open `http://192.168.10.5:8080` → Settings → Backend API → enter `http://192.168.10.5:3001` → click **Test Connection**.

### Step 7 — Deploy a server
1. Plug the server into the staging switch
2. Go to **Deploy** in the UI
3. Step 1: Quick Add → enter MAC address and hostname
4. Step 2: Choose OS (e.g. Ubuntu 22.04)
5. Step 3: Choose configuration
6. Step 4: Click **Write PXE Configs & Deploy**
7. Power on the server — it will PXE boot and install automatically
8. UI polls every 4 seconds and updates the status display

---

## Configuration Reference

### Environment variables (`.env`)
| Variable | Default | Description |
|---|---|---|
| `PXE_ROOT` | `/srv/pxe` | Path to the shared PXE directory on the host |
| `API_HOST` | `localhost` | Staging server IP (used in GRUB configs and installer callbacks) |
| `PXE_UI_PORT` | `8080` | Host port for the management UI |
| `PXE_API_PORT` | `3001` | Host port for the backend API |
| `PXE_FILES_PORT` | `80` | Host port for the file server |

### dnsmasq.conf key settings
| Setting | Default | Description |
|---|---|---|
| `interface` | `eth1` | NIC to listen on |
| `dhcp-range` | `192.168.10.100–200` | DHCP pool for staging servers |
| `dhcp-option router` | `192.168.10.1` | Gateway for staging servers |
| `tftp-root` | `/srv/pxe/tftp` | TFTP root (must match volume mount) |

### OS image directory mapping
| OS Profile ID | Image directory |
|---|---|
| `ubuntu-22-04` | `ubuntu-22.04` |
| `ubuntu-24-04` | `ubuntu-24.04` |
| `debian-12` | `debian-12` |
| `rocky-9` | `rocky-9` |
| `windows-2025` | `windows-2025` |

---

## Technology Stack

### Frontend
| | |
|---|---|
| Framework | React 19 + TypeScript |
| Build | Vite 6 |
| Styling | Tailwind CSS v4 |
| State | Redux Toolkit + redux-persist |
| Routing | React Router v7 |
| Animation | Framer Motion |
| Charts | Recharts |
| Icons | Lucide React |
| Toasts | react-hot-toast |
| Offline | vite-plugin-pwa (Workbox service worker) |
| File storage | IndexedDB (package file blobs) |

### Backend
| | |
|---|---|
| Runtime | Node.js 20 |
| Framework | Express 4 |
| Language | TypeScript 5 |
| Persistence | JSON file (`deployments.json`) |
| WoL | wake_on_lan 1.0 |

### Infrastructure
| | |
|---|---|
| Container runtime | Docker + Compose v2 |
| UI server | nginx 1.25-alpine |
| File server | nginx 1.25-alpine |
| DHCP+TFTP | jpillora/dnsmasq |
| UEFI bootloader | grubnetx64.efi (GRUB2 EFI) |
