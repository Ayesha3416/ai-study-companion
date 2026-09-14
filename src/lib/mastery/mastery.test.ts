import { describe, it, expect } from "vitest";
import { computeUpdatedMastery } from "./mastery";

describe("computeUpdatedMastery", () => {
  it("sets mastery directly to the score on the very first piece of evidence", () => {
    // evidenceCount 0 -> learningRate = max(0.15, 1/1) = 1 -> full jump.
    // There's nothing to weigh the new evidence against yet.
    expect(
      computeUpdatedMastery({ previousLevel: 0, evidenceCount: 0, scorePercent: 72 })
    ).toBe(72);
  });

  it("moves partway toward the new score once some evidence already exists", () => {
    // evidenceCount 1 -> learningRate = max(0.15, 1/2) = 0.5
    // 50 + 0.5 * (100 - 50) = 75
    expect(
      computeUpdatedMastery({ previousLevel: 50, evidenceCount: 1, scorePercent: 100 })
    ).toBe(75);
  });

  it("never fully freezes even after a lot of evidence (MIN_LEARNING_RATE floor)", () => {
    // evidenceCount 100 -> 1/101 ≈ 0.0099, which is below the 0.15 floor,
    // so the floor applies instead: 60 + 0.15 * (100 - 60) = 66
    expect(
      computeUpdatedMastery({ previousLevel: 60, evidenceCount: 100, scorePercent: 100 })
    ).toBe(66);
  });

  it("moves mastery down on a poor score, not just up", () => {
    // evidenceCount 1 -> learningRate 0.5; 80 + 0.5 * (0 - 80) = 40
    expect(
      computeUpdatedMastery({ previousLevel: 80, evidenceCount: 1, scorePercent: 0 })
    ).toBe(40);
  });

  it("is a no-op when the new score exactly matches the existing estimate", () => {
    expect(
      computeUpdatedMastery({ previousLevel: 55, evidenceCount: 3, scorePercent: 55 })
    ).toBe(55);
  });
});
