import { createClient } from "@/lib/supabase/server";

// PRD §58-59: Admin Users list + User Detail. Same RLS-via-is_admin()
// reasoning as overview.ts — no service-role client needed, an admin
// session already sees every user's rows.

export type AdminUserSummary = {
  id: string;
  email: string;
  registeredAt: string;
  lastActiveAt: string | null;
  spaceCount: number;
  projectCount: number;
  activityCount: number;
  overallProgress: number | null; // average mastery_level across all their concepts
};

/**
 * Lists every user with per-user aggregates. Deliberately fetches each
 * aggregate table in full (spaces, projects, activity_events, concept_mastery)
 * and groups by owner_id in JS rather than either (a) N+1 querying per user,
 * or (b) standing up a dedicated SQL view — fine at the number of users a
 * prototype/demo actually has; **this is the first place in the app where
 * "every row across every user" is fetched at once rather than RLS-scoped
 * to one owner, so it's the one query pattern in this codebase that
 * wouldn't scale past a few hundred users without moving to a real SQL
 * aggregation (a view or a Postgres function), unlike everything else here.**
 */
export async function listUsersForAdmin(): Promise<AdminUserSummary[]> {
  const supabase = await createClient();

  const [profilesResult, spacesResult, projectsResult, eventsResult, masteryResult] =
    await Promise.all([
      supabase.from("profiles").select("id, email, created_at").order("created_at", { ascending: false }),
      supabase.from("spaces").select("owner_id"),
      supabase.from("projects").select("owner_id"),
      supabase.from("activity_events").select("owner_id, created_at"),
      supabase.from("concept_mastery").select("owner_id, mastery_level"),
    ]);

  if (profilesResult.error) throw profilesResult.error;
  if (spacesResult.error) throw spacesResult.error;
  if (projectsResult.error) throw projectsResult.error;
  if (eventsResult.error) throw eventsResult.error;
  if (masteryResult.error) throw masteryResult.error;

  const spaceCounts = countByOwner(spacesResult.data ?? []);
  const projectCounts = countByOwner(projectsResult.data ?? []);

  const activityCounts = new Map<string, number>();
  const lastActive = new Map<string, string>();
  for (const e of eventsResult.data ?? []) {
    activityCounts.set(e.owner_id, (activityCounts.get(e.owner_id) ?? 0) + 1);
    const current = lastActive.get(e.owner_id);
    if (!current || e.created_at > current) lastActive.set(e.owner_id, e.created_at);
  }

  const masteryByOwner = new Map<string, { sum: number; count: number }>();
  for (const m of masteryResult.data ?? []) {
    const bucket = masteryByOwner.get(m.owner_id) ?? { sum: 0, count: 0 };
    bucket.sum += m.mastery_level;
    bucket.count += 1;
    masteryByOwner.set(m.owner_id, bucket);
  }

  return (profilesResult.data ?? []).map((p) => {
    const mastery = masteryByOwner.get(p.id);
    return {
      id: p.id,
      email: p.email,
      registeredAt: p.created_at,
      lastActiveAt: lastActive.get(p.id) ?? null,
      spaceCount: spaceCounts.get(p.id) ?? 0,
      projectCount: projectCounts.get(p.id) ?? 0,
      activityCount: activityCounts.get(p.id) ?? 0,
      overallProgress: mastery ? Math.round(mastery.sum / mastery.count) : null,
    };
  });
}

function countByOwner(rows: { owner_id: string }[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const r of rows) counts.set(r.owner_id, (counts.get(r.owner_id) ?? 0) + 1);
  return counts;
}

export type AdminActivityItem = {
  id: string;
  eventType: string;
  projectName: string | null;
  createdAt: string;
};

export type AdminUserDetail = {
  id: string;
  email: string;
  registeredAt: string;
  spaces: { id: string; name: string }[];
  projects: { id: string; name: string; spaceName: string }[];
  overallProgress: number | null;
  assessmentAccuracy: number | null;
  quizQuestionsAnswered: number;
  tutorConversations: number;
  tutorQuestionsAsked: number;
  activityTimeline: AdminActivityItem[];
};

/** Full detail for one user — PRD §59's User Overview / Learning Overview / Activity Timeline / Usage. */
export async function getUserDetailForAdmin(userId: string): Promise<AdminUserDetail | null> {
  const supabase = await createClient();

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, email, created_at")
    .eq("id", userId)
    .maybeSingle();
  if (profileError) throw profileError;
  if (!profile) return null;

  const [
    spacesResult,
    projectsResult,
    masteryResult,
    quizQuestionsResult,
    conversationsResult,
    tutorEventsResult,
    timelineResult,
  ] = await Promise.all([
    supabase.from("spaces").select("id, name").eq("owner_id", userId),
    supabase.from("projects").select("id, name, space_id, spaces(name)").eq("owner_id", userId),
    supabase.from("concept_mastery").select("mastery_level").eq("owner_id", userId),
    supabase
      .from("quiz_questions")
      .select("is_correct, score_percent, answered_at")
      .eq("owner_id", userId)
      .not("answered_at", "is", null),
    supabase.from("conversations").select("id", { count: "exact", head: true }).eq("owner_id", userId),
    supabase
      .from("activity_events")
      .select("event_type", { count: "exact" })
      .eq("owner_id", userId)
      .eq("event_type", "tutor_question_asked"),
    supabase
      .from("activity_events")
      .select("id, event_type, created_at, projects(name)")
      .eq("owner_id", userId)
      .order("created_at", { ascending: false })
      .limit(30),
  ]);

  if (spacesResult.error) throw spacesResult.error;
  if (projectsResult.error) throw projectsResult.error;
  if (masteryResult.error) throw masteryResult.error;
  if (quizQuestionsResult.error) throw quizQuestionsResult.error;
  if (conversationsResult.error) throw conversationsResult.error;
  if (tutorEventsResult.error) throw tutorEventsResult.error;
  if (timelineResult.error) throw timelineResult.error;

  const masteryRows = masteryResult.data ?? [];
  const overallProgress =
    masteryRows.length === 0
      ? null
      : Math.round(masteryRows.reduce((sum, r) => sum + r.mastery_level, 0) / masteryRows.length);

  const answered = quizQuestionsResult.data ?? [];
  const assessmentAccuracy =
    answered.length === 0
      ? null
      : Math.round(
          answered.reduce((sum, q) => sum + (q.score_percent ?? (q.is_correct ? 100 : 0)), 0) /
            answered.length
        );

  type ProjectRow = { id: string; name: string; spaces: { name: string } | null };
  const projects = ((projectsResult.data ?? []) as unknown as ProjectRow[]).map((p) => ({
    id: p.id,
    name: p.name,
    spaceName: p.spaces?.name ?? "",
  }));

  type TimelineRow = {
    id: string;
    event_type: string;
    created_at: string;
    projects: { name: string } | null;
  };
  const activityTimeline: AdminActivityItem[] = (
    (timelineResult.data ?? []) as unknown as TimelineRow[]
  ).map((e) => ({
    id: e.id,
    eventType: e.event_type,
    projectName: e.projects?.name ?? null,
    createdAt: e.created_at,
  }));

  return {
    id: profile.id,
    email: profile.email,
    registeredAt: profile.created_at,
    spaces: spacesResult.data ?? [],
    projects,
    overallProgress,
    assessmentAccuracy,
    quizQuestionsAnswered: answered.length,
    tutorConversations: conversationsResult.count ?? 0,
    tutorQuestionsAsked: tutorEventsResult.count ?? 0,
    activityTimeline,
  };
}
