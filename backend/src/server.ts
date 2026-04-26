import express from 'express';
import cors from 'cors';
import deployRouter      from './routes/deploy';
import callbackRouter    from './routes/callback';
import deploymentsRouter from './routes/deployments';
import wolRouter         from './routes/wol';

const app  = express();
const PORT = Number(process.env.PORT ?? 3001);

// ── Middleware ───────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(express.text({ limit: '2mb' }));

// ── Routes ───────────────────────────────────────────────────────────────────
app.use('/api/deploy',      deployRouter);
app.use('/api/callback',    callbackRouter);
app.use('/api/deployments', deploymentsRouter);
app.use('/api/wol',         wolRouter);

// ── Health ───────────────────────────────────────────────────────────────────
app.get('/api/health', (_req, res) => {
  res.json({
    ok:        true,
    service:   'pxe-deployer-api',
    version:   '1.0.0',
    timestamp: new Date().toISOString(),
    pxeRoot:   process.env.PXE_ROOT ?? '/srv/pxe',
    apiHost:   process.env.API_HOST ?? 'localhost',
  });
});

// ── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, '0.0.0.0', () => {
  console.log(`PXE Deployer API listening on :${PORT}`);
  console.log(`  PXE_ROOT = ${process.env.PXE_ROOT ?? '/srv/pxe'}`);
  console.log(`  API_HOST = ${process.env.API_HOST ?? 'localhost'}`);
});
