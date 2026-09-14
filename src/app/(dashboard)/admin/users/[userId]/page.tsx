export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound } from "next/navigation";
import { getUserDetailForAdmin } from "@/lib/admin/users";
import { EVENT_LABELS } from "@/lib/admin/event-labels";
import { StatCard } from "@/components/stat-card";
import { LocalTimestamp } from "@/components/local-timestamp";

export default async function AdminUserDetailPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const { userId } = await params;
  const detail = await getUserDetailForAdmin(userId);
  if (!detail) notFound();

  return (
    <div className="mx-auto max-w-3xl space-y-8 p-8">
      <div>
        <Link href="/admin/users" className="text-sm text-neutral-500 hover:underline">
          ← Back to Users
        </Link>
        <h1 className="mt-1 text-xl font-semibold">{detail.email}</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Registered <LocalTimestamp value={detail.registeredAt} />
        </p>
      </div>

      <section>
        <h2 className="mb-3 text-sm font-medium text-neutral-700">Learning Overview</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="Spaces" value={detail.spaces.length} />
          <StatCard label="Projects" value={detail.projects.length} />
          <StatCard
            label="Overall Progress"
            value={detail.overallProgress === null ? "—" : `${detail.overallProgress}%`}
          />
          <StatCard
            label="Assessment Accuracy"
            value={detail.assessmentAccuracy === null ? "—" : `${detail.assessmentAccuracy}%`}
          />
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-medium text-neutral-700">Usage</h2>
        <div className="grid grid-cols-3 gap-3">
          <StatCard label="Tutor Conversations" value={detail.tutorConversations} />
          <StatCard label="Tutor Questions" value={detail.tutorQuestionsAsked} />
          <StatCard label="Quiz Questions Answered" value={detail.quizQuestionsAnswered} />
        </div>
      </section>

      {detail.projects.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-medium text-neutral-700">Projects</h2>
          <ul className="space-y-2">
            {detail.projects.map((p) => (
              <li key={p.id} className="rounded-lg border p-3 text-sm">
                <span className="font-medium">{p.name}</span>
                {p.spaceName && <span className="text-neutral-400"> · {p.spaceName}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h2 className="mb-3 text-sm font-medium text-neutral-700">Activity Timeline</h2>
        {detail.activityTimeline.length === 0 ? (
          <p className="text-sm text-neutral-400">No activity recorded yet.</p>
        ) : (
          <ul className="space-y-1.5">
            {detail.activityTimeline.map((e) => (
              <li
                key={e.id}
                className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"
              >
                <span>
                  {EVENT_LABELS[e.eventType] ?? e.eventType}
                  {e.projectName && <span className="text-neutral-400"> · {e.projectName}</span>}
                </span>
                <span className="text-xs text-neutral-400">
                  <LocalTimestamp value={e.createdAt} />
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
