function pad(n: number, w = 2): string {
  return n.toString().padStart(w, '0');
}

export function formatTimecode(seconds: number): string {
  const safe = Number.isFinite(seconds) && seconds >= 0 ? seconds : 0;
  const totalMs = Math.round(safe * 1000);
  const hours = Math.floor(totalMs / 3_600_000);
  const minutes = Math.floor((totalMs % 3_600_000) / 60_000);
  const secs = Math.floor((totalMs % 60_000) / 1000);
  const ms = totalMs % 1000;
  return `${pad(hours)}:${pad(minutes)}:${pad(secs)}.${pad(ms, 3)}`;
}

export function parseTimecode(input: string): number | undefined {
  const trimmed = input.trim();
  if (trimmed === '') return undefined;
  const match = trimmed.match(/^(?:(\d+):)?(?:(\d+):)?(\d+)(?:\.(\d{1,3}))?$/);
  if (!match) return undefined;
  const [, a, b, c, frac] = match;
  let h: number;
  let m: number;
  let s: number;
  if (a !== undefined && b !== undefined) {
    h = Number(a);
    m = Number(b);
    s = Number(c);
  } else if (a !== undefined) {
    h = 0;
    m = Number(a);
    s = Number(c);
  } else {
    h = 0;
    m = 0;
    s = Number(c);
  }
  const ms = frac !== undefined ? Number(frac.padEnd(3, '0')) : 0;
  if ([h, m, s, ms].some((n) => Number.isNaN(n))) return undefined;
  return h * 3600 + m * 60 + s + ms / 1000;
}
