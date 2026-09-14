import Link from "next/link";
import { listConversations, startConversation } from "./actions";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { LocalTimestamp } from "@/components/local-timestamp";

export const dynamic = "force-dynamic"; // always show the freshest conversation list, never a cached one

export default async function TutorPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const conversations = await listConversations(projectId);

  async function handleNewConversation() {
    "use server";
    const conversationId = await startConversation(projectId);
    revalidatePath(`/projects/${projectId}/tutor/${conversationId}`); // defense in depth alongside the force-dynamic fix on that destination page
    redirect(`/projects/${projectId}/tutor/${conversationId}`);
  }

  return (
    <div className="mx-auto max-w-2xl p-4 sm:p-8 space-y-6">
      <div>
        <Link
          href={`/projects/${projectId}`}
          className="text-sm text-neutral-500 hover:underline"
        >
          ← Back to Project
        </Link>
        <h1 className="mt-1 text-xl font-semibold">AI Tutor</h1>
      </div>

      <form action={handleNewConversation}>
        <button className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white">
          Start a new conversation
        </button>
      </form>

      {conversations.length > 0 && (
        <div>
          <h2 className="mb-2 text-sm font-medium text-neutral-700">
            Previous conversations
          </h2>
          <ul className="space-y-2">
            {conversations.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/projects/${projectId}/tutor/${c.id}`}
                  className="block rounded-lg border p-3 text-sm hover:bg-neutral-50"
                >
                  {c.title || (
                    <>
                      Conversation from <LocalTimestamp value={c.created_at} />
                    </>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
