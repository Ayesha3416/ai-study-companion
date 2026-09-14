import { createClient } from "@/lib/supabase/server";

export type GrowthTrend = "improving" | "stable" | "needs_attention";

export type ConceptGrowth = {
  conceptId: string;
  conceptName: string;
  previousMastery: number;
  currentMastery: number;
  evidenceCount: number;
  trend: GrowthTrend;
};

// Percentage-point threshold for calling a change "improving" or "needs
// attention" rather than noise (PRD §31's example: 54%→72% = Improving,
// 68%→69% = Stable, 61%→47% = Needs Attention — a ±5pp band comfortably
// separates those cases). Exported so Global Analytics (Step 24) can
// classify trends the same way without duplicating this logic.
export const TREND_THRESHOLD = 5;

export function classifyTrend(previousMastery: number, currentMastery: number): GrowthTrend {
  const delta = currentMastery - previousMastery;
  if (delta >= TREND_THRESHOLD) return "improving";
  if (delta <= -TREND_THRESHOLD) return "needs_attention";
  return "stable";
}

/**
 * "Previous" is each concept's FIRST-EVER recorded mastery value (from
 * mastery_history), and "current" is its latest value (from
 * concept_mastery). This is deliberately simple rather than a fixed time
 * window (e.g. "7 days ago") — a rolling time window would show no
 * meaningful trend for concepts that were only ever studied within a single
 * short session, which is common early in a project's life. Comparing
 * against the very first data point always has something meaningful to show.
 */
export async function getGrowthAnalysis(projectId: string): Promise<ConceptGrowth[]> {
  const supabase = await createClient();

  const { data: masteryRows, error: masteryError } = await supabase
    .from("concept_mastery")
    .select("concept_id, mastery_level, evidence_count, concepts(id, name)")
    .eq("project_id", projectId);
  if (masteryError) throw masteryError;

  const results: ConceptGrowth[] = [];

  for (const row of masteryRows ?? []) {
    const { data: firstHistory, error: historyError } = await supabase
      .from("mastery_history")
      .select("mastery_level")
      .eq("concept_id", row.concept_id)
      .order("recorded_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (historyError) throw historyError;

    const previousMastery = firstHistory?.mastery_level ?? row.mastery_level;
    const currentMastery = row.mastery_level;
    const trend = classifyTrend(previousMastery, currentMastery);

    results.push({
      conceptId: row.concept_id,
      conceptName: (row.concepts as unknown as { name: string } | null)?.name ?? "Unknown concept",
      previousMastery,
      currentMastery,
      evidenceCount: row.evidence_count,
      trend,
    });
  }

  // Weakest-current-mastery first — consistent with listMasteryForProject's
  // convention, surfaces what needs attention without extra sorting logic
  // in the UI.
  return results.sort((a, b) => a.currentMastery - b.currentMastery);
}
