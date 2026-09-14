import Link from "next/link";
import { getGlobalAnalytics } from "@/lib/analytics/global-analytics";
import { StatCard } from "@/components/stat-card";
import { TrendBars } from "@/components/trend-bars";

// Same reasoning as Project Analytics: this data changes on essentially
// every user action across the whole account, so it should never be served
// from a cached render.
export const dynamic = "force-dynamic";

export default async function GlobalAnalyticsPage() {
  const analytics = await getGlobalAnalytics();
  const { overallLearning, performance, aiUsage, trends } = analytics;

  return (
    <div className="mx-auto max-w-3xl space-y-8 p-4 sm:p-8">
      <div>
        <Link href="/home" className="text-sm text-neutral-500 hover:underline">
          ← Back to Home
        </Link>
        <h1 className="mt-1 text-xl font-semibold">Your Learning Analytics</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Aggregated across all your Spaces and Projects.
        </p>
      </div>

      <section>
        <h2 className="mb-3 text-sm font-medium text-neutral-700">Overall Learning</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="Spaces" value={overallLearning.spaceCount} />
          <StatCard label="Projects" value={overallLearning.projectCount} />
          <StatCard label="Active Days" value={overallLearning.activeDays} />
          <StatCard
            label="Total Learning Activity"
            value={overallLearning.totalActivityEvents}
          />
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-medium text-neutral-700">Learning Performance</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard
            label="Overall Mastery"
            value={performance.overallMastery === null ? "—" : `${performance.overallMastery}%`}
            hint={performance.overallMastery === null ? "No concepts yet" : undefined}
          />
          <StatCard
            label="Avg. Assessment Performance"
            value={
              performance.averageAssessmentPerformance === null
                ? "—"
                : `${performance.averageAssessmentPerformance}%`
            }
            hint={performance.averageAssessmentPerformance === null ? "No answers yet" : undefined}
          />
          <StatCard label="Concepts Improving" value={performance.conceptsImproving} />
          <StatCard
            label="Concepts Needing Attention"
            value={performance.conceptsNeedingAttention}
          />
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-medium text-neutral-700">AI Usage</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="Tutor Interactions" value={aiUsage.tutorInteractions} />
          <StatCard label="Questions Asked" value={aiUsage.questionsAsked} />
          <StatCard label="Quiz Activity" value={aiUsage.quizActivity} />
          <StatCard label="AI-Generated Feedback" value={aiUsage.aiGeneratedFeedback} />
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-medium text-neutral-700">Trends</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-lg border p-4">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-neutral-500">
              Learning Activity
            </p>
            <TrendBars
              points={trends.activityOverTime}
              emptyLabel="No activity yet."
              barColor="bg-neutral-400"
            />
          </div>
          <div className="rounded-lg border p-4">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-neutral-500">
              Mastery Over Time
            </p>
            <TrendBars
              points={trends.masteryOverTime}
              emptyLabel="No mastery history yet."
              barColor="bg-green-400"
            />
          </div>
          <div className="rounded-lg border p-4">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-neutral-500">
              Assessment Performance
            </p>
            <TrendBars
              points={trends.assessmentPerformanceOverTime}
              emptyLabel="No answered questions yet."
              barColor="bg-blue-400"
            />
          </div>
        </div>
      </section>
    </div>
  );
}
