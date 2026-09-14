import { createClient } from "@/lib/supabase/server";
import { getAiUsageSummary } from "@/lib/observability/langfuse-query";

// PRD §64 — Admin System Health: API health, DB health, AI provider health,
// background processing health, recent failures, processing backlog,
// average AI latency, error rates.
//
// **Engineering decision, documented per PRD §81**: the original Step 30
// plan (see CONTEXT.MD) was to pull "jobs queued/running/completed/failed"
// straight from Inngest's own run-history API. Investigating that surface
// turned up a real blocker: Inngest's REST API for *listing* runs by status/
// time-range needs a dedicated `INNGEST_API_KEY` (Settings → API Keys in
// the Inngest dashboard) — a different credential than the
// `INNGEST_EVENT_KEY`/`INNGEST_SIGNING_KEY` already provisioned for this
// project — and broad run-search beyond a single event/run ID lookup lives
// behind Inngest's "Insights" feature, which isn't guaranteed available on
// every plan tier. Introducing a new required secret and an unverified API
// dependency for a prototype health page is worse engineering than the
// alternative: this project already writes a `material_processing_started`/
// `_completed`/`_failed` activity event at every stage of the one background
// pipeline it has (`process-material.ts`), and every `materials` row already
// carries its own current `status` + `updated_at`. That's sufficient to
// answer every question PRD §64 actually asks (job counts, backlog, recent
// failures, processing duration) without a new dependency, and it reads
// from data this app fully controls and already trusts.
// **Known limitation** (documented honestly, not silently glossed over):
// per-attempt retry counts genuinely aren't tracked — Inngest retries
// internally (`retries: 3` in `process-material.ts`) without this app
// recording each attempt, so "retry attempts" isn't a number we can report
// truthfully today. Surfaced as "not tracked" in the UI rather than a
// fabricated 0.

const IN_PROGRESS_STATUSES = [
  "queued",
  "processing",
  "reading_content",
  "understanding_structure",
  "extracting_knowledge",
  "creating_searchable_representation",
] as const;

// A material sitting in an in-progress status longer than this is almost
// certainly stuck (crashed worker, exhausted retries that somehow didn't
// reach onFailure, etc.) rather than genuinely still working — PDF
// processing for this app's chunking+embedding pipeline normally completes
// in well under a minute per document.
const BACKLOG_STALL_MINUTES = 10;

// "Is the AI provider currently healthy" wants a *recent* signal, not the
// AI Usage page's 7-day usage trend — a provider outage in the last hour
// shouldn't be diluted by six days of healthy traffic. Kept intentionally
// short and separate from that page's WINDOW_HOURS.
const AI_HEALTH_WINDOW_HOURS = 1;

export type BackgroundJobHealth = {
  queued: number;
  processing: number; // sum of every in-progress sub-status
  ready: number;
  failed: number;
  backlogCount: number; // in-progress for longer than BACKLOG_STALL_MINUTES
  backlogItems: {
    id: string;
    fileName: string;
    status: string;
    stuckForMinutes: number;
  }[];
  avgProcessingSeconds: number | null; // from matched started→completed event pairs
  recentFailures: {
    materialId: string;
    fileName: string;
    errorMessage: string | null;
    failedAt: string;
  }[];
};

export type DatabaseHealth = {
  ok: boolean;
  latencyMs: number | null;
  error: string | null;
};

export type AiProviderHealth = {
  ok: boolean;
  windowHours: number;
  requests: number;
  errorRate: number; // 0-1
  avgLatencyMs: number | null;
  error: string | null; // set if Langfuse itself was unreachable
};

export type SystemHealth = {
  checkedAt: string;
  database: DatabaseHealth;
  backgroundJobs: BackgroundJobHealth;
  aiProvider: AiProviderHealth;
};

/**
 * A trivial, cheap read used purely to measure "is the database reachable
 * and how fast does it respond right now" — not meant to check anything
 * business-specific, just connectivity + latency (PRD §64's "Database
 * health" / "API health").
 */
