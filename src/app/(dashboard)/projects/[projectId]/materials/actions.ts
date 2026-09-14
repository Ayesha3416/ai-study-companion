"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { inngest } from "@/lib/inngest/client";
import { recordActivityEvent } from "@/lib/activity/events";

const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024; // 20MB

export type UploadMaterialState = {
  error?: string;
};

export async function uploadMaterial(
  _prevState: UploadMaterialState,
  formData: FormData
): Promise<UploadMaterialState> {
  const projectId = formData.get("projectId");
  const file = formData.get("file");

  if (typeof projectId !== "string" || !projectId) {
    return { error: "Missing project" };
  }

  if (!(file instanceof File) || file.size === 0) {
    return { error: "Please choose a PDF file" };
  }

  if (file.type !== "application/pdf") {
    return { error: "Only PDF files are supported right now" };
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    return { error: "File is too large (max 20MB)" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Not authenticated" };
  }

  // Confirm the project exists and belongs to this user (RLS would block a
  // cross-user write anyway, but this gives a clean error message).
  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("id")
    .eq("id", projectId)
    .single();

  if (projectError || !project) {
    return { error: "Project not found" };
  }

  // Path convention: {owner_id}/{project_id}/{uuid}-{filename}
  // The leading owner_id segment is what the Storage RLS policy checks.
  const safeFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const storagePath = `${user.id}/${projectId}/${crypto.randomUUID()}-${safeFileName}`;

  const { error: uploadError } = await supabase.storage
    .from("materials")
    .upload(storagePath, file, {
      contentType: "application/pdf",
      upsert: false,
    });

  if (uploadError) {
    return { error: `Upload failed: ${uploadError.message}` };
  }

  const { data: material, error: insertError } = await supabase
    .from("materials")
    .insert({
      project_id: projectId,
      owner_id: user.id,
      file_name: file.name,
      storage_path: storagePath,
      file_size_bytes: file.size,
      status: "queued",
    })
    .select("id")
    .single();

  if (insertError || !material) {
    // Clean up the orphaned file if the DB insert failed, so we don't leave
    // storage and the database out of sync.
    await supabase.storage.from("materials").remove([storagePath]);
    return {
      error: `Could not save material record: ${insertError?.message ?? "unknown error"}`,
    };
  }

  // Kick off background processing (Step 7). The `id` here dedupes the event
  // within Inngest's default dedupe window, so an accidental double-submit
  // of the same material can't trigger two parallel processing runs.
  await inngest.send({
    id: `material-uploaded-${material.id}`,
    name: "material/uploaded",
    data: { materialId: material.id },
  });

  await recordActivityEvent({
    ownerId: user.id,
    eventType: "material_uploaded",
    projectId,
    metadata: { fileName: file.name, materialId: material.id },
  });

  revalidatePath(`/projects/${projectId}`);
  return {};
}

export async function listMaterialsForProject(projectId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("materials")
    .select(
      "id, file_name, status, error_message, page_count, file_size_bytes, created_at"
    )
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data;
}
