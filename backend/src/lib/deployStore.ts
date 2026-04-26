/**
 * Lightweight JSON-file deployment store.
 * In production this file lives at /srv/pxe/deployments.json so it persists
 * across container restarts (the volume is bind-mounted from the host).
 */
import fs from 'fs';
import path from 'path';

export type DeploymentStatus = 'queued' | 'installing' | 'completed' | 'failed' | 'cancelled';

export interface DeploymentRecord {
  id: string;
  mac: string;           // normalised: aa-bb-cc-dd-ee-ff  (hyphens)
  hostname: string;
  osProfileId: string;
  osName: string;
  status: DeploymentStatus;
  startedAt: string;
  updatedAt: string;
  completedAt?: string;
  logs: string[];
}

const PXE_ROOT = process.env.PXE_ROOT ?? '/srv/pxe';
const STORE_PATH = path.join(PXE_ROOT, 'deployments.json');

function readAll(): DeploymentRecord[] {
  try {
    if (!fs.existsSync(STORE_PATH)) return [];
    const raw = fs.readFileSync(STORE_PATH, 'utf8');
    return JSON.parse(raw) as DeploymentRecord[];
  } catch {
    return [];
  }
}

function writeAll(records: DeploymentRecord[]): void {
  const dir = path.dirname(STORE_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(STORE_PATH, JSON.stringify(records, null, 2), 'utf8');
}

export function getAllDeployments(): DeploymentRecord[] {
  return readAll();
}

export function getDeployment(id: string): DeploymentRecord | undefined {
  return readAll().find(d => d.id === id);
}

export function getDeploymentByMac(mac: string): DeploymentRecord | undefined {
  return readAll().find(d => d.mac === normaliseMac(mac));
}

export function createDeployment(record: DeploymentRecord): void {
  const all = readAll().filter(d => d.mac !== record.mac); // replace existing for same MAC
  writeAll([...all, record]);
}

export function updateDeployment(id: string, updates: Partial<DeploymentRecord>): DeploymentRecord | null {
  const all = readAll();
  const idx = all.findIndex(d => d.id === id);
  if (idx === -1) return null;
  const updated = { ...all[idx], ...updates, updatedAt: new Date().toISOString() };
  all[idx] = updated;
  writeAll(all);
  return updated;
}

export function appendLog(id: string, line: string): void {
  const all = readAll();
  const idx = all.findIndex(d => d.id === id);
  if (idx === -1) return;
  all[idx].logs.push(line);
  all[idx].updatedAt = new Date().toISOString();
  writeAll(all);
}

/** aa:bb:cc:dd:ee:ff  or  AA-BB-CC  →  aa-bb-cc-dd-ee-ff */
export function normaliseMac(mac: string): string {
  return mac.toLowerCase().replace(/[:-]/g, '-');
}
