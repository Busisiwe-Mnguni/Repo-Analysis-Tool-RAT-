import { useRef, useState } from 'react';
import type { RepoMeta } from '../../../shared/types';
import { api } from '../api';

export function UploadModal({ onClose, onAdded }: { onClose: () => void; onAdded: (meta: RepoMeta) => void }) {
  const [tab, setTab] = useState<'zip' | 'url'>('zip');
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const doUpload = async () => {
    if (!file) return;
    setBusy(true);
    setError(null);
    setProgress(0);
    try {
      const meta = await api.uploadZip(file, setProgress);
      onAdded(meta);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
      setProgress(null);
    }
  };

  const doClone = async () => {
    if (!url.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const meta = await api.clone(url.trim());
      onAdded(meta);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  return (
    <div className="overlay" onClick={busy ? undefined : onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <header>
          <h2>Add repository</h2>
          <button className="ghost" onClick={onClose} disabled={busy}>
            ✕
          </button>
        </header>
        <div className="modal-body">
          <div className="tabs-inner">
            <button className={tab === 'zip' ? 'active' : ''} onClick={() => setTab('zip')} disabled={busy}>
              Zip file
            </button>
            <button className={tab === 'url' ? 'active' : ''} onClick={() => setTab('url')} disabled={busy}>
              Clone URL
            </button>
          </div>

          {tab === 'zip' && (
            <>
              <div
                className="drop-zone"
                onClick={() => fileInput.current?.click()}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.currentTarget.classList.add('drag');
                }}
                onDragLeave={(e) => e.currentTarget.classList.remove('drag')}
                onDrop={(e) => {
                  e.preventDefault();
                  e.currentTarget.classList.remove('drag');
                  const f = e.dataTransfer.files?.[0];
                  if (f) setFile(f);
                }}
              >
                {file ? (
                  <span>
                    <b>{file.name}</b> ({Math.round(file.size / 1024)} KB)
                  </span>
                ) : (
                  <span>Click to choose a .zip of the repository, or drop it here.<br />The archive must include the .git directory.</span>
                )}
              </div>
              <input
                ref={fileInput}
                type="file"
                accept=".zip,application/zip"
                style={{ display: 'none' }}
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
              {progress !== null && (
                <div style={{ marginTop: 12 }}>
                  <div className="progress-bar">
                    <div style={{ width: `${progress}%` }} />
                  </div>
                  <div className="loading-note" style={{ marginTop: 6 }}>
                    {progress < 100 ? `Uploading… ${progress}%` : 'Analyzing repository history…'}
                  </div>
                </div>
              )}
            </>
          )}

          {tab === 'url' && (
            <div className="field">
              <label>Repository URL (git clone)</label>
              <input
                type="text"
                placeholder="https://github.com/user/repo.git"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && doClone()}
                disabled={busy}
                autoFocus
              />
              <span className="hint">The repository is deeply cloned — the full history is required for metrics.</span>
            </div>
          )}

          {error && <div className="banner error" style={{ marginTop: 12 }}>{error}</div>}
        </div>
        <footer>
          {busy && (
            <span className="loading-note">
              <span className="spin" />
              {tab === 'zip' ? 'Uploading & analyzing…' : 'Cloning (this may take a while)…'}
            </span>
          )}
          <div className="spacer" />
          <button onClick={onClose} disabled={busy}>
            Cancel
          </button>
          {tab === 'zip' ? (
            <button className="primary" onClick={doUpload} disabled={!file || busy}>
              Upload & analyze
            </button>
          ) : (
            <button className="primary" onClick={doClone} disabled={!url.trim() || busy}>
              Clone & analyze
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}
