import { Router, Request, Response } from 'express';
import { getAllDeployments, getDeployment } from '../lib/deployStore';

const router = Router();

// GET /api/deployments
router.get('/', (_req: Request, res: Response) => {
  res.json(getAllDeployments());
});

// GET /api/deployments/:id
router.get('/:id', (req: Request, res: Response) => {
  const dep = getDeployment(req.params.id);
  if (!dep) {
    res.status(404).json({ error: 'Deployment not found' });
    return;
  }
  res.json(dep);
});

export default router;
