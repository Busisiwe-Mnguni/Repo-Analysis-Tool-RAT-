import type {
  AuthorMetric,
  CommitEntry,
  CommitMetric,
  DirMetric,
  FileMetric,
  ManualMerges,
  MetricsFilter,
  MetricsResult,
  RepoIndex,
  TimelinePoint,
  TopOwner,
} from '../shared/types';
import { buildAuthorResolver } from './authors';

interface FileStat {
  commits: Set<number>;
  added: number;
  removed: number;
  authors: Set<string>;
  first: number;
  last: number;
  /** Commits with churn > 0 on this file (n_H,f). */
  modifications: Set<number>;
  /** Churn attributed to each author on this file (for ownership ω_H,f,a). */
  authorChurn: Map<string, number>;
}
interface DirStat {
  commits: Set<number>;
  added: number;
  removed: number;
  files: Set<number>;
  modifications: Set<number>;
  authorChurn: Map<string, number>;
}
interface AuthorStat {
  commits: Set<number>;
  added: number;
  removed: number;
  files: Set<number>;
  first: number;
  last: number;
}

/**
 * Compute every metric category for a filtered commit set H ⊆ H̄.
 *
 * Selection: commitMode 'all' | 'range' (H_t / H_{i,j}, `to` exclusive) |
 * 'list' (explicit hashes), intersected with the author filter (h[a]).
 * Scope: optional file/directory path restricting the measured universe.
 *
 * Semantics per the brief:
 *  - H[F] = ⋃_{h∈H} (h[F] ∪ h[p][F]); H[D] likewise, root included.
 *  - Rename changes are attributed to the new path (a pure rename is a no-op).
 *  - Deletions are recorded as removed lines on the deleted path.
 *  - Binary files are not measured (never in the path universe).
 */
