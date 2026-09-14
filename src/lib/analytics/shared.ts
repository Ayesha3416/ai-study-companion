import { parsePgTimestamp } from "@/lib/format-date";

export type DailyPoint = { date: string; value: number };

// Single source of truth for the mastery-level cutoffs used to color
// mastery bars, and to classify concepts as "mastered" / "needs attention"
// in both Project and Global analytics — keeping these in one place means
// the bar colors and the stat-card numbers can never silently disagree.
export const MASTERY_THRESHOLDS = {
  needsAttention: 40, // mastery_level below this
  mastered: 70, // mastery_level at or above this
} as const;

/**
 * Groups timestamped rows into UTC-day buckets and averages a numeric field
 * per day. Fine at prototype scale (a handful of concepts/questions); would
 * move to a SQL window/group-by for a project with heavy history.
 */
export function averageByDay(rows: { created_at: string; value: number }[]): DailyPoint[] {
  const buckets = new Map<string, { sum: number; count: number }>();
  for (const row of rows) {
    const day = parsePgTimestamp(row.created_at).toISOString().slice(0, 10);
    const bucket = buckets.get(day) ?? { sum: 0, count: 0 };
    bucket.sum += row.value;
    bucket.count += 1;
    buckets.set(day, bucket);
  }
  return Array.from(buckets.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, { sum, count }]) => ({
      date,
      value: Math.round(sum / count),
    }));
}

/** Counts rows-per-day instead of averaging a value — used for "activity over time". */
export function countByDay(timestamps: string[]): DailyPoint[] {
  const buckets = new Map<string, number>();
  for (const ts of timestamps) {
    const day = parsePgTimestamp(ts).toISOString().slice(0, 10);
    buckets.set(day, (buckets.get(day) ?? 0) + 1);
  }
  return Array.from(buckets.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, value]) => ({ date, value }));
}

/** Number of distinct calendar days (UTC) represented in a list of timestamps. */
export function distinctDayCount(timestamps: string[]): number {
  const days = new Set(timestamps.map((t) => parsePgTimestamp(t).toISOString().slice(0, 10)));
  return days.size;
}
