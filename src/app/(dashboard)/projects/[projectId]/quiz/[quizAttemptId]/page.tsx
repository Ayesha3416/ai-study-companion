import Link from "next/link";
import { getCurrentQuestion, finishQuiz } from "../actions";
import { QuizQuestion } from "../quiz-question";

export const dynamic = "force-dynamic"; // must always generate/fetch the freshest current question, never a cached one
// submitAnswer (open-ended grading) and generateNextQuizQuestion are both
// synchronous AI calls — same reasoning as the Tutor/Quiz-start pages.
export const maxDuration = 60;

export default async function QuizAttemptPage({
  params,
}: {
  params: Promise<{ projectId: string; quizAttemptId: string }>;
}) {
  const { projectId, quizAttemptId } = await params;

  let question;
  let loadError: string | null = null;
  try {
    question = await getCurrentQuestion(projectId, quizAttemptId);
  } catch (error) {
    loadError = error instanceof Error ? error.message : "Could not load a question";
  }

  async function handleFinish() {
    "use server";
    await finishQuiz(projectId, quizAttemptId);
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-8">
      <div className="flex items-center justify-between">
        <Link
          href={`/projects/${projectId}`}
          className="text-sm text-neutral-500 hover:underline"
        >
          ← Back to Project
        </Link>
        <form action={handleFinish}>
          <button className="text-sm text-neutral-500 hover:underline">
            Finish Quiz
          </button>
        </form>
      </div>

      {loadError || !question ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          {loadError ?? "No question is available right now."}
        </div>
      ) : (
        <QuizQuestion key={question.id} question={question} />
      )}
    </div>
  );
}