export function computeMetrics(
  index: RepoIndex,
  filter: MetricsFilter,
  manual: ManualMerges | null,
): MetricsResult {
  const resolver = buildAuthorResolver(index, manual);
  const { commits, paths } = index;
  const headSet = new Set(index.headTree);

  // ---- Commit set H (indices into commits)
  const hashSet = new Set(filter.hashes ?? []);
  const from = filter.range?.from;
  const to = filter.range?.to;
  const authorFilter = new Set(filter.authors ?? []);
  const H: number[] = [];
  for (let i = 0; i < commits.length; i++) {
    const c = commits[i];
    if (filter.commitMode === 'range') {
      if (from !== undefined && c.date < from) continue;
      if (to !== undefined && c.date >= to) continue;
    } else if (filter.commitMode === 'list') {
      if (!hashSet.has(c.hash)) continue;
    }
    if (authorFilter.size > 0 && !authorFilter.has(resolver.keyForCommit(c.authorName, c.authorEmail))) {
      continue;
    }
    H.push(i);
  }

  // ---- Scope (path filter)
  const scope = (filter.path ?? '').trim();
  const hasScope = scope.length > 0;
  const isFileScope = filter.pathMode === 'file';
  const inScope = (idx: number): boolean => {
    if (!hasScope) return true;
    const p = paths[idx];
    if (isFileScope) return p === scope;
    return p === scope || p.startsWith(scope + '/');
  };

  // h[p][F] — first parent may be a merge commit (mergeTrees) or h∅ (empty).
  const parentTreeOf = (c: CommitEntry): number[] => {
    if (!c.parent) return [];
    const pi = index.commitIdxByHash[c.parent];
    if (pi !== undefined) return commits[pi].tree;
    return index.mergeTrees[c.parent] ?? [];
  };

  // ---- H[F] (scoped)
  const universe = new Set<number>();
  for (const ci of H) {
    const c = commits[ci];
    for (const idx of c.tree) if (inScope(idx)) universe.add(idx);
    for (const idx of parentTreeOf(c)) if (inScope(idx)) universe.add(idx);
  }

  // ---- Stats accumulation
  const fileStats = new Map<number, FileStat>();
  const dirStats = new Map<string, DirStat>();
  const authorStats = new Map<string, AuthorStat>();
  const dirOf = (d: string): DirStat => {
    let s = dirStats.get(d);
    if (!s) {
      s = { commits: new Set(), added: 0, removed: 0, files: new Set(), modifications: new Set(), authorChurn: new Map() };
      dirStats.set(d, s);
    }
    return s;
  };
  const statOf = (key: string): AuthorStat => {
    let s = authorStats.get(key);
    if (!s) {
      s = { commits: new Set(), added: 0, removed: 0, files: new Set(), first: Infinity, last: -Infinity };
      authorStats.set(key, s);
    }
    return s;
  };
  // All ancestor directories of a file path, root included.
  const dirsOf = (p: string): string[] => {
    const res = [''];
    const parts = p.split('/');
    for (let i = 1; i < parts.length; i++) res.push(parts.slice(0, i).join('/'));
    return res;
  };

  // Zero-activity files/dirs still belong to H[F]/H[D].
  for (const idx of universe) {
    fileStats.set(idx, {
      commits: new Set(), added: 0, removed: 0, authors: new Set(), first: Infinity, last: -Infinity,
      modifications: new Set(), authorChurn: new Map(),
    });
    for (const d of dirsOf(paths[idx])) dirOf(d).files.add(idx);
  }
  dirOf(''); // the root is always part of H[D]

  // |H| per the brief: the committer-date/author/mode-selected commit set,
  // independent of any path scope (scope only restricts which objects o are
  // reported, not the denominator of rate formulas).
  const totalH = H.length;

  let totalAdded = 0;
  let totalRemoved = 0;
  const scopedCommits: number[] = [];
  const rowAdded: number[] = [];
  const rowRemoved: number[] = [];
  const rowFiles: number[] = [];

  for (const ci of H) {
    const c = commits[ci];
    const akey = resolver.keyForCommit(c.authorName, c.authorEmail);
    let added = 0;
    let removed = 0;
    let filesChanged = 0;
    for (const ch of c.changes) {
      if (!inScope(ch.path)) continue;
      const fstat = fileStats.get(ch.path);
      if (!fstat) continue; // defensive: change path always in universe
      filesChanged++;
      added += ch.added;
      removed += ch.removed;

      fstat.commits.add(ci);
      fstat.added += ch.added;
      fstat.removed += ch.removed;
      fstat.authors.add(akey);
      if (c.date < fstat.first) fstat.first = c.date;
      if (c.date > fstat.last) fstat.last = c.date;

      const churn = ch.added + ch.removed;
      if (churn > 0) {
        fstat.modifications.add(ci);
        fstat.authorChurn.set(akey, (fstat.authorChurn.get(akey) ?? 0) + churn);
      }

      for (const d of dirsOf(paths[ch.path])) {
        const dstat = dirOf(d);
        dstat.commits.add(ci);
        dstat.added += ch.added;
        dstat.removed += ch.removed;
        if (churn > 0) {
          dstat.modifications.add(ci);
          dstat.authorChurn.set(akey, (dstat.authorChurn.get(akey) ?? 0) + churn);
        }
      }

      const astat = statOf(akey);
      astat.commits.add(ci);
      astat.added += ch.added;
      astat.removed += ch.removed;
      astat.files.add(ch.path);
      if (c.date < astat.first) astat.first = c.date;
      if (c.date > astat.last) astat.last = c.date;
    }

    // With a scope, a commit counts only if it touches the scoped universe.
    if (!hasScope || filesChanged > 0) {
      scopedCommits.push(ci);
      rowAdded.push(added);
      rowRemoved.push(removed);
      rowFiles.push(filesChanged);
      totalAdded += added;
      totalRemoved += removed;
      if (!hasScope) {
        // Empty commits (no file changes) still count as commits of their author.
        const astat = statOf(akey);
        astat.commits.add(ci);
        if (c.date < astat.first) astat.first = c.date;
        if (c.date > astat.last) astat.last = c.date;
      }
    }
  }

  // ---- Summary
  let firstDate = 0;
  let lastDate = 0;
  for (const ci of scopedCommits) {
    const d = commits[ci].date;
    if (firstDate === 0 || d < firstDate) firstDate = d;
    if (d > lastDate) lastDate = d;
  }
  const groupByKey = new Map(resolver.groups.map((g) => [g.key, g]));
  const authorCount = new Set<string>();
  for (const ci of scopedCommits) {
    const c = commits[ci];
    authorCount.add(resolver.keyForCommit(c.authorName, c.authorEmail));
  }

  // ---- Files
  const topOwnerOf = (authorChurn: Map<string, number>, churn: number): TopOwner | null => {
    if (churn <= 0 || authorChurn.size === 0) return null;
    let bestKey = '';
    let bestChurn = -1;
    for (const [k, v] of authorChurn) {
      if (v > bestChurn) {
        bestChurn = v;
        bestKey = k;
      }
    }
    return { key: bestKey, name: groupByKey.get(bestKey)?.name ?? bestKey, share: bestChurn / churn };
  };

  const files: FileMetric[] = [];
  for (const [idx, s] of fileStats) {
    const churn = s.added + s.removed;
    files.push({
      path: paths[idx],
      commits: s.commits.size,
      added: s.added,
      removed: s.removed,
      growth: s.added - s.removed,
      churn,
      modifications: s.modifications.size,
      modFrequency: totalH > 0 ? s.modifications.size / totalH : 0,
      churnRate: totalH > 0 ? churn / totalH : 0,
      topOwner: topOwnerOf(s.authorChurn, churn),
      authors: s.authors.size,
      firstDate: Number.isFinite(s.first) ? s.first : 0,
      lastDate: Number.isFinite(s.last) ? s.last : 0,
      existsInHead: headSet.has(idx),
    });
  }
  files.sort(
    (a, b) =>
      b.commits - a.commits ||
      b.added + b.removed - (a.added + a.removed) ||
      a.path.localeCompare(b.path),
  );

  // ---- Directories (subdirs = directories whose immediate parent is this one)
  const parentOf = (d: string): string | null => {
    if (d === '') return null;
    const i = d.lastIndexOf('/');
    return i === -1 ? '' : d.slice(0, i);
  };
  const subdirCount = new Map<string, number>();
  for (const d of dirStats.keys()) {
    const p = parentOf(d);
    if (p !== null) subdirCount.set(p, (subdirCount.get(p) ?? 0) + 1);
  }
  const dirs: DirMetric[] = [];
  for (const [d, s] of dirStats) {
    const churn = s.added + s.removed;
    dirs.push({
      path: d,
      commits: s.commits.size,
      added: s.added,
      removed: s.removed,
      growth: s.added - s.removed,
      churn,
      modifications: s.modifications.size,
      modFrequency: totalH > 0 ? s.modifications.size / totalH : 0,
      churnRate: totalH > 0 ? churn / totalH : 0,
      topOwner: topOwnerOf(s.authorChurn, churn),
      files: s.files.size,
      subdirs: subdirCount.get(d) ?? 0,
    });
  }
  dirs.sort(
    (a, b) =>
      b.commits - a.commits ||
      b.added + b.removed - (a.added + a.removed) ||
      a.path.localeCompare(b.path),
  );

  // ---- Authors
  const authors: AuthorMetric[] = [];
  for (const [key, s] of authorStats) {
    const g = groupByKey.get(key);
    authors.push({
      key,
      name: g?.name ?? key,
      email: g?.email ?? '',
      commits: s.commits.size,
      added: s.added,
      removed: s.removed,
      growth: s.added - s.removed,
      churn: s.added + s.removed,
      files: s.files.size,
      firstDate: Number.isFinite(s.first) ? s.first : 0,
      lastDate: Number.isFinite(s.last) ? s.last : 0,
    });
  }
  authors.sort(
    (a, b) =>
      b.commits - a.commits ||
      b.added - a.added ||
      a.name.localeCompare(b.name),
  );

  // ---- Commits (date descending, capped)
  const order = scopedCommits
    .map((ci, row) => ({ ci, row }))
    .sort((a, b) => commits[b.ci].date - commits[a.ci].date);
  const limit = Math.max(1, filter.limit ?? 1000);
  const commitRows: CommitMetric[] = [];
  for (let i = 0; i < order.length && i < limit; i++) {
    const { ci, row } = order[i];
    const c = commits[ci];
    const key = resolver.keyForCommit(c.authorName, c.authorEmail);
    commitRows.push({
      hash: c.hash,
      subject: c.subject,
      authorKey: key,
      authorName: groupByKey.get(key)?.name ?? c.authorName,
      date: c.date,
      added: rowAdded[row],
      removed: rowRemoved[row],
      files: rowFiles[row],
    });
  }

  // ---- Timeline (UTC day/week/month buckets over the scoped commit set)
  const timeline = buildTimeline(commits, scopedCommits, rowAdded, rowRemoved);

  // Repository metrics are directory metrics on the root (per the brief).
  const rootStat = dirStats.get('');
  const rootChurn = rootStat ? rootStat.added + rootStat.removed : 0;
  const rootModifications = rootStat ? rootStat.modifications.size : 0;

  return {
    summary: {
      commits: scopedCommits.length,
      authors: authorCount.size,
      files: universe.size,
      dirs: dirStats.size,
      added: totalAdded,
      removed: totalRemoved,
      net: totalAdded - totalRemoved,
      churn: rootChurn,
      modifications: rootModifications,
      modFrequency: totalH > 0 ? rootModifications / totalH : 0,
      churnRate: totalH > 0 ? rootChurn / totalH : 0,
      firstDate,
      lastDate,
      headHash: index.headHash,
    },
    authors,
    files,
    dirs,
    commits: commitRows,
    commitsTotal: scopedCommits.length,
    timeline,
  };
}

