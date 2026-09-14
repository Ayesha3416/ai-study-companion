export const dynamic = "force-dynamic";

import { getAdminOverview } from "@/lib/admin/overview";
import { StatCard } from "@/components/stat-card";

export default async function AdminOverviewPage() {
  const overview = await getAdminOverview();

  return (
    <div className="mx-auto max-w-3xl space-y-8 p-8">
      <div>
        <h1 className="text-xl font-semibold">Admin Overview</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Platform-wide snapshot across every user.
        </p>
      </div>

      <section>
        <h2 className="mb-3 text-sm font-medium text-neutral-700">Users &amp; Structure</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="Total Users" value={overview.totalUsers} />
          <StatCard
            label="Active Users"
            value={overview.activeUsers7d}
            hint="last 7 days"
          />
          <StatCard label="Total Spaces" value={overview.totalSpaces} />
          <StatCard label="Total Projects" value={overview.totalProjects} />
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-medium text-neutral-700">Learning Activity</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="Materials Uploaded" value={overview.materialsUploaded} />
          <StatCard
            label="Materials Failed"
            value={overview.materialsFailed}
            hint={overview.materialsFailed > 0 ? "processing failures" : undefined}
          />
          <StatCard label="Tutor Conversations" value={overview.tutorConversations} />
          <StatCard label="Tutor Questions" value={overview.tutorQuestionsAsked} />
          <StatCard label="Quiz Questions Answered" value={overview.quizQuestionsAnswered} />
          <StatCard label="Total Activity Events" value={overview.totalActivityEvents} />
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-medium text-neutral-700">AI &amp; System Health</h2>
        <div className="rounded-lg border border-dashed p-4 text-sm text-neutral-400">
          AI cost/latency/error rate has its own page —{" "}
          <a href="/admin/ai-usage" className="underline">
            AI Usage &amp; Evaluation
          </a>
          . Database and background-processing health (queued/processing/
          failed materials, stuck jobs, recent failures) has its own page too
          —{" "}
          <a href="/admin/system-health" className="underline">
            System Health
          </a>
          .
        </div>
      </section>
    </div>
  );
}
