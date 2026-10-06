import { Router } from 'express';
import multer from 'multer';
import AdmZip from 'adm-zip';
import * as fsp from 'node:fs/promises';
import * as path from 'node:path';
import type { ManualMerges, MetricsFilter, RepoMeta } from '../shared/types';
import { analyzeRepo } from './analyze';
import { buildAuthorResolver } from './authors';
import { cloneRepo } from './git';
import { computeMetrics } from './metrics';
import { TMP_DIR, getRepo, listRepos, loadIndex, loadMerges, newId, removeRepo, repoPath, saveIndex, saveMerges, upsertRepo } from './store';

export const api = Router();

class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const wrap = (fn: (req: any, res: any) => Promise<void>) =>
  (req: any, res: any, next: any) => {
    fn(req, res).catch(next);
  };

const upload = multer({
  storage: multer.diskStorage({
    destination: TMP_DIR,
    filename: (_req, file, cb) => cb(null, `upload-${Date.now()}-${Math.random().toString(36).slice(2)}.zip`),
  }),
  limits: { fileSize: 500 * 1024 * 1024 },
});

async function registerAnalyzed(id: string, name: string, source: RepoMeta['source'], url?: string): Promise<RepoMeta> {
  const index = await analyzeRepo(repoPath(id));
  if (index.commits.length === 0) {
    throw new HttpError(400, 'Repository has no commits on HEAD');
  }
  await saveIndex(id, index);
  const resolver = buildAuthorResolver(index, null);
  const meta: RepoMeta = {
    id,
    name,
    source,
    url,
    createdAt: Date.now(),
    commits: index.commits.length,
    authors: resolver.groups.length,
    headHash: index.headHash,
    hasMailmap: index.mailmap.length > 0,
  };
  await upsertRepo(meta);
  return meta;
}

function cleanRepoDir(id: string): Promise<void> {
  return fsp.rm(repoPath(id), { recursive: true, force: true });
}

// ---- Repositories -------------------------------------------------------------

api.get('/repos', wrap(async (_req, res) => {
  res.json(await listRepos());
}));

api.post('/repos/zip', upload.single('file'), wrap(async (req, res) => {
  const file = req.file as Express.Multer.File | undefined;
  if (!file) throw new HttpError(400, 'No zip file uploaded (expected field "file")');
  const id = newId();
  const name = sanitizeName((file.originalname ?? '').replace(/\.zip$/i, ''), 'repo');
  const work = path.join(TMP_DIR, `zip-${id}`);
  try {
    await fsp.mkdir(work, { recursive: true });
    const zip = new AdmZip(file.path);
    zip.extractAllTo(work, true);
    const root = await findRepoRoot(work);
    if (!root) {
      throw new HttpError(400, 'No .git directory found — the zip must contain a git repository');
    }
    await fsp.mkdir(path.dirname(repoPath(id)), { recursive: true });
    await fsp.rename(root, repoPath(id));
    res.json(await registerAnalyzed(id, name, 'zip'));
  } catch (err) {
    await Promise.allSettled([cleanRepoDir(id), fsp.rm(work, { recursive: true, force: true })]);
    throw err;
  } finally {
    await fsp.rm(file.path, { force: true });
    await fsp.rm(work, { recursive: true, force: true }).catch(() => undefined);
  }
}));

