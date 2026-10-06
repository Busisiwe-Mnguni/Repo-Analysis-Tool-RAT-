import type { AuthorGroup, ManualMerges, RepoIndex } from '../shared/types';
import { makeMailmapResolver } from './mailmap';
import { identity } from './util';

export interface AuthorResolver {
  /** Merged author key for a commit's original identity. */
  keyForCommit: (authorName: string, authorEmail: string) => string;
  /** All merged authors with their underlying canonical identities. */
  groups: AuthorGroup[];
}

/**
 * Resolve authors per commit:
 *   original identity -> (mailmap) -> canonical identity -> (manual group) -> key
 * The key is the canonical identity of the group's representative, so it is
 * stable across metric computations.
 */
export function buildAuthorResolver(index: RepoIndex, manual: ManualMerges | null): AuthorResolver {
  const resolveMailmap = makeMailmapResolver(index.mailmap);

  // original identity -> canonical identity (after mailmap)
  const canonicalOf = new Map<string, string>();
  const canonicalOfCommit = (name: string, email: string): string => {
    const orig = identity(name, email);
    let can = canonicalOf.get(orig);
    if (can === undefined) {
      const r = resolveMailmap(name, email);
      can = identity(r.name, r.email);
      canonicalOf.set(orig, can);
    }
    return can;
  };

  // canonical identity -> manual group key
  const groupKeyOf = new Map<string, string>();
  if (manual) {
    for (const g of manual.groups) {
      if (!g.members.includes(g.canonical)) continue; // invalid group; ignore
      for (const m of g.members) groupKeyOf.set(m, g.canonical);
    }
  }

  const keyForCommit = (authorName: string, authorEmail: string): string => {
    const can = canonicalOfCommit(authorName, authorEmail);
    return groupKeyOf.get(can) ?? can;
  };

  // Build groups from actual commit identities.
  const groups = new Map<string, AuthorGroup>();
  const memberSets = new Map<string, Set<string>>();
  for (const c of index.commits) {
    const key = keyForCommit(c.authorName, c.authorEmail);
    if (!groups.has(key)) {
      const can = canonicalOfCommit(c.authorName, c.authorEmail);
      const m = can.match(/^(.*) <([^<>]*)>$/);
      groups.set(key, {
        key,
        name: m ? m[1] : c.authorName,
        email: m ? m[2] : c.authorEmail,
        members: [],
      });
      memberSets.set(key, new Set());
    }
    memberSets.get(key)!.add(canonicalOfCommit(c.authorName, c.authorEmail));
  }
  for (const [key, members] of memberSets) {
    const g = groups.get(key)!;
    g.members = [...members].sort();
  }

  return { keyForCommit, groups: [...groups.values()] };
}
