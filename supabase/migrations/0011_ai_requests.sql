-- ============================================================
-- 0011_ai_requests.sql
-- First-party AI usage/cost tracking (PRD §43)
-- ============================================================
--
-- Scoping decision (Step 31, documented per PRD §81): this is deliberately
-- a lean metrics table, not a duplicate of Langfuse's full tracing (no
-- prompt/output text stored here). Two things justified building this
-- despite Langfuse (Step 9) already existing:
--   1. Resilience — Admin's AI Usage view (Step 29) is currently 100%
--      dependent on Langfuse being reachable. This table is a first-party
--      record this app fully owns, so a Langfuse outage doesn't erase
--      visibility into AI usage.
--   2. Real cost data — Langfuse only prices models it has registered,
--      and Groq's openai/gpt-oss-120b isn't one of them (Step 29's
--      totalCostUsd reads `null` for exactly this reason). This table
--      prices requests itself (src/lib/ai/pricing.ts) so estimated cost is
--      actually populated for the model this app uses.
--
-- Only generateText/generateStructured calls are logged here (same
-- boundary Step 29's Langfuse GENERATION-type query already draws) —
-- embeddings calls are a separate, much cheaper, non-conversational cost
-- category and out of scope for this table, consistent with that
-- precedent rather than a new one.

create table if not exists public.ai_requests (
  id uuid primary key default uuid_generate_v4(),
  -- Nullable + ON DELETE SET NULL (not CASCADE): a usage/cost record is
  -- historical accounting data. If the user or project is later deleted,
  -- the spend that already happened shouldn't disappear from the ledger,
  -- unlike e.g. quiz_questions which are meaningless without their parent.
  owner_id uuid references public.profiles(id) on delete set null,
  project_id uuid references public.projects(id) on delete set null,
  feature text not null, -- mirrors provider.ts's `feature:` option (tutor_response, quiz_generation, open_ended_grading, recommendation_generation)
  model text not null,
  input_tokens int not null default 0,
  output_tokens int not null default 0,
  latency_ms int not null,
  -- Null (not 0) when the model isn't in our pricing table yet — never
  -- fabricate a cost for a model we haven't verified pricing for.
  estimated_cost_usd numeric(12, 6),
  success boolean not null,
  error_message text,
  created_at timestamptz not null default now()
);

create index if not exists idx_ai_requests_owner on public.ai_requests(owner_id, created_at desc);
create index if not exists idx_ai_requests_project on public.ai_requests(project_id, created_at desc);
create index if not exists idx_ai_requests_created on public.ai_requests(created_at desc);
create index if not exists idx_ai_requests_feature on public.ai_requests(feature);

alter table public.ai_requests enable row level security;

create policy "Users can view their own AI requests, admins view all"
  on public.ai_requests for select
  using (auth.uid() = owner_id or public.is_admin());

-- No insert policy for the authenticated role, deliberately: like
-- activity_events, this is only ever written via the service-role admin
-- client (src/lib/ai/usage-log.ts), called from inside provider.ts right
-- after every Groq call completes or fails. Keeps the usage/cost ledger
-- something the client can never spoof, same tamper-proofing reasoning as
-- 0008_activity_events.sql.
