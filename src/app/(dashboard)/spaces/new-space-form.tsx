"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { createSpace, type CreateSpaceState } from "./actions";

const initialState: CreateSpaceState = {};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
    >
      {pending ? "Creating..." : "Create Space"}
    </button>
  );
}

export function NewSpaceForm() {
  const [state, formAction] = useActionState(createSpace, initialState);

  return (
    <form action={formAction} className="space-y-3 rounded-lg border p-4">
      <div className="flex gap-2">
        <input
          name="icon"
          placeholder="🎯"
          maxLength={4}
          className="w-14 rounded-md border border-neutral-300 px-2 py-2 text-center text-sm"
        />
        <input
          name="name"
          placeholder="Space name (e.g. Spanish, Data Structures)"
          required
          className="flex-1 rounded-md border border-neutral-300 px-3 py-2 text-sm"
        />
      </div>
      <textarea
        name="description"
        placeholder="What's this Space about? (optional)"
        rows={2}
        className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
      />
      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      <SubmitButton />
    </form>
  );
}