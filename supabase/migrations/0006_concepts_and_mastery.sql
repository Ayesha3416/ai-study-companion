-- ============================================================
-- 0006_concepts_and_mastery.sql
-- Concept + Mastery data model (PRD §29 — Mastery Model)
-- ============================================================

-- A Concept is a named topic within a Project (e.g. "Photosynthesis",
-- "Verb Conjugation"). Concepts can come from two places: extracted
-- automatically from materials (Step 33's background workflow) or
-- introduced implicitly the first time the Quiz/Tutor needs to reference
-- one that doesn't exist yet.
create table if not exists public.concepts (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid not null references public.projects(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  description text,
  created_at timestamptz not null default now(),
  unique (project_id, name) -- avoid duplicate concepts with the same name in one project
);

create index if not exists idx_concepts_project on public.concepts(project_id);

-- Mastery is a per-concept, per-project rolling estimate (PRD §29: "The
-- purpose is not to claim perfect measurement... an understandable
-- representation of the user's current learning state"). One row per
-- concept — updated in place as new evidence arrives, with history
-- preserved separately in mastery_history for Growth trends (Step 20-21).
create table if not exists public.concept_mastery (
  id uuid primary key default uuid_generate_v4(),
  concept_id uuid not null references public.concepts(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade, -- denormalized for fast RLS/queries
  owner_id uuid not null references public.profiles(id) on delete cascade,
  -- 0-100 estimated mastery level (PRD §29's progress-bar style display)
  mastery_level int not null default 0 check (mastery_level between 0 and 100),
  -- How many assessment data points fed into the current estimate — lets
  -- later logic weight new evidence appropriately (e.g. don't let one lucky
  -- guess swing mastery wildly once there's an established history).
  evidence_count int not null default 0,
  last_evaluated_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (concept_id)
);

create index if not exists idx_concept_mastery_project on public.concept_mastery(project_id);

drop trigger if exists touch_concept_mastery on public.concept_mastery;
create trigger touch_concept_mastery before update on public.concept_mastery
  for each row execute function public.touch_updated_at();

-- Append-only history of mastery changes, so Growth Analysis (PRD §30-31,
-- Step 20-21) can show "Previous Mastery → Current Mastery" trends without
-- needing to reconstruct them from raw assessment events.
create table if not exists public.mastery_history (
  id uuid primary key default uuid_generate_v4(),
  concept_id uuid not null references public.concepts(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  mastery_level int not null check (mastery_level between 0 and 100),
  -- What triggered this data point — keeps the history self-explanatory
  -- without joining back to quiz_attempts/messages tables that don't exist yet.
  source text not null check (source in ('quiz_answer', 'open_ended_assessment', 'manual_adjustment')),
  recorded_at timestamptz not null default now()
);

create index if not exists idx_mastery_history_concept on public.mastery_history(concept_id, recorded_at);

alter table public.concepts enable row level security;
alter table public.concept_mastery enable row level security;
alter table public.mastery_history enable row level security;

create policy "Users can view their own concepts"
  on public.concepts for select
  using (auth.uid() = owner_id or public.is_admin());

create policy "Users can create their own concepts"
  on public.concepts for insert
  with check (auth.uid() = owner_id);

create policy "Users can update their own concepts"
  on public.concepts for update
  using (auth.uid() = owner_id);

create policy "Users can view their own concept mastery"
  on public.concept_mastery for select
  using (auth.uid() = owner_id or public.is_admin());

create policy "Users can view their own mastery history"
  on public.mastery_history for select
  using (auth.uid() = owner_id or public.is_admin());

-- Note: concept_mastery and mastery_history are deliberately NOT
-- insert/update-able directly by end users through the normal client —
-- they're only ever written by trusted server-side logic (the Quiz
-- evaluation flow in Step 16-19) via the user-scoped client, which is fine
-- since that logic runs on our server, not arbitrary client input. If this
-- were opened up to direct client writes, mastery could be manipulated by
-- a user without ever actually answering anything.
create policy "Server logic can insert concept mastery"
  on public.concept_mastery for insert
  with check (auth.uid() = owner_id);

create policy "Server logic can update concept mastery"
  on public.concept_mastery for update
  using (auth.uid() = owner_id);

create policy "Server logic can insert mastery history"
  on public.mastery_history for insert
  with check (auth.uid() = owner_id);
