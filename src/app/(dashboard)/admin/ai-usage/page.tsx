export const dynamic = "force-dynamic";

import { getAiUsageSummary } from "@/lib/observability/langfuse-query";
import { getAiRequestSummary } from "@/lib/admin/ai-requests";
import { listEvalRuns } from "@/lib/eval/runner";
import { StatCard } from "@/components/stat-card";
import { LocalTimestamp } from "@/components/local-timestamp";

const WINDOW_HOURS = 24 * 7; // last 7 days — matches the Overview page's "active users" window for consistency

// quiz_generation/open_ended_grading/tutor_response/recommendation_generation
// don't read naturally as feature names — reuse the same human labels the
// rest of Admin already uses wherever they happen to overlap, falling back
// to the raw feature string (from provider.ts's `feature:` option) otherwise.
const FEATURE_LABELS: Record<string, string> = {
  tutor_response: "AI Tutor",
  quiz_generation: "Quiz Generation",
  open_ended_grading: "Open-Ended Grading",
  recommendation_generation: "Recommendations",
  // Step 32's harness uses "eval_"-prefixed feature names so its traffic
  // stays visually distinct from real production usage in these tables,
  // rather than silently blending in under the same label.
  eval_quiz_generation: "Quiz Generation (Eval)",
  eval_open_ended_grading: "Open-Ended Grading (Eval)",
  eval_recommendation_generation: "Recommendations (Eval)",
};

