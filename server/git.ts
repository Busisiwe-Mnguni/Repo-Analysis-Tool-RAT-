import { spawn } from 'node:child_process';
import { unquotePath } from './util';

export interface GitOpts {
  cwd?: string;
  timeoutMs?: number;
}

/** Run a git command, resolving with stdout or rejecting with stderr. */
export function execGit(args: string[], opts: GitOpts = {}): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn('git', args, {
      cwd: opts.cwd,
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_ASKPASS: 'echo' },
    });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`git ${args[0]} timed out`));
    }, opts.timeoutMs ?? 120_000);

    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (c: string) => { stdout += c; });
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (c: string) => { stderr += c; });
    child.on('error', (err) => { clearTimeout(timer); reject(err); });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(stdout);
      else reject(new Error(stderr.trim() || `git exited with code ${code}`));
    });
  });
}

/** Deeply clone a repository URL into dest (full history, no shallow). */
export async function cloneRepo(url: string, dest: string, timeoutMs = 15 * 60_000): Promise<void> {
  await execGit(['clone', '--progress', url, dest], { timeoutMs });
}

export async function revListHashes(cwd: string, extra: string[] = []): Promise<string[]> {
  const out = await execGit(['rev-list', ...extra, 'HEAD'], { cwd });
  return out.split('\n').map((s) => s.trim()).filter(Boolean);
}

export async function lsTree(cwd: string, hash: string): Promise<string[]> {
  const out = await execGit(['-c', 'core.quotePath=false', 'ls-tree', '-r', '--name-only', '-z', hash], { cwd });
  return out.split('\0').filter(Boolean);
}

export interface RawChange {
  status: 'A' | 'M' | 'D' | 'R';
  newPath: string;
  oldPath?: string;
  added: number;
  removed: number;
  binary: boolean;
}

export interface RawCommit {
  hash: string;
  parents: string[];
  authorName: string;
  authorEmail: string;
  /** Committer date, unix seconds. */
  date: number;
  subject: string;
  changes: RawChange[];
}

const REC = '\u0001';
const FIELD = '\u0002';

/**
 * One pass over `git log` capturing, per non-merge commit reachable from HEAD:
 * identity fields plus both --name-status (A/M/D/R + paths) and --numstat
 * (added/removed counts). Rename detection at 50% (-M50%) so a pure rename
 * carries no metric change and is attributed to the new path.
 *
 * git emits only ONE of --numstat / --name-status per invocation (they share
 * a diff-format slot), so we run two passes with identical flags and join the
 * results by hash; both passes are deterministic and produce the same order.
 */
export async function readCommitLog(cwd: string): Promise<RawCommit[]> {
  const fmt = `--format=${REC}%H${FIELD}%P${FIELD}%an${FIELD}%ae${FIELD}%ct${FIELD}%s`;
  const base = ['-c', 'core.quotePath=false', 'log', '--no-merges', '--topo-order', '-M50%'];
  const [numOut, stOut] = await Promise.all([
    execGit([...base, '--numstat', fmt, 'HEAD'], { cwd, timeoutMs: 600_000 }),
    execGit([...base, '--name-status', fmt, 'HEAD'], { cwd, timeoutMs: 600_000 }),
  ]);

  // Pass 1: status rows per hash (A/M/D/R + paths).
  const statusByHash = new Map<string, { letter: string; paths: string[] }[]>();
  walkLog(stOut, (rec, lines) => {
    const rows: { letter: string; paths: string[] }[] = [];
    for (const line of lines) {
      const m = line.match(/^([AMDRTCUX])(\d*)\t(.*)$/s);
      if (!m) continue; // unrecognized line
      rows.push({ letter: m[1], paths: m[3].split('\t') });
    }
    statusByHash.set(rec.hash, rows);
  });

  // Pass 2: walkLog visits records in output order, so driving from the
  // numstat pass preserves commit order and full identity fields; the status
  // rows are joined by hash (both passes share flags, hence the same order).
  const commits: RawCommit[] = [];
  walkLog(numOut, (rec, lines) => {
    const numstat: { added: number; removed: number; pathStr: string }[] = [];
    for (const line of lines) {
      const m = line.match(/^(\d+|-)\t(\d+|-)\t(.*)$/s);
      if (!m) continue;
      numstat.push({
        added: m[1] === '-' ? -1 : parseInt(m[1], 10),
        removed: m[2] === '-' ? -1 : parseInt(m[2], 10),
        pathStr: m[3],
      });
    }
    rec.changes = pairChanges(numstat, statusByHash.get(rec.hash) ?? []);
    commits.push(rec);
  });
  return commits;
}

