import { describe, it, expect } from "vitest";
import { selectQuizFocus, type MasteryRow } from "./quiz";

function mastery(level: number, name = "concept"): MasteryRow {
  return { mastery_level: level, concepts: { id: name, name } };
}

describe("selectQuizFocus", () => {
  it("explores a new concept when fewer than 3 concepts exist, even with mastery data present", () => {
    // Regression test for the real bug documented in quiz.ts: with only
    // one concept, it is *always* "the weakest" by definition, so pinning
    // to mastery[0] here would make it structurally impossible for a
    // second concept to ever be introduced. This is exactly the bug that
    // shipped before it was caught by a user noticing Growth only ever
    // showed one concept — a test like this would have caught it
    // immediately, per this project's own Step 34 rationale.
    const result = selectQuizFocus({
      mastery: [mastery(20, "only-concept")],
      existingConceptCount: 1,
      questionCount: 5, // not a multiple of 3 — the *concept count* branch must still trigger on its own
    });

    expect(result.shouldExploreNewConcept).toBe(true);
    expect(result.targetConcept).toBeNull();
  });

  it("pins to the weakest concept once coverage is established and it's not an explore turn", () => {
    const weakest = mastery(20, "weak");
    const result = selectQuizFocus({
      mastery: [weakest, mastery(80, "strong")],
      existingConceptCount: 5,
      questionCount: 4, // not a multiple of 3
    });

    expect(result.shouldExploreNewConcept).toBe(false);
    expect(result.targetConcept).toBe(weakest);
  });

  it("explores a new concept every 3rd question even with established coverage", () => {
    const result = selectQuizFocus({
      mastery: [mastery(20)],
      existingConceptCount: 5,
      questionCount: 6, // 6 % 3 === 0
    });

    expect(result.shouldExploreNewConcept).toBe(true);
    expect(result.targetConcept).toBeNull();
  });

  it("falls back to no target concept when there is no mastery data yet, without exploring unnecessarily", () => {
    const result = selectQuizFocus({
      mastery: [],
      existingConceptCount: 5,
      questionCount: 4,
    });

    expect(result.targetConcept).toBeNull();
    expect(result.difficulty).toBe("easy"); // no evidence yet — deriveDifficulty(null)
  });

  describe("difficulty derivation (PRD §26 — smoothed, not reflexive)", () => {
    it.each([
      [null, "easy"],
      [0, "easy"],
      [39, "easy"],
      [40, "medium"],
      [69, "medium"],
      [70, "hard"],
      [100, "hard"],
    ] as const)("mastery %s -> %s", (masteryLevel, expected) => {
      const result = selectQuizFocus({
        mastery: masteryLevel === null ? [] : [mastery(masteryLevel)],
        existingConceptCount: 5, // established coverage, not an explore turn
        questionCount: 1,
      });
      expect(result.difficulty).toBe(expected);
    });
  });
});
