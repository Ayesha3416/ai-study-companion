export const dynamic = "force-dynamic";

import { getSystemHealth } from "@/lib/admin/system-health";
import { StatCard } from "@/components/stat-card";
import { LocalTimestamp } from "@/components/local-timestamp";

function StatusPill({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
        ok
          ? "bg-green-50 text-green-700"
          : "bg-red-50 text-red-700"
      }`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${ok ? "bg-green-500" : "bg-red-500"}`}
      />
      {label}
    </span>
  );
}

export default async function AdminSystemHealthPage() {
  let health: Awaited<ReturnType<typeof getSystemHealth>> | null = null;
  let loadError: string | null = null;

  try {
    health = await getSystemHealth();
  } catch (error) {
    // Even the health page itself must not 500 on a hiccup — PRD §49's
    // pattern applied to Admin, same as the AI Usage page.
    loadError = error instanceof Error ? error.message : "Unknown error";
  }

  return (
    <div className="mx-auto max-w-4xl space-y-8 p-8">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold">System Health</h1>
          <p className="mt-1 text-sm text-neutral-500">
            A lightweight operational snapshot — not a replacement for
            dedicated infrastructure monitoring.
          </p>
        </div>
        {health && (
          <p className="text-xs text-neutral-400">
            Checked <LocalTimestamp value={health.checkedAt} />
          </p>
        )}
      </div>

      {loadError && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          Couldn&apos;t load system health: {loadError}
        </div>
      )}

      {health && (
        <>
          <section>
            <h2 className="mb-3 text-sm font-medium text-neutral-700">
              Component Status
            </h2>
            <div className="flex flex-wrap gap-2">
              <StatusPill ok={health.database.ok} label="Database" />
              <StatusPill
                ok={health.aiProvider.ok}
                label="AI Provider (Groq/Google)"
              />
              <StatusPill
                ok={health.backgroundJobs.backlogCount === 0}
                label="Background Processing"
              />
            </div>
          </section>

          <section>
            <h2 className="mb-3 text-sm font-medium text-neutral-700">
              Database
            </h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatCard
                label="Latency"
                value={
                  health.database.latencyMs === null
                    ? "—"
                    : `${health.database.latencyMs}ms`
                }
                hint="single lightweight read"
              />
              <StatCard
                label="Status"
                value={health.database.ok ? "OK" : "Error"}
              />
            </div>
            {health.database.error && (
              <p className="mt-2 text-xs text-red-600">{health.database.error}</p>
            )}
          </section>

          <section>
            <h2 className="mb-3 text-sm font-medium text-neutral-700">
              AI Provider
            </h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatCard
                label="Requests"
                value={health.aiProvider.requests}
                hint={`last ${health.aiProvider.windowHours}h`}
              />
              <StatCard
                label="Error Rate"
                value={`${Math.round(health.aiProvider.errorRate * 100)}%`}
              />
              <StatCard
                label="Avg Latency"
                value={
                  health.aiProvider.avgLatencyMs === null
                    ? "—"
                    : `${health.aiProvider.avgLatencyMs}ms`
                }
              />
            </div>
            {health.aiProvider.error && (
              <p className="mt-2 text-xs text-red-600">
                Couldn&apos;t reach Langfuse: {health.aiProvider.error}
              </p>
            )}
            <p className="mt-2 text-xs text-neutral-400">
              See{" "}
              <a href="/admin/ai-usage" className="underline">
                AI Usage &amp; Evaluation
              </a>{" "}
              for cost, token, and per-feature breakdowns over a longer window.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-sm font-medium text-neutral-700">
              Background Processing
            </h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatCard label="Queued" value={health.backgroundJobs.queued} />
              <StatCard
                label="Processing"
                value={health.backgroundJobs.processing}
              />
              <StatCard label="Ready" value={health.backgroundJobs.ready} />
              <StatCard label="Failed" value={health.backgroundJobs.failed} />
              <StatCard
                label="Avg Processing Time"
                value={
                  health.backgroundJobs.avgProcessingSeconds === null
                    ? "—"
                    : `${health.backgroundJobs.avgProcessingSeconds}s`
                }
              />
              <StatCard
                label="Backlog"
                value={health.backgroundJobs.backlogCount}
                hint="stuck > 10 min"
              />
            </div>
            <p className="mt-2 text-xs text-neutral-400">
              Per-attempt retry counts aren&apos;t tracked yet — Inngest
              retries internally, but this app doesn&apos;t log each attempt
              as its own record, so that number isn&apos;t shown rather than
              guessed at.
            </p>

            {health.backgroundJobs.backlogItems.length > 0 && (
              <div className="mt-4">
                <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-neutral-500">
                  Stuck Materials
                </h3>
                <ul className="space-y-1.5 text-sm">
                  {health.backgroundJobs.backlogItems.map((item) => (
                    <li
                      key={item.id}
                      className="flex items-center justify-between rounded-md border border-amber-100 bg-amber-50/50 px-3 py-2"
                    >
                      <span className="font-medium">{item.fileName}</span>
                      <span className="text-xs text-neutral-500">
                        {item.status} · stuck {item.stuckForMinutes}m
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="mt-4">
              <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-neutral-500">
                Recent Failures
              </h3>
              {health.backgroundJobs.recentFailures.length === 0 ? (
                <p className="text-sm text-neutral-400">
                  No failed materials.
                </p>
              ) : (
                <ul className="space-y-1.5 text-sm">
                  {health.backgroundJobs.recentFailures.map((f) => (
                    <li
                      key={f.materialId}
                      className="rounded-md border border-red-100 bg-red-50/50 px-3 py-2"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium">{f.fileName}</span>
                        <span className="text-xs text-neutral-400">
                          <LocalTimestamp value={f.failedAt} />
                        </span>
                      </div>
                      {f.errorMessage && (
                        <p className="mt-1 text-xs text-neutral-500">
                          {f.errorMessage}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
