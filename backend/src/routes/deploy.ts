import { Router, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import {
  createDeployment,
  normaliseMac,
  updateDeployment,
  getDeploymentByMac,
} from '../lib/deployStore';
import { writeInstallConfig, removeGrubConfig } from '../lib/grubWriter';

const router = Router();

const PXE_ROOT  = process.env.PXE_ROOT  ?? '/srv/pxe';
const API_HOST  = process.env.API_HOST  ?? 'localhost';
const CONFIGS_DIR = path.join(PXE_ROOT, 'http', 'configs');

function ensureConfigsDir(): void {
  if (!fs.existsSync(CONFIGS_DIR)) fs.mkdirSync(CONFIGS_DIR, { recursive: true });
}

// ── POST /api/deploy ─────────────────────────────────────────────────────────
router.post('/', (req: Request, res: Response) => {
  const { mac, hostname, osProfileId, osFamily, osName, installerConfig, kernelArgs } =
    req.body as {
      mac: string;
      hostname: string;
      osProfileId: string;
      osFamily: 'debian' | 'rhel' | 'windows';
      osName: string;
      installerConfig: string;
      kernelArgs?: string;
    };

  if (!mac || !osFamily || !installerConfig) {
    res.status(400).json({ error: 'mac, osFamily, and installerConfig are required' });
    return;
  }

  const normMac = normaliseMac(mac);
  const id      = `dep-${uuidv4().replace(/-/g, '').slice(0, 12)}`;
  const now     = new Date().toISOString();

  try {
    ensureConfigsDir();

    // 1. Write installer config (preseed / kickstart / autounattend)
    const configPath = path.join(CONFIGS_DIR, `${normMac}.cfg`);
    fs.writeFileSync(configPath, installerConfig, 'utf8');

    // 2. Write per-MAC GRUB2 boot config
    writeInstallConfig({
      mac,
      hostname:      hostname || normMac,
      osProfileId:   osProfileId || '',
      osFamily,
      osName:        osName || osProfileId,
      apiHost:       API_HOST,
      extraKernelArgs: kernelArgs,
    });

    // 3. Create deployment record (replaces any existing record for same MAC)
    createDeployment({
      id,
      mac:         normMac,
      hostname:    hostname || normMac,
      osProfileId: osProfileId || '',
      osName:      osName || osProfileId,
      status:      'queued',
      startedAt:   now,
      updatedAt:   now,
      logs: [
        `[${now}] Deployment queued`,
        `[${now}] GRUB config written: grub.cfg-01-${normMac}`,
        `[${now}] Installer config written: configs/${normMac}.cfg`,
        `[${now}] Waiting for server to PXE boot…`,
      ],
    });

    res.status(201).json({ deploymentId: id, mac: normMac, status: 'queued' });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: `Failed to write PXE files: ${msg}` });
  }
});

// ── DELETE /api/deploy/:mac ──────────────────────────────────────────────────
router.delete('/:mac', (req: Request, res: Response) => {
  const { mac } = req.params;
  const normMac = normaliseMac(mac);

  try {
    // Remove installer config
    const configPath = path.join(CONFIGS_DIR, `${normMac}.cfg`);
    if (fs.existsSync(configPath)) fs.unlinkSync(configPath);

    // Remove GRUB config
    removeGrubConfig(mac);

    // Mark cancelled in store
    const existing = getDeploymentByMac(mac);
    if (existing) updateDeployment(existing.id, { status: 'cancelled' });

    res.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

export default router;
