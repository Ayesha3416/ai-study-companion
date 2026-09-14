-- ============================================================
-- 0003_material_chunks.sql
-- Stores chunked + embedded text from processed materials.
-- Written only by the background job (service-role client), never
-- directly by end users — so no insert/update/delete RLS policies exist,
-- only select (for future Tutor retrieval queries in Step 9-13).
-- ============================================================

create table if not exists public.material_chunks (
  id uuid primary key default uuid_generate_v4(),
  material_id uuid not null references public.materials(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade, -- denormalized for fast retrieval scoping
  owner_id uuid not null references public.profiles(id) on delete cascade,
  chunk_index int not null,
  page_number int,
  content text not null,
  -- 768 dims: matches gemini-embedding-001 with outputDimensionality=768
  -- (Google recommends 768/1536/3072; 768 balances retrieval quality vs.
  -- storage/index cost for a prototype).
  embedding vector(768),
  created_at timestamptz not null default now(),
  unique (material_id, chunk_index)
);

create index if not exists idx_material_chunks_project on public.material_chunks(project_id);
create index if not exists idx_material_chunks_material on public.material_chunks(material_id);

-- HNSW index for fast approximate nearest-neighbor search on embeddings.
-- Cosine distance matches how we'll query in the Tutor's retrieval step.
create index if not exists idx_material_chunks_embedding
  on public.material_chunks using hnsw (embedding vector_cosine_ops);

alter table public.material_chunks enable row level security;

-- Only SELECT is exposed to end users (via their own project's data).
-- Writes only ever happen through the service-role client in the
-- background job, which bypasses RLS entirely by design.
create policy "Users can view chunks from their own projects"
  on public.material_chunks for select
  using (auth.uid() = owner_id or public.is_admin());
