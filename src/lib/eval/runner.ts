import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateStructured } from "@/lib/ai/provider";
import { answerTutorQuestion } from "@/lib/ai/tutor";
import { QuizQuestionSchema } from "@/lib/ai/quiz";
import { GradingResultSchema } from "@/lib/ai/grading";
import { RecommendationSchema } from "@/lib/ai/recommendation";
import { buildQuizPrompt } from "@/lib/ai/prompts/quiz";
import { buildGradingPrompt } from "@/lib/ai/prompts/grading";
import { buildRecommendationPrompt } from "@/lib/ai/prompts/recommendation";
import { listConcepts } from "@/lib/mastery/concepts";
import type { RetrievedChunk } from "@/lib/ai/retrieval";

// Step 32: Basic AI Evaluation Harness (PRD §46-47).
//
// **Scoping decision, documented per PRD §81**: this uses rule-based/
// structural checks (schema validity, discrimination between a good and
// bad answer, whether a recommendation actually references the data it
// was given) rather than a second AI model judging the first one's output.
// PRD §46 explicitly lists "Rule-based checks" as a valid evaluation
// method alongside model-based ones — adding an AI-judges-AI layer would
// roughly double this feature's AI cost and introduce its own reliability
// question ("how do we know the judge is right?") for a prototype-scale
// harness. Genuinely useful signal (did generation actually fail schema
// validation? does grading discriminate a real answer from a blank one?
// does a recommendation mention the concept its own input said was weak?)
// without that overhead.
//
// **Non-mutation guarantee, category by category**:
// - Quiz generation / Grading / Recommendation cases call `generateStructured`
//   directly with a synthetic, fixed context — NOT through
//   `generateNextQuizQuestion`/`gradeOpenEndedAnswer`/
//   `getOrGenerateRecommendation`, which persist to real `quiz_questions`/
//   `recommendations` rows tied to a real project. Running eval must never
//   overwrite a real user's actual quiz question, grade, or cached
//   recommendation — so these three categories are evaluated at the
//   prompt+schema level, against synthetic data, with zero DB writes to
//   production tables. Trade-off: this tests "does the prompt+schema
//   reliably produce valid, sensible structured output" rather than the
//   full retrieval-to-persistence pipeline for those three — acceptable,
//   since Quiz/Grading/Recommendation's *retrieval* step is exactly the
//   same `retrieveRelevantChunks` the Tutor cases below DO exercise
//   end-to-end.
// - Tutor cases are the exception: they call the real `answerTutorQuestion`
//   against a real project (to genuinely exercise retrieval + groundedness
//   + citation-building end to end, which can't be meaningfully faked with
//   synthetic chunks the way schema checks can). This does create a real
//   `conversations` row — mitigated by titling it clearly and deleting it
//   in a `finally` block regardless of pass/fail, so no eval artifact is
//   left in the admin's real Tutor conversation list. One real imprecision
//   accepted here: `answerTutorQuestion` hardcodes `feature: "tutor_response"`
//   internally (not parameterized), so these 1-2 calls per run DO mix into
//   the real "tutor_response" AI Usage numbers, unlike the other three
//   categories below which use "eval_"-prefixed feature names specifically
//   to keep eval traffic out of production usage stats. Not worth changing
//   tutor.ts's signature just for this.

export type EvalCategory = "tutor" | "quiz_generation" | "grading" | "recommendation";
export type EvalStatus = "pass" | "fail" | "skipped";

export type EvalCaseResult = {
  id: string;
  category: EvalCategory;
  name: string;
  status: EvalStatus;
  detail: string;
  latencyMs: number;
};

export type EvalRunSummary = {
  id: string;
  projectId: string | null;
  startedAt: string;
  finishedAt: string;
  totalCount: number;
  passCount: number;
  failCount: number;
  skippedCount: number;
  results: EvalCaseResult[];
};

// Fixed synthetic study material — used for every Quiz Generation / Grading
// case so those categories never depend on which real project (if any)
// exists, and can run identically every time (a precondition for PRD §47's
// "compare against previous result" to mean anything).
const SYNTHETIC_CHUNKS: RetrievedChunk[] = [
  {
    id: "eval-chunk-1",
    materialId: "eval-material",
    fileName: "eval-sample.pdf",
    pageNumber: 1,
    similarity: 1,
    content:
      "Photosynthesis is the process by which plants convert light energy into chemical " +
      "energy. It occurs in the chloroplasts, primarily using the green pigment chlorophyll. " +
      "The overall reaction combines carbon dioxide and water, using light energy, to " +
      "produce glucose and oxygen. This process is the foundation of most food chains on Earth.",
  },
];

