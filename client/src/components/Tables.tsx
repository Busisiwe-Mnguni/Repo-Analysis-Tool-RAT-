import { useState } from 'react';
import type { AuthorMetric, CommitMetric, DirMetric, FileMetric, MetricsResult } from '../../../shared/types';
import { fmtDate, fmtDay, fmtInt, fmtNet, shortHash, signedCls } from '../format';

type Dir = 'asc' | 'desc';

function useSort<K extends string>(initial: K, initialDir: Dir = 'desc') {
  const [key, setKey] = useState<K>(initial);
  const [dir, setDir] = useState<Dir>(initialDir);
  const toggle = (k: K) => {
    if (k === key) setDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setKey(k);
      setDir('desc');
    }
  };
  return { key, dir, toggle };
}

function Th<K extends string>({
  k,
  sort,
  label,
  num,
}: {
  k: K;
  sort: { key: K; dir: Dir; toggle: (k: K) => void };
  label: string;
  num?: boolean;
}) {
  return (
    <th className={num ? 'num' : ''} onClick={() => sort.toggle(k)}>
      {label}
      {sort.key === k && <span className="arrow">{sort.dir === 'asc' ? '▲' : '▼'}</span>}
    </th>
  );
}

function cmpNum(a: number, b: number, dir: Dir): number {
  return dir === 'asc' ? a - b : b - a;
}
function cmpStr(a: string, b: string, dir: Dir): number {
  return dir === 'asc' ? a.localeCompare(b) : b.localeCompare(a);
}

// ---- Summary cards -------------------------------------------------------------

export function SummaryCards({ metrics }: { metrics: MetricsResult }) {
  const s = metrics.summary;
  const cards: { label: string; value: string; cls?: string; sub?: string }[] = [
    { label: 'Commits', value: fmtInt(s.commits), sub: `of ${fmtInt(metrics.commitsTotal)} total` },
    { label: 'Authors', value: fmtInt(s.authors) },
    { label: 'Files', value: fmtInt(s.files) },
    { label: 'Directories', value: fmtInt(s.dirs), sub: 'incl. root' },
    { label: 'Lines added', value: `+${fmtInt(s.added)}`, cls: 'pos' },
    { label: 'Lines removed', value: `−${fmtInt(s.removed)}`, cls: 'neg' },
    { label: 'Net lines', value: fmtNet(s.net), cls: signedCls(s.net) },
  ];
  return (
    <div className="summary-grid">
      {cards.map((c) => (
        <div key={c.label} className="card">
          <div className="label">{c.label}</div>
          <div className={`value ${c.cls ?? ''}`}>{c.value}</div>
          {c.sub && <div className="sub">{c.sub}</div>}
        </div>
      ))}
      <div className="card">
        <div className="label">Period</div>
        <div className="sub" style={{ fontSize: 13 }}>
          {fmtDay(s.firstDate)}
        </div>
        <div className="sub" style={{ fontSize: 13 }}>
          → {fmtDay(s.lastDate)}
        </div>
      </div>
    </div>
  );
}

// ---- Authors --------------------------------------------------------------------

