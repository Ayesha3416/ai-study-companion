-- ============================================================
-- 0002_materials.sql
-- Materials table + Storage bucket + Storage RLS policies
-- Run this in Supabase SQL Editor
-- ============================================================

-- ---------- Materials table ----------
-- Status states mirror PRD §13's processing pipeline. We only ever set
-- 'queued' from the app; Step 7 (Inngest background job) will drive the
-- transitions between the rest of these states.
create table if not exists public.materials (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid not null references public.projects(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade, -- denormalized for fast RLS
  file_name text not null,
  storage_path text not null, -- path within the 'materials' storage bucket
  file_size_bytes bigint,
  status text not null default 'queued' check (status in (
    'queued',
    'processing',
    'reading_content',
    'understanding_structure',
    'extracting_knowledge',
    'creating_searchable_representation',
    'ready',
    'failed'
  )),
  error_message text, -- populated if status = 'failed'
  page_count int,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_materials_project on public.materials(project_id);
create index if not exists idx_materials_owner on public.materials(owner_id);

drop trigger if exists touch_materials on public.materials;
create trigger touch_materials before update on public.materials
  for each row execute function public.touch_updated_at();

alter table public.materials enable row level security;

create policy "Users can view their own materials"
  on public.materials for select
  using (auth.uid() = owner_id or public.is_admin());

create policy "Users can create their own materials"
  on public.materials for insert
  with check (auth.uid() = owner_id);

create policy "Users can update their own materials"
  on public.materials for update
  using (auth.uid() = owner_id);

create policy "Users can delete their own materials"
  on public.materials for delete
  using (auth.uid() = owner_id);

-- ============================================================
-- Storage bucket for uploaded PDFs
-- ============================================================
-- Private bucket — files are never publicly accessible by URL.
-- Access always goes through a signed URL generated server-side after an
-- ownership check, or through the authenticated Supabase client (RLS below).
insert into storage.buckets (id, name, public)
values ('materials', 'materials', false)
on conflict (id) do nothing;

-- Files are stored at path: {owner_id}/{project_id}/{uuid}-{filename}.pdf
-- so RLS can check the first path segment against auth.uid().

create policy "Users can upload their own material files"
  on storage.objects for insert
  with check (
    bucket_id = 'materials'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Users can view their own material files"
  on storage.objects for select
  using (
    bucket_id = 'materials'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Users can delete their own material files"
  on storage.objects for delete
  using (
    bucket_id = 'materials'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
