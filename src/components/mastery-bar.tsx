import { MASTERY_THRESHOLDS } from "@/lib/analytics/shared";

function barColor(level: number): string {
  if (level < MASTERY_THRESHOLDS.needsAttention) return "bg-red-400";
  if (level < MASTERY_THRESHOLDS.mastered) return "bg-amber-400";
  return "bg-green-500";
}

export function MasteryBar({ level }: { level: number }) {
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-neutral-100">
        <div
          className={`h-full rounded-full ${barColor(level)}`}
          style={{ width: `${Math.max(0, Math.min(100, level))}%` }}
        />
      </div>
      <span className="w-10 shrink-0 text-right text-xs text-neutral-500">
        {level}%
      </span>
    </div>
  );
}