export function AuthorsTable({
  rows,
  activeAuthors,
  onToggle,
}: {
  rows: AuthorMetric[];
  activeAuthors: string[];
  onToggle: (key: string) => void;
}) {
  const sort = useSort<'commits' | 'name' | 'added' | 'removed' | 'files'>('commits');
  const sorted = [...rows].sort((a, b) => {
    switch (sort.key) {
      case 'name': return cmpStr(a.name, b.name, sort.dir);
      case 'added': return cmpNum(a.added, b.added, sort.dir);
      case 'removed': return cmpNum(a.removed, b.removed, sort.dir);
      case 'files': return cmpNum(a.files, b.files, sort.dir);
      default: return cmpNum(a.commits, b.commits, sort.dir) || cmpNum(a.added, b.added, 'desc');
    }
  });
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <Th k="name" sort={sort} label="Author" />
            <Th k="commits" sort={sort} label="Commits" num />
            <Th k="added" sort={sort} label="Added" num />
            <Th k="removed" sort={sort} label="Removed" num />
            <th className="num">Net</th>
            <Th k="files" sort={sort} label="Files" num />
            <th>Last commit</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((a) => (
            <tr
              key={a.key}
              className={`clickable ${activeAuthors.includes(a.key) ? 'active' : ''}`}
              onClick={() => onToggle(a.key)}
              title="Click to filter by this author"
            >
              <td className="author-cell">
                <b>{a.name}</b>
                <span className="email">{a.email}</span>
              </td>
              <td className="num">{fmtInt(a.commits)}</td>
              <td className="num pos">+{fmtInt(a.added)}</td>
              <td className="num neg">−{fmtInt(a.removed)}</td>
              <td className={`num ${signedCls(a.added - a.removed)}`}>{fmtNet(a.added - a.removed)}</td>
              <td className="num">{fmtInt(a.files)}</td>
              <td>{fmtDate(a.lastDate)}</td>
            </tr>
          ))}
          {sorted.length === 0 && (
            <tr>
              <td colSpan={7} className="zero">No authors in the selected commit set.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

// ---- Files ------------------------------------------------------------------------

export function FilesTable({
  rows,
  activePath,
  onSelect,
}: {
  rows: FileMetric[];
  activePath: string;
  onSelect: (path: string) => void;
}) {
  const sort = useSort<'path' | 'commits' | 'added' | 'removed' | 'authors' | 'lastDate'>('commits');
  const sorted = [...rows].sort((a, b) => {
    switch (sort.key) {
      case 'path': return cmpStr(a.path, b.path, sort.dir);
      case 'added': return cmpNum(a.added, b.added, sort.dir);
      case 'removed': return cmpNum(a.removed, b.removed, sort.dir);
      case 'authors': return cmpNum(a.authors, b.authors, sort.dir);
      case 'lastDate': return cmpNum(a.lastDate, b.lastDate, sort.dir);
      default: return cmpNum(a.commits, b.commits, sort.dir) || cmpNum(a.added + a.removed, b.added + b.removed, 'desc');
    }
  });
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <Th k="path" sort={sort} label="File" />
            <Th k="commits" sort={sort} label="Commits" num />
            <Th k="added" sort={sort} label="Added" num />
            <Th k="removed" sort={sort} label="Removed" num />
            <th className="num">Net</th>
            <Th k="authors" sort={sort} label="Authors" num />
            <Th k="lastDate" sort={sort} label="Last change" />
            <th className="num">In HEAD</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((f) => (
            <tr
              key={f.path}
              className={`clickable ${activePath === f.path ? 'active' : ''}`}
              onClick={() => onSelect(f.path)}
              title="Click to scope the dashboard to this file"
            >
              <td className="path-cell">{f.path}</td>
              <td className="num">{fmtInt(f.commits)}</td>
              <td className="num pos">+{fmtInt(f.added)}</td>
              <td className="num neg">−{fmtInt(f.removed)}</td>
              <td className={`num ${signedCls(f.added - f.removed)}`}>{fmtNet(f.added - f.removed)}</td>
              <td className="num">{fmtInt(f.authors)}</td>
              <td>{fmtDate(f.lastDate)}</td>
              <td className="num">{f.existsInHead ? <span className="tick">✓</span> : <span className="cross">—</span>}</td>
            </tr>
          ))}
          {sorted.length === 0 && (
            <tr>
              <td colSpan={8} className="zero">No files in the selected commit set.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

// ---- Directories ---------------------------------------------------------------------

export function DirsTable({
  rows,
  activePath,
  onSelect,
}: {
  rows: DirMetric[];
  activePath: string;
  onSelect: (path: string) => void;
}) {
  const sort = useSort<'path' | 'commits' | 'files' | 'subdirs' | 'added' | 'removed'>('commits');
  const sorted = [...rows].sort((a, b) => {
    switch (sort.key) {
      case 'path': return cmpStr(a.path, b.path, sort.dir);
      case 'files': return cmpNum(a.files, b.files, sort.dir);
      case 'subdirs': return cmpNum(a.subdirs, b.subdirs, sort.dir);
      case 'added': return cmpNum(a.added, b.added, sort.dir);
      case 'removed': return cmpNum(a.removed, b.removed, sort.dir);
      default: return cmpNum(a.commits, b.commits, sort.dir) || cmpStr(a.path, b.path, 'asc');
    }
  });
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <Th k="path" sort={sort} label="Directory" />
            <Th k="commits" sort={sort} label="Commits" num />
            <Th k="files" sort={sort} label="Files" num />
            <Th k="subdirs" sort={sort} label="Subdirs" num />
            <Th k="added" sort={sort} label="Added" num />
            <Th k="removed" sort={sort} label="Removed" num />
          </tr>
        </thead>
        <tbody>
          {sorted.map((d) => (
            <tr
              key={d.path}
              className={`clickable ${activePath === d.path ? 'active' : ''}`}
              onClick={() => onSelect(d.path)}
              title="Click to scope the dashboard to this directory"
            >
              <td className="path-cell">{d.path === '' ? '/' : `${d.path}/`}</td>
              <td className="num">{fmtInt(d.commits)}</td>
              <td className="num">{fmtInt(d.files)}</td>
              <td className="num">{fmtInt(d.subdirs)}</td>
              <td className="num pos">+{fmtInt(d.added)}</td>
              <td className="num neg">−{fmtInt(d.removed)}</td>
            </tr>
          ))}
          {sorted.length === 0 && (
            <tr>
              <td colSpan={6} className="zero">No directories in the selected commit set.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

// ---- Commits ---------------------------------------------------------------------------

export function CommitsTable({ rows, total }: { rows: CommitMetric[]; total: number }) {
  const sort = useSort<'date' | 'authorName' | 'added' | 'removed' | 'files'>('date');
  const sorted = [...rows].sort((a, b) => {
    switch (sort.key) {
      case 'authorName': return cmpStr(a.authorName, b.authorName, sort.dir);
      case 'added': return cmpNum(a.added, b.added, sort.dir);
      case 'removed': return cmpNum(a.removed, b.removed, sort.dir);
      case 'files': return cmpNum(a.files, b.files, sort.dir);
      default: return cmpNum(a.date, b.date, sort.dir);
    }
  });
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <Th k="date" sort={sort} label="Date" />
            <Th k="authorName" sort={sort} label="Author" />
            <th>Subject</th>
            <Th k="files" sort={sort} label="Files" num />
            <Th k="added" sort={sort} label="Added" num />
            <Th k="removed" sort={sort} label="Removed" num />
            <th>Hash</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((c) => (
            <tr key={c.hash}>
              <td style={{ whiteSpace: 'nowrap' }}>{fmtDate(c.date)}</td>
              <td>{c.authorName}</td>
              <td className="subject-cell">{c.subject}</td>
              <td className="num">{fmtInt(c.files)}</td>
              <td className="num pos">+{fmtInt(c.added)}</td>
              <td className="num neg">−{fmtInt(c.removed)}</td>
              <td className="hash">{shortHash(c.hash)}</td>
            </tr>
          ))}
          {sorted.length === 0 && (
            <tr>
              <td colSpan={7} className="zero">No commits match the current filters.</td>
            </tr>
          )}
        </tbody>
      </table>
      {total > rows.length && (
        <div className="loading-note" style={{ padding: '8px 12px' }}>
          Showing {rows.length} of {fmtInt(total)} commits — narrow the filters to see more.
        </div>
      )}
    </div>
  );
}