async function timed<T>(fn: () => Promise<T>): Promise<{ result: T; latencyMs: number }> {
  const start = Date.now();
  const result = await fn();
  return { result, latencyMs: Date.now() - start };
}

async function runQuizGenerationCases(): Promise<EvalCaseResult[]> {
  const results: EvalCaseResult[] = [];

  try {
    const { prompt, system } = buildQuizPrompt({
      chunks: SYNTHETIC_CHUNKS,
      existingConcepts: [],
      recentQuestionPrompts: [],
      difficulty: "medium",
      questionType: "multiple_choice",
    });
    const { result: q, latencyMs } = await timed(() =>
      generateStructured({
        feature: "eval_quiz_generation",
        system,
        prompt,
        schema: QuizQuestionSchema,
      })
    );
    const optionsOk = q.options?.length === 4;
    const correctIdOk = !!q.correctOptionId && (q.options ?? []).some((o) => o.id === q.correctOptionId);
    results.push({
      id: "quiz_schema_multiple_choice",
      category: "quiz_generation",
      name: "Multiple-choice question has 4 options + a valid correct answer",
      status: optionsOk && correctIdOk ? "pass" : "fail",
      detail: optionsOk && correctIdOk
        ? `Generated "${q.prompt.slice(0, 60)}..." with ${q.options?.length} options.`
        : `options.length=${q.options?.length ?? 0}, correctOptionId=${q.correctOptionId ?? "null"} (must match one option id).`,
      latencyMs,
    });
  } catch (error) {
    results.push({
      id: "quiz_schema_multiple_choice",
      category: "quiz_generation",
      name: "Multiple-choice question has 4 options + a valid correct answer",
      status: "fail",
      detail: `Threw: ${error instanceof Error ? error.message : String(error)}`,
      latencyMs: 0,
    });
  }

  try {
    const { prompt, system } = buildQuizPrompt({
      chunks: SYNTHETIC_CHUNKS,
      existingConcepts: [],
      recentQuestionPrompts: [],
      difficulty: "medium",
      questionType: "open_ended",
    });
    const { result: q, latencyMs } = await timed(() =>
      generateStructured({
        feature: "eval_quiz_generation",
        system,
        prompt,
        schema: QuizQuestionSchema,
      })
    );
    const noOptionsOk = !q.options || q.options.length === 0;
    const promptOk = q.prompt.trim().length > 0;
    results.push({
      id: "quiz_schema_open_ended",
      category: "quiz_generation",
      name: "Open-ended question omits multiple-choice options",
      status: noOptionsOk && promptOk ? "pass" : "fail",
      detail: noOptionsOk && promptOk
        ? `Generated "${q.prompt.slice(0, 60)}..." with no options, as expected.`
        : `options=${JSON.stringify(q.options)} (expected empty/null for open_ended).`,
      latencyMs,
    });
  } catch (error) {
    results.push({
      id: "quiz_schema_open_ended",
      category: "quiz_generation",
      name: "Open-ended question omits multiple-choice options",
      status: "fail",
      detail: `Threw: ${error instanceof Error ? error.message : String(error)}`,
      latencyMs: 0,
    });
  }

  return results;
}

async function runGradingCases(): Promise<EvalCaseResult[]> {
  const question = "Explain how photosynthesis converts light energy into a usable form for the plant.";
  const strongAnswer =
    "Plants use chlorophyll in their chloroplasts to absorb light energy, then use that energy " +
    "to combine carbon dioxide and water into glucose, releasing oxygen as a byproduct. The glucose " +
    "stores the converted energy chemically for the plant to use later.";
  const weakAnswer = "idk plants make food from the sun somehow";

  try {
    const strongPrompt = buildGradingPrompt(SYNTHETIC_CHUNKS, question, strongAnswer);
    const weakPrompt = buildGradingPrompt(SYNTHETIC_CHUNKS, question, weakAnswer);

    const start = Date.now();
    const [strong, weak] = await Promise.all([
      generateStructured({
        feature: "eval_open_ended_grading",
        system: strongPrompt.system,
        prompt: strongPrompt.prompt,
        schema: GradingResultSchema,
      }),
      generateStructured({
        feature: "eval_open_ended_grading",
        system: weakPrompt.system,
        prompt: weakPrompt.prompt,
        schema: GradingResultSchema,
      }),
    ]);
    const latencyMs = Date.now() - start;

    // The real check that matters here: does grading actually discriminate
    // a substantive, accurate answer from a near-empty non-answer, rather
    // than clustering every answer around the same score regardless of
    // quality?
    const discriminates = strong.scorePercent - weak.scorePercent >= 30;
    return [
      {
        id: "grading_discriminates_quality",
        category: "grading",
        name: "Grading scores a substantive answer meaningfully higher than a non-answer",
        status: discriminates ? "pass" : "fail",
        detail: `Strong answer: ${strong.scorePercent}%. Weak answer: ${weak.scorePercent}%. ${
          discriminates ? "Gap ≥ 30 points, as expected." : "Gap under 30 points — grading may not be discriminating well."
        }`,
        latencyMs,
      },
      {
        id: "grading_feedback_present",
        category: "grading",
        name: "Both gradings return non-empty feedback text",
        status: strong.feedback.trim().length > 0 && weak.feedback.trim().length > 0 ? "pass" : "fail",
        detail: `Strong feedback length=${strong.feedback.length}, weak feedback length=${weak.feedback.length}.`,
        latencyMs: 0,
      },
    ];
  } catch (error) {
    return [
      {
        id: "grading_discriminates_quality",
        category: "grading",
        name: "Grading scores a substantive answer meaningfully higher than a non-answer",
        status: "fail",
        detail: `Threw: ${error instanceof Error ? error.message : String(error)}`,
        latencyMs: 0,
      },
    ];
  }
}

