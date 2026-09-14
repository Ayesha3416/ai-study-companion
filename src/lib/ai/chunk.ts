export type Chunk = {
  content: string;
  pageNumber: number;
};

const CHUNK_SIZE_CHARS = 1000;
const CHUNK_OVERLAP_CHARS = 150;

/**
 * Splits each page's text into overlapping chunks of roughly CHUNK_SIZE_CHARS,
 * preserving which page each chunk came from (needed for Tutor citations —
 * PRD §19: "Source: Document Name — Page 14").
 *
 * Overlap keeps sentences that straddle a chunk boundary from losing context.
 */
export function chunkPages(pages: string[]): Chunk[] {
  const chunks: Chunk[] = [];

  pages.forEach((pageText, pageIndex) => {
    const cleaned = pageText.replace(/\s+/g, " ").trim();
    if (!cleaned) return;

    let start = 0;
    while (start < cleaned.length) {
      const end = Math.min(start + CHUNK_SIZE_CHARS, cleaned.length);
      const content = cleaned.slice(start, end).trim();
      if (content.length > 0) {
        chunks.push({ content, pageNumber: pageIndex + 1 });
      }
      if (end === cleaned.length) break;
      start = end - CHUNK_OVERLAP_CHARS;
    }
  });

  return chunks;
}