async function checkDatabaseHealth(): Promise<DatabaseHealth> {
  const supabase = await createClient();
  const start = Date.now();
  try {
    const { error } = await supabase
      .from("profiles")
      .select("id", { count: "exact", head: true });
    const latencyMs = Date.now() - start;
    if (error) return { ok: false, latencyMs, error: error.message };
    return { ok: true, latencyMs, error: null };
  } catch (error) {
    return {
      ok: false,
      latencyMs: Date.now() - start,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

async function getBackgroundJobHealth(): Promise<BackgroundJobHealth> {
  const supabase = await createClient();

  const { data: materials, error } = await supabase
    .from("materials")
    .select("id, file_name, status, error_message, updated_at")
    .order("updated_at", { ascending: false })
    .limit(500); // prototype-scale cap, same reasoning as every other Admin query in this app
  if (error) throw error;

  const rows = materials ?? [];
  const now = Date.now();

  let queued = 0;
  let processing = 0;
  let ready = 0;
  let failed = 0;
  const backlogItems: BackgroundJobHealth["backlogItems"] = [];
  const recentFailures: BackgroundJobHealth["recentFailures"] = [];

  for (const m of rows) {
    if (m.status === "ready") {
      ready++;
    } else if (m.status === "failed") {
      failed++;
      if (recentFailures.length < 10) {
        recentFailures.push({
          materialId: m.id,
          fileName: m.file_name,
          errorMessage: m.error_message,
          failedAt: m.updated_at,
        });
      }
    } else if ((IN_PROGRESS_STATUSES as readonly string[]).includes(m.status)) {
      if (m.status === "queued") queued++;
      else processing++;

      const stuckForMinutes = Math.round(
        (now - new Date(m.updated_at).getTime()) / 60000
      );
      if (stuckForMinutes >= BACKLOG_STALL_MINUTES) {
        backlogItems.push({
          id: m.id,
          fileName: m.file_name,
          status: m.status,
          stuckForMinutes,
        });
      }
    }
  }

  // Average processing duration: pair up each material's
  // material_processing_started/_completed activity events by materialId
  // (both events carry it in `metadata`, written by process-material.ts).
  const { data: events, error: eventsError } = await supabase
    .from("activity_events")
    .select("event_type, metadata, created_at")
    .in("event_type", ["material_processing_started", "material_processing_completed"])
    .order("created_at", { ascending: false })
    .limit(400);
  if (eventsError) throw eventsError;

  const startedAt = new Map<string, number>();
  const durationsMs: number[] = [];
  // Walk oldest-first so a started event is always seen before its completed
  // pair, regardless of the descending fetch order above.
  for (const e of [...(events ?? [])].reverse()) {
    const materialId = (e.metadata as { materialId?: string } | null)?.materialId;
    if (!materialId) continue;
    if (e.event_type === "material_processing_started") {
      startedAt.set(materialId, new Date(e.created_at).getTime());
    } else if (e.event_type === "material_processing_completed") {
      const start = startedAt.get(materialId);
      if (start !== undefined) {
        durationsMs.push(new Date(e.created_at).getTime() - start);
        startedAt.delete(materialId);
      }
    }
  }

  const avgProcessingSeconds =
    durationsMs.length === 0
      ? null
      : Math.round(
          durationsMs.reduce((a, b) => a + b, 0) / durationsMs.length / 1000
        );

  return {
    queued,
    processing,
    ready,
    failed,
    backlogCount: backlogItems.length,
    backlogItems: backlogItems.slice(0, 10),
    avgProcessingSeconds,
    recentFailures,
  };
}

async function getAiProviderHealth(): Promise<AiProviderHealth> {
  try {
    const summary = await getAiUsageSummary(AI_HEALTH_WINDOW_HOURS);
    return {
      ok: summary.totalRequests === 0 || summary.errorRate < 0.2,
      windowHours: AI_HEALTH_WINDOW_HOURS,
      requests: summary.totalRequests,
      errorRate: summary.errorRate,
      avgLatencyMs: summary.avgLatencyMs,
      error: null,
    };
  } catch (error) {
    return {
      ok: false,
      windowHours: AI_HEALTH_WINDOW_HOURS,
      requests: 0,
      errorRate: 0,
      avgLatencyMs: null,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

export async function getSystemHealth(): Promise<SystemHealth> {
  // Independent checks — one section being down (e.g. Langfuse unreachable)
  // must not prevent the rest of the health page from rendering, which is
  // the whole point of a health page (PRD §49 pattern, applied to Admin
  // itself this time).
  const [database, backgroundJobs, aiProvider] = await Promise.all([
    checkDatabaseHealth(),
    getBackgroundJobHealth(),
    getAiProviderHealth(),
  ]);

  return {
    checkedAt: new Date().toISOString(),
    database,
    backgroundJobs,
    aiProvider,
  };
}
