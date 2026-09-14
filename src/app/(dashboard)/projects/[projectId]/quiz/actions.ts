"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { generateNextQuizQuestion } from "@/lib/ai/quiz";
import { gradeOpenEndedAnswer } from "@/lib/ai/grading";
import { recordMasteryEvidence } from "@/lib/mastery/mastery";
import { recordActivityEvent } from "@/lib/activity/events";

export async function startQuizAttempt(projectId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data, error } = await supabase
    .from("quiz_attempts")
    .insert({ project_id: projectId, owner_id: user.id })
    .select("id")
    .single();
  if (error) throw error;

  await recordActivityEvent({
    ownerId: user.id,
    eventType: "quiz_started",
    projectId,
    metadata: { quizAttemptId: data.id },
  });

  redirect(`/projects/${projectId}/quiz/${data.id}`);
}

/**
 * Returns the current unanswered question for this attempt, generating a
 * fresh one if none exists yet. Making this idempotent (rather than
 * generating exactly once at quiz-start) means refreshing the page never
 * loses your place or duplicates a question.
 */
export async function getCurrentQuestion(projectId: string, quizAttemptId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data: unanswered, error: fetchError } = await supabase
    .from("quiz_questions")
    .select("id, question_type, difficulty, prompt, options, order_index")
    .eq("quiz_attempt_id", quizAttemptId)
    .is("answered_at", null)
    .order("order_index", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (fetchError) throw fetchError;

  if (unanswered) return unanswered;

  return generateNextQuizQuestion({
    projectId,
    ownerId: user.id,
    quizAttemptId,
  });
}

export type SubmitAnswerResult =
  | {
      // Multiple-choice: we know correctness immediately.
      questionType: "multiple_choice";
      isCorrect: boolean;
      correctOptionId: string;
    }
  | {
      // Open-ended: graded by AI right after submission (Step 18).
      questionType: "open_ended";
      isCorrect: boolean;
      scorePercent: number;
      feedback: string;
    }
  | { error: string };

export async function submitAnswer(
  questionId: string,
  answer: string
): Promise<SubmitAnswerResult> {
  if (!answer.trim()) return { error: "Answer cannot be empty" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { data: question, error: questionError } = await supabase
    .from("quiz_questions")
    .select("id, project_id, concept_id, question_type, correct_option_id")
    .eq("id", questionId)
    .single();
  if (questionError || !question) return { error: "Question not found" };

  if (question.question_type === "multiple_choice") {
    const isCorrect = answer === question.correct_option_id;

    // PRD §50 idempotency: a double-click (or a retried request after a
    // slow response) must not record mastery evidence twice for one
    // answer. `.is("answered_at", null)` makes this an atomic claim, not
    // a check-then-act — only whichever request reaches Postgres first
    // actually flips the row; a simultaneous second request affects zero
    // rows and falls into the branch below instead of reprocessing.
    const { data: claimed, error: updateError } = await supabase
      .from("quiz_questions")
      .update({
        user_answer: answer,
        is_correct: isCorrect,
        score_percent: isCorrect ? 100 : 0,
        answered_at: new Date().toISOString(),
      })
      .eq("id", questionId)
      .is("answered_at", null)
      .select("id")
      .maybeSingle();
    if (updateError) return { error: updateError.message };

    if (!claimed) {
      // Lost the race — someone (or something) already answered this
      // question first. Multiple-choice grading is instant and
      // synchronous, so by the time we're here the winning write has
      // already completed — safe to just read back and return its result
      // rather than erroring or reprocessing.
      const { data: existing } = await supabase
        .from("quiz_questions")
        .select("is_correct, correct_option_id")
        .eq("id", questionId)
        .single();
      return {
        questionType: "multiple_choice",
        isCorrect: existing?.is_correct ?? isCorrect,
        correctOptionId: question.correct_option_id!,
      };
    }

    // Mastery updates apply uniformly to both question types (Step 19) —
    // MC already knows its score the instant it's answered.
    await recordMasteryEvidence({
      conceptId: question.concept_id,
      projectId: question.project_id,
      ownerId: user.id,
      scorePercent: isCorrect ? 100 : 0,
      source: "quiz_answer",
    });

    await recordActivityEvent({
      ownerId: user.id,
      eventType: "quiz_question_answered",
      projectId: question.project_id,
      metadata: { questionId, questionType: "multiple_choice", isCorrect },
    });

    return {
      questionType: "multiple_choice",
      isCorrect,
      correctOptionId: question.correct_option_id!,
    };
  }

  // open_ended: same atomic-claim idempotency guard as multiple_choice
  // above, but the loser can't just read back the winner's result the way
  // MC's loser can — grading is an async AI call that takes 1-3 seconds,
  // so a near-simultaneous duplicate request will almost always reach this
  // point before the winner's grading has finished. Rather than build a
  // wait-and-poll mechanism for what's fundamentally a double-click edge
  // case, the loser gets an honest "already submitted" message instead of
  // a fabricated result — still correctly prevents the double
  // mastery-evidence write, which is the actual bug being guarded against.
  const { data: claimed, error: updateError } = await supabase
    .from("quiz_questions")
    .update({ user_answer: answer, answered_at: new Date().toISOString() })
    .eq("id", questionId)
    .is("answered_at", null)
    .select("id")
    .maybeSingle();
  if (updateError) return { error: updateError.message };

  if (!claimed) {
    return { error: "This question was already submitted — refresh to see your result." };
  }

  try {
    const graded = await gradeOpenEndedAnswer(questionId);

    await recordMasteryEvidence({
      conceptId: question.concept_id,
      projectId: question.project_id,
      ownerId: user.id,
      scorePercent: graded.scorePercent,
      source: "open_ended_assessment",
    });

    await recordActivityEvent({
      ownerId: user.id,
      eventType: "quiz_question_answered",
      projectId: question.project_id,
      metadata: { questionId, questionType: "open_ended", scorePercent: graded.scorePercent },
    });

    return {
      questionType: "open_ended",
      isCorrect: graded.isCorrect,
      scorePercent: graded.scorePercent,
      feedback: graded.feedback,
    };
  } catch (error) {
    // The answer is already saved even if grading itself fails — don't lose
    // the student's work over an AI hiccup (PRD §49: a failed AI step
    // shouldn't corrupt learning state). Mastery simply isn't updated for
    // this attempt if grading failed, which is correct — there's no score
    // to record evidence from.
    return {
      error: `Answer saved, but grading failed: ${error instanceof Error ? error.message : "unknown error"}`,
    };
  }
}

export async function finishQuiz(projectId: string, quizAttemptId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Same idempotency concern as submitAnswer: a double-click on "Finish
  // Quiz" (or a redirect that fires the action twice) shouldn't log
  // `quiz_completed` more than once — that's a duplicate analytics event
  // for one logical action (PRD §50 explicitly lists analytics events as
  // needing this). `.neq("status", "completed")` makes this an atomic
  // claim on the transition itself: only the request that actually moves
  // the attempt from in_progress → completed gets a non-null result back
  // and logs the event; a second call sees the attempt already completed
  // and just redirects, no duplicate write.
  const { data: transitioned, error } = await supabase
    .from("quiz_attempts")
    .update({ status: "completed", completed_at: new Date().toISOString() })
    .eq("id", quizAttemptId)
    .neq("status", "completed")
    .select("id")
    .maybeSingle();
  if (error) throw error;

  if (user && transitioned) {
    await recordActivityEvent({
      ownerId: user.id,
      eventType: "quiz_completed",
      projectId,
      metadata: { quizAttemptId },
    });
  }

  redirect(`/projects/${projectId}`);
}
