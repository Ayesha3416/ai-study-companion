import { createClient } from "@/lib/supabase/server";
import { embedText } from "./embeddings";

export type RetrievedChunk = {
  id: string;
  materialId: string;
  fileName: string;
  content: string;
  pageNumber: number | null;
  similarity: number;
};

// Shape of a row returned by the match_material_chunks() SQL function
// (0004_match_chunks_function.sql). Supabase's .rpc() has no generated
// types to infer this from (no database.types.ts in this project), so the
// row shape is declared explicitly here rather than left implicit.
type MatchedChunkRow = {
  id: string;
  material_id: string;
  content: string;
  page_number: number | null;
  similarity: number;
};

/**
 * Embeds the query and runs a cosine-similarity search over this project's
 * material_chunks (PRD §18 — Grounded AI Learning: "Retrieve Relevant
 * Content"). Results are ordered most-relevant first and include enough
 * info (file name + page number) to build a citation like
 * "Source: Document Name — Page 14" (PRD §19).
 *
 * Relies on the caller's own Supabase session (via createClient(), not the
 * admin client) so Row Level Security enforces project ownership even if
 * something upstream passes the wrong projectId.
 */
export async function retrieveRelevantChunks(
  projectId: string,
  query: string,
  topK = 5
): Promise<RetrievedChunk[]> {
  const supabase = await createClient();
  const queryEmbedding = await embedText(query);

  const { data, error } = await supabase.rpc("match_material_chunks", {
    query_embedding: queryEmbedding,
    match_project_id: projectId,
    match_count: topK,
  });

  if (error) throw error;
  const rows = (data ?? []) as MatchedChunkRow[];
  if (rows.length === 0) return [];

  const materialIds = [...new Set(rows.map((c) => c.material_id))];
  const { data: materials, error: materialsError } = await supabase
    .from("materials")
    .select("id, file_name")
    .in("id", materialIds);

  if (materialsError) throw materialsError;

  const fileNameById = new Map(
    (materials ?? []).map((m) => [m.id, m.file_name])
  );

  return rows.map((chunk) => ({
    id: chunk.id,
    materialId: chunk.material_id,
    fileName: fileNameById.get(chunk.material_id) ?? "Unknown document",
    content: chunk.content,
    pageNumber: chunk.page_number,
    similarity: chunk.similarity,
  }));
}

/**
 * A simple, tunable gate for PRD §20 (Handling Unsupported Questions): if
 * even the best-matching chunk is a weak match, there isn't enough reliable
 * evidence to answer confidently.
 *
 * Threshold calibrated empirically against gemini-embedding-001 (768-dim)
 * scores on real content: a genuinely relevant query scored ~0.49, a
 * clearly unrelated query scored ~0.40 on the same document. 0.45 sits
 * between those two observed clusters. This is based on a small sample from
 * one document — revisit with more/varied real Tutor queries once traffic
 * exists, and consider making it per-project or content-type tunable rather
 * than a single global constant if false positives/negatives show up.
 */
export function hasReliableEvidence(
  chunks: RetrievedChunk[],
  threshold = 0.45
): boolean {
  return chunks.length > 0 && chunks[0].similarity >= threshold;
}