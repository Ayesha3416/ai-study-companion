import { Langfuse } from "langfuse";

// Separate client instance from provider.ts's ingestion client. Same
// credentials, different purpose (reading back instead of writing) — kept
// apart so a future change to one (e.g. batching config on the ingestion
// side) can't accidentally affect the other.
const langfuse = new Langfuse({
  publicKey: process.env.LANGFUSE_PUBLIC_KEY,
  secretKey: process.env.LANGFUSE_SECRET_KEY,
  baseUrl: process.env.LANGFUSE_HOST,
});

// provider.ts's `feature` option becomes both the trace name and the
// generation/observation name (see generateText/generateStructured) — so
// filtering GENERATION-type observations by name IS filtering by product
// feature. Keep this list in sync with the `feature:` strings passed at
// every generateText/generateStructured call site; it's only used to give
// the "by feature" breakdown stable, complete rows (a feature with zero
// calls in the window still shows up as 0 rather than being silently
// absent from the table).
const KNOWN_AI_FEATURES = [
  "tutor_response",
  "quiz_generation",
  "open_ended_grading",
  "recommendation_generation",
] as const;

export type AiFeatureUsage = {
  feature: string;
  requests: number;
  errors: number;
  avgLatencyMs: number | null;
  totalInputTokens: number;
  totalOutputTokens: number;
};

export type AiModelUsage = {
  model: string;
  requests: number;
  totalTokens: number;
};

export type AiUsageError = {
  id: string;
  traceId: string | null;
  feature: string;
  statusMessage: string | null;
  startTime: string;
};

export type AiUsageSummary = {
  windowHours: number;
  totalRequests: number;
  errorCount: number;
  errorRate: number; // 0-1
  avgLatencyMs: number | null;
  totalInputTokens: number;
  totalOutputTokens: number;
  /** Null when Langfuse has no registered pricing for the model(s) used
   * (expected for Groq models right now — see module comment below) rather
   * than silently showing $0.00, which would misleadingly imply "free." */
  totalCostUsd: number | null;
  byFeature: AiFeatureUsage[];
  byModel: AiModelUsage[];
  recentErrors: AiUsageError[];
  /** True if we hit MAX_OBSERVATIONS_TO_SCAN and stopped paginating —
   * lets the UI show "showing most recent N" instead of implying these
   * numbers are a complete window total. */
  truncated: boolean;
};

// Prototype-scale cap (PRD §64: "not to replace a dedicated infrastructure
// monitoring system"). At ~200ms/page this keeps the admin page responsive;
// revisit with Langfuse's Metrics API (server-side aggregation) if usage
// ever grows past what's comfortable to paginate through client-side.
const PAGE_SIZE = 100;
const MAX_PAGES = 5;

/**
 * Aggregates AI usage/quality metrics for the Admin AI Usage & Evaluation
 * view (PRD §63) by reading back GENERATION-type observations that
 * provider.ts has been sending to Langfuse since Step 9.
 *
 * Cost note: Langfuse only populates `costDetails` for models it has
 * registered pricing for. Groq models (this project's TEXT_MODEL) aren't
 * in Langfuse's default model list, so `totalCostUsd` will likely come
 * back null until a custom model price is registered in the Langfuse
 * project settings. This is surfaced honestly in the UI rather than
 * showing a fabricated $0.00 — matches this project's standing rule
 * (Step 27's note) against inventing numbers for sections that aren't
 * really wired up.
 */
