"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { recordActivityEvent } from "@/lib/activity/events";

const createProjectSchema = z.object({
  spaceId: z.string().uuid(),
  name: z.string().min(1, "Name is required").max(100),
  description: z.string().max(1000).optional(),
  goal: z.string().max(1000).optional(),
});

export type CreateProjectState = {
  error?: string;
};

export async function createProject(
  _prevState: CreateProjectState,
  formData: FormData
): Promise<CreateProjectState> {
  const parsed = createProjectSchema.safeParse({
    spaceId: formData.get("spaceId"),
    name: formData.get("name"),
    description: formData.get("description") || undefined,
    goal: formData.get("goal") || undefined,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Not authenticated" };
  }

  // Verify the space exists and is owned by this user before attaching a
  // project to it. RLS would block a cross-user insert anyway, but checking
  // explicitly gives a clean error message instead of a raw DB failure.
  const { data: space, error: spaceError } = await supabase
    .from("spaces")
    .select("id")
    .eq("id", parsed.data.spaceId)
    .single();

  if (spaceError || !space) {
    return { error: "Space not found" };
  }

  const { data, error } = await supabase
    .from("projects")
    .insert({
      space_id: parsed.data.spaceId,
      owner_id: user.id,
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      goal: parsed.data.goal ?? null,
    })
    .select("id")
    .single();

  if (error) {
    return { error: error.message };
  }

  await recordActivityEvent({
    ownerId: user.id,
    eventType: "project_created",
    spaceId: parsed.data.spaceId,
    projectId: data.id,
    metadata: { name: parsed.data.name },
  });

  revalidatePath(`/spaces/${parsed.data.spaceId}`);
  redirect(`/projects/${data.id}`);
}

export async function listProjectsForSpace(spaceId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("projects")
    .select("id, name, description, goal, created_at")
    .eq("space_id", spaceId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data;
}

export async function getProject(projectId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("projects")
    .select("id, name, description, goal, space_id, created_at")
    .eq("id", projectId)
    .single();

  if (error) throw error;
  return data;
}
