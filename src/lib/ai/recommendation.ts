import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { generateStructured } from "./provider";
import { buildRecommendationPrompt } from "./prompts/recommendation";
import { getGrowthAnalysis } from "@/lib/mastery/growth";
import { getOrCreateConcept } from "@/lib/mastery/concepts";
import { recordActivityEvent } from "@/lib/activity/events";

// Exported so the Step 32 evaluation harness can validate against the
// exact same schema real recommendation generation uses, instead of a
// parallel definition that could silently drift out of sync.
export const RecommendationSchema = z.object({
  message: z.string().min(1),
  focusConceptName: z.string().nullable(),
});

export type Recommendation = {
  id: string;
  message: string;
  createdAt: string;
};

// Recommendations reflect a snapshot of Growth data that only changes as
// quizzes are answered, so regenerating on every single page view would
// waste AI calls without adding value. 10 minutes balances feeling
// responsive during an active study session against not spamming requests
// on repeat page loads.
const FRESHNESS_WINDOW_MINUTES = 10;

export async function getOrGenerateRecommendation(
  projectId: string
): Promise<Recommendation> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data: latest, error: latestError } = await supabase
    .from("recommendations")
    .select("id, message, created_at")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (latestError) throw latestError;

  if (latest) {
    const ageMinutes = (Date.now() - new Date(latest.created_at).getTime()) / 60000;
    if (ageMinutes < FRESHNESS_WINDOW_MINUTES) {
      return { id: latest.id, message: latest.message, createdAt: latest.created_at };
    }
  }

  const [growth, project] = await Promise.all([
    getGrowthAnalysis(projectId),
    supabase.from("projects").select("goal").eq("id", projectId).single(),
  ]);

  const { system, prompt } = buildRecommendationPrompt({
    growth,
    learningGoal: project.data?.goal ?? null,
    previousRecommendation: latest?.message ?? null,
  });

  const result = await generateStructured({
    feature: "recommendation_generation",
    system,
    prompt,
    schema: RecommendationSchema,
    userId: user.id,
    metadata: { projectId },
  });

  const conceptId = result.focusConceptName
    ? await getOrCreateConcept(projectId, user.id, result.focusConceptName)
    : null;

  const { data: inserted, error: insertError } = await supabase
    .from("recommendations")
    .insert({
      project_id: projectId,
      owner_id: user.id,
      concept_id: conceptId,
      message: result.message,
    })
    .select("id, message, created_at")
    .single();
  if (insertError) throw insertError;

  await recordActivityEvent({
    ownerId: user.id,
    eventType: "recommendation_generated",
    projectId,
    metadata: { recommendationId: inserted.id },
  });

  return { id: inserted.id, message: inserted.message, createdAt: inserted.created_at };
}
