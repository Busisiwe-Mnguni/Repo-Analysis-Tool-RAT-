/**
 * Shared types between the analysis server and the web client.
 *
 * Model (per the brief):
 *  - H̄  : non-merge commits reachable from the reference commit (HEAD).
 *  - h[a]: single author after author merging (mailmap + manual groups).
 *  - h[p]: previous (first-parent) commit; the initial commit's parent is h∅ (empty).
 *  - h[committer-date]: committer timestamp (unix seconds).
 *  - h[F]: set of all (non-binary) files in the commit tree.
 *  - h[D]: set of all directories (implied by h[F], including the root).
 *  - H[F] = ⋃_{h∈H} (h[F] ∪ h[p][F]);  H[D] likewise (including the root).
 */

export interface ChangeEntry {
  /** Index into RepoIndex.paths (the new path for renames). */
  path: number;
  /** Index into RepoIndex.paths for the old path of a rename, if known. */
  oldPath?: number;
  status: 'A' | 'M' | 'D' | 'R';
  added: number;
  removed: number;
}

export interface CommitEntry {
  hash: string;
  /** First parent hash, or null for the initial commit (h[p] = h∅). */
  parent: string | null;
  authorName: string;
  authorEmail: string;
  /** Committer date, unix seconds. */
  date: number;
  subject: string;
  /** Sorted indices into paths — the full file set h[F] (binary files excluded). */
  tree: number[];
  changes: ChangeEntry[];
}

export interface MailmapEntry {
  /** Identity being mapped, e.g. "Old Name <old@x>" or "<old@x>". */
  from: string;
  /** Canonical identity, e.g. "Proper Name <proper@x>". */
  to: string;
}

export interface RepoIndex {
  version: 1;
  headHash: string;
  /** Sorted path indices — the file set of the reference commit (HEAD). */
  headTree: number[];
  /** Interned universe of measured (non-binary) file paths. */
  paths: string[];
  /** H̄ — non-merge commits reachable from HEAD. */
  commits: CommitEntry[];
  /** Trees of merge commits; needed as h[p][F] for children of merges. */
  mergeTrees: Record<string, number[]>;
  commitIdxByHash: Record<string, number>;
  mailmap: MailmapEntry[];
}

export interface RepoMeta {
  id: string;
  name: string;
  source: 'zip' | 'clone';
  url?: string;
  createdAt: number;
  commits: number;
  authors: number;
  headHash: string;
  hasMailmap: boolean;
}

export interface AuthorGroup {
  /** Merged author key (canonical identity, or manual group canonical). */
  key: string;
  name: string;
  email: string;
  /** Distinct canonical identities merged into this author. */
  members: string[];
}

export interface RepoDetail {
  meta: RepoMeta;
  authors: AuthorGroup[];
  mailmapEntries: number;
}

/** Manual merge groups persisted per repository (data/merges/<id>.json). */
export interface ManualMerges {
  groups: { canonical: string; members: string[] }[];
}

export interface MetricsFilter {
  /** Merged author keys to include; empty means all. */
  authors?: string[];
  /** File or directory path to scope to; empty/undefined means the whole repo. */
  path?: string;
  pathMode?: 'file' | 'dir';
  commitMode: 'all' | 'range' | 'list';
  /** Unix seconds; `to` is exclusive (H[i,j]: i ≤ date < j). Omitted to = present (H_t). */
  range?: { from?: number; to?: number };
  /** Explicit commit hashes (commitMode = 'list'). */
  hashes?: string[];
  limit?: number;
}

export interface FileMetric {
  path: string;
  commits: number;
  added: number;
  removed: number;
  authors: number;
  firstDate: number;
  lastDate: number;
  existsInHead: boolean;
}

export interface DirMetric {
  path: string;
  commits: number;
  added: number;
  removed: number;
  files: number;
  subdirs: number;
}

export interface AuthorMetric {
  key: string;
  name: string;
  email: string;
  commits: number;
  added: number;
  removed: number;
  files: number;
  firstDate: number;
  lastDate: number;
}

export interface CommitMetric {
  hash: string;
  subject: string;
  authorKey: string;
  authorName: string;
  date: number;
  added: number;
  removed: number;
  files: number;
}

export interface TimelinePoint {
  t: number;
  commits: number;
  added: number;
  removed: number;
}

export interface MetricsResult {
  summary: {
    commits: number;
    authors: number;
    files: number;
    dirs: number;
    added: number;
    removed: number;
    net: number;
    firstDate: number;
    lastDate: number;
    headHash: string;
  };
  authors: AuthorMetric[];
  files: FileMetric[];
  dirs: DirMetric[];
  commits: CommitMetric[];
  commitsTotal: number;
  timeline: TimelinePoint[];
}

/** Compact commit row for the manual commit picker. */
export interface CommitRow {
  hash: string;
  subject: string;
  authorKey: string;
  authorName: string;
  date: number;
  added: number;
  removed: number;
}
