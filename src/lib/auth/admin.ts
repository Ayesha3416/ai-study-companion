import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// PRD §56: gates the Admin Dashboard itself. `public.is_admin()` (Step 2's
// migration) already enforces this at the RLS layer for every table an
// admin can read across other users' data — this is the corresponding
// app-layer check, so a non-admin never even reaches an admin *page* to
// begin with, rather than relying solely on individual queries silently
// returning nothing.
//
// Deliberately a Server Component helper (called from a layout), not
// middleware/proxy.ts: role lives in `profiles`, a DB table, and proxy.ts
// already only checks *authentication* (is there a session at all) — adding
// a DB round-trip to the proxy would run on every single request site-wide,
// not just the few admin routes that need it. A layout-level check runs
// once per admin-route navigation instead, which is the right place for an
// authorization (as opposed to authentication) check in the App Router.
//
// Unauthorized outcome is `notFound()`, not a "you don't have permission"
// page — same posture the rest of the app already takes when RLS blocks a
// row (`getSpace`/`getProject`'s catch-and-notFound pattern): a non-admin
// shouldn't be able to distinguish "this route doesn't exist" from "this
// route exists but I can't see it," which leaks less about the app's
// internal structure.
export async function requireAdmin(): Promise<{ id: string; email: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("role, email")
    .eq("id", user.id)
    .single();

  if (error || !profile || profile.role !== "admin") {
    notFound();
  }

  return { id: user.id, email: profile.email };
}
