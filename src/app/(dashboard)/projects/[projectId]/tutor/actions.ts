"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { answerTutorQuestion, type TutorAnswer } from "@/lib/ai/tutor";
import { recordActivityEvent } from "@/lib/activity/events";

export async function startConversation(projectId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data, error } = await supabase
    .from("conversations")
    .insert({ project_id: projectId, owner_id: user.id })
    .select("id")
    .single();

  if (error) throw error;

  await recordActivityEvent({
    ownerId: user.id,
    eventType: "tutor_conversation_started",
    projectId,
    metadata: { conversationId: data.id },
  });

  return data.id as string;
}

export async function listConversations(projectId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("conversations")
    .select("id, title, created_at, updated_at")
    .eq("project_id", projectId)
    .order("updated_at", { ascending: false });

  if (error) throw error;
  return data;
}

export async function listMessages(conversationId: string) {
  const supabase = await createClient();

  // Verify the conversation itself is visible to this user first (RLS-backed)
  // so a wrong/foreign conversationId 404s cleanly instead of silently
  // rendering an empty chat. Rethrow the *original* error rather than a
  // generic one — the caller needs to see the real Supabase error to tell
  // a genuine not-found apart from a transient failure (see
  // src/lib/supabase/errors.ts).
  const { data: conversation, error: convError } = await supabase
    .from("conversations")
    .select("id")
    .eq("id", conversationId)
    .single();
  if (convError) throw convError;
  if (!conversation) throw new Error("Conversation not found");

  const { data, error } = await supabase
    .from("messages")
    .select("id, role, content, citations, is_unsupported, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });

  if (error) throw error;
  return data;
}

export type SendMessageResult = TutorAnswer | { error: string };

export async function sendMessage(
  projectId: string,
  conversationId: string,
  question: string
): Promise<SendMessageResult> {
  if (!question.trim()) {
    return { error: "Question cannot be empty" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  // Ownership check up front — RLS would block a cross-user write anyway,
  // but this gives a clean error instead of a raw DB failure.
  const { data: conversation, error: convError } = await supabase
    .from("conversations")
    .select("id, project_id")
    .eq("id", conversationId)
    .single();

  if (convError || !conversation || conversation.project_id !== projectId) {
    return { error: "Conversation not found" };
  }

  try {
    const result = await answerTutorQuestion({
      projectId,
      conversationId,
      question,
      userId: user.id,
    });

    await recordActivityEvent({
      ownerId: user.id,
      eventType: "tutor_question_asked",
      projectId,
      metadata: { conversationId, isUnsupported: result.isUnsupported },
    });

    revalidatePath(`/projects/${projectId}/tutor/${conversationId}`);
    return result;
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Something went wrong",
    };
  }
}
