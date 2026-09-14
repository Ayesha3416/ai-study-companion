-- ============================================================
-- 0009_recommendations.sql
-- Learning Recommendations (PRD §32)
-- ============================================================

create table if not exists public.recommendations (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid not null references public.projects(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  concept_id uuid references public.concepts(id) on delete set null, -- nullable: a recommendation may not target one specific concept
  message text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_recommendations_project on public.recommendations(project_id, created_at desc);

alter table public.recommendations enable row level security;

create policy "Users can view their own recommendations"
  on public.recommendations for select
  using (auth.uid() = owner_id or public.is_admin());

create policy "Users can create their own recommendations"
  on public.recommendations for insert
  with check (auth.uid() = owner_id);
