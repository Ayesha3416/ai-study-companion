-- ============================================================
-- 0001_core_schema.sql
-- Profiles, Spaces, Projects + Row Level Security (project isolation)
-- Run this in Supabase SQL Editor (or via `supabase db push` if using CLI)
-- ============================================================

-- ---------- Extensions ----------
create extension if not exists "uuid-ossp";
create extension if not exists vector; -- pgvector, needed later for embeddings

-- ---------- Profiles ----------
-- Mirrors auth.users, adds app-specific fields (role for admin dashboard access)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  role text not null default 'user' check (role in ('user', 'admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Auto-create a profile row whenever a new auth user signs up
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email);
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- Spaces ----------
create table if not exists public.spaces (
  id uuid primary key default uuid_generate_v4(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  description text,
  icon text, -- optional visual identity, e.g. emoji or color hex
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_spaces_owner on public.spaces(owner_id);

-- ---------- Projects ----------
create table if not exists public.projects (
  id uuid primary key default uuid_generate_v4(),
  space_id uuid not null references public.spaces(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade, -- denormalized for fast RLS + queries
  name text not null,
  description text,
  goal text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_projects_space on public.projects(space_id);
create index if not exists idx_projects_owner on public.projects(owner_id);

-- ---------- updated_at auto-touch trigger (reusable) ----------
create or replace function public.touch_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists touch_spaces on public.spaces;
create trigger touch_spaces before update on public.spaces
  for each row execute function public.touch_updated_at();

drop trigger if exists touch_projects on public.projects;
create trigger touch_projects before update on public.projects
  for each row execute function public.touch_updated_at();

-- ============================================================
-- ROW LEVEL SECURITY  (PRD §52 — Security & Data Isolation)
-- ============================================================

alter table public.profiles enable row level security;
alter table public.spaces enable row level security;
alter table public.projects enable row level security;

-- Helper: is the current user an admin?
create or replace function public.is_admin()
returns boolean as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$ language sql stable security definer;

-- ---- profiles policies ----
create policy "Users can view their own profile"
  on public.profiles for select
  using (auth.uid() = id or public.is_admin());

create policy "Users can update their own profile"
  on public.profiles for update
  using (auth.uid() = id);

-- ---- spaces policies ----
create policy "Users can view their own spaces"
  on public.spaces for select
  using (auth.uid() = owner_id or public.is_admin());

create policy "Users can create their own spaces"
  on public.spaces for insert
  with check (auth.uid() = owner_id);

create policy "Users can update their own spaces"
  on public.spaces for update
  using (auth.uid() = owner_id);

create policy "Users can delete their own spaces"
  on public.spaces for delete
  using (auth.uid() = owner_id);

-- ---- projects policies ----
create policy "Users can view their own projects"
  on public.projects for select
  using (auth.uid() = owner_id or public.is_admin());

create policy "Users can create their own projects"
  on public.projects for insert
  with check (auth.uid() = owner_id);

create policy "Users can update their own projects"
  on public.projects for update
  using (auth.uid() = owner_id);

create policy "Users can delete their own projects"
  on public.projects for delete
  using (auth.uid() = owner_id);

-- ============================================================
-- NOTE: To make your own account an admin (for testing the Admin
-- Dashboard later), run this manually after you sign up once:
--
--   update public.profiles set role = 'admin' where email = 'you@example.com';
-- ============================================================