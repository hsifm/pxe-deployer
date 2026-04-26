/**
 * Called by the installer (via curl) during the install process.
 *
 * Preseed (Ubuntu/Debian):
 *   early_command: curl -sf http://API:3001/api/callback/MAC/started
 *   late_command:  curl -sf http://API:3001/api/callback/MAC/completed
 *
 * Kickstart (Rocky/RHEL):
 *   %pre:  curl -sf http://API:3001/api/callback/MAC/started
 *   %post: curl -sf http://API:3001/api/callback/MAC/completed
 */
import { Router, Request, Response } from 'express';
import { getDeploymentByMac, updateDeployment, appendLog, normaliseMac } from '../lib/deployStore';
import { writeLocalBootConfig } from '../lib/grubWriter';

const router = Router();

router.post('/:mac/:event', (req: Request, res: Response) => {
  const { mac, event } = req.params;
  const normMac = normaliseMac(mac);
  const now     = new Date().toISOString();

  const dep = getDeploymentByMac(mac);
  if (!dep) {
    // Accept anyway — installer may have started before UI created the record
    res.json({ ok: true, note: 'No matching deployment record found' });
    return;
  }

  switch (event) {
    case 'started': {
      updateDeployment(dep.id, { status: 'installing' });
      appendLog(dep.id, `[${now}] Installer started on ${normMac}`);
      break;
    }
    case 'completed': {
      updateDeployment(dep.id, { status: 'completed', completedAt: now });
      appendLog(dep.id, `[${now}] Installation completed successfully`);
      // Rewrite GRUB config so server boots from disk on next restart
      try { writeLocalBootConfig(mac); } catch { /* non-fatal */ }
      break;
    }
    case 'failed': {
      const reason = (req.query.reason as string) || 'Unknown error';
      updateDeployment(dep.id, { status: 'failed' });
      appendLog(dep.id, `[${now}] Installation FAILED: ${reason}`);
      break;
    }
    default:
      res.status(400).json({ error: `Unknown event: ${event}` });
      return;
  }

  res.json({ ok: true });
});

export default router;
