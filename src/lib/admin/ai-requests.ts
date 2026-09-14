import { createClient } from "@/lib/supabase/server";

// Reads back the first-party ai_requests table (Step 31, PRD §43) for the
// Admin AI Usage page. Uses the plain user-scoped client (not the
// service-role admin client) — same reasoning as admin/overview.ts: an
// admin session already sees every row through RLS's `or public.is_admin()`
// clause, so there's no need to bypass RLS entirely for a bigger blast
// radius with no benefit. Only ever call this from an already
// requireAdmin()-gated code path.

export type AiRequestFeatureSummary = {
  feature: string;
  requests: number;
  failures: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCostUsd: number; // sum of known-price requests only
  avgLatencyMs: number | null;
};

export type AiRequestLogEntry = {
  id: string;
  feature: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  estimatedCostUsd: number | null;
  success: boolean;
  errorMessage: string | null;
  createdAt: string;
};

export type AiRequestSummary = {
  windowHours: number;
  totalRequests: number;
  totalFailures: number;
  /** Null only when there are zero requests with a known price this
   * window — never a fabricated $0.00 for "we don't know." */
  totalCostUsd: number | null;
  /** 0-1: fraction of requests this window whose model has a registered
   * price in pricing.ts. Surfaced in the UI so "$X total" doesn't silently
   * imply completeness if, say, a new unpriced model gets added later. */
  costCoverage: number;
  byFeature: AiRequestFeatureSummary[];
  recent: AiRequestLogEntry[];
  /** True if the window had more than SCAN_LIMIT rows and this summary is
   * only over the most recent SCAN_LIMIT — same honesty signal as
   * langfuse-query.ts's `truncated` field, so this table doesn't silently
   * under-report once usage grows past the prototype-scale cap. */
  truncated: boolean;
};

const RECENT_LIMIT = 15;
// Prototype-scale cap, same reasoning as every other Admin query in this
// app (PRD §64: "not to replace a dedicated infrastructure monitoring
// system").
const SCAN_LIMIT = 1000;

export async function getAiRequestSummary(
  windowHours = 24 * 7
): Promise<AiRequestSummary> {
  const supabase = await createClient();
  const since = new Date(Date.now() - windowHours * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from("ai_requests")
    .select(
      "id, feature, model, input_tokens, output_tokens, latency_ms, estimated_cost_usd, success, error_message, created_at"
    )
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(SCAN_LIMIT + 1); // fetch one extra row purely to detect truncation without a separate count query
  if (error) throw error;

  const truncated = (data ?? []).length > SCAN_LIMIT;
  const rows = truncated ? (data ?? []).slice(0, SCAN_LIMIT) : data ?? [];
  const byFeature = new Map<
    string,
    {
      requests: number;
      failures: number;
      inTok: number;
      outTok: number;
      cost: number;
      latencies: number[];
    }
  >();

  let totalFailures = 0;
  let knownCostTotal = 0;
  let knownCostCount = 0;

  for (const r of rows) {
    if (!r.success) totalFailures++;
    if (typeof r.estimated_cost_usd === "number") {
      knownCostTotal += r.estimated_cost_usd;
      knownCostCount++;
    }

    const entry = byFeature.get(r.feature) ?? {
      requests: 0,
      failures: 0,
      inTok: 0,
      outTok: 0,
      cost: 0,
      latencies: [],
    };
    entry.requests++;
    if (!r.success) entry.failures++;
    entry.inTok += r.input_tokens;
    entry.outTok += r.output_tokens;
    if (typeof r.estimated_cost_usd === "number") entry.cost += r.estimated_cost_usd;
    entry.latencies.push(r.latency_ms);
    byFeature.set(r.feature, entry);
  }

  const average = (nums: number[]) =>
    nums.length === 0 ? null : Math.round(nums.reduce((a, b) => a + b, 0) / nums.length);

  return {
    windowHours,
    totalRequests: rows.length,
    totalFailures,
    totalCostUsd: knownCostCount === 0 ? null : knownCostTotal,
    costCoverage: rows.length === 0 ? 0 : knownCostCount / rows.length,
    truncated,
    byFeature: [...byFeature.entries()]
      .map(([feature, v]) => ({
        feature,
        requests: v.requests,
        failures: v.failures,
        totalInputTokens: v.inTok,
        totalOutputTokens: v.outTok,
        totalCostUsd: v.cost,
        avgLatencyMs: average(v.latencies),
      }))
      .sort((a, b) => b.requests - a.requests),
    recent: rows.slice(0, RECENT_LIMIT).map((r) => ({
      id: r.id,
      feature: r.feature,
      model: r.model,
      inputTokens: r.input_tokens,
      outputTokens: r.output_tokens,
      latencyMs: r.latency_ms,
      estimatedCostUsd: r.estimated_cost_usd,
      success: r.success,
      errorMessage: r.error_message,
      createdAt: r.created_at,
    })),
  };
}
