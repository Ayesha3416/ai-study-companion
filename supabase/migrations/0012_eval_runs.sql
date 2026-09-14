-- ============================================================
-- 0012_eval_runs.sql
-- Basic AI evaluation harness (Step 32, PRD §46-47)
-- ============================================================
--
-- One row per harness run. Results are stored as jsonb rather than a
-- separate eval_results table — a run's cases are a fixed, small, read-
-- together unit (never queried case-by-case across runs), so a normalized
-- table would add join overhead for no real benefit at this scale. This
-- does mean "compare this case across runs" (PRD §47) requires reading a
-- few rows' jsonb rather than a single indexed query — acceptable at the
-- number of runs a prototype will ever accumulate; revisit if this table
-- needs querying by individual case result at scale.

create table if not exists public.eval_runs (
  id uuid primary key default uuid_generate_v4(),
  -- Who triggered it, and which project the Tutor-category cases ran
  -- against (null if no eligible project existed — see runner.ts). Both
  -- ON DELETE SET NULL: an eval run's historical result shouldn't vanish
  -- just because the triggering admin or the test project was later
  -- deleted, same reasoning as ai_requests.
  triggered_by uuid references public.profiles(id) on delete set null,
  project_id uuid references public.projects(id) on delete set null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  total_count int not null default 0,
  pass_count int not null default 0,
  fail_count int not null default 0,
  skipped_count int not null default 0,
  -- Array of {id, category, name, status, detail, latencyMs}.
  results jsonb not null default '[]'::jsonb
);

create index if not exists idx_eval_runs_started on public.eval_runs(started_at desc);

alter table public.eval_runs enable row level security;

create policy "Admins can view eval runs"
  on public.eval_runs for select
  using (public.is_admin());

-- No insert/update policy for the authenticated role: only ever written
-- via the service-role admin client from runner.ts, which itself is only
-- ever invoked from an already requireAdmin()-gated server action — same
-- tamper-proofing posture as activity_events/ai_requests.
