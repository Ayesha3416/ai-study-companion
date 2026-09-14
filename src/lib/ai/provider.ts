import Groq from "groq-sdk";
import { Langfuse } from "langfuse";
import { z } from "zod";
import { recordAiRequest, extractProjectId } from "./usage-log";

// llama-3.3-70b-versatile was deprecated on Groq's free/dev tier in Aug 2026
// (Enterprise-only now). openai/gpt-oss-120b is the current recommended
// replacement — comparable quality/size class, actively supported.
const TEXT_MODEL = "openai/gpt-oss-120b";

// Lazily constructed (Step 34 fix, found while adding unit tests): both
// SDKs validate their credentials in the constructor itself, so
// constructing them eagerly at module scope meant simply *importing*
// provider.ts — or anything that transitively imports it, like quiz.ts —
// crashed immediately in any context without GROQ_API_KEY loaded, such as
// `vitest run` picking up quiz.test.ts. Neither client is used at import
// time in this file, only inside generateText/generateStructured, so
// there's no reason to pay that cost (or that crash risk) before a call
// actually happens.
let groqClient: Groq | null = null;
function getGroq(): Groq {
  if (!groqClient) groqClient = new Groq({ apiKey: process.env.GROQ_API_KEY });
  return groqClient;
}

let langfuseClient: Langfuse | null = null;
function getLangfuse(): Langfuse {
  if (!langfuseClient) {
    langfuseClient = new Langfuse({
      publicKey: process.env.LANGFUSE_PUBLIC_KEY,
      secretKey: process.env.LANGFUSE_SECRET_KEY,
      baseUrl: process.env.LANGFUSE_HOST,
    });
  }
  return langfuseClient;
}

export type GenerateTextOptions = {
  /** Which product feature is calling this — e.g. "tutor_response",
   * "quiz_generation", "open_ended_grading". Shows up in Langfuse so AI
   * usage/cost/latency can be broken down by feature (PRD §43-44). */
  feature: string;
  system?: string;
  prompt: string;
  temperature?: number;
  maxTokens?: number;
  /** For attributing usage to a user in Langfuse traces. */
  userId?: string;
  metadata?: Record<string, unknown>;
};

export type GenerateTextResult = {
  text: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
};

export async function generateText(
  options: GenerateTextOptions
): Promise<GenerateTextResult> {
  const trace = getLangfuse().trace({
    name: options.feature,
    userId: options.userId,
    metadata: options.metadata,
  });

  const messages: Groq.Chat.ChatCompletionMessageParam[] = [];
  if (options.system) messages.push({ role: "system", content: options.system });
  messages.push({ role: "user", content: options.prompt });

  const generation = trace.generation({
    name: options.feature,
    model: TEXT_MODEL,
    input: messages,
  });

  const startedAt = Date.now();

  try {
    const completion = await getGroq().chat.completions.create({
      model: TEXT_MODEL,
      messages,
      temperature: options.temperature ?? 0.3,
      max_tokens: options.maxTokens ?? 1024,
      reasoning_effort: "low",
    });

    const latencyMs = Date.now() - startedAt;
    const text = completion.choices[0]?.message?.content ?? "";
    const inputTokens = completion.usage?.prompt_tokens ?? 0;
    const outputTokens = completion.usage?.completion_tokens ?? 0;

    generation.end({
      output: text,
      usage: { input: inputTokens, output: outputTokens, unit: "TOKENS" },
    });

    // Step 31: first-party usage/cost record, independent of Langfuse.
    // Awaited (not fire-and-forget) so a slow write can't outlive this
    // request's lifecycle in a serverless context, same reasoning as the
    // explicit getLangfuse().flushAsync() below — but its own errors are
    // swallowed inside recordAiRequest, so this can't fail the actual
    // Tutor/Quiz/etc. response.
    await recordAiRequest({
      ownerId: options.userId ?? null,
      projectId: extractProjectId(options.metadata),
      feature: options.feature,
      model: TEXT_MODEL,
      inputTokens,
      outputTokens,
      latencyMs,
      success: true,
    });

    return { text, model: TEXT_MODEL, inputTokens, outputTokens, latencyMs };
  } catch (error) {
    const latencyMs = Date.now() - startedAt;
    const errorMessage = error instanceof Error ? error.message : String(error);
    generation.end({
      level: "ERROR",
      statusMessage: errorMessage,
    });
    await recordAiRequest({
      ownerId: options.userId ?? null,
      projectId: extractProjectId(options.metadata),
      feature: options.feature,
      model: TEXT_MODEL,
      inputTokens: 0,
      outputTokens: 0,
      latencyMs,
      success: false,
      errorMessage,
    });
    throw error;
  } finally {
    // Serverless/short-lived request contexts (API routes, Inngest steps)
    // can exit before Langfuse's background batching flushes on its own,
    // so flush explicitly every call.
    await getLangfuse().flushAsync();
  }
}