/**
 * Split a `git log --format=<custom>` output into records. The format line
 * starts with REC; every following non-empty line is a raw diff line of that
 * commit. Calls visit(rec, diffLines) per commit in output order.
 */
function walkLog(out: string, visit: (rec: RawCommit, diffLines: string[]) => void): void {
  let cur: RawCommit | null = null;
  let lines: string[] = [];
  const flush = () => {
    if (!cur) return;
    visit(cur, lines);
    cur = null;
    lines = [];
  };
  for (const line of out.split('\n')) {
    if (line.startsWith(REC)) {
      flush();
      const [hash = '', parents = '', an = '', ae = '', ct = '', ...rest] = line.slice(1).split(FIELD);
      cur = {
        hash,
        parents: parents.split(' ').filter(Boolean),
        authorName: an,
        authorEmail: ae,
        date: parseInt(ct, 10) || 0,
        subject: rest.join(FIELD),
        changes: [],
      };
      continue;
    }
    if (!line || !cur) continue;
    lines.push(line);
  }
  flush();
}

/** Resolve numstat path column, expanding brace-form renames: a/{b => c}/d */
function resolveNumstatPath(raw: string): { newPath: string; oldPath?: string } {
  const p = unquotePath(raw);
  const brace = p.match(/^(.*)\{(.*) => (.*)\}(.*)$/s);
  if (brace) {
    return {
      oldPath: brace[1] + brace[2] + brace[4],
      newPath: brace[1] + brace[3] + brace[4],
    };
  }
  if (p.includes(' => ')) {
    const arrow = p.split(' => ');
    const newPath = arrow.pop() as string;
    return { oldPath: arrow.join(' => '), newPath };
  }
  return { newPath: p };
}

function pairChanges(
  numstat: { added: number; removed: number; pathStr: string }[],
  statuses: { letter: string; paths: string[] }[],
): RawChange[] {
  const changes: RawChange[] = [];
  const byNewPath = new Map<string, { letter: string; paths: string[] }>();
  for (const st of statuses) {
    // A/M/D/T: one path; R/C: old, new
    const newPath = st.paths.length >= 2 ? st.paths[1] : st.paths[0];
    if (newPath !== undefined) byNewPath.set(newPath, st);
  }

  const sameLength = numstat.length === statuses.length;
  numstat.forEach((ns, i) => {
    const { newPath, oldPath } = resolveNumstatPath(ns.pathStr);
    let st = sameLength ? statuses[i] : byNewPath.get(newPath);
    if (!st) st = byNewPath.get(oldPath ?? '');
    if (!st) return; // cannot attribute; skip defensively
    const binary = ns.added === -1 || ns.removed === -1;
    const letter = st.letter;
    const status: RawChange['status'] =
      letter === 'A' ? 'A' :
      letter === 'D' ? 'D' :
      letter === 'R' ? 'R' : 'M'; // M, T (typechange), C (copy) behave as modify/add
    changes.push({
      status,
      newPath,
      oldPath,
      added: binary ? 0 : ns.added,
      removed: binary ? 0 : ns.removed,
      binary,
    });
  });
  return changes;
}
