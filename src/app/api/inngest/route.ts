import { serve } from "inngest/next";
import { inngest } from "@/lib/inngest/client";
import { processMaterial } from "@/lib/inngest/functions/process-material";

// Inngest invokes this route to execute each step of processMaterial
// (parse → chunk → embed → extract concepts) — a large PDF's embedding
// calls in particular can add up past a short default function timeout.
// Inngest's own step retries (per-step, not per-request) are separate from
// this — this just gives one invocation enough room to finish a step.
export const maxDuration = 60;

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [processMaterial],
});