async function runRecommendationCases(): Promise<EvalCaseResult[]> {
  const weakConceptName = "Recursion";
  try {
    const { system, prompt } = buildRecommendationPrompt({
      growth: [
        {
          conceptId: "eval-weak",
          conceptName: weakConceptName,
          previousMastery: 80,
          currentMastery: 35,
          evidenceCount: 5,
          trend: "needs_attention",
        },
        {
          conceptId: "eval-strong",
          conceptName: "Loops",
          previousMastery: 60,
          currentMastery: 85,
          evidenceCount: 5,
          trend: "improving",
        },
      ],
      learningGoal: "Get comfortable with core programming concepts",
      previousRecommendation: null,
    });
    const { result: rec, latencyMs } = await timed(() =>
      generateStructured({
        feature: "eval_recommendation_generation",
        system,
        prompt,
        schema: RecommendationSchema,
      })
    );
    const mentionsWeak = rec.message.toLowerCase().includes(weakConceptName.toLowerCase());
    return [
      {
        id: "recommendation_mentions_weak_concept",
        category: "recommendation",
        name: "Recommendation references the concept its input data flagged as weak",
        status: mentionsWeak ? "pass" : "fail",
        detail: mentionsWeak
          ? `Message mentions "${weakConceptName}": "${rec.message.slice(0, 100)}..."`
          : `Message did not mention "${weakConceptName}": "${rec.message.slice(0, 100)}..."`,
        latencyMs,
      },
    ];
  } catch (error) {
    return [
      {
        id: "recommendation_mentions_weak_concept",
        category: "recommendation",
        name: "Recommendation references the concept its input data flagged as weak",
        status: "fail",
        detail: `Threw: ${error instanceof Error ? error.message : String(error)}`,
        latencyMs: 0,
      },
    ];
  }
}

/**
 * Picks a real project to run the Tutor cases against: needs at least one
 * concept (so a "grounded question" case has something real to ask about)
 * and belongs to the admin triggering the run. Returns null if nothing
 * eligible exists — the Tutor cases are then marked "skipped", never
 * "failed", since an empty account isn't a Tutor pipeline problem.
 */
async function findEvalProject(
  adminUserId: string
): Promise<{ id: string; conceptName: string } | null> {
  const supabase = await createClient();
  const { data: projects, error } = await supabase
    .from("projects")
    .select("id")
    .eq("owner_id", adminUserId)
    .limit(20);
  if (error) throw error;

  for (const p of projects ?? []) {
    const concepts = await listConcepts(p.id);
    if (concepts.length > 0) {
      return { id: p.id, conceptName: concepts[0].name };
    }
  }
  return null;
}

