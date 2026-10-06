#!/usr/bin/env bash
# Creates a deterministic git repository exercising every RAT edge case:
#   - multiple identities per author (.mailmap + manual merging)
#   - rename with modification (attributed to the new path)
#   - deletion (removed lines recorded on the deleted path)
#   - binary file (excluded from all metrics)
#   - mode-only change (0/0 touch)
#   - a merge commit (excluded from H-bar; its tree used as h[p])
# Prints one commit hash per line (c1..c15) to stdout.
set -euo pipefail

DEST="${1:-.tmp/rat-fixture}"
TMPD="$(cd "$(dirname "$DEST")" && pwd)"
rm -rf "$DEST"
mkdir -p "$DEST" "$TMPD"
cd "$DEST"
git init -q -b main

# commit <name> <email> <date> <message>
commit() {
  GIT_AUTHOR_NAME="$1" GIT_AUTHOR_EMAIL="$2" \
  GIT_COMMITTER_NAME="$1" GIT_COMMITTER_EMAIL="$2" \
  GIT_AUTHOR_DATE="$3" GIT_COMMITTER_DATE="$3" \
  git commit -q -m "$4"
}
hash_() { git rev-parse HEAD; }

# c1 — Alice: README + src/app.ts + .mailmap
cat > README.md <<'EOF'
line one
line two
line three
line four
line five
EOF
cat > .mailmap <<'EOF'
Alice Alison <alice@x> <alicia@x>
EOF
mkdir -p src
cat > src/app.ts <<'EOF'
a1
a2
a3
a4
a5
a6
a7
a8
a9
a10
EOF
git add -A
commit "Alice Alison" "alice@x" "2026-01-01T10:00:00Z" "c1: initial files"
hash_ > "$TMPD/rat-c"1

# c2 — Alice: modify src/app.ts (+5/-2)
cat > src/app.ts <<'EOF'
a1
a2-mod
a3
a4-mod
a5
a6
a7
a8
a9
a10
a11
a12
a13
EOF
git add -A
commit "Alice Alison" "alice@x" "2026-01-02T10:00:00Z" "c2: update app.ts"
hash_ > "$TMPD/rat-c"2

# c3 — Alicia (alias of Alice via .mailmap): src/util.ts + docs/guide.md
mkdir -p docs
cat > src/util.ts <<'EOF'
u1
u2
u3
u4
u5
u6
u7
u8
EOF
cat > docs/guide.md <<'EOF'
g1
g2
g3
g4
EOF
git add -A
commit "Alicia Alley" "alicia@x" "2026-01-03T10:00:00Z" "c3: util and guide"
hash_ > "$TMPD/rat-c"3

# c4 — Bob: binary asset (not measured) + README tweak
mkdir -p assets
printf 'PNGDATA\x00\x01\x00BINARY' > assets/logo.png
cat > README.md <<'EOF'
line one
line two changed
line three
line four
line five
EOF
git add -A
commit "Bob Bobson" "bob@x" "2026-01-04T10:00:00Z" "c4: logo and readme"
hash_ > "$TMPD/rat-c"4

# c5 — Carol: src/deep/parse.ts
mkdir -p src/deep
cat > src/deep/parse.ts <<'EOF'
p1
p2
p3
p4
p5
p6
p7
p8
p9
p10
p11
p12
EOF
git add -A
commit "Carol Clear" "carol@x" "2026-01-05T10:00:00Z" "c5: deep parser"
hash_ > "$TMPD/rat-c"5

# c6 — Alice: rename src/app.ts -> src/main.ts WITH modification (+3/-1)
git mv src/app.ts src/main.ts
cat > src/main.ts <<'EOF'
a1
a2-mod
a3
a4-mod
a5
a6
a7
a8
a9
a10
a11
a12
a13
a14
a15
EOF
git add -A
commit "Alice Alison" "alice@x" "2026-01-06T10:00:00Z" "c6: rename app.ts to main.ts"
hash_ > "$TMPD/rat-c"6

# c7 — Bob: delete docs/guide.md
git rm -q docs/guide.md
commit "Bob Bobson" "bob@x" "2026-01-07T10:00:00Z" "c7: remove guide"
hash_ > "$TMPD/rat-c"7

# c8 — Caroline (same email as Carol, different name; manual merge target)
cat > src/util.ts <<'EOF'
u1
u2
u3
u4
u5
u6
u7
u8
u9
EOF
cat > src/deep/parse.ts <<'EOF'
p1
p2
p3
p4
p5
p6
p7
p8
p9
p10
p11
p12
p13
EOF
git add -A
commit "Caroline Clear" "carol@x" "2026-01-08T10:00:00Z" "c8: tweak util and parse"
hash_ > "$TMPD/rat-c"8

# c9 — Bob: add src/tmp.txt
cat > src/tmp.txt <<'EOF'
t1
t2
t3
EOF
git add -A
commit "Bob Bobson" "bob@x" "2026-01-09T10:00:00Z" "c9: add tmp"
hash_ > "$TMPD/rat-c"9

# c10 — Bob: delete src/tmp.txt
git rm -q src/tmp.txt
commit "Bob Bobson" "bob@x" "2026-01-10T10:00:00Z" "c10: remove tmp"
hash_ > "$TMPD/rat-c"10

# c11 — Carol: mode-only change on src/main.ts (0/0)
chmod +x src/main.ts
git add -A
commit "Carol Clear" "carol@x" "2026-01-11T10:00:00Z" "c11: make main executable"
hash_ > "$TMPD/rat-c"11

# c12 — Alice: docs/api.md
mkdir -p docs
cat > docs/api.md <<'EOF'
api1
api2
api3
api4
api5
api6
EOF
git add -A
commit "Alice Alison" "alice@x" "2026-01-12T10:00:00Z" "c12: api docs"
hash_ > "$TMPD/rat-c"12

# c13 — Bob on branch feature: src/feature.ts
git checkout -q -b feature
cat > src/feature.ts <<'EOF'
f1
f2
f3
f4
f5
f6
f7
EOF
git add -A
commit "Bob Bobson" "bob@x" "2026-01-13T10:00:00Z" "c13: feature work"
hash_ > "$TMPD/rat-c"13

# c14 — merge commit (excluded from H-bar)
git checkout -q main
GIT_AUTHOR_NAME="Alice Alison" GIT_AUTHOR_EMAIL="alice@x" \
GIT_COMMITTER_NAME="Alice Alison" GIT_COMMITTER_EMAIL="alice@x" \
GIT_AUTHOR_DATE="2026-01-14T10:00:00Z" GIT_COMMITTER_DATE="2026-01-14T10:00:00Z" \
git merge -q --no-ff feature -m "c14: merge feature"
hash_ > "$TMPD/rat-c"14

# c15 — Alice: README tweak (first-parent is the merge commit)
cat > README.md <<'EOF'
line one
line two changed
line three
line four
line five
line six
line seven
EOF
git add -A
commit "Alice Alison" "alice@x" "2026-01-15T10:00:00Z" "c15: readme after merge"
hash_ > "$TMPD/rat-c"15

# Emit hashes c1..c15 in order
for i in $(seq 1 15); do
  cat "$TMPD/rat-c$i"
  rm -f "$TMPD/rat-c$i"
done
