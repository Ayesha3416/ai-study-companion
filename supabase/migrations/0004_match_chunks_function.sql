-- ============================================================
-- 0004_match_chunks_function.sql
-- Vector similarity search over material_chunks, scoped to a project.
-- ============================================================

create or replace function public.match_material_chunks(
  query_embedding vector(768),
  match_project_id uuid,
  match_count int default 5
)
returns table (
  id uuid,
  material_id uuid,
  content text,
  page_number int,
  similarity float
)
language sql
stable
as $$
  select
    mc.id,
    mc.material_id,
    mc.content,
    mc.page_number,
    1 - (mc.embedding <=> query_embedding) as similarity
  from public.material_chunks mc
  where mc.project_id = match_project_id
  order by mc.embedding <=> query_embedding
  limit match_count;
$$;

-- Deliberately NOT `security definer` — this function runs with the
-- caller's own permissions, so the material_chunks RLS policy (select only
-- where owner_id = auth.uid()) still applies underneath it. Even if a
-- caller passed another user's project_id, RLS ensures zero rows come back
-- rather than leaking that project's content (PRD §52 — AI retrieval must
-- respect Project boundaries).
grant execute on function public.match_material_chunks(vector, uuid, int) to authenticated;
