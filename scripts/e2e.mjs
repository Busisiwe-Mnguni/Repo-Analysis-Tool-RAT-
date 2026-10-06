/**
 * End-to-end verification of the RAT API against a deterministic fixture repo.
 * Expected values are hand-computed from scripts/make-fixture.sh.
 *
 * Usage: RAT_URL=http://localhost:4100 node scripts/e2e.mjs
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = process.env.RAT_URL ?? 'http://localhost:4100';

let failures = 0;
/** Key-order-insensitive deep stringify so object comparisons are stable. */
function stable(v) {
  if (Array.isArray(v)) return v.map(stable);
  if (v && typeof v === 'object') {
    return Object.fromEntries(
      Object.entries(v)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([k, x]) => [k, stable(x)]),
    );
  }
  return v;
}
function check(name, actual, expected) {
  const ok = JSON.stringify(stable(actual)) === JSON.stringify(stable(expected));
  if (ok) console.log(`ok   ${name}`);
  else {
    failures++;
    console.error(`FAIL ${name}\n     expected: ${JSON.stringify(expected)}\n     actual:   ${JSON.stringify(actual)}`);
  }
}

async function j(method, url, body, isForm) {
  const res = await fetch(BASE + url, {
    method,
    headers: isForm || body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: isForm ? body : body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`${method} ${url} -> ${res.status}: ${data?.error ?? res.statusText}`);
  return data;
}

const metricOf = (rows, p) => rows.find((r) => r.path === p);
const authorOf = (rows, name) => rows.find((r) => r.name === name);
const dirOf = (rows, p) => rows.find((r) => r.path === p);

const fixturesZip = path.join(ROOT, '.tmp', 'rat-fixture.zip');
const fixtureRepo = path.join(ROOT, '.tmp', 'rat-fixture');
const hashes = fs.readFileSync(path.join(ROOT, '.tmp', 'rat-hashes.txt'), 'utf8').trim().split('\n');
const [c1, , , , , , , c8, c9, c10] = hashes; // named for the filters below

const created = [];

async function main() {
  const baseline = await j('GET', '/api/repos');

  // ---- 1. Zip upload ----------------------------------------------------------
  const zipBuf = fs.readFileSync(fixturesZip);
  const form = new FormData();
  form.append('file', new Blob([zipBuf], { type: 'application/zip' }), 'rat-fixture.zip');
  const zipMeta = await j('POST', '/api/repos/zip', form, true);
  created.push(zipMeta.id);
  check('zip: commits (15 total, 1 merge excluded)', zipMeta.commits, 14);
  check('zip: authors before merging', zipMeta.authors, 4);
  check('zip: mailmap detected', zipMeta.hasMailmap, true);
  check('zip: name derived from filename', zipMeta.name, 'rat-fixture');

  // ---- 2. Clone upload ----------------------------------------------------------
  const cloneMeta = await j('POST', '/api/repos/clone', { url: 'file://' + fixtureRepo });
  created.push(cloneMeta.id);
  check('clone: same commit count', cloneMeta.commits, 14);
  check('clone: marked as clone', cloneMeta.source, 'clone');

  // ---- 3. Full-history metrics ---------------------------------------------------
  const m = await j('POST', `/api/repos/${zipMeta.id}/metrics`, { commitMode: 'all' });
  check('summary.commits', m.summary.commits, 14);
  check('summary.authors', m.summary.authors, 4);
  check('summary.files (10 incl .mailmap, binary excluded)', m.summary.files, 10);
  check('summary.dirs (root, docs, src, src/deep)', m.summary.dirs, 4);
  check('summary.added', m.summary.added, 68);
  check('summary.removed', m.summary.removed, 10);
  check('summary.net', m.summary.net, 58);

  // Per-file (rename attributed to new path; deletion on old path; binary absent)
  check('file README.md', {
    path: metricOf(m.files, 'README.md')?.path, commits: metricOf(m.files, 'README.md')?.commits,
    added: metricOf(m.files, 'README.md')?.added, removed: metricOf(m.files, 'README.md')?.removed,
    authors: metricOf(m.files, 'README.md')?.authors, existsInHead: metricOf(m.files, 'README.md')?.existsInHead,
  }, {
    path: 'README.md', commits: 3, added: 8, removed: 1, authors: 2, existsInHead: true,
  });
  // New formal-spec fields: growth, churn, modifications, modFrequency, churnRate, topOwner.
  check('file README.md: growth/churn/modifications', {
    growth: metricOf(m.files, 'README.md').growth, churn: metricOf(m.files, 'README.md').churn,
    modifications: metricOf(m.files, 'README.md').modifications,
  }, { growth: 7, churn: 9, modifications: 3 });
  check('file README.md: topOwner', metricOf(m.files, 'README.md').topOwner, { key: 'Alice Alison <alice@x>', name: 'Alice Alison', share: 7 / 9 });
  check('file src/app.ts (rename-out adds nothing)', metricOf(m.files, 'src/app.ts') && {
    commits: metricOf(m.files, 'src/app.ts').commits, added: metricOf(m.files, 'src/app.ts').added,
    removed: metricOf(m.files, 'src/app.ts').removed, authors: metricOf(m.files, 'src/app.ts').authors,
    existsInHead: metricOf(m.files, 'src/app.ts').existsInHead,
  }, { commits: 2, added: 15, removed: 2, authors: 1, existsInHead: false });
  check('file src/main.ts (rename +2/-0 + chmod 0/0)', {
    commits: metricOf(m.files, 'src/main.ts').commits, added: metricOf(m.files, 'src/main.ts').added,
    removed: metricOf(m.files, 'src/main.ts').removed, authors: metricOf(m.files, 'src/main.ts').authors,
    existsInHead: metricOf(m.files, 'src/main.ts').existsInHead,
  }, { commits: 2, added: 2, removed: 0, authors: 2, existsInHead: true });
  check('file src/util.ts', {
    commits: metricOf(m.files, 'src/util.ts').commits, added: metricOf(m.files, 'src/util.ts').added,
    removed: metricOf(m.files, 'src/util.ts').removed, authors: metricOf(m.files, 'src/util.ts').authors,
  }, { commits: 2, added: 9, removed: 0, authors: 2 });
  check('file docs/guide.md (deleted, removal recorded)', {
    commits: metricOf(m.files, 'docs/guide.md').commits, added: metricOf(m.files, 'docs/guide.md').added,
    removed: metricOf(m.files, 'docs/guide.md').removed, existsInHead: metricOf(m.files, 'docs/guide.md').existsInHead,
  }, { commits: 2, added: 4, removed: 4, existsInHead: false });
  check('file src/deep/parse.ts', {
    commits: metricOf(m.files, 'src/deep/parse.ts').commits, added: metricOf(m.files, 'src/deep/parse.ts').added,
    removed: metricOf(m.files, 'src/deep/parse.ts').removed,
  }, { commits: 2, added: 13, removed: 0 });
  check('file src/tmp.txt (add then delete)', {
    commits: metricOf(m.files, 'src/tmp.txt').commits, added: metricOf(m.files, 'src/tmp.txt').added,
    removed: metricOf(m.files, 'src/tmp.txt').removed,
  }, { commits: 2, added: 3, removed: 3 });
  check('file src/feature.ts (via merge branch)', {
    commits: metricOf(m.files, 'src/feature.ts').commits, added: metricOf(m.files, 'src/feature.ts').added,
  }, { commits: 1, added: 7 });
  check('binary assets/logo.png not measured', m.files.some((f) => f.path.includes('logo')), false);

  // Per-author (mailmap merged Alicia into Alice)
  check('author Alice', { commits: authorOf(m.authors, 'Alice Alison').commits, added: authorOf(m.authors, 'Alice Alison').added, removed: authorOf(m.authors, 'Alice Alison').removed, files: authorOf(m.authors, 'Alice Alison').files }, { commits: 6, added: 43, removed: 2, files: 7 });
  check('author Bob', { commits: authorOf(m.authors, 'Bob Bobson').commits, added: authorOf(m.authors, 'Bob Bobson').added, removed: authorOf(m.authors, 'Bob Bobson').removed, files: authorOf(m.authors, 'Bob Bobson').files }, { commits: 5, added: 11, removed: 8, files: 4 });
  check('author Carol (pre-merge)', { commits: authorOf(m.authors, 'Carol Clear').commits, added: authorOf(m.authors, 'Carol Clear').added, removed: authorOf(m.authors, 'Carol Clear').removed, files: authorOf(m.authors, 'Carol Clear').files }, { commits: 2, added: 12, removed: 0, files: 2 });
  check('author Caroline (pre-merge)', { commits: authorOf(m.authors, 'Caroline Clear').commits, added: authorOf(m.authors, 'Caroline Clear').added, removed: authorOf(m.authors, 'Caroline Clear').removed }, { commits: 1, added: 2, removed: 0 });

  // Per-directory
  check('dir root', { commits: dirOf(m.dirs, '').commits, files: dirOf(m.dirs, '').files, subdirs: dirOf(m.dirs, '').subdirs }, { commits: 14, files: 10, subdirs: 2 });
  check('dir src', { commits: dirOf(m.dirs, 'src').commits, files: dirOf(m.dirs, 'src').files, subdirs: dirOf(m.dirs, 'src').subdirs, added: dirOf(m.dirs, 'src').added, removed: dirOf(m.dirs, 'src').removed }, { commits: 10, files: 6, subdirs: 1, added: 49, removed: 5 });
  check('dir docs', { commits: dirOf(m.dirs, 'docs').commits, files: dirOf(m.dirs, 'docs').files, added: dirOf(m.dirs, 'docs').added, removed: dirOf(m.dirs, 'docs').removed }, { commits: 3, files: 2, added: 10, removed: 4 });
  check('dir assets (binary only) absent', dirOf(m.dirs, 'assets'), undefined);

  // ---- 4. Commit-set filters ------------------------------------------------------
  // H_t: from 2026-01-10T00:00Z to present -> c10..c15 minus merge = 5 commits
  const t0 = Date.parse('2026-01-10T00:00:00Z') / 1000;
  const mHt = await j('POST', `/api/repos/${zipMeta.id}/metrics`, { commitMode: 'range', range: { from: t0 } });
  check('H_t commits', mHt.summary.commits, 5);
  check('H_t added', mHt.summary.added, 15);
  check('H_t removed', mHt.summary.removed, 3);

  // H_{i,j}: [c8 date, c10 date) — both boundaries exclusive/inclusive check
  const i0 = Date.parse('2026-01-08T10:00:00Z') / 1000;
  const j0 = Date.parse('2026-01-10T10:00:00Z') / 1000;
  const mIj = await j('POST', `/api/repos/${zipMeta.id}/metrics`, { commitMode: 'range', range: { from: i0, to: j0 } });
  check('H_{i,j} commits (c8,c9 only — to exclusive)', mIj.summary.commits, 2);
  check('H_{i,j} added', mIj.summary.added, 5);
  check('H_{i,j} removed', mIj.summary.removed, 0);

  // Manual list: c9 + c10
  const mList = await j('POST', `/api/repos/${zipMeta.id}/metrics`, { commitMode: 'list', hashes: [c9, c10] });
  check('manual list commits', mList.summary.commits, 2);
  check('manual list added/removed', { added: mList.summary.added, removed: mList.summary.removed }, { added: 3, removed: 3 });
  check('manual list keeps untouched README.md at 0', metricOf(mList.files, 'README.md').commits, 0);

  // Author filter
  const mAuthor = await j('POST', `/api/repos/${zipMeta.id}/metrics`, { commitMode: 'all', authors: ['Carol Clear <carol@x>'] });
  check('author filter commits', mAuthor.summary.commits, 2);

  // Path scope: directory
  const mSrc = await j('POST', `/api/repos/${zipMeta.id}/metrics`, { commitMode: 'all', path: 'src', pathMode: 'dir' });
  check('scope src: files', mSrc.summary.files, 6);
  check('scope src: dirs (root, src, src/deep)', mSrc.summary.dirs, 3);
  check('scope src: commits', mSrc.summary.commits, 10);
  check('scope src: added/removed', { added: mSrc.summary.added, removed: mSrc.summary.removed }, { added: 49, removed: 5 });

  // Path scope: single file
  const mFile = await j('POST', `/api/repos/${zipMeta.id}/metrics`, { commitMode: 'all', path: 'src/main.ts', pathMode: 'file' });
  check('scope file: commits', mFile.summary.commits, 2);
  check('scope file: added/removed', { added: mFile.summary.added, removed: mFile.summary.removed }, { added: 2, removed: 0 });
  check('scope file: files universe', mFile.files.map((f) => f.path), ['src/main.ts']);
  check('scope file: dirs', mFile.dirs.map((d) => d.path).sort(), ['', 'src']);

  // ---- 5. Manual author merging ----------------------------------------------------
  await j('POST', `/api/repos/${zipMeta.id}/merges`, {
    groups: [{ canonical: 'Carol Clear <carol@x>', members: ['Carol Clear <carol@x>', 'Caroline Clear <carol@x>'] }],
  });
  const detail = await j('GET', `/api/repos/${zipMeta.id}`);
  check('merged detail: Carol members', detail.authors.find((a) => a.name === 'Carol Clear').members.length, 2);
  const mMerged = await j('POST', `/api/repos/${zipMeta.id}/metrics`, { commitMode: 'all' });
  check('merged: authors count', mMerged.summary.authors, 3);
  check('merged: Carol commits', authorOf(mMerged.authors, 'Carol Clear').commits, 3);
  check('merged: Carol added/removed/files', { added: authorOf(mMerged.authors, 'Carol Clear').added, removed: authorOf(mMerged.authors, 'Carol Clear').removed, files: authorOf(mMerged.authors, 'Carol Clear').files }, { added: 14, removed: 0, files: 3 });
  check('merged: Caroline gone', authorOf(mMerged.authors, 'Caroline Clear'), undefined);

  // Unmerge restores
  await j('POST', `/api/repos/${zipMeta.id}/merges`, { groups: [] });
  const mUnmerged = await j('POST', `/api/repos/${zipMeta.id}/metrics`, { commitMode: 'all' });
  check('unmerged: authors back to 4', mUnmerged.summary.authors, 4);

  // Clone repo metrics parity
  const mClone = await j('POST', `/api/repos/${cloneMeta.id}/metrics`, { commitMode: 'all' });
  check('clone: parity with zip analysis', { commits: mClone.summary.commits, added: mClone.summary.added, removed: mClone.summary.removed }, { commits: 14, added: 68, removed: 10 });

  // Commits endpoint (picker data)
  const rows = await j('GET', `/api/repos/${zipMeta.id}/commits`);
  check('picker rows', rows.length, 14);
  const mergeHash = hashes[13]; // c14
  check('picker excludes merge commit', rows.some((r) => r.hash === mergeHash), false);

  // ---- 6. Cleanup -------------------------------------------------------------------
  for (const id of created) await j('DELETE', `/api/repos/${id}`);
  const after = await j('GET', '/api/repos');
  check('cleanup restores repo count', after.length, baseline.length);

  console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
  process.exitCode = failures === 0 ? 0 : 1;
}

main().catch((e) => {
  console.error('E2E fatal:', e.message);
  process.exit(1);
});
