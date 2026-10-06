/** Small shared helpers for the server. */

/** Run an async mapper over items with bounded concurrency, preserving order. */
export async function asyncPool<T, R>(
  limit: number,
  items: T[],
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const idx = next++;
      if (idx >= items.length) break;
      results[idx] = await fn(items[idx], idx);
    }
  });
  await Promise.all(workers);
  return results;
}

/** Identity string form used everywhere for authors: "Name <email>". */
export function identity(name: string, email: string): string {
  return `${name} <${email}>`;
}

/** Unquote a C-style quoted git path (core.quotePath or exotic characters). */
export function unquotePath(p: string): string {
  if (p.length >= 2 && p.startsWith('"') && p.endsWith('"')) {
    const body = p.slice(1, -1);
    return body
      .replace(/\\([0-7]{3})/g, (_, oct: string) => String.fromCharCode(parseInt(oct, 8)))
      .replace(/\\(.)/g, (_, c: string) => {
        switch (c) {
          case 'n': return '\n';
          case 't': return '\t';
          case 'r': return '\r';
          default: return c;
        }
      });
  }
  return p;
}
