import { createClient } from "@/lib/supabase/server";
import { classifyTrend } from "@/lib/mastery/growth";
import { averageByDay, countByDay, distinctDayCount, type DailyPoint } from "./shared";

// PRD §35-36: Global User Analytics — the same shape of insight as Project
// Analytics (Step 23), but aggregated across ALL of a user's Spaces and
// Projects rather than scoped to one.
//
// **Bug fixed (found via a real admin account seeing another user's data
// here)**: every query below now explicitly filters `.eq("owner_id",
// user.id)`. This module's own comment used to claim RLS alone was enough
// ("the user-scoped Supabase client already only ever sees this user's own
// rows") — that's true for a non-admin, but every table's SELECT policy is
// `auth.uid() = owner_id OR is_admin()` (intentional, so the real Admin
// Dashboard can read across all users), so an admin session's queries here
// silently returned every user's rows. See home-dashboard.ts's matching
// fix and comment for the full explanation — same root cause, same fix.

export type GlobalAnalytics = {
  overallLearning: {
    totalActivityEvents: number;
    activeDays: number;
    spaceCount: number;
    projectCount: number;
  };
  performance: {
    overallMastery: number | null;
    averageAssessmentPerformance: number | null;
    conceptsImproving: number;
    conceptsNeedingAttention: number;
  };
  aiUsage: {
    tutorInteractions: number; // conversations started
    questionsAsked: number; // individual questions asked within those conversations
    quizActivity: number; // quiz questions answered, across all attempts
    aiGeneratedFeedback: number; // graded open-ended answers with feedback text
  };
  trends: {
    activityOverTime: DailyPoint[];
    masteryOverTime: DailyPoint[];
    assessmentPerformanceOverTime: DailyPoint[];
  };
};

export async function getGlobalAnalytics(): Promise<GlobalAnalytics> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const [
    spacesResult,
    projectsResult,
    eventsResult,
    masteryResult,
    masteryHistoryResult,
    quizQuestionsResult,
    conversationsResult,
  ] = await Promise.all([
    supabase.from("spaces").select("id", { count: "exact", head: true }).eq("owner_id", user.id),
    supabase.from("projects").select("id", { count: "exact", head: true }).eq("owner_id", user.id),
    supabase.from("activity_events").select("event_type, created_at").eq("owner_id", user.id),
    supabase.from("concept_mastery").select("concept_id, mastery_level").eq("owner_id", user.id),
    supabase.from("mastery_history").select("concept_id, mastery_level, recorded_at").eq("owner_id", user.id),
    supabase
      .from("quiz_questions")
      .select("question_type, is_correct, score_percent, feedback, answered_at, created_at")
      .eq("owner_id", user.id)
      .not("answered_at", "is", null),
    supabase.from("conversations").select("id", { count: "exact", head: true }).eq("owner_id", user.id),
  ]);

  if (spacesResult.error) throw spacesResult.error;
  if (projectsResult.error) throw projectsResult.error;
  if (eventsResult.error) throw eventsResult.error;
  if (masteryResult.error) throw masteryResult.error;
  if (masteryHistoryResult.error) throw masteryHistoryResult.error;
  if (quizQuestionsResult.error) throw quizQuestionsResult.error;
  if (conversationsResult.error) throw conversationsResult.error;

  const events = eventsResult.data ?? [];
  const eventCounts = new Map<string, number>();
  for (const { event_type } of events) {
    eventCounts.set(event_type, (eventCounts.get(event_type) ?? 0) + 1);
  }
  const countOf = (type: string) => eventCounts.get(type) ?? 0;

  const masteryRows = masteryResult.data ?? [];
  const overallMastery =
    masteryRows.length === 0
      ? null
      : Math.round(masteryRows.reduce((sum, r) => sum + r.mastery_level, 0) / masteryRows.length);

  // Same "first-ever vs. current" trend classification as per-project
  // Growth Analysis (Step 21), just run across every concept the user has
  // regardless of which project it belongs to.
  // **Same N+1 bug as per-project Growth Analysis (src/lib/mastery/
  // growth.ts), fixed the same way — and here it's not just a fix but a
  // straight-up removal of redundant work: `masteryHistoryResult` above
  // already fetched every one of this user's mastery_history rows in ONE
  // round trip (needed below for `masteryOverTime` regardless), it just
  // wasn't being reused here. Grouping that already-fetched data by
  // concept_id in JS, instead of firing one additional sequential query
  // per concept, means this loop now costs zero extra round trips rather
  // than one per concept in the user's ENTIRE account (worse than the
  // per-project version, since this runs across every project).
  const firstMasteryByConceptId = new Map<string, number>();
  for (const h of [...(masteryHistoryResult.data ?? [])].sort(
    (a, b) => new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime()
  )) {
    if (!firstMasteryByConceptId.has(h.concept_id)) {
      firstMasteryByConceptId.set(h.concept_id, h.mastery_level);
    }
  }

  let conceptsImproving = 0;
  let conceptsNeedingAttention = 0;
  for (const row of masteryRows) {
    const previousMastery = firstMasteryByConceptId.get(row.concept_id) ?? row.mastery_level;
    const trend = classifyTrend(previousMastery, row.mastery_level);
    if (trend === "improving") conceptsImproving++;
    if (trend === "needs_attention") conceptsNeedingAttention++;
  }

  const answeredQuestions = quizQuestionsResult.data ?? [];
  const averageAssessmentPerformance =
    answeredQuestions.length === 0
      ? null
      : Math.round(
          answeredQuestions.reduce(
            (sum, q) => sum + (q.score_percent ?? (q.is_correct ? 100 : 0)),
            0
          ) / answeredQuestions.length
        );

  const activityOverTime = countByDay(events.map((e) => e.created_at));
  const masteryOverTime = averageByDay(
    (masteryHistoryResult.data ?? []).map((r) => ({
      created_at: r.recorded_at,
      value: r.mastery_level,
    }))
  );
  const assessmentPerformanceOverTime = averageByDay(
    answeredQuestions.map((q) => ({
      created_at: q.created_at,
      value: q.score_percent ?? (q.is_correct ? 100 : 0),
    }))
  );

  return {
    overallLearning: {
      totalActivityEvents: events.length,
      activeDays: distinctDayCount(events.map((e) => e.created_at)),
      spaceCount: spacesResult.count ?? 0,
      projectCount: projectsResult.count ?? 0,
    },
    performance: {
      overallMastery,
      averageAssessmentPerformance,
      conceptsImproving,
      conceptsNeedingAttention,
    },
    aiUsage: {
      tutorInteractions: conversationsResult.count ?? 0,
      questionsAsked: countOf("tutor_question_asked"),
      quizActivity: countOf("quiz_question_answered"),
      aiGeneratedFeedback: answeredQuestions.filter(
        (q) => q.question_type === "open_ended" && q.feedback
      ).length,
    },
    trends: {
      activityOverTime,
      masteryOverTime,
      assessmentPerformanceOverTime,
    },
  };
}
