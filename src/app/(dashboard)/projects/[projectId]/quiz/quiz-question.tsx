"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { submitAnswer, type SubmitAnswerResult } from "./actions";

type Option = { id: string; text: string };
type Question = {
  id: string;
  question_type: "multiple_choice" | "open_ended";
  difficulty: "easy" | "medium" | "hard";
  prompt: string;
  options: Option[] | null;
  order_index: number;
};

const DIFFICULTY_STYLES: Record<string, string> = {
  easy: "bg-green-100 text-green-800",
  medium: "bg-amber-100 text-amber-800",
  hard: "bg-red-100 text-red-800",
};

// submitAnswer's error branch is always handled (and returned from) inside
// handleSubmit below, before setResult is ever called — so this component's
// `result` state can never actually hold the `{ error: string }` member.
// Excluding it here (rather than leaving `result` typed as the full
// SubmitAnswerResult) lets every `result.questionType`/`.isCorrect`/etc.
// access below type-check without an extra "error" in result guard that
// would never actually trigger.
type SubmitAnswerSuccess = Exclude<SubmitAnswerResult, { error: string }>;

export function QuizQuestion({ question }: { question: Question }) {
  const router = useRouter();
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [openAnswer, setOpenAnswer] = useState("");
  const [result, setResult] = useState<SubmitAnswerSuccess | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  // Separate transition from the submit one above: these represent two
  // different waits with two different meanings ("grading your answer" vs
  // "generating the next question"), so they need independently accurate
  // pending flags and labels rather than one shared `isPending` that would
  // show "Checking..." while actually loading the next question.
  const [isLoadingNext, startNextTransition] = useTransition();

  function handleSubmit() {
    const answer =
      question.question_type === "multiple_choice" ? selectedOption : openAnswer;
    if (!answer?.trim()) return;

    setError(null);
    startTransition(async () => {
      const res = await submitAnswer(question.id, answer);
      if ("error" in res) {
        setError(res.error);
        return;
      }
      setResult(res);
    });
  }

  function handleNext() {
    // Previously this reset local state immediately and called
    // router.refresh() with no pending indicator. Two problems compounded:
    // (1) resetting `result`/`selectedOption` right away flips the UI back
    // to the "Submit Answer" branch — disabled, since nothing's selected
    // yet — before the next question has actually arrived, and (2) with no
    // loading indicator at all, that disabled button just sat there for
    // however long the next AI-generated question took (a real network +
    // AI call via generateStructured in quiz.ts, not an instant local
    // update) with nothing on screen explaining why. Easy to misread as
    // the previous click's effect being stuck.
    // Fix: don't reset anything here — the parent already gives this
    // component a fresh `key={question.id}` (see [quizAttemptId]/page.tsx),
    // so the moment the new question actually arrives, this whole
    // component unmounts and remounts with pristine default state for
    // free. Until then, keep the just-answered question and its "Next
    // Question" button on screen exactly as the user left it, just
    // disabled with a clear "Loading next question..." label — visible,
    // accurate feedback instead of a confusing early reset.
    startNextTransition(() => {
      router.refresh(); // re-runs the server component, which generates the next question
    });
  }

  const answered = result !== null;

  return (
    <div className="space-y-4 rounded-lg border p-6">
      <div className="flex items-center gap-2 text-xs text-neutral-500">
        <span>Question {question.order_index}</span>
        <span
          className={`rounded-full px-2 py-0.5 font-medium ${DIFFICULTY_STYLES[question.difficulty]}`}
        >
          {question.difficulty}
        </span>
      </div>

      <p className="text-base font-medium">{question.prompt}</p>

      {question.question_type === "multiple_choice" && question.options && (
        <div className="space-y-2">
          {question.options.map((opt) => {
            const isSelected = selectedOption === opt.id;
            const isCorrectOption =
              answered &&
              result.questionType === "multiple_choice" &&
              opt.id === result.correctOptionId;
            const isWrongSelected =
              answered &&
              result.questionType === "multiple_choice" &&
              isSelected &&
              !result.isCorrect;

            return (
              <button
                key={opt.id}
                type="button"
                disabled={answered}
                onClick={() => setSelectedOption(opt.id)}
                className={`block w-full rounded-md border p-3 text-left text-sm transition ${
                  isCorrectOption
                    ? "border-green-500 bg-green-50"
                    : isWrongSelected
                      ? "border-red-500 bg-red-50"
                      : isSelected
                        ? "border-neutral-900"
                        : "border-neutral-300 hover:bg-neutral-50"
                } disabled:cursor-default`}
              >
                {opt.text}
              </button>
            );
          })}
        </div>
      )}

      {question.question_type === "open_ended" && (
        <textarea
          value={openAnswer}
          onChange={(e) => setOpenAnswer(e.target.value)}
          disabled={answered}
          rows={4}
          placeholder="Type your answer..."
          className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm disabled:bg-neutral-50"
        />
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      {answered && result.questionType === "multiple_choice" && (
        <p
          className={`text-sm font-medium ${result.isCorrect ? "text-green-700" : "text-red-700"}`}
        >
          {result.isCorrect ? "Correct!" : "Not quite — see the highlighted answer above."}
        </p>
      )}
      {answered && result.questionType === "open_ended" && (
        <div className="space-y-2">
          <p
            className={`text-sm font-medium ${result.isCorrect ? "text-green-700" : "text-amber-700"}`}
          >
            Score: {result.scorePercent}%
          </p>
          <p className="whitespace-pre-wrap text-sm text-neutral-700">
            {result.feedback}
          </p>
        </div>
      )}

      <div className="flex justify-end gap-2">
        {!answered ? (
          <button
            key="submit"
            onClick={handleSubmit}
            disabled={
              isPending ||
              (question.question_type === "multiple_choice"
                ? !selectedOption
                : !openAnswer.trim())
            }
            className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {isPending ? "Checking..." : "Submit Answer"}
          </button>
        ) : (
          <button
            key="next"
            onClick={handleNext}
            disabled={isLoadingNext}
            className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {isLoadingNext ? "Loading next question..." : "Next Question"}
          </button>
        )}
      </div>
    </div>
  );
}
