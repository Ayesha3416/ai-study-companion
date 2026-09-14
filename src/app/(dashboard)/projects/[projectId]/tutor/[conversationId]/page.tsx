export const dynamic = "force-dynamic";
// **Bug fix**: same root cause as spaces/[spaceId]/page.tsx — this page
// (redirected to immediately after startConversation()) was missing
// force-dynamic, letting Next.js cache a first-visit 404 for a brand-new
// conversation ID and keep serving it to every subsequent visitor. See
// that file's comment for the full explanation.
import Link from "next/link";
import { notFound } from "next/navigation";
import { listMessages } from "../actions";
import { TutorChat } from "../tutor-chat";
import { isNotFoundError } from "@/lib/supabase/errors";

// Server Actions on this page (sendMessage) make a synchronous grounded-AI
// call (retrieval + Groq generation); the platform default (as low as 10s
// on some plan/compute configurations) can be tight for that round trip.
// See "If using Server Actions, set the maxDuration at the page level" —
// https://nextjs.org/docs/app/api-reference/file-conventions/route-segment-config/maxDuration
export const maxDuration = 60;

export default async function ConversationPage({
  params,
}: {
  params: Promise<{ projectId: string; conversationId: string }>;
}) {
  const { projectId, conversationId } = await params;

  let messages;
  try {
    messages = await listMessages(conversationId);
  } catch (error) {
    // See src/lib/supabase/errors.ts — only a genuine not-found is a 404.
    if (isNotFoundError(error)) notFound();
    throw error;
  }

  return (
    <div className="mx-auto max-w-2xl p-4 sm:p-8 space-y-4">
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
