import { useMemo, useState } from 'react';
import type { AuthorGroup } from '../../../shared/types';
import { signedCls } from '../format';

export interface FilterState {
  authors: string[];
  path: string;
  pathMode: 'file' | 'dir';
  commitMode: 'all' | 'range' | 'list';
  from: string; // datetime-local string
  to: string; // datetime-local string (exclusive)
  hashes: string[];
}

export const EMPTY_FILTER: FilterState = {
  authors: [],
  path: '',
  pathMode: 'dir',
  commitMode: 'all',
  from: '',
  to: '',
  hashes: [],
};

export function isFilterActive(f: FilterState): boolean {
  if (f.authors.length > 0) return true;
  if (f.path !== '') return true;
  if (f.commitMode === 'range') return f.from !== '' || f.to !== '';
  if (f.commitMode === 'list') return f.hashes.length > 0;
  return false;
}

export function FilterPanel({
  authors,
  paths,
  filter,
  onChange,
  onOpenPicker,
}: {
  authors: AuthorGroup[];
  paths: { files: string[]; dirs: string[] };
  filter: FilterState;
  onChange: (f: FilterState) => void;
  onOpenPicker: () => void;
}) {
  const [authorOpen, setAuthorOpen] = useState(false);
  const [authorSearch, setAuthorSearch] = useState('');

  const filteredAuthors = useMemo(() => {
    const q = authorSearch.trim().toLowerCase();
    if (!q) return authors;
    return authors.filter(
      (a) => a.name.toLowerCase().includes(q) || a.email.toLowerCase().includes(q) || a.members.some((m) => m.toLowerCase().includes(q)),
    );
  }, [authors, authorSearch]);

  const set = (patch: Partial<FilterState>) => onChange({ ...filter, ...patch });

  const onPathChange = (value: string) => {
    // Auto-detect file vs directory when the value matches a known path.
    let mode = filter.pathMode;
    if (paths.files.includes(value)) mode = 'file';
    else if (paths.dirs.includes(value)) mode = 'dir';
    set({ path: value, pathMode: mode });
  };

  const selectedAuthorNames = filter.authors
    .map((k) => authors.find((a) => a.key === k)?.name)
    .filter(Boolean) as string[];

  return (
    <div className="filters">
      {/* Author filter */}
      <div className="filter-block">
        <label>Authors</label>
        <div className="relative">
          <button onClick={() => setAuthorOpen((o) => !o)} style={{ minWidth: 170 }}>
            {filter.authors.length === 0
              ? 'All authors'
              : filter.authors.length === 1
                ? selectedAuthorNames[0]
                : `${filter.authors.length} authors`}
            {' ▾'}
          </button>
          {authorOpen && (
            <div className="dropdown-panel">
              <input
                type="text"
                placeholder="Search authors…"
                value={authorSearch}
                onChange={(e) => setAuthorSearch(e.target.value)}
                style={{ width: '100%', marginBottom: 6 }}
                autoFocus
              />
              {filteredAuthors.map((a) => (
                <label key={a.key} className="check-row">
                  <input
                    type="checkbox"
                    checked={filter.authors.includes(a.key)}
                    onChange={() =>
                      set({
                        authors: filter.authors.includes(a.key)
                          ? filter.authors.filter((k) => k !== a.key)
                          : [...filter.authors, a.key],
                      })
                    }
                  />
                  <span>
                    {a.name} <span className="sub">&lt;{a.email}&gt;</span>
                    {a.members.length > 1 && <span className="sub"> ({a.members.length} identities)</span>}
                  </span>
                </label>
              ))}
              {filteredAuthors.length === 0 && <div className="loading-note">No authors match.</div>}
            </div>
          )}
        </div>
      </div>

      {/* Path filter */}
      <div className="filter-block">
        <label>File or directory</label>
        <div className="filter-row">
          <div className="segmented">
            <button
              className={filter.pathMode === 'dir' ? 'active' : ''}
              onClick={() => set({ pathMode: 'dir' })}
              title="Scope to a directory"
            >
              Dir
            </button>
            <button
              className={filter.pathMode === 'file' ? 'active' : ''}
              onClick={() => set({ pathMode: 'file' })}
              title="Scope to a single file"
            >
              File
            </button>
          </div>
          <input
            type="text"
            list="rat-path-options"
            placeholder={filter.pathMode === 'file' ? 'src/main.ts' : 'src/ (empty = whole repo)'}
            value={filter.path}
            onChange={(e) => onPathChange(e.target.value)}
            style={{ minWidth: 220 }}
          />
          <datalist id="rat-path-options">
            {paths.dirs.map((d) => (
              <option key={`d:${d}`} value={d}>
                directory
              </option>
            ))}
            {paths.files.map((p) => (
              <option key={`f:${p}`} value={p}>
                file
              </option>
            ))}
          </datalist>
        </div>
      </div>

      {/* Commit filter */}
      <div className="filter-block">
        <label>Commits</label>
        <div className="filter-row">
          <div className="segmented">
            <button
              className={filter.commitMode === 'all' ? 'active' : ''}
              onClick={() => set({ commitMode: 'all' })}
            >
              All
            </button>
            <button
              className={filter.commitMode === 'range' ? 'active' : ''}
              onClick={() => set({ commitMode: 'range' })}
            >
              Time range
            </button>
            <button
              className={filter.commitMode === 'list' ? 'active' : ''}
              onClick={() => set({ commitMode: 'list' })}
            >
              Selected {filter.hashes.length > 0 && <span className="badge">{filter.hashes.length}</span>}
            </button>
          </div>
          {filter.commitMode === 'range' && (
            <>
              <input
                type="datetime-local"
                value={filter.from}
                onChange={(e) => set({ from: e.target.value })}
                title="From (inclusive)"
              />
              <input
                type="datetime-local"
                value={filter.to}
                onChange={(e) => set({ to: e.target.value })}
                title="Until (exclusive)"
              />
              <span className="mode-note">until is exclusive</span>
            </>
          )}
          {filter.commitMode === 'list' && (
            <button onClick={onOpenPicker}>
              {filter.hashes.length > 0 ? `Edit selection (${filter.hashes.length})` : 'Choose commits…'}
            </button>
          )}
        </div>
      </div>

      <div className="spacer" />
      {isFilterActive(filter) && (
        <button className="ghost" onClick={() => onChange({ ...EMPTY_FILTER })}>
          Reset filters
        </button>
      )}
      {authorOpen && <div style={{ position: 'fixed', inset: 0, zIndex: 25 }} onClick={() => setAuthorOpen(false)} />}
    </div>
  );
}

/** Small helper used by tables to colorize +/- counts. */
export { signedCls };
