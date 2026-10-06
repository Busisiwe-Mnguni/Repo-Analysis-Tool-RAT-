import express from 'express';
import compression from 'compression';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { api } from './routes';
import { initDataDirs } from './store';

const PORT = Number(process.env.PORT ?? 4000);
const distDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist');

const app = express();
app.disable('x-powered-by');
app.use(compression());
app.use(express.json({ limit: '2mb' }));

app.use('/api', api);
app.all('/api/*', (_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

if (fs.existsSync(distDir)) {
  app.use(express.static(distDir));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(distDir, 'index.html'));
  });
}

// JSON error handler — keeps error messages visible in the client.
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const status = typeof err?.status === 'number' ? err.status : 500;
  const message = err instanceof Error ? err.message : String(err);
  if (status >= 500) console.error(err);
  res.status(status).json({ error: message });
});

initDataDirs()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`[server] RAT API listening on http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error('[server] failed to initialize data dirs', err);
    process.exit(1);
  });
