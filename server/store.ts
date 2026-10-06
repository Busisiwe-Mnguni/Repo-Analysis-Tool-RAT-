import * as fsp from 'node:fs/promises';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import type { ManualMerges, RepoIndex, RepoMeta } from '../shared/types';

const DATA_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'data');
const REPOS_DIR = path.join(DATA_ROOT, 'repos');
const INDEX_DIR = path.join(DATA_ROOT, 'index');
const MERGES_DIR = path.join(DATA_ROOT, 'merges');
export const TMP_DIR = path.join(DATA_ROOT, 'tmp');
const REGISTRY_FILE = path.join(DATA_ROOT, 'repos.json');

export async function initDataDirs(): Promise<void> {
  await Promise.all(
    [DATA_ROOT, REPOS_DIR, INDEX_DIR, MERGES_DIR, TMP_DIR].map((d) =>
      fsp.mkdir(d, { recursive: true }),
    ),
  );
}

export function newId(): string {
  return randomUUID().replace(/-/g, '').slice(0, 12);
}

export function repoPath(id: string): string {
  return path.join(REPOS_DIR, id);
}

// ---- Registry -----------------------------------------------------------------

export async function listRepos(): Promise<RepoMeta[]> {
  try {
    const raw = await fsp.readFile(REGISTRY_FILE, 'utf8');
    const list = JSON.parse(raw) as RepoMeta[];
    return Array.isArray(list) ? list.sort((a, b) => b.createdAt - a.createdAt) : [];
  } catch {
    return [];
  }
}

async function saveRepos(list: RepoMeta[]): Promise<void> {
  await fsp.writeFile(REGISTRY_FILE, JSON.stringify(list, null, 2));
}

export async function upsertRepo(meta: RepoMeta): Promise<void> {
  const list = await listRepos();
  const i = list.findIndex((r) => r.id === meta.id);
  if (i === -1) list.unshift(meta);
  else list[i] = meta;
  await saveRepos(list);
}

export async function getRepo(id: string): Promise<RepoMeta | null> {
  const list = await listRepos();
  return list.find((r) => r.id === id) ?? null;
}

export async function removeRepo(id: string): Promise<void> {
  await saveRepos((await listRepos()).filter((r) => r.id !== id));
  await Promise.all([
    fsp.rm(repoPath(id), { recursive: true, force: true }),
    fsp.rm(path.join(INDEX_DIR, `${id}.json`), { force: true }),
    fsp.rm(path.join(MERGES_DIR, `${id}.json`), { force: true }),
  ]);
}

// ---- Analysis index (cached by id + mtime) ------------------------------------

const indexCache = new Map<string, { mtimeMs: number; index: RepoIndex }>();

export async function saveIndex(id: string, index: RepoIndex): Promise<void> {
  const file = path.join(INDEX_DIR, `${id}.json`);
  await fsp.writeFile(file, JSON.stringify(index));
  indexCache.set(id, { mtimeMs: (await fsp.stat(file)).mtimeMs, index });
}

export async function loadIndex(id: string): Promise<RepoIndex> {
  const file = path.join(INDEX_DIR, `${id}.json`);
  const st = await fsp.stat(file);
  const cached = indexCache.get(id);
  if (cached && cached.mtimeMs === st.mtimeMs) return cached.index;
  const index = JSON.parse(await fsp.readFile(file, 'utf8')) as RepoIndex;
  indexCache.set(id, { mtimeMs: st.mtimeMs, index });
  return index;
}

// ---- Manual author merges ------------------------------------------------------

export async function loadMerges(id: string): Promise<ManualMerges> {
  try {
    const raw = await fsp.readFile(path.join(MERGES_DIR, `${id}.json`), 'utf8');
    const m = JSON.parse(raw) as ManualMerges;
    return m && Array.isArray(m.groups) ? m : { groups: [] };
  } catch {
    return { groups: [] };
  }
}

export async function saveMerges(id: string, merges: ManualMerges): Promise<void> {
  await fsp.writeFile(path.join(MERGES_DIR, `${id}.json`), JSON.stringify(merges, null, 2));
}
