import type { RepoMeta } from '../../../shared/types';
import { fmtInt } from '../format';

function fmtAddedAt(ms: number): string {
  return new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/**
 * Home view: every analyzed repository as a clickable card. This is the
 * primary navigation surface — selecting a card opens that repo's dashboard,
 * and the dashboard's "back" button returns here.
 */
export function RepoGrid({
  repos,
  onSelect,
  onDelete,
  onAdd,
}: {
  repos: RepoMeta[];
  onSelect: (id: string) => void;
  onDelete: (repo: RepoMeta) => void;
  onAdd: () => void;
}) {
  if (repos.length === 0) {
    return (
      <div className="empty">
        <div className="logo">📊</div>
        <h1>No repositories analyzed yet</h1>
        <p>
          RAT measures per-author, per-file, per-directory and whole-repository metrics for any git
          repository. Add one by uploading a zip that contains the .git directory, or by cloning a
          remote URL.
        </p>
        <button className="primary" onClick={onAdd}>
          + Add your first repository
        </button>
      </div>
    );
  }

  return (
    <div className="repo-grid-wrap">
      <div className="repo-grid-header">
        <h1>Your repositories</h1>
        <p>Select a repository to open its dashboard.</p>
      </div>
      <div className="repo-grid">
        {repos.map((r) => (
          <div key={r.id} className="repo-card" onClick={() => onSelect(r.id)} title={`Open ${r.name}`}>
            <button
              className="repo-card-delete"
              title="Delete repository"
              onClick={(e) => {
                e.stopPropagation();
                onDelete(r);
              }}
            >
              ×
            </button>
            <div className="repo-card-name">{r.name}</div>
            <div className="repo-card-stats">
              <span>
                <b>{fmtInt(r.commits)}</b> commits
              </span>
              <span>
                <b>{fmtInt(r.authors)}</b> authors
              </span>
            </div>
            <div className="repo-card-tags">
              <span className="chip-static">{r.source === 'zip' ? 'uploaded zip' : 'cloned'}</span>
              {r.hasMailmap && <span className="chip-static">.mailmap</span>}
            </div>
            <div className="repo-card-foot">
              <span className="hash">{r.headHash.slice(0, 7)}</span>
              <span>added {fmtAddedAt(r.createdAt)}</span>
            </div>
          </div>
        ))}
        <button className="repo-card repo-card-add" onClick={onAdd}>
          <span className="repo-card-add-plus">+</span>
          Add repository
        </button>
      </div>
    </div>
  );
}
