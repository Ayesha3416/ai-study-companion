"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { uploadMaterial, type UploadMaterialState } from "./actions";

const initialState: UploadMaterialState = {};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
    >
      {pending ? "Uploading..." : "Upload PDF"}
    </button>
  );
}

export function UploadMaterialForm({ projectId }: { projectId: string }) {
  const [state, formAction] = useActionState(uploadMaterial, initialState);

  return (
    <form
      action={formAction}
      key={state.error ?? "ok"} // remounts (clearing the file input) after a successful submit
      className="space-y-3 rounded-lg border p-4"
    >
      <input type="hidden" name="projectId" value={projectId} />
      <input
        type="file"
        name="file"
        accept="application/pdf"
        required
        className="block w-full text-sm"
      />
      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      <SubmitButton />
    </form>
  );
}