export type GenerateStructuredOptions<T> = {
  feature: string;
  system?: string;
  prompt: string;
  schema: z.ZodType<T>;
  temperature?: number;
  maxTokens?: number;
  userId?: string;
  metadata?: Record<string, unknown>;
};

/**
 * Same idea as generateText, but for anywhere application logic needs to
 * consume the AI's output programmatically (quiz questions, grading
 * results, recommendations, etc.) — PRD §42: "prefer structured and
 * validated responses over relying exclusively on free-form text."
 *
 * The response is parsed as JSON and validated against the given Zod
 * schema before being returned. Invalid/unparseable output throws rather
 * than silently returning malformed data — callers should decide how to
 * handle that failure (retry, fall back, surface an error) rather than
 * having bad AI output flow further into the app.
 */
export async function generateStructured<T>(
  options: GenerateStructuredOptions<T>
): Promise<T> {
  const trace = getLangfuse().trace({
    name: options.feature,
    userId: options.userId,
    metadata: options.metadata,
  });

  const jsonInstruction =
    "\n\nRespond with ONLY a single valid JSON object matching the required shape. " +
    "No markdown code fences, no commentary, no text before or after the JSON.";

  const messages: Groq.Chat.ChatCompletionMessageParam[] = [];
  if (options.system) messages.push({ role: "system", content: options.system });
  messages.push({ role: "user", content: options.prompt + jsonInstruction });

  const generation = trace.generation({
    name: options.feature,
    model: TEXT_MODEL,
    input: messages,
  });

  const startedAt = Date.now();

  try {
    const completion = await getGroq().chat.completions.create({
      model: TEXT_MODEL,
      messages,
      temperature: options.temperature ?? 0.3,
      max_tokens: options.maxTokens ?? 2048, // higher than generateText's default — reasoning tokens + full JSON both eat into this budget
      response_format: { type: "json_object" },
      reasoning_effort: "low", // we want fast, concise structured output, not deep multi-step reasoning
    });

    const raw = completion.choices[0]?.message?.content ?? "";

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error(`Model did not return valid JSON: ${raw.slice(0, 200)}`);
    }

    const result = options.schema.safeParse(parsed);
    if (!result.success) {
      throw new Error(
        `Structured output failed schema validation: ${result.error.message}`
      );
    }

    generation.end({
      output: result.data,
      usage: {
        input: completion.usage?.prompt_tokens ?? 0,
        output: completion.usage?.completion_tokens ?? 0,
        unit: "TOKENS",
      },
    });

    await recordAiRequest({
      ownerId: options.userId ?? null,
      projectId: extractProjectId(options.metadata),
      feature: options.feature,
      model: TEXT_MODEL,
      inputTokens: completion.usage?.prompt_tokens ?? 0,
      outputTokens: completion.usage?.completion_tokens ?? 0,
      latencyMs: Date.now() - startedAt,
      success: true,
    });

    return result.data;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    generation.end({
      level: "ERROR",
      statusMessage: errorMessage,
    });
    await recordAiRequest({
      ownerId: options.userId ?? null,
      projectId: extractProjectId(options.metadata),
      feature: options.feature,
      model: TEXT_MODEL,
      inputTokens: 0,
      outputTokens: 0,
      latencyMs: Date.now() - startedAt,
      success: false,
      errorMessage,
    });
    throw error;
  } finally {
    await getLangfuse().flushAsync();
  }
}