const EMBEDDING_MODEL = "gemini-embedding-001";
const OUTPUT_DIMENSIONS = 768;

/**
 * Provider abstraction (PRD §41): feature code should always call
 * embedText()/embedTexts() from here, never call the Google SDK/fetch
 * directly. Swapping embedding providers later means changing only this file.
 */

// PRD §49 gap found in Step 33's audit: Groq calls (provider.ts) get 2 free
// retries with backoff on transient failures via the groq-sdk itself
// (network errors, 408/409/429, >=500 — confirmed from the SDK's own docs,
// not assumed). This raw `fetch()` to Google's embedding API had none —
// meaning a single transient blip here failed a live Tutor/Quiz/Grading/
// Recommendation request outright, even though the Groq call sitting right
// next to it in the same request would have quietly retried through the
// exact same kind of blip. Background material processing (Inngest) was
// already fine — Inngest retries the whole `step.run()` around
// `embedTexts` at the job level — this fix is specifically for the
// synchronous, request-time embedding calls in `retrieval.ts` that had no
// safety net of their own. Mirrors the SDK's own retry criteria rather than
// inventing different ones: retry connection errors, 408, 409, 429, and
// >=500; never retry 4xx errors like 401/403/400, since those mean
// something is actually wrong (bad API key, bad request) that retrying
// won't fix.
const MAX_EMBED_ATTEMPTS = 3;

function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 409 || status === 429 || status >= 500;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function embedTextOnce(text: string, apiKey: string): Promise<number[]> {
  let res: Response;
  try {
    res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${EMBEDDING_MODEL}:embedContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: { parts: [{ text }] },
          outputDimensionality: OUTPUT_DIMENSIONS,
        }),
      }
    );
  } catch (error) {
    // A thrown fetch (DNS/connection failure, "fetch failed") has no
    // status code to check — always worth retrying, same as the SDK
    // treating connection errors as retryable by default.
    throw new RetryableEmbeddingError(
      `Embedding request network failure: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  if (!res.ok) {
    const body = await res.text();
    const message = `Embedding request failed (${res.status}): ${body}`;
    if (isRetryableStatus(res.status)) throw new RetryableEmbeddingError(message);
    throw new Error(message); // 4xx other than 408/409/429 — retrying won't help
  }

  const data = await res.json();
  const values: number[] | undefined = data?.embedding?.values;

  if (!values || values.length !== OUTPUT_DIMENSIONS) {
    // A malformed-but-200 response is unusual enough that a retry is cheap
    // insurance, but not worth a whole separate error class for.
    throw new RetryableEmbeddingError("Embedding response missing or wrong-sized vector");
  }

  return values;
}

class RetryableEmbeddingError extends Error {}

export async function embedText(text: string): Promise<number[]> {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) throw new Error("GOOGLE_API_KEY is not set"); // never retryable — retrying won't add a missing key

  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_EMBED_ATTEMPTS; attempt++) {
    try {
      return await embedTextOnce(text, apiKey);
    } catch (error) {
      lastError = error;
      const retryable = error instanceof RetryableEmbeddingError;
      if (!retryable || attempt === MAX_EMBED_ATTEMPTS) throw error;
      // Short linear backoff (300ms, 600ms) — same spirit as the SDK's own
      // "short exponential backoff," kept simple since this only ever runs
      // 1-2 extra times before giving up.
      await sleep(300 * attempt);
    }
  }
  throw lastError; // unreachable — satisfies TS control-flow analysis
}

/**
 * Embeds many texts with limited concurrency, so we don't blow past Google's
 * per-second rate limits on a large document.
 */
export async function embedTexts(
  texts: string[],
  concurrency = 5
): Promise<number[][]> {
  const results: number[][] = new Array(texts.length);
  let cursor = 0;

  async function worker() {
    while (cursor < texts.length) {
      const index = cursor++;
      results[index] = await embedText(texts[index]);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, texts.length) }, worker)
  );

  return results;
}
