import { createClient } from "@/lib/supabase/server";

// PRD §57: Admin Overview — platform-wide snapshot. Unlike every other
// analytics module in this app (Project/Global Analytics, Home), this one
// deliberately does NOT rely on RLS's select-own-rows scoping to limit
// results — it needs the opposite: every user's data, not just the
// caller's. That's already possible with the plain user-scoped client
// (`createClient()`, cookie-based) rather than the service-role admin
// client, because every relevant table's SELECT policy already has an
// `or public.is_admin()` clause (Step 2's migration) — an admin session
// already sees every row through RLS itself. Reaching for the service-role
// client here would bypass RLS entirely and be a strictly bigger blast
// radius for no benefit: if `requireAdmin()` (Step 26) ever had a bug, RLS
// is a second independent gate behind it. This only works because the
// caller has already been through `requireAdmin()` — never call this from
// a non-admin-gated code path.
//
// **Known gap, deliberately not faked**: PRD §57 also asks for "AI usage,"
// "system performance," "background job health," and "AI error rate."
// Real AI cost/latency/error data lives in Langfuse (Step 9's tracing) and
// isn't queryable from this app yet — that's Step 29's job (Admin AI
// Usage & Evaluation, "pulls from Langfuse" per this file's own Step 27
// planning note). Background job health (Inngest run states) is Step 30's.
// Rather than approximate those with activity_event counts and call it
// done, the Overview page below only shows what's genuinely measurable
// today and labels the rest "Coming in Step 29/30" — consistent with this
// project's rule of never fabricating numbers for a section that isn't
// really wired up yet.

export type AdminOverview = {
  totalUsers: number;
  activeUsers7d: number; // distinct owner_id with an activity_event in the last 7 days
  totalSpaces: number;
  totalProjects: number;
  materialsUploaded: number;
  materialsFailed: number;
  tutorConversations: number;
  tutorQuestionsAsked: number;
  quizQuestionsAnswered: number;
  totalActivityEvents: number;
};

export async function getAdminOverview(): Promise<AdminOverview> {
  const supabase = await createClient();

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const [
    usersResult,
    spacesResult,
    projectsResult,
    materialsResult,
    materialsFailedResult,
    conversationsResult,
    eventsResult,
    recentEventsResult,
  ] = await Promise.all([
    supabase.from("profiles").select("id", { count: "exact", head: true }),
    supabase.from("spaces").select("id", { count: "exact", head: true }),
    supabase.from("projects").select("id", { count: "exact", head: true }),
    supabase.from("materials").select("id", { count: "exact", head: true }),
    supabase
      .from("materials")
      .select("id", { count: "exact", head: true })
      .eq("status", "failed"),
    supabase.from("conversations").select("id", { count: "exact", head: true }),
    supabase.from("activity_events").select("event_type", { count: "exact" }),
    supabase
      .from("activity_events")
      .select("owner_id")
      .gte("created_at", sevenDaysAgo),
  ]);

  if (usersResult.error) throw usersResult.error;
  if (spacesResult.error) throw spacesResult.error;
  if (projectsResult.error) throw projectsResult.error;
  if (materialsResult.error) throw materialsResult.error;
  if (materialsFailedResult.error) throw materialsFailedResult.error;
  if (conversationsResult.error) throw conversationsResult.error;
  if (eventsResult.error) throw eventsResult.error;
  if (recentEventsResult.error) throw recentEventsResult.error;

  const events = eventsResult.data ?? [];
  const tutorQuestionsAsked = events.filter(
    (e) => e.event_type === "tutor_question_asked"
  ).length;
  const quizQuestionsAnswered = events.filter(
    (e) => e.event_type === "quiz_question_answered"
  ).length;

  const activeUsers7d = new Set((recentEventsResult.data ?? []).map((e) => e.owner_id)).size;

  return {
    totalUsers: usersResult.count ?? 0,
    activeUsers7d,
    totalSpaces: spacesResult.count ?? 0,
    totalProjects: projectsResult.count ?? 0,
    materialsUploaded: materialsResult.count ?? 0,
    materialsFailed: materialsFailedResult.count ?? 0,
    tutorConversations: conversationsResult.count ?? 0,
    tutorQuestionsAsked,
    quizQuestionsAnswered,
    totalActivityEvents: eventsResult.count ?? 0,
  };
}
