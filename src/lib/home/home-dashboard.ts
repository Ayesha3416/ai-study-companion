import { createClient } from "@/lib/supabase/server";
import { MASTERY_THRESHOLDS } from "@/lib/analytics/shared";
import type { ActivityEventType } from "@/lib/activity/events";

// PRD §54-55: Home Dashboard — Continue Learning, Recent Projects, Overall
// Progress, Areas to Improve, Recommended Next Step. All five pull from
// data that already exists (activity_events, concept_mastery,
// recommendations) — nothing new is written here, same "pure aggregation"
// shape as Project/Global Analytics (Steps 23-24).
//
// **Bug fixed (found via a real admin account showing another user's data
// on its own personal Home Dashboard)**: every query here now explicitly
// filters `.eq("owner_id", user.id)`, which is NOT redundant with RLS —
// every table's SELECT policy is `auth.uid() = owner_id OR is_admin()`
// (needed so the actual Admin Dashboard can read across all users), which
// means an admin session's queries silently return every user's rows
// whenever a query relies on RLS alone instead of filtering explicitly.
// That's correct and intentional for admin/*.ts, which deliberately wants
// that broad access — but this module renders a normal user's OWN
// dashboard, admin or not, so it must always scope to the current user
// explicitly rather than depending on RLS to do it.

export type ContinueLearningItem = {
  projectId: string;
  projectName: string;
  spaceName: string;
  href: string;
  activityLabel: string;
} | null;

export type RecentProject = {
  projectId: string;
  projectName: string;
  spaceName: string;
  lastActivityAt: string;
};

export type AreaToImprove = {
  conceptId: string;
  conceptName: string;
  projectId: string;
  projectName: string;
  masteryLevel: number;
};

export type RecommendedNextStep = {
  projectId: string;
  projectName: string;
  message: string;
} | null;

export type HomeDashboardData = {
  continueLearning: ContinueLearningItem;
  recentProjects: RecentProject[];
  overallProgress: {
    spaceCount: number;
    projectCount: number;
    overallMastery: number | null;
  };
  areasToImprove: AreaToImprove[];
  recommendedNextStep: RecommendedNextStep;
};

// Maps the event that was most recently recorded for a project into a
// human-readable "here's what you were doing" label + where to send the
// user back to — so "Continue Learning" resumes the actual activity
// (Tutor vs. Quiz vs. just the dashboard) rather than always landing on
// the generic Project Dashboard regardless of what they were last doing.
function describeActivity(
  eventType: ActivityEventType,
  projectId: string
): { href: string; label: string } {
  if (eventType === "tutor_conversation_started" || eventType === "tutor_question_asked") {
    return { href: `/projects/${projectId}/tutor`, label: "You were chatting with the Tutor" };
  }
  if (
    eventType === "quiz_started" ||
    eventType === "quiz_question_answered" ||
    eventType === "quiz_completed"
  ) {
    return { href: `/projects/${projectId}/quiz`, label: "You were taking a quiz" };
  }
  if (eventType === "material_uploaded" || eventType.startsWith("material_processing")) {
    return { href: `/projects/${projectId}`, label: "You uploaded new material" };
  }
  return { href: `/projects/${projectId}`, label: "You were working here" };
}

export async function getHomeDashboardData(): Promise<HomeDashboardData> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const [
    spacesResult,
    projectsResult,
    masteryResult,
    recentEventsResult,
    weakConceptsResult,
    latestRecommendationResult,
  ] = await Promise.all([
    supabase.from("spaces").select("id", { count: "exact", head: true }).eq("owner_id", user.id),
    supabase.from("projects").select("id", { count: "exact", head: true }).eq("owner_id", user.id),
    supabase.from("concept_mastery").select("mastery_level").eq("owner_id", user.id),
    // Most recent 50 project-scoped events is plenty to derive both
    // "Continue Learning" (the very first one) and "Recent Projects" (the
    // first few distinct project_ids) without needing a SQL group-by —
    // same prototype-scale JS-aggregation tradeoff as Project/Global
    // Analytics.
    supabase
      .from("activity_events")
      .select("event_type, project_id, created_at, projects(name, spaces(name))")
      .eq("owner_id", user.id)
      .not("project_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("concept_mastery")
      .select("concept_id, project_id, mastery_level, concepts(name), projects(name)")
      .eq("owner_id", user.id)
      .lt("mastery_level", MASTERY_THRESHOLDS.needsAttention)
      .order("mastery_level", { ascending: true })
      .limit(5),
    supabase
      .from("recommendations")
      .select("project_id, message, projects(name)")
      .eq("owner_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (spacesResult.error) throw spacesResult.error;
  if (projectsResult.error) throw projectsResult.error;
  if (masteryResult.error) throw masteryResult.error;
  if (recentEventsResult.error) throw recentEventsResult.error;
  if (weakConceptsResult.error) throw weakConceptsResult.error;
  if (latestRecommendationResult.error) throw latestRecommendationResult.error;

  const masteryRows = masteryResult.data ?? [];
  const overallMastery =
    masteryRows.length === 0
      ? null
      : Math.round(masteryRows.reduce((sum, r) => sum + r.mastery_level, 0) / masteryRows.length);

  type EventRow = {
    event_type: string;
    project_id: string;
    created_at: string;
    projects: { name: string; spaces: { name: string } | null } | null;
  };
  const events = (recentEventsResult.data ?? []) as unknown as EventRow[];

  const continueLearning: ContinueLearningItem = events[0]
    ? (() => {
        const e = events[0];
        const { href, label } = describeActivity(e.event_type as ActivityEventType, e.project_id);
        return {
          projectId: e.project_id,
          projectName: e.projects?.name ?? "Untitled Project",
          spaceName: e.projects?.spaces?.name ?? "",
          href,
          activityLabel: label,
        };
      })()
    : null;

  const seenProjects = new Set<string>();
  const recentProjects: RecentProject[] = [];
  for (const e of events) {
    if (seenProjects.has(e.project_id)) continue;
    seenProjects.add(e.project_id);
    recentProjects.push({
      projectId: e.project_id,
      projectName: e.projects?.name ?? "Untitled Project",
      spaceName: e.projects?.spaces?.name ?? "",
      lastActivityAt: e.created_at,
    });
    if (recentProjects.length >= 5) break;
  }

  type WeakConceptRow = {
    concept_id: string;
    project_id: string;
    mastery_level: number;
    concepts: { name: string } | null;
    projects: { name: string } | null;
  };
  const areasToImprove: AreaToImprove[] = (
    (weakConceptsResult.data ?? []) as unknown as WeakConceptRow[]
  ).map((r) => ({
    conceptId: r.concept_id,
    conceptName: r.concepts?.name ?? "Unknown concept",
    projectId: r.project_id,
    projectName: r.projects?.name ?? "Untitled Project",
    masteryLevel: r.mastery_level,
  }));

  type RecommendationRow = {
    project_id: string;
    message: string;
    projects: { name: string } | null;
  } | null;
  const rec = latestRecommendationResult.data as unknown as RecommendationRow;
  const recommendedNextStep: RecommendedNextStep = rec
    ? {
        projectId: rec.project_id,
        projectName: rec.projects?.name ?? "Untitled Project",
        message: rec.message,
      }
    : null;

  return {
    continueLearning,
    recentProjects,
    overallProgress: {
      spaceCount: spacesResult.count ?? 0,
      projectCount: projectsResult.count ?? 0,
      overallMastery,
    },
    areasToImprove,
    recommendedNextStep,
  };
}
