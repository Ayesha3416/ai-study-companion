import type { DailyPoint } from "@/lib/analytics/project-analytics";

/**
 * Small dependency-free trend visualization: one horizontal bar per day,
 * 0-100 scale. No charting library needed at prototype scale, and it
 * matches the existing MasteryBar's plain-div style rather than pulling in
 * something like recharts for a handful of data points.
 */
export function TrendBars({
  points,
  emptyLabel,
  barColor = "bg-blue-400",
}: {
  points: DailyPoint[];
  emptyLabel: string;
  barColor?: string;
}) {
  if (points.length === 0) {
    return <p className="text-sm text-neutral-400">{emptyLabel}</p>;
  }

  // Most recent 14 days of data is plenty to see a trend without the list
  // scrolling forever on a long-lived project.
  const recent = points.slice(-14);

  return (
    <ul className="space-y-1.5">
      {recent.map((p) => (
        <li key={p.date} className="flex items-center gap-2 text-xs">
          <span className="w-16 shrink-0 text-neutral-400">
            {p.date.slice(5)}
          </span>
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-neutral-100">
            <div
              className={`h-full rounded-full ${barColor}`}
              style={{ width: `${Math.max(0, Math.min(100, p.value))}%` }}
            />
          </div>
          <span className="w-8 shrink-0 text-right text-neutral-500">
            {p.value}%
          </span>
        </li>
      ))}
    </ul>
  );
}
