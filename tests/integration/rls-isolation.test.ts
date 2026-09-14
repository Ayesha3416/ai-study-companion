import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// PRD §52/§73: "Users must only access their own Spaces and Projects" is a
// real security property, not just application logic — it's enforced by
// Postgres Row Level Security policies (0001_core_schema.sql), so it needs
// an actual test against a real Postgres instance with those policies
// active. There's no meaningful way to unit-test RLS with a mock: the
// policies live in the database, not in this codebase's TypeScript.
//
// This test creates and deletes two real, throwaway users (and a real
// Space/Project) against whichever Supabase project the env vars below
// point to. It reuses this app's normal env var names rather than
// inventing separate SUPABASE_TEST_* ones, since a prototype doesn't
// warrant maintaining two parallel Supabase projects — but that does mean
// **you should point this at a dev/staging Supabase project, not a real
// production one with real user data**, before running it. Cleanup runs in
// a `finally` block regardless of pass/fail, but "runs against whatever
// project is configured" is worth knowing before hitting run.
//
// Self-skips (rather than failing) when the required env vars aren't
// present — e.g. `npm test` in CI or a fresh clone without `.env.local`
// populated yet — so the rest of the suite (the pure-logic unit tests)
// still runs and passes on its own. Run this specific file with real
// credentials loaded (`npx dotenv -e .env.local -- npx vitest run
// tests/integration/rls-isolation.test.ts`) to actually exercise it.
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const hasLiveCredentials = Boolean(SUPABASE_URL && ANON_KEY && SERVICE_ROLE_KEY);

describe.skipIf(!hasLiveCredentials)("Project isolation (RLS) — live Supabase", () => {
  const suffix = Date.now();
  const userAEmail = `eval-isolation-test-a-${suffix}@example.com`;
  const userBEmail = `eval-isolation-test-b-${suffix}@example.com`;
  const password = `Test-Password-${suffix}!`;

  let userAId: string;
  let userBId: string;
  let projectId: string;

  const admin = hasLiveCredentials
    ? createSupabaseClient(SUPABASE_URL!, SERVICE_ROLE_KEY!, {
        auth: { autoRefreshToken: false, persistSession: false },
      })
    : null;

  beforeAll(async () => {
    if (!admin) return;

    // email_confirm: true so these throwaway accounts can sign in
    // immediately, without actually sending/clicking a confirmation email.
    const { data: userA, error: userAError } = await admin.auth.admin.createUser({
      email: userAEmail,
      password,
      email_confirm: true,
    });
    if (userAError || !userA.user) throw userAError ?? new Error("Failed to create test user A");
    userAId = userA.user.id;

    const { data: userB, error: userBError } = await admin.auth.admin.createUser({
      email: userBEmail,
      password,
      email_confirm: true,
    });
    if (userBError || !userB.user) throw userBError ?? new Error("Failed to create test user B");
    userBId = userB.user.id;

    // Create a Space + Project as user A, via the admin client for setup
    // simplicity — the isolation property under test is about *reading*
    // across users, not about who's allowed to write, so using the admin
    // client here doesn't weaken what's being verified below.
    const { data: space, error: spaceError } = await admin
      .from("spaces")
      .insert({ owner_id: userAId, name: "Isolation Test Space" })
      .select("id")
      .single();
    if (spaceError || !space) throw spaceError ?? new Error("Failed to create test space");

    const { data: project, error: projectError } = await admin
      .from("projects")
      .insert({
        space_id: space.id,
        owner_id: userAId,
        name: "Isolation Test Project",
        goal: "Verify RLS isolation",
      })
      .select("id")
      .single();
    if (projectError || !project) throw projectError ?? new Error("Failed to create test project");
    projectId = project.id;
  });

  afterAll(async () => {
    if (!admin) return;
    // Cascading FKs (owner_id ... on delete cascade) clean up the
    // space/project rows automatically once the users are deleted — no
    // separate cleanup needed for those.
    if (userAId) await admin.auth.admin.deleteUser(userAId);
    if (userBId) await admin.auth.admin.deleteUser(userBId);
  });

  it("lets the owning user see their own project", async () => {
    const client = createSupabaseClient(SUPABASE_URL!, ANON_KEY!);
    const { error: signInError } = await client.auth.signInWithPassword({
      email: userAEmail,
      password,
    });
    expect(signInError).toBeNull();

    const { data, error } = await client
      .from("projects")
      .select("id")
      .eq("id", projectId);

    expect(error).toBeNull();
    expect(data).toHaveLength(1);
  });

  it("does not let a different user see or read that project (PRD §52)", async () => {
    const client = createSupabaseClient(SUPABASE_URL!, ANON_KEY!);
    const { error: signInError } = await client.auth.signInWithPassword({
      email: userBEmail,
      password,
    });
    expect(signInError).toBeNull();

    // RLS filters rows rather than raising a permission error — a
    // cross-user read comes back as a successful query with zero rows,
    // not an error. Asserting the *empty result*, not just "no crash", is
    // the actual property PRD §52 cares about.
    const { data, error } = await client
      .from("projects")
      .select("id")
      .eq("id", projectId);

    expect(error).toBeNull();
    expect(data).toHaveLength(0);
  });

  it("does not let a different user see that project via its parent space either", async () => {
    const client = createSupabaseClient(SUPABASE_URL!, ANON_KEY!);
    await client.auth.signInWithPassword({ email: userBEmail, password });

    const { data, error } = await client
      .from("spaces")
      .select("id, projects(id)")
      .eq("owner_id", userAId);

    expect(error).toBeNull();
    expect(data).toHaveLength(0);
  });
});
