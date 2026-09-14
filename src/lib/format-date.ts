/**
 * Postgres returns timestamptz values like "2026-09-12 12:40:45.065517+00"
 * — space-separated, short "+00" offset. This isn't strict ISO 8601, and
 * `new Date(...)` on some engines mis-parses it as local time instead of
 * UTC, silently breaking every "X minutes ago" / localized-time display.
 * Always parse Postgres timestamps through this helper rather than calling
 * `new Date(value)` directly on a raw DB string.
 */
export function parsePgTimestamp(value: string): Date {
  const iso = value.replace(" ", "T").replace(/\+00$/, "Z");
  return new Date(iso);
}

export function formatPgTimestamp(value: string): string {
  return parsePgTimestamp(value).toLocaleString();
}
