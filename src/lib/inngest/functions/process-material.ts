import { PDFParse } from "pdf-parse";
import { inngest } from "../client";
import { createAdminClient } from "@/lib/supabase/admin";
import { chunkPages } from "@/lib/ai/chunk";
import { embedTexts } from "@/lib/ai/embeddings";
import { recordActivityEvent } from "@/lib/activity/events";

// Mirrors the pipeline in PRD §13.
type MaterialStatus =
  | "queued"
  | "processing"
  | "reading_content"
  | "understanding_structure"
  | "extracting_knowledge"
  | "creating_searchable_representation"
  | "ready"
  | "failed";

async function setStatus(
  materialId: string,
  status: MaterialStatus,
  extra: Record<string, unknown> = {}
) {
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("materials")
    .update({ status, ...extra })
    .eq("id", materialId);
  if (error) throw error;
}

export const processMaterial = inngest.createFunction(
  {
    id: "process-material",
    triggers: [{ event: "material/uploaded" }],
    retries: 3,
    // If every retry is exhausted, mark the material as failed instead of
    // leaving it stuck "processing" forever (PRD §49 — a failed AI/background
    // step must not silently corrupt learning state).
    onFailure: async ({ event }) => {
      const originalEvent = event.data.event;
      const materialId = originalEvent.data.materialId as string;
      await setStatus(materialId, "failed", {
        error_message:
          "Processing failed after multiple attempts. Try re-uploading the file.",
      });

      // Fetch owner/project for the activity event — onFailure doesn't have
      // these in scope otherwise.
      const supabase = createAdminClient();
      const { data: material } = await supabase
        .from("materials")
        .select("owner_id, project_id")
        .eq("id", materialId)
        .single();
      if (material) {
        await recordActivityEvent({
          ownerId: material.owner_id,
          eventType: "material_processing_failed",
          projectId: material.project_id,
          metadata: { materialId },
        });
      }
    },
  },
  async ({ event, step }) => {
    const { materialId } = event.data as { materialId: string };
    const supabase = createAdminClient();

    // ---- 1. Load the material record ----
    const material = await step.run("load-material", async () => {
      const { data, error } = await supabase
        .from("materials")
        .select("id, project_id, owner_id, storage_path")
        .eq("id", materialId)
        .single();
      if (error || !data) throw new Error("Material not found");
      return data;
    });

    await step.run("mark-processing", () =>
      setStatus(materialId, "processing")
    );

    await step.run("record-processing-started", () =>
      recordActivityEvent({
        ownerId: material.owner_id,
        eventType: "material_processing_started",
        projectId: material.project_id,
        metadata: { materialId },
      })
    );

    // ---- 2. Download the PDF from Storage ----
    const fileBase64 = await step.run("download-file", async () => {
      const { data, error } = await supabase.storage
        .from("materials")
        .download(material.storage_path);
      if (error || !data) throw new Error("Could not download file");
      const buffer = Buffer.from(await data.arrayBuffer());
      // Step results are JSON-serialized by Inngest, so we pass the file as
      // base64 rather than a raw Buffer.
      return buffer.toString("base64");
    });

    await step.run("mark-reading-content", () =>
      setStatus(materialId, "reading_content")
    );

    // ---- 3. Extract text per page ----
    // A single getText() call with a custom pageJoiner marker is far faster
    // than looping getText({ partial: [n] }) once per page — pdf-parse
    // inserts the marker (with the real page number substituted in) between
    // every page's text in one pass over the document.
    const { pages, pageCount } = await step.run("extract-text", async () => {
      const buffer = Buffer.from(fileBase64, "base64");
      const parser = new PDFParse({ data: buffer });

      try {
        const result = await parser.getText({
          pageJoiner: "<<<PDF_PAGE_page_number>>>",
        });

        // Splitting on a regex with a capture group interleaves the text
        // segments with the captured page numbers:
        // [page1Text, "1", page2Text, "2", ..., pageNText, "N", trailing?]
        const parts = result.text.split(/<<<PDF_PAGE_(\d+)>>>/);
        const pages: string[] = [];
        for (let i = 0; i < parts.length - 1; i += 2) {
          pages.push(parts[i]);
        }

        return { pages, pageCount: pages.length };
      } finally {
        await parser.destroy();
      }
    });

    await step.run("mark-understanding-structure", () =>
      setStatus(materialId, "understanding_structure")
    );

    // ---- 4. Chunk the text ----
    const chunks = await step.run("chunk-text", async () => chunkPages(pages));

    if (chunks.length === 0) {
      throw new Error(
        "No extractable text found — the PDF may be scanned/image-only, which isn't supported yet"
      );
    }

    await step.run("mark-extracting-knowledge", () =>
      setStatus(materialId, "extracting_knowledge")
    );

    await step.run("mark-creating-searchable-representation", () =>
      setStatus(materialId, "creating_searchable_representation")
    );

    // ---- 5. Embed + store chunks ----
    // Idempotent by design: delete any existing chunks for this material
    // before inserting fresh ones, so retries never produce duplicates
    // (PRD §50 — idempotency for retried operations).
    await step.run("embed-and-store-chunks", async () => {
      const embeddings = await embedTexts(chunks.map((c) => c.content));

      await supabase.from("material_chunks").delete().eq("material_id", materialId);

      const rows = chunks.map((chunk, index) => ({
        material_id: materialId,
        project_id: material.project_id,
        owner_id: material.owner_id,
        chunk_index: index,
        page_number: chunk.pageNumber,
        content: chunk.content,
        embedding: embeddings[index],
      }));

      // Insert in batches to keep request payloads reasonable.
      const BATCH_SIZE = 50;
      for (let i = 0; i < rows.length; i += BATCH_SIZE) {
        const { error } = await supabase
          .from("material_chunks")
          .insert(rows.slice(i, i + BATCH_SIZE));
        if (error) throw error;
      }
    });

    // ---- 6. Done ----
    await step.run("mark-ready", () =>
      setStatus(materialId, "ready", { page_count: pageCount })
    );

    await step.run("record-processing-completed", () =>
      recordActivityEvent({
        ownerId: material.owner_id,
        eventType: "material_processing_completed",
        projectId: material.project_id,
        metadata: { materialId, pageCount, chunkCount: chunks.length },
      })
    );

    return { materialId, pageCount, chunkCount: chunks.length };
  }
);
