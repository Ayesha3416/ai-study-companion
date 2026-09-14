export const dynamic = "force-dynamic"; // same caching lesson as every other frequently-changing dashboard in this app

import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getHomeDashboardData } from "@/lib/home/home-dashboard";
import { StatCard } from "@/components/stat-card";
import { MasteryBar } from "@/components/mastery-bar";
import { LocalTimestamp } from "@/components/local-timestamp";

export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const {
    continueLearning,
    recentProjects,
    overallProgress,
    areasToImprove,
    recommendedNextStep,
  } = await getHomeDashboardData();

  return (
    <div className="mx-auto max-w-3xl space-y-8 p-4 sm:p-8">
      <div>
        <h1 className="text-xl font-semibold">
          Welcome back{user?.email ? `, ${user.email.split("@")[0]}` : ""}
        </h1>
        <p className="mt-1 text-sm text-neutral-500">
          Here&apos;s where your learning stands.
        </p>
      </div>

      {/* Spaces / Analytics / Admin / Sign out now live in the persistent
          top nav (src/app/(dashboard)/layout.tsx) rather than being
          duplicated here — this also removes what used to be an
          unwrapped 4-button row that crowded the title on narrow
          screens. */}

      {continueLearning ? (
        <Link
          href={continueLearning.href}
          className="block rounded-lg border border-neutral-900 bg-neutral-900 p-5 text-white hover:bg-neutral-800"
        >
          <p className="text-xs font-medium uppercase tracking-wide text-neutral-300">
            Continue Learning
          </p>
          <p className="mt-1 text-lg font-semibold">{continueLearning.projectName}</p>
          <p className="mt-1 text-sm text-neutral-300">
            {continueLearning.spaceName && `${continueLearning.spaceName} · `}
            {continueLearning.activityLabel}
          </p>
        </Link>
      ) : (
        <div className="rounded-lg border p-5 text-sm text-neutral-500">
          No activity yet — create a Space and Project to get started.
        </div>
      )}

      {recommendedNextStep && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-blue-700">
            Recommended Next Step
          </p>
          <p className="mt-1 text-sm text-blue-900">{recommendedNextStep.message}</p>
          <Link
            href={`/projects/${recommendedNextStep.projectId}`}
            className="mt-2 inline-block text-xs text-blue-700 hover:underline"
          >
            Go to {recommendedNextStep.projectName} →
          </Link>
        </div>
      )}

      <section>
        <h2 className="mb-3 text-sm font-medium text-neutral-700">Overall Progress</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <StatCard label="Spaces" value={overallProgress.spaceCount} />
          <StatCard label="Projects" value={overallProgress.projectCount} />
          <StatCard
            label="Overall Mastery"
            value={
              overallProgress.overallMastery === null
                ? "—"
                : `${overallProgress.overallMastery}%`
            }
            hint={overallProgress.overallMastery === null ? "No concepts yet" : undefined}
          />
        </div>
      </section>

      {recentProjects.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-medium text-neutral-700">Recent Projects</h2>
          <ul className="space-y-2">
            {recentProjects.map((p) => (
              <li key={p.projectId}>
                <Link
                  href={`/projects/${p.projectId}`}
                  className="flex items-center justify-between rounded-lg border p-3 text-sm hover:bg-neutral-50"
                >
                  <span>
                    <span className="font-medium">{p.projectName}</span>
                    {p.spaceName && <span className="text-neutral-400"> · {p.spaceName}</span>}
                  </span>
                  <span className="text-xs text-neutral-400">
                    <LocalTimestamp value={p.lastActivityAt} />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {areasToImprove.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-medium text-neutral-700">Areas to Improve</h2>
          <ul className="space-y-2">
            {areasToImprove.map((a) => (
              <li key={a.conceptId} className="rounded-lg border p-3">
                <div className="mb-1.5 flex items-center justify-between text-sm">
                  <span className="font-medium">{a.conceptName}</span>
                  <Link
                    href={`/projects/${a.projectId}/growth`}
                    className="text-xs text-neutral-400 hover:underline"
                  >
                    {a.projectName} →
                  </Link>
                </div>
                <MasteryBar level={a.masteryLevel} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
