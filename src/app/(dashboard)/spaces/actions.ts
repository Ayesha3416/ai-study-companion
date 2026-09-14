"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { recordActivityEvent } from "@/lib/activity/events";

const createSpaceSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  description: z.string().max(1000).optional(),
  icon: z.string().max(10).optional(), // e.g. an emoji
});

export type CreateSpaceState = {
  error?: string;
};

export async function createSpace(
  _prevState: CreateSpaceState,
  formData: FormData
): Promise<CreateSpaceState> {
  const parsed = createSpaceSchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description") || undefined,
    icon: formData.get("icon") || undefined,
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

  const { data, error } = await supabase
    .from("spaces")
    .insert({
      owner_id: user.id,
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      icon: parsed.data.icon ?? null,
    })
    .select("id")
    .single();

  if (error) {
    return { error: error.message };
  }

  await recordActivityEvent({
    ownerId: user.id,
    eventType: "space_created",
    spaceId: data.id,
    metadata: { name: parsed.data.name },
  });

  revalidatePath("/spaces");
  redirect(`/spaces/${data.id}`);
}

export async function listSpaces() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  // Explicit owner_id filter, not just RLS — see home-dashboard.ts's fix
  // comment for the full explanation. Without this, an admin's own "Your
  // Spaces" page silently listed every user's Spaces, not just their own.
  const { data, error } = await supabase
    .from("spaces")
    .select("id, name, description, icon, created_at")
    .eq("owner_id", user.id)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data;
}

export async function getSpace(spaceId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("spaces")
    .select("id, name, description, icon, created_at")
    .eq("id", spaceId)
    .single();

  if (error) throw error;
  return data;
}
