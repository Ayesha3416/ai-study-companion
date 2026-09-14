// Cost estimation for src/lib/admin/ai-requests.ts (Step 31, PRD §43).
//
// Rates verified against Groq's published rate card as of Sept 2026 (cross-
// checked across multiple independent trackers, all agreeing):
// openai/gpt-oss-120b — $0.15 / 1M input tokens, $0.60 / 1M output tokens.
// This is exactly the model this project's provider.ts hardcodes as
// TEXT_MODEL. Groq's pricing page has moved/been restructured before
// (see provider.ts's own comment about the Aug 2026 Llama 3.3 70B
// deprecation) — revisit this rate if TEXT_MODEL ever changes, or
// periodically to catch a rate change on the same model.
//
// Deliberately a lookup keyed by model name, not a single constant: an
// unrecognized model returns `null` rather than a guessed number, same
// "never fabricate a cost we haven't verified" rule Step 29 already
// applies to Langfuse's cost field.
const PRICING_PER_MILLION_TOKENS: Record<
  string,
  { input: number; output: number }
> = {
  "openai/gpt-oss-120b": { input: 0.15, output: 0.6 },
};

export function estimateCostUsd(
  model: string,
  inputTokens: number,
  outputTokens: number
): number | null {
  const rate = PRICING_PER_MILLION_TOKENS[model];
  if (!rate) return null;
  return (
    (inputTokens / 1_000_000) * rate.input +
    (outputTokens / 1_000_000) * rate.output
  );
}
