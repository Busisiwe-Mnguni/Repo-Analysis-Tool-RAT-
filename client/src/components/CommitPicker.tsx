import { useMemo, useState } from 'react';
import type { CommitRow } from '../../../shared/types';
import { fmtDate, fmtInt, shortHash, signedCls } from '../format';

/**
 * Modal for manually selecting a list of commits (the H ⊆ H̄ filter).
 */
export function CommitPicker({
  commits,
  loading,
  selected,
  onApply,
  onClose,
}: {
  commits: CommitRow[] | null;
  loading: boolean;
  selected: string[];
  onApply: (hashes: string[]) => void;
  onClose: () => void;
}) {
  const [search, setSearch] = useState('');
  const [temp, setTemp] = useState<Set<string>>(new Set(selected));

  const rows = useMemo(() => {
    if (!commits) return [];
    const q = search.trim().toLowerCase();
    const list = q
      ? commits.filter(
          (c) =>
            c.subject.toLowerCase().includes(q) ||
            c.authorName.toLowerCase().includes(q) ||
            c.hash.startsWith(q),
        )
      : commits;
    return [...list].sort((a, b) => b.date - a.date);
  }, [commits, search]);

  const toggle = (hash: string) => {
    setTemp((prev) => {
      const next = new Set(prev);
      if (next.has(hash)) next.delete(hash);
      else next.add(hash);
      return next;
    });
  };

  const allFilteredSelected = rows.length > 0 && rows.every((r) => temp.has(r.hash));

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal wide" onClick={(e) => e.stopPropagation()}>
        <header>
          <h2>
            Select commits <span className="badge">{temp.size}</span>
          </h2>
          <button className="ghost" onClick={onClose}>✕</button>
        </header>
        <div className="modal-body">
          <div className="picker-toolbar">
            <input
              type="text"
              placeholder="Search subject, author or hash…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ flex: 1, minWidth: 220 }}
              autoFocus
            />
            <button
              onClick={() =>
                setTemp((prev) => {
                  const next = new Set(prev);
                  if (allFilteredSelected) rows.forEach((r) => next.delete(r.hash));
                  else rows.forEach((r) => next.add(r.hash));
                  return next;
                })
              }
            >
              {allFilteredSelected ? 'Deselect filtered' : 'Select filtered'}
            </button>
            <button onClick={() => setTemp(new Set())}>Clear</button>
          </div>

          {loading && <div className="loading-note"><span className="spin" />Loading commits…</div>}
          {!loading && rows.length === 0 && <div className="loading-note">No commits match the search.</div>}

          <div className="picker-list">
            {rows.map((c) => (
              <label key={c.hash} className="picker-row">
                <input type="checkbox" checked={temp.has(c.hash)} onChange={() => toggle(c.hash)} />
                <span className="when">{fmtDate(c.date)}</span>
                <span className="who">{c.authorName}</span>
                <span className="subject">{c.subject}</span>
                <span className={`num ${signedCls(c.added)}`}>+{fmtInt(c.added)}</span>
                <span className={`num ${signedCls(-c.removed)}`}>−{fmtInt(c.removed)}</span>
                <span className="hash">{shortHash(c.hash)}</span>
              </label>
            ))}
          </div>
        </div>
        <footer>
          <span className="loading-note">{temp.size} commit{temp.size === 1 ? '' : 's'} selected</span>
          <div className="spacer" />
          <button onClick={onClose}>Cancel</button>
          <button className="primary" onClick={() => onApply([...temp])}>
            Apply selection
          </button>
        </footer>
      </div>
    </div>
  );
}
