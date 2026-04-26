import { Router, Request, Response } from 'express';
import wol from 'wake_on_lan';

const router = Router();

// POST /api/wol  { mac: "aa:bb:cc:dd:ee:ff", broadcast?: "192.168.1.255" }
router.post('/', (req: Request, res: Response) => {
  const { mac, broadcast } = req.body as { mac: string; broadcast?: string };

  if (!mac) {
    res.status(400).json({ error: 'mac is required' });
    return;
  }

  const opts = broadcast ? { address: broadcast } : {};

  wol.wake(mac, opts, (err: Error | null) => {
    if (err) {
      res.status(500).json({ error: err.message });
    } else {
      res.json({ ok: true, mac });
    }
  });
});

export default router;
