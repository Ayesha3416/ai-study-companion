export const dynamic = "force-dynamic";
// triggerEvalRun makes several real AI calls across 4 categories (Step 32) —
// needs headroom beyond a short default timeout.
export const maxDuration = 60;

import { listEvalRuns, type EvalCaseResult, type EvalStatus } from "@/lib/eval/runner";
import { triggerEvalRun } from "./actions";
import { LocalTimestamp } from "@/components/local-timestamp";

const STATUS_STYLES: Record<EvalStatus, string> = {
  pass: "bg-green-100 text-green-800",
  fail: "bg-red-100 text-red-800",
  skipped: "bg-neutral-100 text-neutral-600",
};

const CATEGORY_LABELS: Record<EvalCaseResult["category"], string> = {
  tutor: "Tutor",
  quiz_generation: "Quiz Generation",
  grading: "Grading",
  recommendation: "Recommendations",
};

export default async function AdminEvaluationPage() {
  const runs = await listEvalRuns();
  const latest = runs[0] ?? null;

  return (
    <div className="mx-auto max-w-3xl space-y-8 p-8">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold">AI Evaluation</h1>
          <p className="mt-1 text-sm text-neutral-500">
            Curated test cases for Tutor, Quiz Generation, Grading, and
            Recommendations — rule-based checks against real schema
            validity and answer quality, not a second AI model judging the
            first one&apos;s output.
          </p>
        </div>
        <form action={triggerEvalRun}>
          <button
            type="submit"
            className="shrink-0 rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white"
          >
            Run Evaluation Now
          </button>
        </form>
      </div>

      <p className="text-xs text-neutral-400">
        Each run makes real AI calls (billed, logged like any other
        request) — Quiz/Grading/Recommendation cases use synthetic data and
        never touch real quiz/recommendation rows; Tutor cases run against
        one of your own projects (skipped if none has a concept yet) and
        clean up their temporary conversation afterward.
      </p>

      {runs.length === 0 ? (
        <p className="text-sm text-neutral-400">
          No evaluation runs yet — click &quot;Run Evaluation Now&quot; to run the
          first one.
        </p>
      ) : (
        <>
          <section>
            <h2 className="mb-3 text-sm font-medium text-neutral-700">Latest Run</h2>
            {latest && <RunSummary run={latest} expanded />}
          </section>

          {runs.length > 1 && (
            <section>
              <h2 className="mb-3 text-sm font-medium text-neutral-700">
                Previous Runs
              </h2>
              <p className="mb-3 text-xs text-neutral-400">
                Compare against the latest run above to spot a regression —
                a case that passed before and fails now is worth
                investigating even if the overall pass count looks similar.
              </p>
              <div className="space-y-3">
                {runs.slice(1).map((run) => (
                  <RunSummary key={run.id} run={run} expanded={false} />
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}

function RunSummary({
  run,
  expanded,
}: {
  run: Awaited<ReturnType<typeof listEvalRuns>>[number];
  expanded: boolean;
}) {
  return (
    <div className="rounded-lg border p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 text-sm">
          <span className="font-medium">
            <LocalTimestamp value={run.startedAt} />
          </span>
          <span className="text-green-700">{run.passCount} passed</span>
          {run.failCount > 0 && <span className="text-red-700">{run.failCount} failed</span>}
          {run.skippedCount > 0 && (
            <span className="text-neutral-400">{run.skippedCount} skipped</span>
          )}
        </div>
        <span className="text-xs text-neutral-400">{run.totalCount} cases</span>
      </div>

      {expanded && (
        <ul className="mt-3 space-y-1.5">
          {run.results.map((r) => (
            <li key={r.id} className="rounded-md border px-3 py-2 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span>
                  <span
                    className={`mr-2 inline-block rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[r.status]}`}
                  >
                    {r.status}
                  </span>
                  <span className="text-neutral-400">{CATEGORY_LABELS[r.category]} — </span>
                  <span className="font-medium">{r.name}</span>
                </span>
                {r.latencyMs > 0 && (
                  <span className="shrink-0 text-xs text-neutral-400">{r.latencyMs}ms</span>
                )}
              </div>
              <p className="mt-1 text-xs text-neutral-500">{r.detail}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