export default async function AdminAiUsagePage() {
  let summary: Awaited<ReturnType<typeof getAiUsageSummary>> | null = null;
  let loadError: string | null = null;

  try {
    summary = await getAiUsageSummary(WINDOW_HOURS);
  } catch (error) {
    // Langfuse being unreachable shouldn't 500 the whole Admin section —
    // same "never let an AI-adjacent failure break the page around it"
    // pattern used everywhere else in this app (PRD §49).
    loadError = error instanceof Error ? error.message : "Unknown error";
  }

  let firstPartySummary: Awaited<ReturnType<typeof getAiRequestSummary>> | null = null;
  let firstPartyError: string | null = null;
  try {
    firstPartySummary = await getAiRequestSummary(WINDOW_HOURS);
  } catch (error) {
    firstPartyError = error instanceof Error ? error.message : "Unknown error";
  }

  let latestEvalRun: Awaited<ReturnType<typeof listEvalRuns>>[number] | null = null;
  try {
    const runs = await listEvalRuns(1);
    latestEvalRun = runs[0] ?? null;
  } catch {
    // Non-critical for this page — the Evaluation page itself surfaces its own load errors.
  }

  return (
    <div className="mx-auto max-w-4xl space-y-8 p-4 sm:p-8">
      <div>
        <h1 className="text-xl font-semibold">AI Usage &amp; Evaluation</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Tutor, Quiz, and Grading requests over the last 7 days, read back from Langfuse.
        </p>
      </div>

      {loadError && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          Couldn&apos;t reach Langfuse: {loadError}
        </div>
      )}

      {summary && (
        <>
          <section>
            <h2 className="mb-3 text-sm font-medium text-neutral-700">Overview</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatCard label="AI Requests" value={summary.totalRequests} hint="last 7 days" />
              <StatCard
                label="Error Rate"
                value={`${Math.round(summary.errorRate * 100)}%`}
                hint={`${summary.errorCount} errors`}
              />
              <StatCard
                label="Avg Latency"
                value={summary.avgLatencyMs === null ? "—" : `${summary.avgLatencyMs}ms`}
              />
              <StatCard
                label="Est. Cost"
                value={summary.totalCostUsd === null ? "n/a" : `$${summary.totalCostUsd.toFixed(4)}`}
                hint={
                  summary.totalCostUsd === null
                    ? "Groq pricing not registered in Langfuse"
                    : undefined
                }
              />
            </div>
            <p className="mt-2 text-xs text-neutral-400">
              {summary.totalInputTokens.toLocaleString()} input tokens ·{" "}
              {summary.totalOutputTokens.toLocaleString()} output tokens
              {summary.truncated && " · showing most recent (window truncated at scan limit)"}
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-sm font-medium text-neutral-700">
              Recorded Usage (First-Party Log)
            </h2>
            <p className="mb-3 text-xs text-neutral-400">
              Independent of Langfuse — written directly by this app to its
              own database (Step 31). Kept deliberately separate so AI usage
              stays visible even if Langfuse is unreachable, and because
              Langfuse has no registered pricing for Groq&apos;s models
              (hence &quot;Est. Cost: n/a&quot; above), while this log prices
              requests itself.
            </p>
            {firstPartyError && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                Couldn&apos;t load first-party usage log: {firstPartyError}
              </div>
            )}
            {firstPartySummary && (
              <>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <StatCard
                    label="Requests"
                    value={firstPartySummary.totalRequests}
                    hint="last 7 days"
                  />
                  <StatCard
                    label="Failures"
                    value={firstPartySummary.totalFailures}
                  />
                  <StatCard
                    label="Est. Cost"
                    value={
                      firstPartySummary.totalCostUsd === null
                        ? "n/a"
                        : `$${firstPartySummary.totalCostUsd.toFixed(4)}`
                    }
                    hint={
                      firstPartySummary.totalRequests > 0
                        ? `${Math.round(firstPartySummary.costCoverage * 100)}% of requests priced`
                        : undefined
                    }
                  />
                </div>
                {firstPartySummary.truncated && (
                  <p className="mt-2 text-xs text-neutral-400">
                    Showing most recent {firstPartySummary.totalRequests.toLocaleString()} requests — window has more than the scan limit.
                  </p>
                )}

                {firstPartySummary.byFeature.length > 0 && (
                  <div className="mt-4 overflow-x-auto rounded-lg border">
                    <table className="w-full min-w-[560px] text-left text-sm">
                      <thead className="border-b bg-neutral-50 text-neutral-500">
                        <tr>
                          <th className="py-2 pr-4 pl-4 font-medium">Feature</th>
                          <th className="py-2 pr-4 font-medium">Requests</th>
                          <th className="py-2 pr-4 font-medium">Failures</th>
                          <th className="py-2 pr-4 font-medium">Avg Latency</th>
                          <th className="py-2 pr-4 font-medium">Cost</th>
                        </tr>
                      </thead>
                      <tbody>
                        {firstPartySummary.byFeature.map((f) => (
                          <tr key={f.feature} className="border-b last:border-0">
                            <td className="py-2 pr-4 pl-4 font-medium">
                              {FEATURE_LABELS[f.feature] ?? f.feature}
                            </td>
                            <td className="py-2 pr-4">{f.requests}</td>
                            <td className="py-2 pr-4">{f.failures}</td>
                            <td className="py-2 pr-4">
                              {f.avgLatencyMs === null ? "—" : `${f.avgLatencyMs}ms`}
                            </td>
                            <td className="py-2 pr-4">${f.totalCostUsd.toFixed(4)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                <div className="mt-4">
                  <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-neutral-500">
                    Recent Requests
                  </h3>
                  {firstPartySummary.recent.length === 0 ? (
                    <p className="text-sm text-neutral-400">
                      No AI requests recorded yet.
                    </p>
                  ) : (
                    <ul className="space-y-1.5 text-sm">
                      {firstPartySummary.recent.map((r) => (
                        <li
                          key={r.id}
                          className={`rounded-md border px-3 py-2 ${
                            r.success
                              ? "border-neutral-100"
                              : "border-red-100 bg-red-50/50"
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-medium">
                              {FEATURE_LABELS[r.feature] ?? r.feature}
                            </span>
                            <span className="text-xs text-neutral-400">
                              <LocalTimestamp value={r.createdAt} />
                            </span>
                          </div>
                          <p className="mt-1 text-xs text-neutral-500">
                            {r.inputTokens}/{r.outputTokens} tokens ·{" "}
                            {r.latencyMs}ms ·{" "}
                            {r.estimatedCostUsd === null
                              ? "cost n/a"
                              : `$${r.estimatedCostUsd.toFixed(6)}`}
                            {!r.success && r.errorMessage && ` · ${r.errorMessage}`}
                          </p>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </>
            )}
          </section>

          <section>
            <h2 className="mb-3 text-sm font-medium text-neutral-700">By Feature</h2>
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full min-w-[560px] text-left text-sm">
                <thead className="border-b bg-neutral-50 text-neutral-500">
                  <tr>
                    <th className="py-2 pr-4 pl-4 font-medium">Feature</th>
                    <th className="py-2 pr-4 font-medium">Requests</th>
                    <th className="py-2 pr-4 font-medium">Errors</th>
                    <th className="py-2 pr-4 font-medium">Avg Latency</th>
                    <th className="py-2 pr-4 font-medium">Tokens (in/out)</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.byFeature.map((f) => (
                    <tr key={f.feature} className="border-b last:border-0">
                      <td className="py-2 pr-4 pl-4 font-medium">
                        {FEATURE_LABELS[f.feature] ?? f.feature}
                      </td>
                      <td className="py-2 pr-4">{f.requests}</td>
                      <td className="py-2 pr-4">{f.errors}</td>
                      <td className="py-2 pr-4">
                        {f.avgLatencyMs === null ? "—" : `${f.avgLatencyMs}ms`}
                      </td>
                      <td className="py-2 pr-4 text-neutral-500">
                        {f.totalInputTokens.toLocaleString()} / {f.totalOutputTokens.toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {summary.byModel.length > 0 && (
            <section>
              <h2 className="mb-3 text-sm font-medium text-neutral-700">By Model</h2>
              <ul className="space-y-1.5 text-sm">
                {summary.byModel.map((m) => (
                  <li key={m.model} className="flex items-center justify-between rounded-md border px-3 py-2">
                    <span className="font-medium">{m.model}</span>
                    <span className="text-neutral-500">
                      {m.requests} requests · {m.totalTokens.toLocaleString()} tokens
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section>
            <h2 className="mb-3 text-sm font-medium text-neutral-700">Recent Errors</h2>
            {summary.recentErrors.length === 0 ? (
              <p className="text-sm text-neutral-400">No AI errors in this window.</p>
            ) : (
              <ul className="space-y-1.5 text-sm">
                {summary.recentErrors.map((e) => (
                  <li key={e.id} className="rounded-md border border-red-100 bg-red-50/50 px-3 py-2">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{FEATURE_LABELS[e.feature] ?? e.feature}</span>
                      <span className="text-xs text-neutral-400">
                        <LocalTimestamp value={e.startTime} />
                      </span>
                    </div>
                    {e.statusMessage && (
                      <p className="mt-1 text-xs text-neutral-500">{e.statusMessage}</p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <h2 className="mb-3 text-sm font-medium text-neutral-700">Evaluation Results</h2>
            {latestEvalRun ? (
              <div className="rounded-lg border p-4 text-sm">
                <div className="flex items-center justify-between">
                  <span>
                    Latest run: <LocalTimestamp value={latestEvalRun.startedAt} /> —{" "}
                    <span className="text-green-700">{latestEvalRun.passCount} passed</span>
                    {latestEvalRun.failCount > 0 && (
                      <span className="text-red-700"> · {latestEvalRun.failCount} failed</span>
                    )}
                    {latestEvalRun.skippedCount > 0 && (
                      <span className="text-neutral-400"> · {latestEvalRun.skippedCount} skipped</span>
                    )}
                  </span>
                  <a href="/admin/evaluation" className="text-xs text-blue-700 hover:underline">
                    Full history →
                  </a>
                </div>
              </div>
            ) : (
              <div className="rounded-lg border border-dashed p-4 text-sm text-neutral-400">
                No evaluation runs yet (Step 32). Curated test cases for Tutor
                groundedness, citation accuracy, unsupported-question handling,
                quiz generation reliability, grading quality, and recommendation
                relevance are ready to run —{" "}
                <a href="/admin/evaluation" className="underline">
                  go to Evaluation
                </a>{" "}
                to trigger the first one.
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