async function runTutorCases(adminUserId: string): Promise<{
  results: EvalCaseResult[];
  projectId: string | null;
}> {
  const project = await findEvalProject(adminUserId);
  if (!project) {
    return {
      projectId: null,
      results: [
        {
          id: "tutor_unsupported",
          category: "tutor",
          name: "Tutor declines an off-topic question rather than guessing",
          status: "skipped",
          detail: "No project with at least one concept found for this admin account — nothing real to test the Tutor against.",
          latencyMs: 0,
        },
        {
          id: "tutor_grounded",
          category: "tutor",
          name: "Tutor answers a real question with a citation",
          status: "skipped",
          detail: "Same reason as above.",
          latencyMs: 0,
        },
      ],
    };
  }

  const supabase = await createClient();
  const { data: conversation, error: convError } = await supabase
    .from("conversations")
    .insert({ project_id: project.id, owner_id: adminUserId, title: "Eval Run (temporary — auto-deleted)" })
    .select("id")
    .single();
  if (convError || !conversation) {
    return {
      projectId: project.id,
      results: [
        {
          id: "tutor_unsupported",
          category: "tutor",
          name: "Tutor declines an off-topic question rather than guessing",
          status: "fail",
          detail: `Couldn't create a temporary eval conversation: ${convError?.message}`,
          latencyMs: 0,
        },
      ],
    };
  }

  const results: EvalCaseResult[] = [];
  try {
    const { result: unsupported, latencyMs: l1 } = await timed(() =>
      answerTutorQuestion({
        projectId: project.id,
        conversationId: conversation.id,
        question: "What is the exact population of the fictional city of Zorblatt-9 on Jupiter's moon Europa?",
        userId: adminUserId,
      })
    );
    results.push({
      id: "tutor_unsupported",
      category: "tutor",
      name: "Tutor declines an off-topic question rather than guessing",
      status: unsupported.isUnsupported && unsupported.citations.length === 0 ? "pass" : "fail",
      detail: `isUnsupported=${unsupported.isUnsupported}, citations=${unsupported.citations.length}.`,
      latencyMs: l1,
    });

    const { result: grounded, latencyMs: l2 } = await timed(() =>
      answerTutorQuestion({
        projectId: project.id,
        conversationId: conversation.id,
        question: `What is ${project.conceptName}? Explain briefly.`,
        userId: adminUserId,
      })
    );
    results.push({
      id: "tutor_grounded",
      category: "tutor",
      name: "Tutor answers a real question with a citation",
      status: !grounded.isUnsupported && grounded.citations.length > 0 ? "pass" : "fail",
      detail: `isUnsupported=${grounded.isUnsupported}, citations=${grounded.citations.length}.`,
      latencyMs: l2,
    });
  } catch (error) {
    results.push({
      id: "tutor_unsupported",
      category: "tutor",
      name: "Tutor cases",
      status: "fail",
      detail: `Threw: ${error instanceof Error ? error.message : String(error)}`,
      latencyMs: 0,
    });
  } finally {
    // Always clean up the temporary conversation, pass or fail, so no eval
    // artifact lingers in the admin's real Tutor conversation list.
    // Messages cascade-delete with it.
    await supabase.from("conversations").delete().eq("id", conversation.id);
  }

  return { projectId: project.id, results };
}

export async function runEvaluation(adminUserId: string): Promise<EvalRunSummary> {
  const startedAt = new Date().toISOString();

  const [tutor, quizGeneration, grading, recommendation] = await Promise.all([
    runTutorCases(adminUserId),
    runQuizGenerationCases(),
    runGradingCases(),
    runRecommendationCases(),
  ]);

  const results = [...tutor.results, ...quizGeneration, ...grading, ...recommendation];
  const finishedAt = new Date().toISOString();
  const passCount = results.filter((r) => r.status === "pass").length;
  const failCount = results.filter((r) => r.status === "fail").length;
  const skippedCount = results.filter((r) => r.status === "skipped").length;

  const admin = createAdminClient();
  const { data: run, error } = await admin
    .from("eval_runs")
    .insert({
      triggered_by: adminUserId,
      project_id: tutor.projectId,
      started_at: startedAt,
      finished_at: finishedAt,
      total_count: results.length,
      pass_count: passCount,
      fail_count: failCount,
      skipped_count: skippedCount,
      results,
    })
    .select("id")
    .single();
  if (error) throw error;

  return {
    id: run.id,
    projectId: tutor.projectId,
    startedAt,
    finishedAt,
    totalCount: results.length,
    passCount,
    failCount,
    skippedCount,
    results,
  };
}

export async function listEvalRuns(limit = 10): Promise<EvalRunSummary[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("eval_runs")
    .select("id, project_id, started_at, finished_at, total_count, pass_count, fail_count, skipped_count, results")
    .order("started_at", { ascending: false })
    .limit(limit);
  if (error) throw error;

  return (data ?? []).map((r) => ({
    id: r.id,
    projectId: r.project_id,
    startedAt: r.started_at,
    finishedAt: r.finished_at ?? r.started_at,
    totalCount: r.total_count,
    passCount: r.pass_count,
    failCount: r.fail_count,
    skippedCount: r.skipped_count,
    results: r.results as EvalCaseResult[],
  }));
}
