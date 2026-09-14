/**
 * True only when a Supabase `.single()` query genuinely found zero (or
 * more than one) matching rows — PostgREST's own signal for "this specific
 * row doesn't exist," distinct from every other kind of failure (network
 * blip, a momentary auth/cookie hiccup during a Server Action's fresh
 * re-render, a timeout, an actual DB error).
 *
 * **Why this exists**: several pages used to do
 * `try { x = await getX(id) } catch { notFound() }` — catching
 * *any* error and rendering it as "this doesn't exist," even for errors
 * that had nothing to do with the row's existence. That produced a
 * misleading 404 for transient failures (confirmed by a user report: a
 * freshly-uploaded PDF triggered a 404 on the project page's own
 * re-render, yet the upload had genuinely succeeded — reloading showed it
 * fine, meaning the project obviously still existed and the earlier 404
 * was a false read, not a real "not found"). Callers should use this to
 * call `notFound()` only for a real not-found, and rethrow anything else
 * so it reaches the nearest `error.tsx` boundary instead of lying to the
 * user about the resource being gone.
 */
export function isNotFoundError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "PGRST116"
  );
}
