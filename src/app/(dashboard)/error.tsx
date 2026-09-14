"use client";

// This app previously had no error.tsx anywhere, so ANY unhandled error
// under (dashboard) rendered Next's bare default error page. That mattered
// more than usual here: a few pages used to blanket-catch every possible
// error and call notFound() for all of them — including transient errors
// that had nothing to do with the resource actually existing (see
// src/lib/supabase/errors.ts's isNotFoundError and its callers). Now that
// those pages correctly rethrow anything that isn't a genuine not-found,
// this boundary is what the user actually sees for that rarer case — a
// real retry button, not a dead end.
export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 p-8 text-center">
      <h1 className="text-lg font-semibold">Something went wrong</h1>
      <p className="text-sm text-neutral-500">
        This looks like a temporary issue, not a missing page — the content
        you were looking for should still be there. Try again.
      </p>
      {error.digest && (
        <p className="text-xs text-neutral-400">Reference: {error.digest}</p>
      )}
      <button
        onClick={() => reset()}
        className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white"
      >
        Try again
      </button>
    </div>
  );
}
