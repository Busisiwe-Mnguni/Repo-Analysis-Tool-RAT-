import { useEffect, useState } from 'react';
import type { CommitRow, ManualMerges, MetricsFilter, MetricsResult, RepoDetail, RepoMeta } from '../../shared/types';
import { api } from './api';
import { CommitPicker } from './components/CommitPicker';
import { Dashboard } from './components/Dashboard';
import { EMPTY_FILTER, FilterPanel, isFilterActive, type FilterState } from './components/FilterPanel';
import { MergeModal } from './components/MergeModal';
import { RepoGrid } from './components/RepoGrid';
import { UploadModal } from './components/UploadModal';

function toMetricsFilter(f: FilterState): MetricsFilter {
  const range: MetricsFilter['range'] = {};
  if (f.from) range.from = Math.floor(new Date(f.from).getTime() / 1000);
  if (f.to) range.to = Math.floor(new Date(f.to).getTime() / 1000);
  return {
    authors: f.authors,
    path: f.path || undefined,
    pathMode: f.pathMode,
    commitMode: f.commitMode,
    range: f.commitMode === 'range' ? range : undefined,
    hashes: f.commitMode === 'list' ? f.hashes : undefined,
  };
}

export default function App() {
  const [repos, setRepos] = useState<RepoMeta[]>([]);
  const [repoId, setRepoId] = useState<string | null>(null);
  const [detail, setDetail] = useState<RepoDetail | null>(null);
  const [paths, setPaths] = useState<{ files: string[]; dirs: string[] }>({ files: [], dirs: [] });
  const [commitRows, setCommitRows] = useState<CommitRow[] | null>(null);
  const [commitRowsLoading, setCommitRowsLoading] = useState(false);
  const [merges, setMerges] = useState<ManualMerges>({ groups: [] });
  const [mergesVersion, setMergesVersion] = useState(0);
  const [mergesBusy, setMergesBusy] = useState(false);

  const [filter, setFilter] = useState<FilterState>(EMPTY_FILTER);
  const [metrics, setMetrics] = useState<MetricsResult | null>(null);
  const [metricsLoading, setMetricsLoading] = useState(false);
  const [metricsError, setMetricsError] = useState<string | null>(null);
  const [pageError, setPageError] = useState<string | null>(null);

  const [showUpload, setShowUpload] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [showMerge, setShowMerge] = useState(false);

  // ---- Data loading -----------------------------------------------------------

  useEffect(() => {
    api.listRepos().then(setRepos).catch((e) => setPageError(e.message));
  }, []);

  useEffect(() => {
    if (!repoId) {
      setDetail(null);
      setMetrics(null);
      return;
    }
    let cancelled = false;
    setDetail(null);
    setPaths({ files: [], dirs: [] });
    setCommitRows(null);
    setMerges({ groups: [] });
    setFilter(EMPTY_FILTER);
    setPageError(null);
    setMetricsError(null);
    api
      .detail(repoId)
      .then((d) => {
        if (!cancelled) setDetail(d);
      })
      .catch((e) => {
        if (!cancelled) setPageError(e.message);
      });
    api
      .paths(repoId)
      .then((p) => {
        if (!cancelled) setPaths(p);
      })
      .catch(() => undefined);
    api
      .merges(repoId)
      .then((m) => {
        if (!cancelled) setMerges(m);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [repoId]);

  // Metrics recomputed whenever the repo, filter, or author merges change.
  const filterKey = JSON.stringify(filter);
  useEffect(() => {
    if (!repoId) return;
    const ctrl = new AbortController();
    setMetricsLoading(true);
    const timer = setTimeout(() => {
      api
        .metrics(repoId, toMetricsFilter(filter), ctrl.signal)
        .then((m) => {
          setMetrics(m);
          setMetricsError(null);
        })
        .catch((e: unknown) => {
          if (e instanceof DOMException && e.name === 'AbortError') return;
          setMetricsError(e instanceof Error ? e.message : String(e));
        })
        .finally(() => setMetricsLoading(false));
    }, 250);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repoId, filterKey, mergesVersion]);

  // ---- Handlers ----------------------------------------------------------------

  const onAdded = (meta: RepoMeta) => {
    setShowUpload(false);
    setRepos((prev) => [meta, ...prev]);
    setRepoId(meta.id);
  };

  const onDelete = async () => {
    if (!repoId || !detail) return;
    await deleteRepo(repoId, detail.meta.name);
  };

  /** Delete any repository by id (used by both the top-bar button and the repo-grid card). */
  const deleteRepo = async (id: string, name: string) => {
    if (!window.confirm(`Delete repository "${name}" and its analysis data?`)) return;
    await api.deleteRepo(id);
    const list = await api.listRepos();
    setRepos(list);
    if (repoId === id) setRepoId(null); // back to the repo grid if the open repo was removed
  };

  const goBack = () => setRepoId(null);

  const openPicker = () => {
    if (!repoId) return;
    if (!commitRows) {
      setCommitRowsLoading(true);
      api
        .commits(repoId)
        .then(setCommitRows)
        .catch((e) => setPageError(e.message))
        .finally(() => setCommitRowsLoading(false));
    }
    setShowPicker(true);
  };

  const onSaveMerges = async (m: ManualMerges) => {
    if (!repoId) return;
    setMergesBusy(true);
    try {
      const saved = await api.saveMerges(repoId, m);
      setMerges(saved);
      setMergesVersion((v) => v + 1);
      setDetail(await api.detail(repoId));
    } catch (e) {
      setPageError(e instanceof Error ? e.message : String(e));
    } finally {
      setMergesBusy(false);
    }
  };

  const selectedMeta = repos.find((r) => r.id === repoId);

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          RAT<span className="brand-sub">Repo Analysis Tool</span>
        </div>
        {repoId && (
          <button className="ghost back-btn" onClick={goBack} title="Back to all repositories">
            ← All repositories
          </button>
        )}
        {selectedMeta && (
          <>
            <span className="current-repo-name">{selectedMeta.name}</span>
            <span className="meta-chip">
              <b>{selectedMeta.commits}</b> commits · <b>{selectedMeta.authors}</b> authors ·{' '}
              {selectedMeta.source === 'zip' ? 'uploaded zip' : 'cloned'}
              {selectedMeta.hasMailmap ? ' · .mailmap applied' : ''}
            </span>
          </>
        )}
        <div className="spacer" />
        <button className="primary" onClick={() => setShowUpload(true)}>
          + Add repository
        </button>
        {detail && (
          <button onClick={() => setShowMerge(true)} disabled={mergesBusy}>
            Merge authors
          </button>
        )}
        {detail && (
          <button className="danger" onClick={onDelete}>
            Delete
          </button>
        )}
      </header>

      {pageError && <div className="banner error" style={{ margin: '12px 20px 0' }}>{pageError}</div>}

      {!repoId ? (
        <main className="app-main">
          <RepoGrid
            repos={repos}
            onSelect={setRepoId}
            onDelete={(r) => deleteRepo(r.id, r.name)}
            onAdd={() => setShowUpload(true)}
          />
        </main>
      ) : !detail ? (
        <div className="empty">
          <span className="spin" />
          Loading repository…
        </div>
      ) : (
        <main className="app-main">
          <FilterPanel
            authors={detail.authors}
            paths={paths}
            filter={filter}
            onChange={setFilter}
            onOpenPicker={openPicker}
          />
          {metricsError && <div className="banner error">{metricsError}</div>}
          {!metrics && metricsLoading && (
            <div className="loading-note">
              <span className="spin" />
              Computing metrics…
            </div>
          )}
          {metrics && (
            <>
              {metricsLoading && <div className="loading-note">Updating metrics…</div>}
              <Dashboard
                metrics={metrics}
                activeAuthors={filter.authors}
                activePath={filter.path}
                onAuthorToggle={(key) =>
                  setFilter((f) => ({
                    ...f,
                    authors: f.authors.includes(key) ? f.authors.filter((k) => k !== key) : [...f.authors, key],
                  }))
                }
                onPathSelect={(path, mode) => setFilter((f) => ({ ...f, path, pathMode: mode }))}
              />
            </>
          )}
        </main>
      )}

      {showUpload && <UploadModal onClose={() => setShowUpload(false)} onAdded={onAdded} />}

      {showPicker && (
        <CommitPicker
          commits={commitRows}
          loading={commitRowsLoading}
          selected={filter.hashes}
          onApply={(hashes) => {
            setFilter((f) => ({ ...f, hashes }));
            setShowPicker(false);
          }}
          onClose={() => setShowPicker(false)}
        />
      )}

      {showMerge && detail && (
        <MergeModal
          authors={detail.authors}
          mailmapEntries={detail.mailmapEntries}
          merges={merges}
          busy={mergesBusy}
          onSave={onSaveMerges}
          onClose={() => setShowMerge(false)}
        />
      )}
    </div>
  );
}

// Re-export for FilterPanel consumers that want a quick emptiness check.
export { isFilterActive };
