import Link from "next/link";
import { startQuizAttempt } from "./actions";

// startQuizAttempt generates the first question via a synchronous
// generateStructured AI call — same reasoning as the Tutor page.
export const maxDuration = 60;

export default async function QuizPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;

  async function handleStart() {
    "use server";
    await startQuizAttempt(projectId);
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-8">
      <div>
        <Link
          href={`/projects/${projectId}`}
          className="text-sm text-neutral-500 hover:underline"
        >
          ← Back to Project
        </Link>
        <h1 className="mt-1 text-xl font-semibold">Adaptive Quiz</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Questions adapt to your current mastery — weaker concepts get
          prioritized automatically.
        </p>
      </div>

      <form action={handleStart}>
        <button className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white">
          Start Quiz
        </button>
      </form>
    </div>
  );
}