function buildTimeline(
  commits: CommitEntry[],
  scoped: number[],
  added: number[],
  removed: number[],
): TimelinePoint[] {
  if (scoped.length === 0) return [];
  let min = Infinity;
  let max = -Infinity;
  for (const ci of scoped) {
    const d = commits[ci].date;
    if (d < min) min = d;
    if (d > max) max = d;
  }
  const spanDays = (max - min) / 86400;
  const step: 'day' | 'week' | 'month' = spanDays <= 92 ? 'day' : spanDays <= 730 ? 'week' : 'month';
  const buckets = new Map<number, TimelinePoint>();
  for (let i = 0; i < scoped.length; i++) {
    const t = bucketStart(commits[scoped[i]].date, step);
    let b = buckets.get(t);
    if (!b) {
      b = { t, commits: 0, added: 0, removed: 0 };
      buckets.set(t, b);
    }
    b.commits++;
    b.added += added[i];
    b.removed += removed[i];
  }
  return [...buckets.values()].sort((a, b) => a.t - b.t);
}

function bucketStart(t: number, step: 'day' | 'week' | 'month'): number {
  const d = new Date(t * 1000);
  d.setUTCHours(0, 0, 0, 0);
  if (step === 'week') {
    const dow = (d.getUTCDay() + 6) % 7; // Monday start
    d.setUTCDate(d.getUTCDate() - dow);
  } else if (step === 'month') {
    d.setUTCDate(1);
  }
  return Math.floor(d.getTime() / 1000);
}
