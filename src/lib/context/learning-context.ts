import { createClient } from "@/lib/supabase/server";

export type ContextType =
  | "known_weakness"
  | "known_strength"
  | "assessment_mistake"
  | "preference"
  | "tutor_note";

export type LearningContextEntry = {
  id: string;
  contextType: ContextType;
  content: string;
  conceptId: string | null;
  relevanceScore: number;
  createdAt: string;
};

// PRD §40: "avoid unnecessarily sending the complete history ... to every
// AI request." Capping the number of entries composed into any one prompt
// is the whole point of `relevance_score` existing — this is deliberately
// small enough to stay cheap even as a long-lived project accumulates many
// context rows over time.
const MAX_CONTEXT_ENTRIES_PER_REQUEST = 8;

/**
 * Retrieves the most relevant persistent context for a project, ordered by
 * relevance then recency. This is intentionally simple (no embedding-based
 * relevance ranking) — at prototype scale, "most important, then most
 * recent" is a reasonable proxy for "relevant to the current request," and
 * avoids a second retrieval pipeline alongside Step 10's material search.
 */
export async function getRelevantContext(
  projectId: string,
  limit: number = MAX_CONTEXT_ENTRIES_PER_REQUEST
): Promise<LearningContextEntry[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("learning_context")
    .select("id, context_type, content, concept_id, relevance_score, created_at")
    .eq("project_id", projectId)
    .order("relevance_score", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id,
    contextType: row.context_type as ContextType,
    content: row.content,
    conceptId: row.concept_id,
    relevanceScore: row.relevance_score,
    createdAt: row.created_at,
  }));
}

/**
 * Records a free-form context entry (currently used for assessment
 * mistakes and future explicit-preference capture). Swallows nothing —
 * unlike activity events, a failed context write is worth knowing about
 * during development, though callers should still treat this as
 * best-effort and not let it break the feature it's attached to (same
 * PRD §49 pattern as everywhere else — see try/catch at call sites).
 */
export async function recordContextEntry({
  projectId,
  ownerId,
  contextType,
  content,
  conceptId,
  relevanceScore = 100,
  source = "ai_inferred",
}: {
  projectId: string;
  ownerId: string;
  contextType: ContextType;
  content: string;
  conceptId?: string | null;
  relevanceScore?: number;
  source?: "ai_inferred" | "user" | "system";
}): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from("learning_context").insert({
    project_id: projectId,
    owner_id: ownerId,
    context_type: contextType,
    content,
    concept_id: conceptId ?? null,
    relevance_score: relevanceScore,
    source,
  });
  if (error) throw error;
}

/**
 * Keeps a single "status" context entry in sync with a concept's current
 * mastery level — called from `recordMasteryEvidence` (Step 15/19) every
 * time mastery updates, not on a schedule, so context never lags behind
 * the number it's describing.
 *
 * Deliberately upserts in place (via the partial unique index on
 * `(project_id, concept_id, context_type)`) rather than appending a new row
 * every time: a concept's weakness/strength status is a single current
 * fact, not a history (mastery_history already IS that history). Decisive
 * thresholds match mastery-bar.tsx's own color coding (<40 red, >=70
 * green) so this table's claims always agree with what mastery bars show
 * elsewhere in the UI. Mid-range mastery (40-69) is neither a notable
 * strength nor weakness — any existing status entry for the concept is
 * removed rather than left stale once mastery moves into that band.
 */
export async function syncConceptMasteryContext({
  projectId,
  ownerId,
  conceptId,
  masteryLevel,
}: {
  projectId: string;
  ownerId: string;
  conceptId: string;
  masteryLevel: number;
}): Promise<void> {
  const supabase = await createClient();

  const { data: concept, error: conceptError } = await supabase
    .from("concepts")
    .select("name")
    .eq("id", conceptId)
    .single();
  if (conceptError || !concept) return; // best-effort — a missing concept name shouldn't break mastery recording

  const { data: existing } = await supabase
    .from("learning_context")
    .select("id")
    .eq("project_id", projectId)
    .eq("concept_id", conceptId)
    .in("context_type", ["known_weakness", "known_strength"])
    .maybeSingle();

  if (masteryLevel < 40) {
    const content = `Struggling with "${concept.name}" (currently ${masteryLevel}% mastery) — prioritize reinforcing this concept.`;
    await upsertStatusEntry(existing?.id, {
      projectId,
      ownerId,
      conceptId,
      contextType: "known_weakness",
      content,
      relevanceScore: 100, // weaknesses matter more than strengths for future tutoring/quizzing
    });
  } else if (masteryLevel >= 70) {
    const content = `Has demonstrated strong understanding of "${concept.name}" (${masteryLevel}% mastery).`;
    await upsertStatusEntry(existing?.id, {
      projectId,
      ownerId,
      conceptId,
      contextType: "known_strength",
      content,
      relevanceScore: 50,
    });
  } else if (existing) {
    // No longer decisively weak or strong — remove the stale claim rather
    // than let outdated context keep surfacing to future AI requests.
    await supabase.from("learning_context").delete().eq("id", existing.id);
  }
}

async function upsertStatusEntry(
  existingId: string | undefined,
  entry: {
    projectId: string;
    ownerId: string;
    conceptId: string;
    contextType: ContextType;
    content: string;
    relevanceScore: number;
  }
): Promise<void> {
  const supabase = await createClient();
  if (existingId) {
    await supabase
      .from("learning_context")
      .update({
        context_type: entry.contextType,
        content: entry.content,
        relevance_score: entry.relevanceScore,
      })
      .eq("id", existingId);
  } else {
    await supabase.from("learning_context").insert({
      project_id: entry.projectId,
      owner_id: entry.ownerId,
      concept_id: entry.conceptId,
      context_type: entry.contextType,
      content: entry.content,
      relevance_score: entry.relevanceScore,
      source: "ai_inferred",
    });
  }
}

/** Renders context entries into a short prompt block (PRD §40's "Compose AI Context"). */
export function formatContextForPrompt(entries: LearningContextEntry[]): string {
  if (entries.length === 0) return "";
  return entries.map((e) => `- ${e.content}`).join("\n");
}
