import { createClient } from "@/lib/supabase/server";
import { recordActivityEvent } from "@/lib/activity/events";
import { syncConceptMasteryContext } from "@/lib/context/learning-context";

export type MasterySource = "quiz_answer" | "open_ended_assessment" | "manual_adjustment";

// Mastery should evolve as new evidence arrives (PRD §29), but a single
// answer shouldn't be able to swing an established estimate wildly. This is
// a simple weighted-average heuristic, NOT a validated psychometric model —
// the PRD is explicit that "the purpose is not to claim perfect
// measurement." Early evidence moves mastery quickly (learning fast when we
// know little); as evidence accumulates, each new data point matters less,
// but MIN_LEARNING_RATE keeps mastery permanently responsive to new
// evidence rather than ever fully freezing.
const MIN_LEARNING_RATE = 0.15;

/**
 * The weighted-average mastery update math itself (PRD §29), pulled out as
 * a pure function so it's unit-testable without a database (Step 34,
 * PRD §73). See mastery.test.ts for the boundary cases this covers:
 * first-ever evidence for a concept, the learning-rate floor kicking in
 * after many data points, and rounding.
 */
export function computeUpdatedMastery({
  previousLevel,
  evidenceCount,
  scorePercent,
}: {
  previousLevel: number;
  evidenceCount: number;
  scorePercent: number;
}): number {
  const learningRate = Math.max(MIN_LEARNING_RATE, 1 / (evidenceCount + 1));
  return Math.round(previousLevel + learningRate * (scorePercent - previousLevel));
}

/**
 * Records one piece of evidence about a concept (a quiz answer, an
 * open-ended grading result, etc.) and updates that concept's mastery
 * estimate accordingly.
 *
 * @param scorePercent 0-100. For a simple right/wrong quiz question, pass
 *   100 or 0. For AI-graded open-ended answers, pass the graded quality score.
 */
export async function recordMasteryEvidence({
  conceptId,
  projectId,
  ownerId,
  scorePercent,
  source,
}: {
  conceptId: string;
  projectId: string;
  ownerId: string;
  scorePercent: number;
  source: MasterySource;
}): Promise<{ newLevel: number; previousLevel: number }> {
  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("concept_mastery")
    .select("mastery_level, evidence_count")
    .eq("concept_id", conceptId)
    .maybeSingle();

  const previousLevel = existing?.mastery_level ?? 0;
  const evidenceCount = existing?.evidence_count ?? 0;
  const newLevel = computeUpdatedMastery({ previousLevel, evidenceCount, scorePercent });

  const { error: upsertError } = await supabase
    .from("concept_mastery")
    .upsert(
      {
        concept_id: conceptId,
        project_id: projectId,
        owner_id: ownerId,
        mastery_level: newLevel,
        evidence_count: evidenceCount + 1,
        last_evaluated_at: new Date().toISOString(),
      },
      { onConflict: "concept_id" }
    );
  if (upsertError) throw upsertError;

  const { error: historyError } = await supabase.from("mastery_history").insert({
    concept_id: conceptId,
    project_id: projectId,
    owner_id: ownerId,
    mastery_level: newLevel,
    source,
  });
  if (historyError) throw historyError;

  await recordActivityEvent({
    ownerId,
    eventType: "mastery_updated",
    projectId,
    metadata: { conceptId, previousLevel, newLevel, source },
  });

  // Step 14: keep this concept's persistent "status" context entry
  // (known_weakness/known_strength) in sync with the number that just
  // changed. Best-effort — a context-sync hiccup must not roll back or
  // fail the mastery update it's describing (PRD §49 pattern).
  try {
    await syncConceptMasteryContext({ projectId, ownerId, conceptId, masteryLevel: newLevel });
  } catch (error) {
    console.error("Failed to sync concept mastery context:", error);
  }

  return { newLevel, previousLevel };
}

export async function listMasteryForProject(projectId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("concept_mastery")
    .select("mastery_level, evidence_count, last_evaluated_at, concepts(id, name)")
    .eq("project_id", projectId)
    .order("mastery_level", { ascending: true }); // weakest concepts first — surfaces "needs attention" areas naturally

  if (error) throw error;
  return data;
}
