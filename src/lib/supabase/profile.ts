import type { User } from "@supabase/supabase-js";
import type { createClient } from "@/lib/supabase/server";

/**
 * Ensures this user's `profiles` row exists before any insert that
 * foreign-keys against it (`spaces.owner_id`, `projects.owner_id`, etc.).
 *
 * Normally unnecessary — the `on_auth_user_created` trigger
 * (0001_core_schema.sql) creates this row automatically on signup. This
 * exists only to close a real race: that trigger fires asynchronously
 * relative to the signup request completing, so a brand-new user moving
 * fast enough (signup → immediately create their first Space) could have
 * that insert fail its `owner_id` foreign key if the trigger hasn't
 * committed yet. Confirmed via a user report of "some users" hitting an
 * error specifically on a first-ever Space.
 *
 * `ignoreDuplicates: true` makes this a true no-op (not even a write) on
 * every call after the first for a given user — the overwhelmingly common
 * case, since this runs on every createSpace call, not just a new user's
 * first one. Requires the INSERT policy added in migration 0014 — profiles
 * previously only had SELECT/UPDATE policies, so a plain user-scoped
 * client couldn't have done this insert at all before that policy existed.
 */
export async function ensureProfile(
  supabase: Awaited<ReturnType<typeof createClient>>,
  user: User
): Promise<void> {
  const { error } = await supabase
    .from("profiles")
    .upsert({ id: user.id, email: user.email ?? "" }, { onConflict: "id", ignoreDuplicates: true });

  // Not fatal if this fails for some unrelated reason — the caller's own
  // insert will still surface its own clear error if the profile row
  // genuinely doesn't exist, same as before this fix existed. This is a
  // best-effort safety net, not the only path to correctness.
  if (error) {
    console.error("ensureProfile upsert failed (non-fatal):", error.message);
  }
}
