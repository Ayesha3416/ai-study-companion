import { createAdminClient } from "@/lib/supabase/admin";
import { estimateCostUsd } from "./pricing";

/**
 * Records one first-party AI usage/cost record (Step 31, PRD §43). Called
 * from provider.ts right after every generateText/generateStructured call
 * completes or fails — same "always via the service-role admin client"
 * pattern as recordActivityEvent, and for the same reason: provider.ts is
 * called from many different execution contexts (server actions with a
 * user session, potentially background jobs with none), so it can't rely
 * on a cookie-based client being available.
 *
 * Deliberately swallows its own errors: a logging hiccup here must never
 * surface as a failure of the actual Tutor/Quiz/Grading/Recommendation
 * request the user is waiting on (PRD §49 pattern, same as activity events).
 */
export async function recordAiRequest({
  ownerId,
  projectId,
  feature,
  model,
  inputTokens,
  outputTokens,
  latencyMs,
  success,
  errorMessage,
}: {
  ownerId?: string | null;
  projectId?: string | null;
  feature: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  success: boolean;
  errorMessage?: string | null;
}): Promise<void> {
  try {
    const supabase = createAdminClient();
    const { error } = await supabase.from("ai_requests").insert({
      owner_id: ownerId ?? null,
      project_id: projectId ?? null,
      feature,
      model,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      latency_ms: latencyMs,
      estimated_cost_usd: estimateCostUsd(model, inputTokens, outputTokens),
      success,
      error_message: errorMessage ?? null,
    });
    if (error) {
      console.error("Failed to record AI request:", feature, error);
    }
  } catch (error) {
    console.error("Failed to record AI request:", feature, error);
  }
}

/** Best-effort extraction of a projectId out of provider.ts's free-form
 * `metadata` bag — every current caller (tutor.ts, quiz.ts, recommendation.ts,
 * and now grading.ts) passes one, but this stays defensive rather than
 * assuming every future caller will remember to. */
export function extractProjectId(
  metadata: Record<string, unknown> | undefined
): string | null {
  const value = metadata?.projectId;
  return typeof value === "string" ? value : null;
}
