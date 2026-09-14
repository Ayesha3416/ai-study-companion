import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { retrieveRelevantChunks, hasReliableEvidence } from "./retrieval";
import { generateStructured } from "./provider";
import { buildQuizPrompt } from "./prompts/quiz";
import { getOrCreateConcept, listConcepts } from "@/lib/mastery/concepts";
import { listMasteryForProject } from "@/lib/mastery/mastery";

const QuestionOptionSchema = z.object({
  id: z.string(),
  text: z.string(),
});

// Exported so the Step 32 evaluation harness can validate against the
// exact same schema real quiz generation uses, instead of a parallel
// definition that could silently drift out of sync.
export const QuizQuestionSchema = z
  .object({
    concept: z.string().min(1),
    questionType: z.enum(["multiple_choice", "open_ended"]),
    difficulty: z.enum(["easy", "medium", "hard"]),
    prompt: z.string().min(1),
    options: z.array(QuestionOptionSchema).nullable().optional(),
    correctOptionId: z.string().nullable().optional(),
  })
  .refine(
    (q) =>
      q.questionType !== "multiple_choice" ||
      (q.options && q.options.length === 4 && !!q.correctOptionId),
    { message: "multiple_choice questions require exactly 4 options and a correctOptionId" }
  )
  .refine(
    (q) =>
      q.questionType !== "multiple_choice" ||
      q.options!.some((o) => o.id === q.correctOptionId),
    { message: "correctOptionId must match one of the provided options" }
  );

const RECENT_QUESTIONS_TO_AVOID = 10;

/**
 * Difficulty is derived from the concept's overall mastery estimate (an
 * aggregate built up over multiple past answers via Step 15's weighted
 * update), NOT from whether the single most recent answer was right or
 * wrong. This is what PRD §26 means by not simply doing "Wrong → Easy,
 * Correct → Hard" — a smoothed trend rather than a reflexive one-answer
 * reaction.
 */
function deriveDifficulty(masteryLevel: number | null): "easy" | "medium" | "hard" {
  if (masteryLevel === null) return "easy"; // no evidence yet — start gentle
  if (masteryLevel < 40) return "easy";
  if (masteryLevel < 70) return "medium";
  return "hard";
}

export type MasteryRow = {
  mastery_level: number;
  // Supabase infers this joined-relation field with slightly different
  // shapes depending on query context (single object vs. single-element
  // array) — left as `unknown` here rather than guessing a shape, same as
  // every other place in this file that already casts it via
  // `as unknown as { name: string }` when it actually needs the name.
  concepts: unknown;
};

/**
 * The adaptive concept/difficulty decision itself (PRD §25-26), pulled out
 * as a small pure function specifically so it's unit-testable in isolation
 * from Supabase/AI calls. This is the exact logic behind the "always picks
 * the only concept" regression documented above (Step 15/16 era) — a test
 * against this function would have caught that regression immediately,
 * which is the whole reason it's separated out now rather than left inline
 * inside generateNextQuizQuestion (PRD §73's own reasoning for why this
 * function specifically was worth testing).
 */
export function selectQuizFocus({
  mastery,
  existingConceptCount,
  questionCount,
}: {
  /** Already sorted weakest-first, same contract as listMasteryForProject. */
  mastery: MasteryRow[];
  existingConceptCount: number;
  questionCount: number;
}): {
  shouldExploreNewConcept: boolean;
  targetConcept: MasteryRow | null;
  difficulty: "easy" | "medium" | "hard";
} {
  const shouldExploreNewConcept =
    existingConceptCount < 3 || questionCount % 3 === 0;
  const targetConcept =
    !shouldExploreNewConcept && mastery.length > 0 ? mastery[0] : null;
  const difficulty = deriveDifficulty(targetConcept?.mastery_level ?? null);

  return { shouldExploreNewConcept, targetConcept, difficulty };
}

