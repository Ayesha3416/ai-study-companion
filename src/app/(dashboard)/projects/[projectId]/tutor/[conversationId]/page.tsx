export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound } from "next/navigation";
import { listMessages } from "../actions";
import { TutorChat } from "../tutor-chat";

export default async function ConversationPage({
  params,
}: {
  params: Promise<{ projectId: string; conversationId: string }>;
}) {
  const { projectId, conversationId } = await params;

  let messages;
  try {
    messages = await listMessages(conversationId);
  } catch {
    notFound();
  }

  return (
    <div className="mx-auto max-w-2xl p-8 space-y-4">
      <Link
        href={`/projects/${projectId}/tutor`}
        className="text-sm text-neutral-500 hover:underline"
      >
        ← All conversations
      </Link>

      <TutorChat
        projectId={projectId}
        conversationId={conversationId}
        initialMessages={messages}
      />
    </div>
  );
}
