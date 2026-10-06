import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ChangeEntry, CommitEntry, RepoIndex } from '../shared/types';
import { execGit, lsTree, readCommitLog, revListHashes } from './git';
import { parseMailmap } from './mailmap';
import { asyncPool } from './util';

/**
 * Build the full analysis index for a repository working copy.
 *
 * - H̄: non-merge commits reachable from HEAD (one `git log` pass).
 * - h[F]: exact tree per commit via `git ls-tree -r`, intersected with the
 *   measured (non-binary) path universe derived from the diffs.
 * - Binary files (numstat "-") are not measured and never enter the universe.
 */
export async function analyzeRepo(repoPath: string): Promise<RepoIndex> {
  const headHash = (await execGit(['rev-parse', 'HEAD'], { cwd: repoPath })).trim();

  const [allHashes, mergeHashes, log] = await Promise.all([
    revListHashes(repoPath),
    revListHashes(repoPath, ['--merges']),
    readCommitLog(repoPath),
  ]);
  // --- Path universe: every non-binary path appearing as the new path of a
  // change (renames attribute to their new path). Deleted paths were added by
  // an earlier commit, so they are covered too.
  const paths: string[] = [];
  const pathIndex = new Map<string, number>();
  const intern = (p: string): number => {
    let i = pathIndex.get(p);
    if (i === undefined) {
      i = paths.length;
      paths.push(p);
      pathIndex.set(p, i);
    }
    return i;
  };
  for (const c of log) {
    for (const ch of c.changes) {
      if (!ch.binary) intern(ch.newPath);
    }
  }

  // --- Trees for every reachable commit (merge commits included: they can be
  // the first parent h[p] of a measured commit, so h[p][F] must be known).
  const trees = new Map<string, number[]>();
  await asyncPool(8, allHashes, async (hash) => {
    const files = await lsTree(repoPath, hash);
    const idxs: number[] = [];
    for (const f of files) {
      const idx = pathIndex.get(f);
      if (idx !== undefined) idxs.push(idx); // filter out binary/never-measured paths
    }
    idxs.sort((a, b) => a - b);
    trees.set(hash, idxs);
  });

  const mergeTrees: Record<string, number[]> = {};
  for (const h of mergeHashes) {
    const t = trees.get(h);
    if (t) mergeTrees[h] = t;
  }

  // --- Measured commits (H̄)
  const commits: CommitEntry[] = [];
  const commitIdxByHash: Record<string, number> = {};
  for (const c of log) {
    const changes: ChangeEntry[] = [];
    for (const ch of c.changes) {
      if (ch.binary) continue;
      const pathIdx = pathIndex.get(ch.newPath);
      if (pathIdx === undefined) continue;
      const entry: ChangeEntry = {
        path: pathIdx,
        status: ch.status,
        added: ch.added,
        removed: ch.removed,
      };
      if (ch.oldPath !== undefined) {
        const oldIdx = pathIndex.get(ch.oldPath);
        if (oldIdx !== undefined) entry.oldPath = oldIdx;
      }
      changes.push(entry);
    }
    commitIdxByHash[c.hash] = commits.length;
    commits.push({
      hash: c.hash,
      parent: c.parents[0] ?? null,
      authorName: c.authorName,
      authorEmail: c.authorEmail,
      date: c.date,
      subject: c.subject,
      tree: trees.get(c.hash) ?? [],
      changes,
    });
  }

  const mailmapFile = await fs.promises
    .readFile(path.join(repoPath, '.mailmap'), 'utf8')
    .catch(() => null);

  return {
    version: 1,
    headHash,
    headTree: trees.get(headHash) ?? [],
    paths,
    commits,
    mergeTrees,
    commitIdxByHash,
    mailmap: mailmapFile !== null ? parseMailmap(mailmapFile) : [],
  };
}
