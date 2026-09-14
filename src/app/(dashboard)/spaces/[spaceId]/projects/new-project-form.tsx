"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { createProject, type CreateProjectState } from "./actions";

const initialState: CreateProjectState = {};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
    >
      {pending ? "Creating..." : "Create Project"}
    </button>
  );
}

export function NewProjectForm({ spaceId }: { spaceId: string }) {
  const [state, formAction] = useActionState(createProject, initialState);

  return (
    <form action={formAction} className="space-y-3 rounded-lg border p-4">
      <input type="hidden" name="spaceId" value={spaceId} />

      <input
        name="name"
        placeholder="Project name (e.g. Verb Conjugation Basics)"
        required
        className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
      />
      <textarea
        name="description"
        placeholder="What's this Project about? (optional)"
        rows={2}
        className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
      />
      <textarea
        name="goal"
        placeholder="What do you want to achieve? (learning goal)"
        rows={2}
        className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
      />

      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      <SubmitButton />
    </form>
  );
}
