import type { MailmapEntry } from '../shared/types';
import { identity } from './util';

/**
 * Parse .mailmap (https://git-scm.com/docs/gitmailmap). Supported forms:
 *   Proper Name <proper@example.com>
 *   <proper@example.com> <commit@example.com>
 *   Proper Name <proper@example.com> <commit@example.com>
 *   Proper Name <proper@example.com> Commit Name <commit@example.com>
 * Blank lines and #-comments are ignored.
 */
export function parseMailmap(content: string): MailmapEntry[] {
  const entries: MailmapEntry[] = [];
  for (const raw of content.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const emails = [...line.matchAll(/<([^<>]*)>/g)].map((m) => m[1]);
    if (emails.length === 0) continue;

    const firstLt = line.indexOf('<');
    const properName = unquoteName(line.slice(0, firstLt).trim());
    const properEmail = emails[0];

    if (emails.length === 1) {
      // Applies the proper name to a given email.
      entries.push({ from: `<${properEmail}>`, to: identity(properName, properEmail) });
    } else {
      const commitEmail = emails[1];
      const firstGt = line.indexOf('>');
      const secondLt = line.indexOf('<', firstGt);
      const commitName = secondLt === -1 ? '' : unquoteName(line.slice(firstGt + 1, secondLt).trim());
      // With a commit name, only that exact identity is mapped; otherwise the
      // email alone matches any name.
      const from = commitName ? identity(commitName, commitEmail) : `<${commitEmail}>`;
      entries.push({ from, to: identity(properName, properEmail) });
    }
  }
  return entries;
}

function unquoteName(name: string): string {
  if (name.length >= 2 && name.startsWith('"') && name.endsWith('"')) {
    return name.slice(1, -1);
  }
  return name;
}

export interface Identity {
  name: string;
  email: string;
}

/**
 * Build a resolver applying mailmap entries. Exact "Name <email>" mappings
 * take precedence over email-only mappings; later entries win, matching git.
 */
export function makeMailmapResolver(entries: MailmapEntry[]): (name: string, email: string) => Identity {
  const exact = new Map<string, string>();
  const byEmail = new Map<string, string>();
  for (const e of entries) {
    if (e.from.startsWith('<')) byEmail.set(e.from.slice(1, -1), e.to);
    else exact.set(e.from, e.to);
  }
  return (name: string, email: string): Identity => {
    const hit = exact.get(identity(name, email)) ?? byEmail.get(email);
    if (!hit) return { name, email };
    const m = hit.match(/^(.*) <([^<>]*)>$/);
    return m ? { name: m[1], email: m[2] } : { name, email };
  };
}