export async function generateNextQuizQuestion({
  projectId,
  ownerId,
  quizAttemptId,
}: {
  projectId: string;
  ownerId: string;
  quizAttemptId: string;
}) {
  const supabase = await createClient();

  // ---- Adaptive selection (our own logic, not left to the model) ----
  const mastery = await listMasteryForProject(projectId); // already weakest-first
  const existingConcepts = await listConcepts(projectId);

  const { data: recentQuestions, error: recentError } = await supabase
    .from("quiz_questions")
    .select("prompt")
    .eq("quiz_attempt_id", quizAttemptId)
    .order("created_at", { ascending: false })
    .limit(RECENT_QUESTIONS_TO_AVOID);
  if (recentError) throw recentError;

  const questionCount = recentQuestions?.length ?? 0;

  // BUG FIX (found while investigating why Growth only ever showed one
  // concept): once a single concept exists, it is *always* "the weakest"
  // by definition (nothing else exists to be weaker or stronger than it),
  // so pinning the model to "the weakest known concept" every time meant
  // a second concept could never be introduced — the very first answered
  // question locked the whole quiz onto one topic forever. Fix: while
  // concept coverage is still thin (<3 concepts), or periodically even
  // once it isn't (every 3rd question), deliberately let the model choose
  // freely from the material instead of pinning it to an existing concept,
  // so new concepts actually get a chance to be introduced. This still
  // reinforces weak concepts most of the time — it just no longer forecloses
  // ever discovering new ones (PRD §25/§26's "Select Concept" step assumes
  // coverage can grow, which the old logic made structurally impossible).
  // Extracted into selectQuizFocus (Step 34) so this exact decision is
  // unit-testable on its own — see quiz.test.ts, including a regression
  // test for the single-concept bug this comment describes.
  const { shouldExploreNewConcept, targetConcept, difficulty } = selectQuizFocus({
    mastery,
    existingConceptCount: existingConcepts.length,
    questionCount,
  });

  // Alternate question types for variety rather than always defaulting to
  // multiple_choice (PRD §24 supports both).
  const questionType: "multiple_choice" | "open_ended" =
    questionCount % 3 === 2 ? "open_ended" : "multiple_choice";

  // ---- Grounded retrieval ----
  const retrievalQuery =
    (targetConcept?.concepts as unknown as { name: string } | null)?.name ??
    "important concepts and facts covered in this material";
  const chunks = await retrieveRelevantChunks(projectId, retrievalQuery, 5);

  if (!hasReliableEvidence(chunks)) {
    throw new Error(
      "Not enough processed material in this project to generate a quiz question yet."
    );
  }

  // ---- Generate ----
  const { system, prompt } = buildQuizPrompt({
    chunks,
    existingConcepts: existingConcepts.map((c) => c.name),
    recentQuestionPrompts: (recentQuestions ?? []).map((q) => q.prompt),
    difficulty,
    questionType,
    targetConcept: (targetConcept?.concepts as unknown as { name: string } | null)?.name,
    preferNewConcept: shouldExploreNewConcept && existingConcepts.length > 0,
  });

  const question = await generateStructured({
    feature: "quiz_generation",
    system,
    prompt,
    schema: QuizQuestionSchema,
    userId: ownerId,
    metadata: { projectId, quizAttemptId, difficulty, questionType },
  });

  const conceptId = await getOrCreateConcept(projectId, ownerId, question.concept);

  const { data: inserted, error: insertError } = await supabase
    .from("quiz_questions")
    .insert({
      quiz_attempt_id: quizAttemptId,
      project_id: projectId,
      owner_id: ownerId,
      concept_id: conceptId,
      question_type: question.questionType,
      difficulty: question.difficulty,
      prompt: question.prompt,
      options: question.options ?? null,
      correct_option_id: question.correctOptionId ?? null,
      order_index: questionCount + 1,
    })
    .select("id, question_type, difficulty, prompt, options, order_index")
    .single();

  if (insertError) {
    // Race condition (Step 33 audit): another concurrent request already
    // generated an unanswered question for this attempt between our check
    // and our insert. The partial unique index on
    // (quiz_attempt_id) WHERE answered_at IS NULL catches it (Postgres
    // code 23505) — same pattern as getOrCreateConcept's race handling —
    // so just fetch and return the winner's question instead of failing
    // the whole request or leaving a duplicate, unanswerable question
    // sitting in the table.
    if (insertError.code === "23505") {
      const { data: raceWinner, error: raceError } = await supabase
        .from("quiz_questions")
        .select("id, question_type, difficulty, prompt, options, order_index")
        .eq("quiz_attempt_id", quizAttemptId)
        .is("answered_at", null)
        .order("order_index", { ascending: true })
        .limit(1)
        .single();
      if (!raceError && raceWinner) return raceWinner;
    }
    throw insertError;
  }

  // Deliberately NOT returning correct_option_id — the client answering
  // this question should never receive the answer up front.
  return inserted;
}
