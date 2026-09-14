import { createClient } from "@/lib/supabase/server";
import { retrieveRelevantChunks, hasReliableEvidence } from "./retrieval";
import { generateText } from "./provider";
import { buildTutorPrompt, type ConversationTurn } from "./prompts/tutor";
import { getRelevantContext, formatContextForPrompt } from "@/lib/context/learning-context";

export type Citation = {
  fileName: string;
  pageNumber: number | null;
};

export type TutorAnswer = {
  answer: string;
  citations: Citation[];
  isUnsupported: boolean;
};

const HISTORY_TURNS_TO_INCLUDE = 6; // last 6 messages (~3 exchanges) of short-term context, PRD §17

const UNSUPPORTED_MESSAGE =
  "I couldn't find enough information in this project's materials to answer that confidently. " +
  "Try rephrasing your question, or upload material that covers this topic — I don't want to guess.";

export async function answerTutorQuestion({
  projectId,
  conversationId,
  question,
  userId,
}: {
  projectId: string;
  conversationId: string;
  question: string;
  userId: string;
}): Promise<TutorAnswer> {
  const supabase = await createClient();

  // Save the user's message immediately, regardless of what happens next.
  const { error: userMsgError } = await supabase.from("messages").insert({
    conversation_id: conversationId,
    owner_id: userId,
    role: "user",
    content: question,
  });
  if (userMsgError) throw userMsgError;

  // ---- Short-term context: recent turns in this conversation (PRD §17) ----
  const { data: recentMessages, error: historyError } = await supabase
    .from("messages")
    .select("role, content")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(HISTORY_TURNS_TO_INCLUDE + 1); // +1 since the question we just inserted is included
  if (historyError) throw historyError;

  const history: ConversationTurn[] = (recentMessages ?? [])
    .slice(1) // drop the question we just inserted — it's passed separately
    .reverse()
    .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

  // ---- Grounded retrieval (PRD §18) ----
  const chunks = await retrieveRelevantChunks(projectId, question);

  if (!hasReliableEvidence(chunks)) {
    const { error: assistantMsgError } = await supabase.from("messages").insert({
      conversation_id: conversationId,
      owner_id: userId,
      role: "assistant",
      content: UNSUPPORTED_MESSAGE,
      is_unsupported: true,
    });
    if (assistantMsgError) throw assistantMsgError;

    return { answer: UNSUPPORTED_MESSAGE, citations: [], isUnsupported: true };
  }

  // ---- Long-term relevant context (PRD §17/§39-40, Step 14) ----
  // Fetched only once we know we're actually going to answer — no point
  // spending these queries on a request that's about to hit the
  // unsupported-question fallback above.
  const [{ data: project }, contextEntries] = await Promise.all([
    supabase.from("projects").select("goal").eq("id", projectId).single(),
    getRelevantContext(projectId),
  ]);

  const { system, prompt } = buildTutorPrompt({
    chunks,
    history,
    question,
    learningGoal: project?.goal ?? null,
    contextBlock: formatContextForPrompt(contextEntries),
  });

  const result = await generateText({
    feature: "tutor_response",
    system,
    prompt,
    userId,
    metadata: { projectId, conversationId },
  });

  // Citations come from what we deterministically retrieved, not from
  // parsing the model's own text — this guarantees the sources shown are
  // real and accurate (PRD §19) rather than trusting the model to cite
  // itself correctly.
  const citations: Citation[] = dedupeCitations(
    chunks.map((c) => ({ fileName: c.fileName, pageNumber: c.pageNumber }))
  );

  const { error: assistantMsgError } = await supabase.from("messages").insert({
    conversation_id: conversationId,
    owner_id: userId,
    role: "assistant",
    content: result.text,
    citations,
    is_unsupported: false,
  });
  if (assistantMsgError) throw assistantMsgError;

  return { answer: result.text, citations, isUnsupported: false };
}

function dedupeCitations(citations: Citation[]): Citation[] {
  const seen = new Set<string>();
  const result: Citation[] = [];
  for (const c of citations) {
    const key = `${c.fileName}::${c.pageNumber}`;
    if (!seen.has(key)) {
      seen.add(key);
      result.push(c);
    }
  }
  return result.slice(0, 3); // cap displayed sources at 3 for a clean UI
}
