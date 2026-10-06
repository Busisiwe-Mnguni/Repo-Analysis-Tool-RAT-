import type {
  CommitRow,
  ManualMerges,
  MetricsFilter,
  MetricsResult,
  RepoDetail,
  RepoMeta,
} from '../../shared/types';

async function j<T>(res: Response): Promise<T> {
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.error ?? `Request failed (${res.status})`);
  return body as T;
}

const JSON_HEADERS = { 'Content-Type': 'application/json' };

export const api = {
  listRepos: () => fetch('/api/repos').then((r) => j<RepoMeta[]>(r)),

  deleteRepo: (id: string) => fetch(`/api/repos/${id}`, { method: 'DELETE' }).then((r) => j<{ ok: boolean }>(r)),

  detail: (id: string) => fetch(`/api/repos/${id}`).then((r) => j<RepoDetail>(r)),

  paths: (id: string) =>
    fetch(`/api/repos/${id}/paths`).then((r) => j<{ files: string[]; dirs: string[] }>(r)),

  commits: (id: string) => fetch(`/api/repos/${id}/commits`).then((r) => j<CommitRow[]>(r)),

  metrics: (id: string, filter: MetricsFilter, signal?: AbortSignal) =>
    fetch(`/api/repos/${id}/metrics`, {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify(filter),
      signal,
    }).then((r) => j<MetricsResult>(r)),

  merges: (id: string) => fetch(`/api/repos/${id}/merges`).then((r) => j<ManualMerges>(r)),

  saveMerges: (id: string, merges: ManualMerges) =>
    fetch(`/api/repos/${id}/merges`, {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify(merges),
    }).then((r) => j<ManualMerges>(r)),

  clone: (url: string) =>
    fetch('/api/repos/clone', { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify({ url }) }).then(
      (r) => j<RepoMeta>(r),
    ),

  uploadZip: (file: File, onProgress: (pct: number) => void) =>
    new Promise<RepoMeta>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', '/api/repos/zip');
      xhr.responseType = 'json';
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
      };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) resolve(xhr.response as RepoMeta);
        else reject(new Error((xhr.response as any)?.error ?? `Upload failed (${xhr.status})`));
      };
      xhr.onerror = () => reject(new Error('Upload failed — network error'));
      const fd = new FormData();
      fd.append('file', file);
      xhr.send(fd);
    }),
};
