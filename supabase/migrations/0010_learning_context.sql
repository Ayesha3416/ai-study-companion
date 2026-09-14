-- ============================================================
-- 0010_learning_context.sql
-- Persistent Learning Context (PRD §17, §39-40)
-- ============================================================

-- Holds "important information that remains useful across future learning
-- sessions" (PRD §39): known strengths/weaknesses, assessment mistakes,
-- tutor notes, preferences. Deliberately separate from `conversations`/
-- `messages` (Step 5's short-term chat history) and from `concept_mastery`
-- (Step 15's numeric estimate) — this table holds curated, human-readable
-- *reasons* worth surfacing to future AI requests, not raw transcripts or
-- scores. `mastery_level` already gives you the "what" (72%); this table
-- gives the tutor the "why it matters right now" (a one-line note to fold
-- into a prompt).
create table if not exists public.learning_context (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid not null references public.projects(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  context_type text not null check (context_type in (
    'known_weakness',      -- auto-derived from low mastery (PRD §39 "Known Weaknesses")
    'known_strength',      -- auto-derived from high mastery (PRD §39 "Known Strengths")
    'assessment_mistake',  -- auto-derived from a specific graded answer (PRD §39 "Assessment Context")
    'preference',          -- explicit or inferred learning preference (PRD §39 "Learning Preferences")
    'tutor_note'           -- carried forward from a Tutor conversation (PRD §39 "Important Tutor Context")
  )),
  content text not null, -- short, human-readable — this gets folded directly into prompts, not parsed
  concept_id uuid references public.concepts(id) on delete set null, -- nullable: not every entry is concept-specific (e.g. a general preference)
  -- Lets older/superseded entries fade without deleting the row outright.
  -- Retrieval (getRelevantContext) orders by this, so a stale note simply
  -- stops surfacing rather than needing active cleanup.
  relevance_score int not null default 100 check (relevance_score between 0 and 100),
  source text not null default 'ai_inferred' check (source in ('ai_inferred', 'user', 'system')),
  created_at timestamptz not null default now()
);

create index if not exists idx_learning_context_project on public.learning_context(project_id, relevance_score desc, created_at desc);

-- One active "status" entry per concept for the two mastery-derived types —
-- lets syncConceptMasteryContext() upsert-in-place as mastery moves rather
-- than accumulating an ever-growing trail of stale weakness/strength notes
-- for the same concept.
create unique index if not exists idx_learning_context_concept_status
  on public.learning_context(project_id, concept_id, context_type)
  where concept_id is not null and context_type in ('known_weakness', 'known_strength');

alter table public.learning_context enable row level security;

create policy "Users can view their own learning context"
  on public.learning_context for select
  using (auth.uid() = owner_id or public.is_admin());

-- No direct client insert/update/delete policy: every write goes through
-- server-side logic (mastery updates, grading, tutor) using the
-- user-scoped client, which already runs as the authenticated user's own
-- session — same trust boundary as concept_mastery/mastery_history
-- (Step 15's migration note applies equally here).
create policy "Server logic can insert learning context"
  on public.learning_context for insert
  with check (auth.uid() = owner_id);

create policy "Server logic can update learning context"
  on public.learning_context for update
  using (auth.uid() = owner_id);

create policy "Server logic can delete learning context"
  on public.learning_context for delete
  using (auth.uid() = owner_id);
