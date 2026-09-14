import Link from "next/link";
import { getProjectAnalytics } from "@/lib/analytics/project-analytics";
import { StatCard } from "@/components/stat-card";
import { TrendBars } from "@/components/trend-bars";
import { MasteryBar } from "@/components/mastery-bar";

// Activity, mastery, and quiz data all change frequently (every question
// answered, every material uploaded) — same caching lesson as the
// Tutor/Materials/Quiz pages elsewhere in the app.
export const dynamic = "force-dynamic";

export default async function ProjectAnalyticsPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const analytics = await getProjectAnalytics(projectId);
  const { activity, performance, growth, aiActivity } = analytics;

  return (
    <div className="mx-auto max-w-3xl space-y-8 p-4 sm:p-8">
      <div>
        <Link
          href={`/projects/${projectId}`}
          className="text-sm text-neutral-500 hover:underline"
        >
          ← Back to Project
        </Link>
        <h1 className="mt-1 text-xl font-semibold">Project Analytics</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Activity, performance, growth, and AI usage for this project.
        </p>
      </div>

      <section>
        <h2 className="mb-3 text-sm font-medium text-neutral-700">Activity</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <StatCard label="Learning Sessions" value={activity.learningSessions} />
          <StatCard label="Tutor Questions" value={activity.tutorQuestions} />
          <StatCard label="Quiz Attempts" value={activity.quizAttempts} />
          <StatCard
            label="Questions Answered"
            value={activity.questionsAnswered}
          />
          <StatCard
            label="Material Interactions"
            value={activity.materialInteractions}
          />
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-medium text-neutral-700">
          Performance
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard
            label="Quiz Accuracy"
            value={performance.quizAccuracy === null ? "—" : `${performance.quizAccuracy}%`}
            hint={performance.quizAccuracy === null ? "No answers yet" : undefined}
          />
          <StatCard
            label="Current Mastery"
            value={performance.averageMastery === null ? "—" : `${performance.averageMastery}%`}
            hint={performance.averageMastery === null ? "No concepts yet" : undefined}
          />
          <StatCard
            label="Concepts Mastered"
            value={`${performance.conceptsMastered}/${performance.totalConcepts}`}
            hint="≥ 70% mastery"
          />
          <StatCard
            label="Needs Attention"
            value={performance.conceptsRequiringAttention}
            hint="< 40% mastery"
          />
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-medium text-neutral-700">Growth</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-lg border p-4">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-neutral-500">
              Mastery Over Time
            </p>
            <TrendBars
              points={growth.masteryOverTime}
              emptyLabel="No mastery history yet — take a quiz to start tracking."
              barColor="bg-green-400"
            />
          </div>
          <div className="rounded-lg border p-4">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-neutral-500">
              Assessment Accuracy Over Time
            </p>
            <TrendBars
              points={growth.accuracyOverTime}
              emptyLabel="No answered questions yet."
              barColor="bg-blue-400"
            />
          </div>
        </div>

        {growth.concepts.length > 0 && (
          <div className="mt-4 space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
              By Concept
            </p>
            <ul className="space-y-2">
              {growth.concepts.map((c) => (
                <li key={c.conceptId} className="rounded-lg border p-3">
                  <div className="mb-1.5 flex items-center justify-between text-sm">
                    <span className="font-medium">{c.conceptName}</span>
                    <span className="text-neutral-400">
                      {c.previousMastery}% → {c.currentMastery}%
                    </span>
                  </div>
                  <MasteryBar level={c.currentMastery} />
                </li>
              ))}
            </ul>
          </div>
        )}

        <Link
          href={`/projects/${projectId}/growth`}
          className="mt-3 inline-block text-xs text-blue-600 hover:underline"
        >
          View full Growth page →
        </Link>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-medium text-neutral-700">
          AI Activity
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard
            label="Tutor Interactions"
            value={aiActivity.tutorInteractions}
          />
          <StatCard
            label="AI-Generated Questions"
            value={aiActivity.aiGeneratedQuestions}
          />
          <StatCard label="AI Evaluations" value={aiActivity.aiEvaluations} />
          <StatCard
            label="Recommendations"
            value={aiActivity.recommendationsGenerated}
          />
        </div>
      </section>
    </div>
  );
}
