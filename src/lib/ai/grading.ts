import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { retrieveRelevantChunks } from "./retrieval";
import { generateStructured } from "./provider";
import { buildGradingPrompt } from "./prompts/grading";
import { recordContextEntry } from "@/lib/context/learning-context";

// Exported so the Step 32 evaluation harness can validate against the
// exact same schema real grading uses, instead of a parallel definition
// that could silently drift out of sync.
export const GradingResultSchema = z.object({
  scorePercent: z.number().min(0).max(100),
  keyConceptsCovered: z.array(z.string()),
  keyConceptsMissing: z.array(z.string()),
  feedback: z.string().min(1),
});

const PASS_THRESHOLD = 70; // used only for the boolean is_correct flag; the real signal is scorePercent

export type GradingResult = {
  scorePercent: number;
  isCorrect: boolean;
  feedback: string;
};

/**
 * Grades an open-ended quiz answer (PRD §28): assesses understanding,
 * accuracy, and which key concepts are covered vs. missing, then writes a
 * deterministically-formatted feedback string (not just whatever prose
 * shape the model happens to produce) back onto the question row.
 */
export async function gradeOpenEndedAnswer(questionId: string): Promise<GradingResult> {
  const supabase = await createClient();

  const { data: question, error: questionError } = await supabase
    .from("quiz_questions")
    .select("id, project_id, owner_id, concept_id, prompt, user_answer, concepts(name)")
    .eq("id", questionId)
    .single();
  if (questionError || !question) throw new Error("Question not found");
  if (!question.user_answer) throw new Error("Question has not been answered yet");

  const conceptName = (question.concepts as unknown as { name: string } | null)?.name;
  const retrievalQuery = conceptName ?? question.prompt;
  const chunks = await retrieveRelevantChunks(question.project_id, retrievalQuery, 5);

  const { system, prompt } = buildGradingPrompt(chunks, question.prompt, question.user_answer);

  const graded = await generateStructured({
    feature: "open_ended_grading",
    system,
    prompt,
    schema: GradingResultSchema,
    userId: question.owner_id,
    metadata: { questionId, projectId: question.project_id },
  });

  // Deterministic formatting (PRD §28's example: a short paragraph, then a
  // "Focus on:" list) rather than trusting the model's own prose structure
  // to always come out consistently.
  const feedback =
    graded.keyConceptsMissing.length > 0
      ? `${graded.feedback}\n\nFocus on:\n${graded.keyConceptsMissing.map((c) => `→ ${c}`).join("\n")}`
      : graded.feedback;

  const isCorrect = graded.scorePercent >= PASS_THRESHOLD;

  const { error: updateError } = await supabase
    .from("quiz_questions")
    .update({
      score_percent: Math.round(graded.scorePercent),
      feedback,
      is_correct: isCorrect,
    })
    .eq("id", questionId);
  if (updateError) throw updateError;

  // Step 14: a genuine miss (below the pass threshold, with specific
  // concepts named as missing) is exactly the kind of "recent mistake"
  // PRD §39's Assessment Context calls out — record it so future Tutor/
  // Recommendation prompts can reference the specific gap, not just the
  // rolled-up mastery number. Deliberately only on a real miss (not every
  // graded answer) so this doesn't flood learning_context with routine,
  // passing responses — best-effort, must never fail the grading result
  // the student is waiting on.
  if (!isCorrect && graded.keyConceptsMissing.length > 0) {
    try {
      await recordContextEntry({
        projectId: question.project_id,
        ownerId: question.owner_id,
        contextType: "assessment_mistake",
        content: `On "${question.prompt}", missed: ${graded.keyConceptsMissing.join(", ")} (scored ${Math.round(graded.scorePercent)}%).`,
        conceptId: question.concept_id,
        relevanceScore: 85,
      });
    } catch (error) {
      console.error("Failed to record assessment mistake context:", error);
    }
  }

  return { scorePercent: Math.round(graded.scorePercent), isCorrect, feedback };
}
