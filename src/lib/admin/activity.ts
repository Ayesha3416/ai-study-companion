import { createClient } from "@/lib/supabase/server";
import { buildProjectToSpaceMap } from "./spaces-projects";
import { ALL_EVENT_TYPES } from "./event-labels";

export type AdminActivityFilters = {
  userId?: string;
  spaceId?: string;
  projectId?: string;
  eventType?: string;
  period?: "today" | "7d" | "30d" | "all";
};

export type AdminActivityItem = {
  id: string;
  eventType: string;
  ownerEmail: string;
  projectName: string | null;
  createdAt: string;
};

// This is a browse/filter view, not an export — PRD §61 doesn't ask for
// pagination, and 100 recent (filtered) events is plenty to answer "what's
// happening lately" at a prototype's activity volume.
const ROW_LIMIT = 100;

function periodToSince(period: AdminActivityFilters["period"]): string | null {
  const now = Date.now();
  switch (period) {
    case "today":
      return new Date(new Date().setHours(0, 0, 0, 0)).toISOString();
    case "7d":
      return new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();
    case "30d":
      return new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString();
    default:
      return null;
  }
}

export async function listActivityForAdmin(
  filters: AdminActivityFilters
): Promise<AdminActivityItem[]> {
  const supabase = await createClient();

  let query = supabase
    .from("activity_events")
    .select("id, event_type, project_id, created_at, profiles(email), projects(name)")
    .order("created_at", { ascending: false })
    .limit(ROW_LIMIT);

  if (filters.userId) query = query.eq("owner_id", filters.userId);
  if (filters.projectId) query = query.eq("project_id", filters.projectId);
  if (filters.eventType) query = query.eq("event_type", filters.eventType);
  const since = periodToSince(filters.period);
  if (since) query = query.gte("created_at", since);

  // Space filtering can't be a direct .eq() (see spaces-projects.ts's
  // module comment — space_id is only set on space_created events), so we
  // resolve it to the set of project_ids that belong to the space first.
  if (filters.spaceId) {
    const projectToSpace = await buildProjectToSpaceMap(supabase);
    const projectIds = [...projectToSpace.entries()]
      .filter(([, spaceId]) => spaceId === filters.spaceId)
      .map(([projectId]) => projectId);
    if (projectIds.length === 0) return []; // space has no projects — nothing can match
    query = query.in("project_id", projectIds);
  }

  const { data, error } = await query;
  if (error) throw error;

  type Row = {
    id: string;
    event_type: string;
    created_at: string;
    profiles: { email: string } | null;
    projects: { name: string } | null;
  };
  return ((data ?? []) as unknown as Row[]).map((r) => ({
    id: r.id,
    eventType: r.event_type,
    ownerEmail: r.profiles?.email ?? "unknown",
    projectName: r.projects?.name ?? null,
    createdAt: r.created_at,
  }));
}

export type AdminActivityFilterOptions = {
  users: { id: string; email: string }[];
  spaces: { id: string; name: string }[];
  projects: { id: string; name: string }[];
  eventTypes: string[];
};

// Deliberately a separate query from listActivityForAdmin, so changing one
// filter doesn't force refetching the dropdown option lists themselves.
export async function getAdminActivityFilterOptions(): Promise<AdminActivityFilterOptions> {
  const supabase = await createClient();

  const [usersResult, spacesResult, projectsResult] = await Promise.all([
    supabase.from("profiles").select("id, email").order("email"),
    supabase.from("spaces").select("id, name").order("name"),
    supabase.from("projects").select("id, name").order("name"),
  ]);
  if (usersResult.error) throw usersResult.error;
  if (spacesResult.error) throw spacesResult.error;
  if (projectsResult.error) throw projectsResult.error;

  return {
    users: usersResult.data ?? [],
    spaces: spacesResult.data ?? [],
    projects: projectsResult.data ?? [],
    eventTypes: ALL_EVENT_TYPES,
  };
}
