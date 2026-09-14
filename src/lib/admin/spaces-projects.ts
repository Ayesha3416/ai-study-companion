import { createClient } from "@/lib/supabase/server";

// Same RLS-via-is_admin() reasoning as overview.ts/users.ts — the plain
// user-scoped client already sees every row for an admin session, no
// service-role client needed.
//
// **Important data-model quirk, worth knowing before touching this file**:
// `activity_events.space_id` is only ever populated on the single
// `space_created` event (see src/lib/activity/events.ts's call sites) —
// every other event type (materials, Tutor, Quiz, mastery, etc.) only
// carries a `project_id`, since that's genuinely where those actions
// happen. So "activity for a Space" can't be read directly off
// `space_id` — both `listSpacesForAdmin()` below and the Space filter in
// `activity.ts`'s `listActivityForAdmin()` instead roll activity up
// through that Space's Projects, via `buildProjectToSpaceMap()`.

export type AdminSpaceSummary = {
  id: string;
  name: string;
  ownerEmail: string;
  projectCount: number;
  activityCount: number;
  lastActivityAt: string | null;
};

export type AdminProjectSummary = {
  id: string;
  name: string;
  ownerEmail: string;
  spaceName: string;
  materialsCount: number;
  tutorActivityCount: number;
  quizActivityCount: number;
  progress: number | null; // average mastery across this project's concepts
  lastActivityAt: string | null;
};

/** project_id -> space_id, for rolling project-scoped activity up to its Space. */
async function buildProjectToSpaceMap(
  supabase: Awaited<ReturnType<typeof createClient>>
): Promise<Map<string, string>> {
  const { data, error } = await supabase.from("projects").select("id, space_id");
  if (error) throw error;
  return new Map((data ?? []).map((p) => [p.id, p.space_id]));
}

export async function listSpacesForAdmin(): Promise<AdminSpaceSummary[]> {
  const supabase = await createClient();

  const [spacesResult, projectsResult, eventsResult] = await Promise.all([
    supabase.from("spaces").select("id, name, owner_id, profiles(email)"),
    supabase.from("projects").select("id, space_id"),
    supabase.from("activity_events").select("project_id, event_type, created_at"),
  ]);
  if (spacesResult.error) throw spacesResult.error;
  if (projectsResult.error) throw projectsResult.error;
  if (eventsResult.error) throw eventsResult.error;

  type ProjectRow = { id: string; space_id: string };
  const projects = (projectsResult.data ?? []) as ProjectRow[];
  const projectToSpace = new Map(projects.map((p) => [p.id, p.space_id]));
  const projectCountBySpace = new Map<string, number>();
  for (const p of projects) {
    projectCountBySpace.set(p.space_id, (projectCountBySpace.get(p.space_id) ?? 0) + 1);
  }

  // Roll project-scoped events up to their Space (see module comment above).
  const activityCountBySpace = new Map<string, number>();
  const lastActivityBySpace = new Map<string, string>();
  for (const e of eventsResult.data ?? []) {
    const spaceId = e.project_id ? projectToSpace.get(e.project_id) : undefined;
    if (!spaceId) continue; // space_created events (no project_id) are skipped here — they're the space's own creation, not ongoing activity
    activityCountBySpace.set(spaceId, (activityCountBySpace.get(spaceId) ?? 0) + 1);
    const current = lastActivityBySpace.get(spaceId);
    if (!current || e.created_at > current) lastActivityBySpace.set(spaceId, e.created_at);
  }

  type SpaceRow = { id: string; name: string; owner_id: string; profiles: { email: string } | null };
  return ((spacesResult.data ?? []) as unknown as SpaceRow[]).map((s) => ({
    id: s.id,
    name: s.name,
    ownerEmail: s.profiles?.email ?? "unknown",
    projectCount: projectCountBySpace.get(s.id) ?? 0,
    activityCount: activityCountBySpace.get(s.id) ?? 0,
    lastActivityAt: lastActivityBySpace.get(s.id) ?? null,
  }));
}

export async function listProjectsForAdmin(): Promise<AdminProjectSummary[]> {
  const supabase = await createClient();

  const [projectsResult, materialsResult, eventsResult, masteryResult] = await Promise.all([
    supabase.from("projects").select("id, name, owner_id, profiles(email), spaces(name)"),
    supabase.from("materials").select("project_id"),
    supabase.from("activity_events").select("project_id, event_type, created_at").not("project_id", "is", null),
    supabase.from("concept_mastery").select("project_id, mastery_level"),
  ]);
  if (projectsResult.error) throw projectsResult.error;
  if (materialsResult.error) throw materialsResult.error;
  if (eventsResult.error) throw eventsResult.error;
  if (masteryResult.error) throw masteryResult.error;

  const materialsCount = new Map<string, number>();
  for (const m of materialsResult.data ?? []) {
    materialsCount.set(m.project_id, (materialsCount.get(m.project_id) ?? 0) + 1);
  }

  const tutorCount = new Map<string, number>();
  const quizCount = new Map<string, number>();
  const lastActivity = new Map<string, string>();
  for (const e of eventsResult.data ?? []) {
    const pid = e.project_id as string;
    if (e.event_type.startsWith("tutor_")) {
      tutorCount.set(pid, (tutorCount.get(pid) ?? 0) + 1);
    } else if (e.event_type.startsWith("quiz_")) {
      quizCount.set(pid, (quizCount.get(pid) ?? 0) + 1);
    }
    const current = lastActivity.get(pid);
    if (!current || e.created_at > current) lastActivity.set(pid, e.created_at);
  }

  const masteryByProject = new Map<string, { sum: number; count: number }>();
  for (const m of masteryResult.data ?? []) {
    const bucket = masteryByProject.get(m.project_id) ?? { sum: 0, count: 0 };
    bucket.sum += m.mastery_level;
    bucket.count += 1;
    masteryByProject.set(m.project_id, bucket);
  }

  type ProjectRow = {
    id: string;
    name: string;
    owner_id: string;
    profiles: { email: string } | null;
    spaces: { name: string } | null;
  };
  return ((projectsResult.data ?? []) as unknown as ProjectRow[]).map((p) => {
    const mastery = masteryByProject.get(p.id);
    return {
      id: p.id,
      name: p.name,
      ownerEmail: p.profiles?.email ?? "unknown",
      spaceName: p.spaces?.name ?? "",
      materialsCount: materialsCount.get(p.id) ?? 0,
      tutorActivityCount: tutorCount.get(p.id) ?? 0,
      quizActivityCount: quizCount.get(p.id) ?? 0,
      progress: mastery ? Math.round(mastery.sum / mastery.count) : null,
      lastActivityAt: lastActivity.get(p.id) ?? null,
    };
  });
}

export { buildProjectToSpaceMap };
