import Link from "next/link";
import { getGrowthAnalysis, type GrowthTrend } from "@/lib/mastery/growth";
import { MasteryBar } from "@/components/mastery-bar";
import { getRelevantContext } from "@/lib/context/learning-context";
import { LearningContextList } from "@/components/learning-context-list";

export const dynamic = "force-dynamic"; // mastery changes every time a quiz question is answered

const TREND_LABELS: Record<GrowthTrend, string> = {
  improving: "Improving",
  stable: "Stable",
  needs_attention: "Needs Attention",
};

const TREND_STYLES: Record<GrowthTrend, string> = {
  improving: "bg-green-100 text-green-800",
  stable: "bg-neutral-100 text-neutral-700",
  needs_attention: "bg-red-100 text-red-800",
};

export default async function GrowthPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const [growth, contextEntries] = await Promise.all([
    getGrowthAnalysis(projectId),
    getRelevantContext(projectId),
  ]);

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-8">
      <div>
        <Link
          href={`/projects/${projectId}`}
          className="text-sm text-neutral-500 hover:underline"
        >
          ← Back to Project
        </Link>
        <h1 className="mt-1 text-xl font-semibold">Growth</h1>
        <p className="mt-1 text-sm text-neutral-500">
          How your understanding has changed since you started studying each concept.
        </p>
      </div>

      {growth.length === 0 ? (
        <p className="text-sm text-neutral-500">
          No mastery data yet — take a quiz to start tracking your growth.
        </p>
      ) : (
        <ul className="space-y-3">
          {growth.map((g) => (
            <li key={g.conceptId} className="rounded-lg border p-4">
              <div className="mb-2 flex items-center justify-between">
                <span className="font-medium">{g.conceptName}</span>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${TREND_STYLES[g.trend]}`}
                >
                  {TREND_LABELS[g.trend]}
                </span>
              </div>
              <div className="flex items-center gap-3 text-sm text-neutral-500">
                <span>{g.previousMastery}%</span>
                <span>→</span>
                <span className="font-medium text-neutral-900">
                  {g.currentMastery}%
                </span>
              </div>
              <div className="mt-2">
                <MasteryBar level={g.currentMastery} />
              </div>
              <p className="mt-1 text-xs text-neutral-400">
                Based on {g.evidenceCount} answer{g.evidenceCount === 1 ? "" : "s"}
              </p>
            </li>
          ))}
        </ul>
      )}

      <div>
        <h2 className="mb-2 text-sm font-medium text-neutral-700">
          What We Remember About Your Progress
        </h2>
        <LearningContextList entries={contextEntries} />
      </div>
    </div>
  );
}