api.post('/repos/clone', wrap(async (req, res) => {
  const url = String(req.body?.url ?? '').trim();
  if (!/^(https?:\/\/|git@|ssh:\/\/|file:\/\/)/.test(url)) {
    throw new HttpError(400, 'Repository URL must start with https://, http://, git@, ssh:// or file://');
  }
  const id = newId();
  const base = url.replace(/\/+$/, '').split('/').pop() ?? 'repo';
  const name = sanitizeName(decodeURIComponent(base).replace(/\.git$/i, ''), 'repo');
  try {
    await cloneRepo(url, repoPath(id));
    res.json(await registerAnalyzed(id, name, 'clone', url));
  } catch (err) {
    await cleanRepoDir(id);
    throw new HttpError(400, `Clone failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}));

api.delete('/repos/:id', wrap(async (req, res) => {
  requireId(req.params.id);
  await removeRepo(req.params.id);
  res.json({ ok: true });
}));

api.get('/repos/:id', wrap(async (req, res) => {
  const id = requireId(req.params.id);
  const meta = await getRepo(id);
  if (!meta) throw new HttpError(404, 'Repository not found');
  const [index, merges] = await Promise.all([loadIndex(id), loadMerges(id)]);
  const resolver = buildAuthorResolver(index, merges);
  res.json({
    meta,
    authors: resolver.groups,
    mailmapEntries: index.mailmap.length,
  });
}));

// ---- Analysis data -------------------------------------------------------------

api.get('/repos/:id/paths', wrap(async (req, res) => {
  const id = requireId(req.params.id);
  const index = await loadIndex(id);
  const dirs = new Set<string>();
  for (const p of index.paths) {
    const parts = p.split('/');
    for (let i = 1; i < parts.length; i++) dirs.add(parts.slice(0, i).join('/'));
  }
  res.json({
    files: [...index.paths].sort(),
    dirs: [...dirs].sort(),
  });
}));

api.get('/repos/:id/commits', wrap(async (req, res) => {
  const id = requireId(req.params.id);
  const [index, merges] = await Promise.all([loadIndex(id), loadMerges(id)]);
  const resolver = buildAuthorResolver(index, merges);
  const groups = new Map(resolver.groups.map((g) => [g.key, g]));
  res.json(
    index.commits.map((c) => {
      const key = resolver.keyForCommit(c.authorName, c.authorEmail);
      let added = 0;
      let removed = 0;
      for (const ch of c.changes) {
        added += ch.added;
        removed += ch.removed;
      }
      return {
        hash: c.hash,
        subject: c.subject,
        authorKey: key,
        authorName: groups.get(key)?.name ?? c.authorName,
        date: c.date,
        added,
        removed,
      };
    }),
  );
}));

api.post('/repos/:id/metrics', wrap(async (req, res) => {
  const id = requireId(req.params.id);
  const [index, merges] = await Promise.all([loadIndex(id), loadMerges(id)]);
  const filter = sanitizeFilter(req.body as MetricsFilter);
  res.json(computeMetrics(index, filter, merges));
}));

// ---- Author merging ------------------------------------------------------------

api.get('/repos/:id/merges', wrap(async (req, res) => {
  res.json(await loadMerges(requireId(req.params.id)));
}));

api.post('/repos/:id/merges', wrap(async (req, res) => {
  const id = requireId(req.params.id);
  const index = await loadIndex(id);
  const resolver = buildAuthorResolver(index, null);
  const known = new Set<string>();
  for (const g of resolver.groups) for (const m of g.members) known.add(m);

  const body = req.body as ManualMerges | undefined;
  const groups = (body?.groups ?? []).filter(
    (g) =>
      Array.isArray(g.members) &&
      g.members.length >= 2 &&
      g.members.every((m) => known.has(m)) &&
      g.members.includes(g.canonical),
  );
  const merges: ManualMerges = { groups };
  await saveMerges(id, merges);
  res.json(merges);
}));

// ---- Helpers --------------------------------------------------------------------

function requireId(id: unknown): string {
  const s = String(id ?? '');
  if (!/^[a-zA-Z0-9-]{1,64}$/.test(s)) throw new HttpError(400, 'Invalid repository id');
  return s;
}

function sanitizeName(raw: string, fallback: string): string {
  const s = raw.replace(/[^\w .-]/g, '_').trim();
  return s.length > 0 && s !== '.' && s !== '..' ? s.slice(0, 80) : fallback;
}

function sanitizeFilter(f: MetricsFilter | undefined): MetricsFilter {
  const mode = f?.commitMode === 'range' || f?.commitMode === 'list' ? f.commitMode : 'all';
  const range =
    mode === 'range' && f?.range
      ? {
          from: typeof f.range.from === 'number' && Number.isFinite(f.range.from) ? f.range.from : undefined,
          to: typeof f.range.to === 'number' && Number.isFinite(f.range.to) ? f.range.to : undefined,
        }
      : undefined;
  const pathMode = f?.pathMode === 'file' ? 'file' : 'dir';
  return {
    authors: Array.isArray(f?.authors) ? f.authors.filter((a) => typeof a === 'string').slice(0, 200) : [],
    path: typeof f?.path === 'string' ? f.path.slice(0, 1024) : '',
    pathMode,
    commitMode: mode,
    range,
    hashes: Array.isArray(f?.hashes) ? f.hashes.filter((h) => typeof h === 'string').slice(0, 10000) : [],
    limit: typeof f?.limit === 'number' && f.limit > 0 ? Math.min(f.limit, 10000) : undefined,
  };
}

/** Depth-limited search for a directory containing a real `.git` directory. */
async function findRepoRoot(dir: string): Promise<string | null> {
  const queue: { d: string; depth: number }[] = [{ d: dir, depth: 0 }];
  while (queue.length > 0) {
    const { d, depth } = queue.shift()!;
    let entries;
    try {
      entries = await fsp.readdir(d, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      if (e.name === '.git' && e.isDirectory()) return d;
    }
    if (depth < 2) {
      for (const e of entries) {
        if (e.isDirectory() && !e.name.startsWith('.')) queue.push({ d: path.join(d, e.name), depth: depth + 1 });
      }
    }
  }
  return null;
}
