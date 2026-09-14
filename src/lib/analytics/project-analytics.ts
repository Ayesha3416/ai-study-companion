import { createClient } from "@/lib/supabase/server";
import { getGrowthAnalysis, type ConceptGrowth } from "@/lib/mastery/growth";
import { averageByDay, MASTERY_THRESHOLDS, type DailyPoint } from "./shared";

// PRD §34: Project Analytics — Activity / Performance / Growth / AI Activity
// for a single project. Everything here reads from tables that already
// exist (activity_events from Step 20, quiz_questions from Step 16-18,
// concept_mastery/mastery_history from Step 15/19, recommendations from
// Step 22) — this module is purely aggregation, no new writes.

export type { DailyPoint };

export type ProjectAnalytics = {
  activity: {
    learningSessions: number;
    tutorQuestions: number;
    quizAttempts: number;
    questionsAnswered: number;
    materialInteractions: number;
  };
  performance: {
    quizAccuracy: number | null; // null = no answered questions yet
    averageMastery: number | null; // null = no concepts tracked yet
    conceptsMastered: number; // mastery_level >= 70
    conceptsRequiringAttention: number; // mastery_level < 40
    totalConcepts: number;
  };
  growth: {
    concepts: ConceptGrowth[];
    masteryOverTime: DailyPoint[]; // avg mastery_level per day, across all concepts
    accuracyOverTime: DailyPoint[]; // quiz accuracy % per day
  };
  aiActivity: {
    tutorInteractions: number;
    aiGeneratedQuestions: number; // every quiz_questions row is AI-generated (PRD §24)
    aiEvaluations: number; // graded open-ended answers
    recommendationsGenerated: number;
  };
};

// Groups timestamped rows into UTC-day buckets and averages a numeric field
// per day — now lives in ./shared.ts so Global Analytics (Step 24) can
// reuse the exact same bucketing logic instead of duplicating it.

export async function getProjectAnalytics(
  projectId: string
): Promise<ProjectAnalytics> {
  const supabase = await createClient();

  const [
    eventsResult,
    quizQuestionsResult,
    masteryResult,
    masteryHistoryResult,
    recommendationsResult,
    growth,
  ] = await Promise.all([
    supabase
      .from("activity_events")
      .select("event_type")
      .eq("project_id", projectId),
    supabase
      .from("quiz_questions")
      .select("question_type, is_correct, score_percent, answered_at, created_at")
      .eq("project_id", projectId),
    supabase
      .from("concept_mastery")
      .select("mastery_level")
      .eq("project_id", projectId),
    supabase
      .from("mastery_history")
      .select("mastery_level, recorded_at")
      .eq("project_id", projectId),
    supabase
      .from("recommendations")
      .select("id", { count: "exact", head: true })
      .eq("project_id", projectId),
    getGrowthAnalysis(projectId),
  ]);

  if (eventsResult.error) throw eventsResult.error;
  if (quizQuestionsResult.error) throw quizQuestionsResult.error;
  if (masteryResult.error) throw masteryResult.error;
  if (masteryHistoryResult.error) throw masteryHistoryResult.error;
  if (recommendationsResult.error) throw recommendationsResult.error;

  const eventCounts = new Map<string, number>();
  for (const { event_type } of eventsResult.data ?? []) {
    eventCounts.set(event_type, (eventCounts.get(event_type) ?? 0) + 1);
  }
  const countOf = (type: string) => eventCounts.get(type) ?? 0;

  const answeredQuestions = (quizQuestionsResult.data ?? []).filter(
    (q) => q.answered_at !== null
  );
  const openEndedGraded = answeredQuestions.filter(
    (q) => q.question_type === "open_ended"
  );

  const quizAccuracy =
    answeredQuestions.length === 0
      ? null
      : Math.round(
          answeredQuestions.reduce(
            (sum, q) => sum + (q.score_percent ?? (q.is_correct ? 100 : 0)),
            0
          ) / answeredQuestions.length
        );

  const masteryRows = masteryResult.data ?? [];
  const averageMastery =
    masteryRows.length === 0
      ? null
      : Math.round(
          masteryRows.reduce((sum, r) => sum + r.mastery_level, 0) /
            masteryRows.length
        );

  const masteryOverTime = averageByDay(
    (masteryHistoryResult.data ?? []).map((r) => ({
      created_at: r.recorded_at,
      value: r.mastery_level,
    }))
  );

  const accuracyOverTime = averageByDay(
    answeredQuestions.map((q) => ({
      created_at: q.created_at,
      value: q.score_percent ?? (q.is_correct ? 100 : 0),
    }))
  );

  return {
    activity: {
      learningSessions: countOf("project_accessed"),
      tutorQuestions: countOf("tutor_question_asked"),
      quizAttempts: countOf("quiz_started"),
      questionsAnswered: countOf("quiz_question_answered"),
      materialInteractions:
        countOf("material_uploaded") + countOf("material_processing_completed"),
    },
    performance: {
      quizAccuracy,
      averageMastery,
      conceptsMastered: masteryRows.filter((r) => r.mastery_level >= MASTERY_THRESHOLDS.mastered)
        .length,
      conceptsRequiringAttention: masteryRows.filter(
        (r) => r.mastery_level < MASTERY_THRESHOLDS.needsAttention
      ).length,
      totalConcepts: masteryRows.length,
    },
    growth: {
      concepts: growth,
      masteryOverTime,
      accuracyOverTime,
    },
    aiActivity: {
      tutorInteractions: countOf("tutor_question_asked"),
      aiGeneratedQuestions: quizQuestionsResult.data?.length ?? 0,
      aiEvaluations: openEndedGraded.length,
      recommendationsGenerated: recommendationsResult.count ?? 0,
    },
  };
}
