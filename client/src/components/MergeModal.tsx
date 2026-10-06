import { useState } from 'react';
import type { AuthorGroup, ManualMerges } from '../../../shared/types';

/**
 * Author merging UI: select several authors and merge them into one; review
 * and undo existing groups. Mailmap-applied aliases appear inside the member
 * chips of an author.
 */
export function MergeModal({
  authors,
  mailmapEntries,
  merges,
  busy,
  onSave,
  onClose,
}: {
  authors: AuthorGroup[];
  mailmapEntries: number;
  merges: ManualMerges;
  busy: boolean;
  onSave: (m: ManualMerges) => void;
  onClose: () => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [canonical, setCanonical] = useState<string>('');

  const toggle = (key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const selectedList = authors.filter((a) => selected.has(a.key));

  const doMerge = () => {
    if (selectedList.length < 2) return;
    const key = canonical || selectedList[0].key;
    const members = [...new Set(selectedList.flatMap((a) => a.members))].sort();
    // Remove members from any existing group they belong to, then add the new one.
    const memberSet = new Set(members);
    const groups = merges.groups.filter((g) => !g.members.some((m) => memberSet.has(m)));
    groups.push({ canonical: key, members });
    onSave({ groups });
    setSelected(new Set());
    setCanonical('');
  };

  const unmerge = (canonicalKey: string) => {
    onSave({ groups: merges.groups.filter((g) => g.canonical !== canonicalKey) });
  };

  const mailmapGroups = authors.filter((a) => a.members.length > 1 && !merges.groups.some((g) => g.canonical === a.key));

  return (
    <div className="overlay" onClick={busy ? undefined : onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <header>
          <h2>Merge authors</h2>
          <button className="ghost" onClick={onClose} disabled={busy}>✕</button>
        </header>
        <div className="modal-body">
          <div className="banner info">
            Authors are matched by name + email. {mailmapEntries > 0
              ? `The repository's .mailmap (${mailmapEntries} entr${mailmapEntries === 1 ? 'y' : 'ies'}) is applied automatically.`
              : 'No .mailmap found — merge different identities manually below.'}
          </div>

          {mailmapGroups.length > 0 && (
            <div className="field">
              <label>Applied by .mailmap</label>
              {mailmapGroups.map((g) => (
                <div key={g.key} className="merge-group">
                  <div className="g-name">{g.name} &lt;{g.email}&gt;</div>
                  <div className="members">
                    {g.members.map((m) => (
                      <span key={m} className="member-chip">{m}</span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="field">
            <label>Select authors to merge (≥ 2)</label>
            {authors.map((a) => (
              <label key={a.key} className="check-row">
                <input
                  type="checkbox"
                  checked={selected.has(a.key)}
                  onChange={() => toggle(a.key)}
                  disabled={busy}
                />
                <span>
                  <b>{a.name}</b> <span className="sub">&lt;{a.email}&gt;</span>
                  {a.members.length > 1 && (
                    <span className="sub"> — {a.members.length} identities</span>
                  )}
                </span>
              </label>
            ))}
          </div>

          {merges.groups.length > 0 && (
            <div className="field">
              <label>Manual merge groups</label>
              {merges.groups.map((g) => {
                const a = authors.find((x) => x.key === g.canonical);
                return (
                  <div key={g.canonical} className="merge-group">
                    <div className="g-name">{a?.name ?? g.canonical}</div>
                    <div className="members">
                      {g.members.map((m) => (
                        <span key={m} className="member-chip">{m}</span>
                      ))}
                    </div>
                    <button className="danger" style={{ marginTop: 8 }} onClick={() => unmerge(g.canonical)} disabled={busy}>
                      Unmerge
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        <footer>
          <span className="loading-note">
            {selectedList.length >= 2
              ? `Merging ${selectedList.length} authors as:`
              : selectedList.length === 1
                ? 'Select at least one more author.'
                : ''}
          </span>
          {selectedList.length >= 2 && (
            <select value={canonical || selectedList[0].key} onChange={(e) => setCanonical(e.target.value)}>
              {selectedList.map((a) => (
                <option key={a.key} value={a.key}>
                  {a.name} &lt;{a.email}&gt;
                </option>
              ))}
            </select>
          )}
          <button className="primary" onClick={doMerge} disabled={selectedList.length < 2 || busy}>
            Merge
          </button>
          <button onClick={onClose} disabled={busy}>Done</button>
        </footer>
      </div>
    </div>
  );
}
