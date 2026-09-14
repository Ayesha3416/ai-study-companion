import { createClient } from "@/lib/supabase/server";

/**
 * Finds an existing concept by name within a project, or creates it.
 * Concepts are introduced implicitly the first time something (Quiz
 * generation, Tutor, background extraction) needs to reference one that
 * doesn't exist yet — there's no separate "create concept" UI flow.
 */
export async function getOrCreateConcept(
  projectId: string,
  ownerId: string,
  name: string
): Promise<string> {
  const supabase = await createClient();
  const trimmedName = name.trim();

  const { data: existing } = await supabase
    .from("concepts")
    .select("id")
    .eq("project_id", projectId)
    .eq("name", trimmedName)
    .maybeSingle();

  if (existing) return existing.id;

  const { data, error } = await supabase
    .from("concepts")
    .insert({ project_id: projectId, owner_id: ownerId, name: trimmedName })
    .select("id")
    .single();

  if (error) {
    // Race condition: another concurrent request created the same concept
    // between our check and our insert. The unique(project_id, name)
    // constraint catches it (Postgres code 23505) — just fetch the winner
    // rather than failing the whole operation.
    if (error.code === "23505") {
      const { data: raceWinner, error: raceError } = await supabase
        .from("concepts")
        .select("id")
        .eq("project_id", projectId)
        .eq("name", trimmedName)
        .single();
      if (!raceError && raceWinner) return raceWinner.id;
    }
    throw error;
  }

  return data.id;
}

export async function listConcepts(projectId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("concepts")
    .select("id, name, description, created_at")
    .eq("project_id", projectId)
    .order("name", { ascending: true });

  if (error) throw error;
  return data;
}
