# RAT — Repo Analysis Tool

RAT is a web dashboard that makes the history of a git repository legible. Point it at a
repository (by uploading a zip of a `.git` checkout, or by giving it a remote URL to clone)
and it computes, server-side, a consistent set of metrics for every **author**, **file**,
**directory**, and the **repository as a whole**, over any **commit set** you choose
(all history, a time range, or a hand-picked list of commits).

It is designed to answer the questions git itself makes opaque: who has touched this file,
how volatile is this directory, which commits mattered, and how has the project grown.

## What it measures

For a commit `h` with previous commit `h[p]`, author `h[a]`, and committer date, over a
chosen commit set `H`:

- **File metrics** — added lines `l⁺`, removed lines `l⁻`, growth `δ = l⁺ − l⁻`, churn
  `λ = l⁺ + l⁻`, per file.
- **Directory metrics** — the same four quantities, recursively aggregated over a
  directory's immediate files and subdirectories (so they equal the sum over every file
  nested underneath). The repository's own metrics are simply the directory metrics of
  the root.
- **Commit-set metrics** — summed added/removed/growth/churn over `H`; **modifications**
  `n` (commits that actually changed an object, i.e. churn > 0 — pure renames and mode-only
  touches don't count); **modification frequency** `η = n / |H|`; **churn rate**
  `ρ = λ / |H|`.
- **Author metrics** — each author's added/removed/growth/churn/commits/files within `H`,
  and **author ownership** `ω` — shown as the top-contributing author plus their share of
  an object's churn, surfaced as a chip on every file and directory row.

Renames (detected at a 50% similarity threshold) carry no spurious metric change and are
attributed to the new path; deletions are recorded as removed lines on the deleted path;
binary files are excluded from every measurement, exactly as git itself detects them.

## Features

- **Repository upload** — a zip file containing the `.git` directory, or a remote URL
  that RAT deep-clones on the server.
- **Multiple repositories** — add, switch between, and delete as many analyzed repos as
  you like.
- **Filtering** — by author, by a single file or whole directory subtree, and by commit
  set (all history, a `from`/`to` time range, or a manually selected list of commits).
- **Author merging** — automatic via the repository's `.mailmap` if present, plus a manual
  merge UI for collapsing identities a mailmap doesn't cover.
- **Dashboard** — summary cards, an activity-over-time chart, a top-authors chart, and
  sortable tables for authors, files, directories, and commits.

## Tech stack

- **Server**: Node.js + Express + TypeScript, driving `git` directly (log/ls-tree/rev-list)
  to build a per-repository analysis index that's cached on disk and re-used across
  metric requests.
- **Client**: React + Vite, charts via Recharts.
- Metrics are computed on demand from the cached index, so filtering/scoping is fast even
  on repositories with tens of thousands of commits.

## Getting started

### Prerequisites

- [Node.js](https://nodejs.org/) 18 or later
- [git](https://git-scm.com/) available on your `PATH`

### Clone and run locally

```bash
git clone https://github.com/<your-account>/Repo-Analysis-Tool-RAT-.git
cd Repo-Analysis-Tool-RAT-

npm install
npm run dev
```

This starts two processes:

- the API server at `http://localhost:4000`
- the Vite dev client at `http://localhost:5173` (proxying `/api` to the server)

Open `http://localhost:5173` in your browser, then either:

- **Upload a zip** of a repository that contains its `.git` directory, or
- **Paste a clone URL** (`https://`, `git@`, or `file://`) to have the server deep-clone it.

Once analyzed, select the repository from the top-bar dropdown and use the filter panel
to scope by author, file/directory, or commit set.

### Other scripts

```bash
npm run build       # production client build (dist/)
npm run start        # run the API server without the dev client/watcher
npm run typecheck    # tsc --noEmit across server + client + shared types
```

### Regenerating the test fixture / end-to-end check

A small deterministic fixture repository (renames, deletions, a binary file, merge
commits, and multiple author identities merged via `.mailmap`) is used to verify metric
correctness:

```bash
bash scripts/make-fixture.sh      # builds .tmp/rat-fixture (+ .tmp/rat-fixture.zip)
PORT=4100 npx tsx server/index.ts & # run the API on a scratch port
RAT_URL=http://localhost:4100 node scripts/e2e.mjs
```

## Data storage

Uploaded/cloned repositories, their analysis indexes, and manual author-merge groups are
kept under `data/` in the project root (git-ignored), keyed by a generated repository id.
Deleting a repository from the dashboard removes its data.
