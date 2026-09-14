-- ============================================================
-- 0008_activity_events.sql
-- Activity/event tracking (PRD §37-38)
-- ============================================================

-- Deliberately no CHECK constraint on event_type: PRD §37 explicitly
-- requires "new event types can be introduced without requiring major
-- architectural changes." Type-safety for event_type is enforced in
-- application code instead (src/lib/activity/events.ts's ActivityEventType
-- union), which is fine — this table only exists to be inserted into and
-- read from, never joined against structurally.
create table if not exists public.activity_events (
  id uuid primary key default uuid_generate_v4(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  space_id uuid references public.spaces(id) on delete cascade,
  project_id uuid references public.projects(id) on delete cascade,
  event_type text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_activity_events_owner on public.activity_events(owner_id, created_at desc);
create index if not exists idx_activity_events_project on public.activity_events(project_id, created_at desc);
create index if not exists idx_activity_events_type on public.activity_events(event_type);

alter table public.activity_events enable row level security;

create policy "Users can view their own activity"
  on public.activity_events for select
  using (auth.uid() = owner_id or public.is_admin());

-- No insert policy for the authenticated role: events are always written
-- via the service-role admin client (src/lib/activity/events.ts), the same
-- pattern already used for material processing status updates. This keeps
-- activity logs tamper-proof from the client's perspective.
