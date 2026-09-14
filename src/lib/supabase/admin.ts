import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// DANGER: this client bypasses Row Level Security entirely.
// Use ONLY in trusted server-side contexts: Inngest background jobs,
// admin-only API routes (after verifying the caller is an admin), etc.
// NEVER import this into any client component or expose it to the browser.
export function createAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
}
