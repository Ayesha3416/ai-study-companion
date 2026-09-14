import { describe, it, expect } from "vitest";
import { hasReliableEvidence, type RetrievedChunk } from "./retrieval";

function chunk(similarity: number): RetrievedChunk {
  return {
    id: "c1",
    materialId: "m1",
    fileName: "doc.pdf",
    content: "some content",
    pageNumber: 1,
    similarity,
  };
}

describe("hasReliableEvidence (PRD §20 — unsupported-question gate)", () => {
  it("has no evidence when no chunks were retrieved at all", () => {
    expect(hasReliableEvidence([])).toBe(false);
  });

  it("rejects a best match below the threshold — the documented 'unrelated query' case", () => {
    // Calibration note from retrieval.ts: an unrelated query scored ~0.40
    // in real testing against this threshold.
    expect(hasReliableEvidence([chunk(0.4)])).toBe(false);
  });

  it("accepts a best match at or above the threshold — the documented 'relevant query' case", () => {
    // Calibration note from retrieval.ts: a genuinely relevant query
    // scored ~0.49 in real testing.
    expect(hasReliableEvidence([chunk(0.49)])).toBe(true);
  });

  it("only looks at the best (first) match, not every retrieved chunk", () => {
    // Chunks are already ordered most-relevant-first by retrieveRelevantChunks
    // — a strong top match should pass even if the rest of the batch is weak.
    expect(hasReliableEvidence([chunk(0.9), chunk(0.1), chunk(0.05)])).toBe(true);
  });

  it("respects a custom threshold override", () => {
    expect(hasReliableEvidence([chunk(0.5)], 0.6)).toBe(false);
    expect(hasReliableEvidence([chunk(0.5)], 0.4)).toBe(true);
  });

  it("treats the threshold as inclusive", () => {
    expect(hasReliableEvidence([chunk(0.45)], 0.45)).toBe(true);
  });
});
