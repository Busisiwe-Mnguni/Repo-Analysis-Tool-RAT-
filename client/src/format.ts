export function fmtInt(n: number): string {
  return n.toLocaleString('en-US');
}

export function fmtNet(n: number): string {
  return n > 0 ? `+${n.toLocaleString('en-US')}` : n.toLocaleString('en-US');
}

export function fmtDate(t: number): string {
  if (!t) return '—';
  return new Date(t * 1000).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
}

export function fmtDay(t: number): string {
  if (!t) return '—';
  return new Date(t * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function shortHash(h: string): string {
  return h.slice(0, 7);
}

export function signedCls(n: number): string {
  return n > 0 ? 'pos' : n < 0 ? 'neg' : 'zero';
}

/** Format a 0..1 fraction as a percentage, e.g. 0.734 -> "73%". */
export function fmtPct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

/** Format a rate (events per commit) with up to 2 decimals, trimming trailing zeros. */
export function fmtRate(n: number): string {
  return n.toLocaleString('en-US', { maximumFractionDigits: 2 });
}