export async function getAiUsageSummary(windowHours = 24 * 7): Promise<AiUsageSummary> {
  // fetchObservations expects a Date object here, not an ISO string.
  const fromStartTime = new Date(Date.now() - windowHours * 60 * 60 * 1000);

  const observations: Awaited<ReturnType<typeof langfuse.fetchObservations>>["data"] = [];
  let truncated = false;

  for (let page = 1; page <= MAX_PAGES; page++) {
    const response = await langfuse.fetchObservations({
      type: "GENERATION",
      fromStartTime,
      limit: PAGE_SIZE,
      page,
    });
    observations.push(...response.data);

    const totalPages = response.meta?.totalPages ?? 1;
    if (page >= totalPages) break;
    if (page === MAX_PAGES) truncated = true;
  }

  const byFeature = new Map<string, { requests: number; errors: number; latencies: number[]; inTok: number; outTok: number }>();
  const byModel = new Map<string, { requests: number; totalTokens: number }>();
  const recentErrors: AiUsageError[] = [];

  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let errorCount = 0;
  let costKnown = false;
  let totalCostUsd = 0;
  const allLatencies: number[] = [];

  for (const obs of observations) {
    const feature = obs.name ?? "unknown";
    const inTok = obs.usage?.input ?? 0;
    const outTok = obs.usage?.output ?? 0;
    const isError = obs.level === "ERROR";
    const latencyMs =
      obs.endTime && obs.startTime
        ? new Date(obs.endTime).getTime() - new Date(obs.startTime).getTime()
        : null;

    totalInputTokens += inTok;
    totalOutputTokens += outTok;
    if (isError) errorCount++;
    if (latencyMs !== null) allLatencies.push(latencyMs);

    const cost = obs.costDetails?.total;
    if (typeof cost === "number") {
      costKnown = true;
      totalCostUsd += cost;
    }

    const featureEntry = byFeature.get(feature) ?? { requests: 0, errors: 0, latencies: [], inTok: 0, outTok: 0 };
    featureEntry.requests++;
    if (isError) featureEntry.errors++;
    if (latencyMs !== null) featureEntry.latencies.push(latencyMs);
    featureEntry.inTok += inTok;
    featureEntry.outTok += outTok;
    byFeature.set(feature, featureEntry);

    if (obs.model) {
      const modelEntry = byModel.get(obs.model) ?? { requests: 0, totalTokens: 0 };
      modelEntry.requests++;
      modelEntry.totalTokens += inTok + outTok;
      byModel.set(obs.model, modelEntry);
    }

    if (isError && recentErrors.length < 20) {
      recentErrors.push({
        id: obs.id,
        traceId: obs.traceId ?? null,
        feature,
        statusMessage: obs.statusMessage ?? null,
        startTime: obs.startTime,
      });
    }
  }

  // Ensure every known feature has a row even with zero calls this window
  // (PRD §63's "AI feature usage" reads better as a complete table than a
  // list that silently omits anything that happened not to run).
  for (const feature of KNOWN_AI_FEATURES) {
    if (!byFeature.has(feature)) {
      byFeature.set(feature, { requests: 0, errors: 0, latencies: [], inTok: 0, outTok: 0 });
    }
  }

  const average = (nums: number[]) =>
    nums.length === 0 ? null : Math.round(nums.reduce((a, b) => a + b, 0) / nums.length);

  return {
    windowHours,
    totalRequests: observations.length,
    errorCount,
    errorRate: observations.length === 0 ? 0 : errorCount / observations.length,
    avgLatencyMs: average(allLatencies),
    totalInputTokens,
    totalOutputTokens,
    totalCostUsd: costKnown ? totalCostUsd : null,
    byFeature: [...byFeature.entries()]
      .map(([feature, v]) => ({
        feature,
        requests: v.requests,
        errors: v.errors,
        avgLatencyMs: average(v.latencies),
        totalInputTokens: v.inTok,
        totalOutputTokens: v.outTok,
      }))
      .sort((a, b) => b.requests - a.requests),
    byModel: [...byModel.entries()]
      .map(([model, v]) => ({ model, requests: v.requests, totalTokens: v.totalTokens }))
      .sort((a, b) => b.requests - a.requests),
    recentErrors: recentErrors.sort((a, b) => b.startTime.localeCompare(a.startTime)),
    truncated,
  };
}
