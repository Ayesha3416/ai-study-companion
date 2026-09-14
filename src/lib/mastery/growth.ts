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

  // **Bug fix (real production issue — found via one specific account
  // reliably timing out on this page, traced back to here)**: this used
  // to fetch each concept's first-ever mastery_history row inside the
  // loop below, one sequential, individually-awaited round-trip per
  // concept. That's fine for a project with a couple of concepts, but
  // scales linearly with a project's entire concept history — a project
  // that's accumulated dozens of concepts over real use (exactly what a
  // long-lived, heavily-tested account looks like, vs. a brand-new one)
  // could rack up dozens of sequential network round-trips on every
  // single call, easily enough to approach or exceed a serverless
  // function's execution limit even with a generous maxDuration. Fixed
  // by fetching every relevant concept's history in ONE query (still just
  // as correct — `order by recorded_at ascending` then keeping only the
  // first row seen per concept_id — but now one round-trip total,
  // regardless of how many concepts the project has, instead of one per
  // concept).
  const conceptIds = (masteryRows ?? []).map((r) => r.concept_id);
  const firstMasteryByConceptId = new Map<string, number>();
  if (conceptIds.length > 0) {
    const { data: historyRows, error: historyError } = await supabase
      .from("mastery_history")
      .select("concept_id, mastery_level")
      .in("concept_id", conceptIds)
      .order("recorded_at", { ascending: true });
    if (historyError) throw historyError;
    for (const h of historyRows ?? []) {
      if (!firstMasteryByConceptId.has(h.concept_id)) {
        firstMasteryByConceptId.set(h.concept_id, h.mastery_level);
      }
    }
  }

  const results: ConceptGrowth[] = [];

  for (const row of masteryRows ?? []) {
    const previousMastery = firstMasteryByConceptId.get(row.concept_id) ?? row.mastery_level;
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
