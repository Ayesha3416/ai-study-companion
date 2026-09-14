import type { LearningContextEntry } from "@/lib/context/learning-context";

const TYPE_LABELS: Record<LearningContextEntry["contextType"], string> = {
  known_weakness: "Needs Attention",
  known_strength: "Strength",
  assessment_mistake: "Recent Mistake",
  preference: "Preference",
  tutor_note: "Tutor Note",
};

const TYPE_STYLES: Record<LearningContextEntry["contextType"], string> = {
  known_weakness: "bg-red-100 text-red-800",
  known_strength: "bg-green-100 text-green-800",
  assessment_mistake: "bg-amber-100 text-amber-800",
  preference: "bg-blue-100 text-blue-800",
  tutor_note: "bg-neutral-100 text-neutral-700",
};

/**
 * Read-only display of what the system currently remembers about the
 * student's learning journey in this project (PRD §39). This is the same
 * data `getRelevantContext` composes into Tutor prompts — surfacing it here
 * makes an otherwise invisible AI-engineering concept (persistent context)
 * something the user can actually see and understand.
 */
export function LearningContextList({ entries }: { entries: LearningContextEntry[] }) {
  if (entries.length === 0) {
    return (
      <p className="text-sm text-neutral-400">
        Nothing remembered yet — this fills in as you take quizzes and chat with the Tutor.
      </p>
    );
  }

  return (
    <ul className="space-y-2">
      {entries.map((entry) => (
        <li key={entry.id} className="rounded-lg border p-3 text-sm">
          <span
            className={`mb-1.5 inline-block rounded-full px-2 py-0.5 text-xs font-medium ${TYPE_STYLES[entry.contextType]}`}
          >
            {TYPE_LABELS[entry.contextType]}
          </span>
          <p className="text-neutral-700">{entry.content}</p>
        </li>
      ))}
    </ul>
  );
}
