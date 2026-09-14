# AI Study Companion — Build Context

> **Purpose of this file**: This is the single source of truth for project progress.
> If a chat with Claude runs out of context, paste this whole file into a new chat
> and say "continue building from here" — it has everything needed to pick up
> exactly where we left off.

---

## 0. Tech Stack Decision (locked in)

| Layer | Choice | Why |
|---|---|---|
| Frontend + API | Next.js 14 (App Router, TypeScript) | Single deployable, fast iteration, good Vercel deploy story |
| Auth + DB + Storage | Supabase (Postgres, Row Level Security, pgvector, file storage) | Auth+DB+vector search+storage in one, generous free tier |
| LLM (text-gen) | Groq | Already provisioned, very fast inference |
| Embeddings | Google embedding API (via GOOGLE_API_KEY) | Already provisioned |
| Background jobs | Inngest | Event-driven, built-in retries/idempotency — fits PRD §14/§38/§50 |
| AI Observability | Langfuse | Trace/token/cost tracking — fits PRD §43/§44 |
| Deployment | Vercel (app) + Supabase (DB/storage) + Inngest Cloud | All have generous free tiers, quick to stand up |

**AI Provider Abstraction (PRD §41)**: all LLM/embedding calls go through
`/lib/ai/provider.ts` interfaces (`generateText`, `generateStructured`, `embed`,
`evaluate`) — never call Groq/Google SDKs directly from feature code. This lets
us swap providers later without touching business logic.

---

## 1. Environment Variables

Live in `.env.local` (git-ignored, never committed). Template lives in
`.env.example` (safe placeholder values, committed to repo).

Required vars (values already provisioned by user — ROTATE THEM before going
to production since they were shared in a chat):
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (server-only, never exposed to client)
- `GROQ_API_KEY`
- `GOOGLE_API_KEY`
- `INNGEST_EVENT_KEY`
- `INNGEST_SIGNING_KEY`
- `LANGFUSE_PUBLIC_KEY`
- `LANGFUSE_SECRET_KEY`
- `LANGFUSE_HOST`

---

## 2. Build Plan (checklist — update ✅ as we go)

### Phase 1 — Foundation
- [x] Step 1: Next.js project scaffold + folder structure + env setup
- [x] Step 2: Supabase schema (users via auth, spaces, projects, RLS policies)
- [x] Step 3: Auth flow (sign up/login/session) + protected routes
- [x] Step 4: Spaces CRUD (create/list/dashboard)
- [x] Step 5: Projects CRUD (create/list/dashboard)

### Phase 2 — Materials & Knowledge
- [x] Step 6: Material upload (PDF → Supabase Storage) + material record + status states
- [x] Step 7: Inngest background job: parse PDF → chunk → embed → store in pgvector
- [x] Step 8: Processing status UI (queued/processing/ready/failed)

### Phase 3 — AI Tutor
- [x] Step 9: AI provider abstraction layer (`/lib/ai/provider.ts`)
- [x] Step 10: Retrieval function (query → embed → similarity search scoped to project)
- [x] Step 11: Tutor chat endpoint: retrieve context + conversation history + generate grounded answer + citations
- [x] Step 12: Unsupported-question handling (low-similarity → "not supported by materials") — built into Step 11's `answerTutorQuestion`
- [x] Step 13: Tutor UI (chat interface, streaming, source display)
- [x] Step 14: Persistent learning context table + retrieval-into-context logic

### Phase 4 — Assessment
- [x] Step 15: Concept model + mastery table
- [x] Step 16: Quiz generation (structured output, adaptive concept/difficulty selection)
- [x] Step 17: Quiz-taking UI + answer submission
- [x] Step 18: Open-ended answer grading (AI-based, structured feedback)
- [x] Step 19: Mastery update logic

### Phase 5 — Growth, Analytics, Recommendations
- [x] Step 20: Activity/event table + event-driven triggers (Inngest)
- [x] Step 21: Growth analysis (mastery trend over time)
- [x] Step 22: Recommendation generation
- [x] Step 23: Project analytics dashboard
- [x] Step 24: Global analytics dashboard
- [x] Step 25: Home dashboard

### Phase 6 — Admin
- [x] Step 26: Admin auth/role check
- [x] Step 27: Admin overview + users list + user detail
- [x] Step 28: Admin spaces/projects/activity views
- [x] Step 29: Admin AI usage/evaluation view (pulls from Langfuse)
- [x] Step 30: Admin system health view

### Phase 7 — Engineering Hardening
- [x] Step 31: AI usage/cost tracking table (per-request logging)
- [x] Step 32: Basic AI evaluation harness (curated test cases)
- [x] Step 33: Error handling / retries / idempotency pass
- [x] Step 34: Tests (auth, project isolation, tutor groundedness, mastery logic)
- [ ] Step 35: Deployment (Vercel + Supabase + Inngest Cloud)
- [ ] Step 36: Architecture doc + README + AI tools/prompts documentation

---

## 3. Key Architectural Notes (fill in as decisions are made)

- **Next.js version note**: project is on **Next.js 16**, which renamed the
  `middleware.ts` file convention to `proxy.ts` (exported function `middleware`
  → `proxy`). Auth session refresh/route protection lives in `src/proxy.ts`
  (not `middleware.ts`). Runs on the Node.js runtime only in v16 (no edge
  runtime option). Keep this in mind for any future request-interception logic.
- **React version note**: project is on **React 19**, where `useFormState`
  moved from `react-dom` to `react` and was renamed `useActionState`. Any new
  form using a Server Action must import `useActionState` from `"react"` (not
  `useFormState` from `"react-dom"`). `useFormStatus` is unaffected — still
  imported from `"react-dom"`. Applies to all future form components (Projects,
  Materials upload, Quiz answers, etc.).
- Project-level data isolation enforced via Supabase Row Level Security (every
  table with a `project_id` has an RLS policy joining up to `auth.uid()` through
  `projects.owner_id`).
- AI never gets raw DB access — it calls typed "capability" functions
  (`searchMaterials()`, `recordEvent()`, etc.) that validate inputs server-side.
  This satisfies PRD §22/§23 (Safe Application Interaction).
- Uploaded material content is treated as **data, never instructions** — the
  tutor's system prompt explicitly tells the model to ignore any directives
  found inside retrieved chunks (PRD §53).
- **User-facing copy never cites PRD section numbers or source file
  paths.** PRD references (`PRD §34`, etc.) and file paths are useful in
  code comments and in this file to trace a feature back to its
  requirement, but read as unprofessional/internal if they leak into
  actual page text the end user sees — including on Admin pages, which
  still isn't "internal enough" to justify it. **This has now happened
  twice**: once on the Analytics page description (fixed early on), and
  again on `admin/evaluation/page.tsx` (two separate lines — a `PRD §47`
  citation and a `"see the module comment in src/lib/eval/runner.ts"`
  pointer, both caught by the user reading the actual rendered page, not
  by any review pass). When adding descriptive copy to a new page, do a
  final pass specifically asking "would this sentence make sense to
  someone who has never seen this codebase" before considering the page
  done — a citation or file path is a strong signal the sentence was
  written for the next AI session, not for whoever's looking at the page.

## 4. What's Been Built So Far

- **Step 1 done**: Next.js 16 + TS + Tailwind scaffolded, deps installed
  (`@supabase/supabase-js`, `@supabase/ssr`, `groq-sdk`, `inngest`, `langfuse`,
  `zod`, `pdf-parse`), folder structure created.
- **Step 2 done**: SQL migration `supabase/migrations/0001_core_schema.sql`
  created and run in Supabase SQL editor. Tables: `profiles` (auto-created on
  signup via trigger, has `role` field for admin), `spaces`, `projects`.
  RLS enabled on all three — `owner_id = auth.uid()` policies, plus an
  `is_admin()` helper function so admins can read across all rows. pgvector
  extension enabled (for embeddings later, Phase 2).
  Reminder: after first signup, run
  `update public.profiles set role='admin' where email='you@example.com';`
  to get admin access for testing later.
- **Step 3 done**: `src/lib/supabase/{client,server,admin}.ts` (browser client,
  server-component client, service-role admin client for background jobs),
  `middleware.ts` (session refresh + redirects unauthenticated users away from
  `/home`, `/spaces`, `/admin`), signup/login pages under `src/app/(auth)/`,
  sign-out server action, placeholder `src/app/(dashboard)/home/page.tsx`,
  and `src/app/page.tsx` redirects to `/home` or `/login` based on session.
- **Step 4 done**: `src/app/(dashboard)/spaces/actions.ts` (server actions:
  `createSpace`, `listSpaces`, `getSpace` — RLS handles ownership, no manual
  filtering needed), `new-space-form.tsx` (client form using `useActionState`
  from `"react"`, per the React 19 note above),
  `spaces/page.tsx` (list + create UI), `spaces/[spaceId]/page.tsx` (Space
  Dashboard placeholder — Projects list goes here in Step 5). Accessing a
  space you don't own 404s (RLS blocks the row, caught and mapped to
  `notFound()`).
- **Step 5 done**: `src/app/(dashboard)/spaces/[spaceId]/projects/actions.ts`
  (`createProject`, `listProjectsForSpace`, `getProject`), matching
  `new-project-form.tsx` client form. Space Dashboard page updated to show
  the create-project form + project list. New top-level Project Dashboard at
  `src/app/(dashboard)/projects/[projectId]/page.tsx` — placeholder sections
  for Materials/Tutor/Quiz/Growth, wired up in later steps. `src/proxy.ts`
  updated to protect `/projects` routes too.
- **Step 6 done**: SQL migration `0002_materials.sql` adds `materials` table
  (status column mirrors PRD §13's full pipeline: queued → processing →
  reading_content → understanding_structure → extracting_knowledge →
  creating_searchable_representation → ready/failed) plus RLS, and creates a
  **private** `materials` Storage bucket with RLS policies keyed on
  `{owner_id}/...` path prefix. `materials/actions.ts` has `uploadMaterial`
  (validates PDF type + 20MB size limit, uploads to Storage, inserts DB row
  as `status: 'queued'`, rolls back the storage file if the DB insert fails)
  and `listMaterialsForProject`. `upload-material-form.tsx` (client form,
  resets via a `key` trick after successful submit) and `status-badge.tsx`
  render in the Project Dashboard, which now shows real materials instead of
  a placeholder. **Note**: status only ever reaches `queued` right now —
  nothing advances it further until Step 7's background job exists.

- **Step 7 done**: SQL migration `0003_material_chunks.sql` adds
  `material_chunks` (pgvector `embedding vector(768)` column, HNSW index for
  cosine-similarity search, unique `(material_id, chunk_index)`, RLS: SELECT
  only — writes only ever happen via the service-role client). AI provider
  abstraction started at `src/lib/ai/embeddings.ts` (`embedText`/`embedTexts`,
  calls Google's `gemini-embedding-001` REST endpoint, 768-dim output — swap
  providers here later, PRD §41) and `src/lib/ai/chunk.ts` (`chunkPages`:
  ~1000-char chunks with 150-char overlap, tracks page number per chunk for
  future citations). Inngest wired up: `src/lib/inngest/client.ts`,
  `src/lib/inngest/functions/process-material.ts` (the actual pipeline —
  each stage is a `step.run()` for automatic retry/memoization; deletes+
  reinserts chunks before writing so retries can't duplicate rows — PRD §50;
  `onFailure` handler marks the material `failed` with a message after all
  retries are exhausted — PRD §49), `src/app/api/inngest/route.ts` (serve
  endpoint). `materials/actions.ts`'s `uploadMaterial` now sends a
  `material/uploaded` event (deduped by a deterministic event `id`) right
  after inserting the material row.
  **Local dev requirement**: must run the Inngest Dev Server separately —
  `npx inngest-cli@latest dev -u http://localhost:3000/api/inngest` — in
  parallel with `npm run dev`, and watch job runs at `http://localhost:8288`.
  The `INNGEST_EVENT_KEY`/`INNGEST_SIGNING_KEY` env vars are only needed once
  deployed to Inngest Cloud in production (Step 35).
- **pdf-parse version note**: installed version is **v2**, which replaced the
  old `pdfParse(buffer)` function-call API with a class-based `PDFParse` API
  and dropped the old `pagerender` callback entirely. If pdf-parse gets
  upgraded further, re-check its API before touching `process-material.ts`.
  **Performance note**: originally looped `getText({ partial: [n] })` once
  per page, which was very slow on multi-page PDFs. Switched to a single
  `getText({ pageJoiner: "<<<PDF_PAGE_page_number>>>" })` call — pdf-parse
  substitutes the real page number into that marker between every page in
  one pass, and we split the result on a regex with a capture group to
  recover per-page text without N separate calls.
- **Inngest version note**: installed version is **SDK v4**, which merges the
  trigger into the config object — `createFunction({ id, triggers: [{ event:
  "..." }], ... }, handler)` — **2 arguments total**, not the old v3 3-argument
  style (`createFunction(config, trigger, handler)`). Getting this wrong
  produces a cascade of unrelated-looking "implicitly any" TS errors below the
  call, not just an argument-count error — worth remembering if a future step
  adds more Inngest functions.
- **Inngest local dev requires `INNGEST_DEV=1`**: since `.env.local` has real
  `INNGEST_EVENT_KEY`/`INNGEST_SIGNING_KEY` values, the SDK defaults to Cloud
  mode and tries to reach `api.inngest.com`, which times out locally (`fetch
  failed` / `ETIMEDOUT`). `.env.local` (and `.env.example`) now include
  `INNGEST_DEV=1` to force Dev mode against the local Inngest Dev Server.
  **Remove or unset this in production** so it uses the real keys instead.
- **pdf-parse/pdfjs-dist bundling fix**: Next.js's automatic server bundling
  breaks pdfjs-dist's worker file resolution ("Setting up fake worker failed:
  Cannot find module '.../pdf.worker.mjs'"). Fixed via `next.config.ts` →
  `serverExternalPackages: ["pdf-parse", "pdfjs-dist"]`, which makes Next.js
  use Node's native `require` for these instead of bundling them.

- **Step 8 done**: `materials-list.tsx` (client component) polls
  `GET /api/projects/[projectId]/materials` every 3s **only while at least
  one material has an in-progress status** (stops polling once everything is
  `ready`/`failed`). `src/app/api/projects/[projectId]/materials/route.ts` is
  the endpoint it polls — reuses `listMaterialsForProject`, which is
  RLS-scoped so it can't leak another user's materials. Project Dashboard
  page now renders `<MaterialsList>` instead of an inline list. Status now
  updates live without a manual page refresh — the earlier known limitation
  is resolved.

- **Step 9 done**: `src/lib/ai/provider.ts` — `generateText({ feature, system?,
  prompt, temperature?, maxTokens?, userId?, metadata? })`, calling Groq
  (model configurable via one `TEXT_MODEL` constant — see model note below —
  centralized here per PRD §41's provider abstraction). Every call
  is wrapped in a Langfuse trace + generation (name = `feature`, so usage/
  cost/latency can be broken down per product feature later in the Admin AI
  Usage view — PRD §43-44), with `langfuse.flushAsync()` called explicitly
  since short-lived request contexts (API routes, Inngest steps) can exit
  before Langfuse's background batching flushes on its own. Temporary
  `GET /api/test-ai` route added purely to verify the Groq+Langfuse wiring
  works — **delete it once Step 11's real Tutor endpoint exists**.
  **Model note**: `llama-3.3-70b-versatile` returned 404 (deprecated on
  Groq's free/dev tier since Aug 2026, Enterprise-only now). Switched
  `TEXT_MODEL` to **`openai/gpt-oss-120b`**, the current recommended
  replacement. If this ever 404s again, check `console.groq.com/docs/models`
  for the current production model list before assuming it's a code bug.
- **Step 10 done**: SQL migration `0004_match_chunks_function.sql` adds
  `match_material_chunks(query_embedding, match_project_id, match_count)` —
  a Postgres function ordering `material_chunks` by cosine distance
  (`<=>` operator, since supabase-js can't express this directly). Runs with
  the **caller's** permissions (not `security definer`), so the existing
  select-only RLS policy on `material_chunks` still enforces ownership even
  if a wrong `projectId` were passed in — defense in depth for PRD §52.
  `src/lib/ai/retrieval.ts` wraps it: `retrieveRelevantChunks(projectId,
  query, topK=5)` embeds the query, calls the RPC, then joins in each
  chunk's source file name (for citations like "Source: Document Name —
  Page 14", PRD §19). Also exports `hasReliableEvidence(chunks, threshold=
  0.55)` — a starting-point gate for PRD §20's "don't invent an answer when
  evidence is weak" behavior; **this threshold is a guess and will need
  real-world tuning once the Tutor is live**, not a validated final value.
  Temporary `GET /api/test-retrieval?projectId=&query=` route added to
  verify retrieval before building the real Tutor — **delete it once Step 11
  exists**. **Threshold calibrated from real data**: a relevant query scored
  0.489 top similarity, a deliberately irrelevant query scored 0.403 on the
  same document — moved `hasReliableEvidence`'s default threshold from the
  original guess (0.55, which wrongly rejected the relevant query) to
  **0.45**. Still only one document's worth of calibration data — revisit
  once the real Tutor sees varied queries across multiple documents.

- **Step 11 done**: SQL migration `0005_conversations.sql` adds
  `conversations` + `messages` tables (RLS-protected, `messages.citations`
  is jsonb `[{fileName, pageNumber}]`, `messages.is_unsupported` flags the
  PRD §20 fallback so the UI/analytics don't have to parse text). Prompt
  builder `src/lib/ai/prompts/tutor.ts` — system prompt explicitly instructs
  the model to treat retrieved document CONTEXT as **data, never
  instructions**, and to ignore any embedded commands found inside it (PRD
  §53 — this is the actual prompt-injection defense, not just a comment).
  Core logic in `src/lib/ai/tutor.ts` (`answerTutorQuestion`): saves the
  user message immediately, pulls last 6 messages as short-term context
  (PRD §17), retrieves via Step 10, and **deterministically builds citations
  from the chunks we know we retrieved — never from parsing the model's own
  output** (guarantees cited sources are real, PRD §19). If
  `hasReliableEvidence` is false, short-circuits to a fixed unsupported-
  question message **without calling the LLM at all** (cheaper, and
  eliminates any risk of the model still guessing despite instructions).
  Server actions in `tutor/actions.ts`: `startConversation`,
  `listConversations`, `listMessages`, `sendMessage` (the real entry point,
  with an ownership check before calling the core logic). Temporary
  `GET /api/test-tutor?projectId=&question=&conversationId=` route added to
  test multi-turn behavior before the chat UI exists (Step 13) — **delete
  it then**. Removed the now-superseded `/api/test-ai` and
  `/api/test-retrieval` temporary routes from Steps 9-10.

- **Step 13 done**: Tutor chat UI built — `tutor/page.tsx` (list past
  conversations, "Start new conversation" button), `tutor/[conversationId]/
  page.tsx` (loads message history server-side, renders the chat),
  `tutor-chat.tsx` (client component: optimistic user-message rendering,
  `useTransition` for the pending state, auto-scroll, unsupported-answer
  messages styled distinctly amber, citations rendered under each assistant
  message as "Source: filename — Page N"). `listMessages` now verifies
  conversation ownership explicitly before fetching messages, so a
  wrong/foreign `conversationId` 404s cleanly instead of rendering an empty
  chat. Project Dashboard's "AI Tutor" card now links to `/projects/
  [projectId]/tutor` instead of being a placeholder. **No streaming yet**
  (PRD §51 "Should Have" — `generateText` currently awaits the full
  response; true token-by-token streaming would need reworking the provider
  abstraction and is a good candidate for later polish, not required for
  the Must-Have baseline). Deleted the temporary `/api/test-tutor` route.
  **Bug fix**: `tutor/page.tsx` (conversation list) was missing
  `export const dynamic = "force-dynamic"`, so a freshly-created conversation
  didn't appear in the list until an unrelated cache-busting navigation
  happened — same caching pattern that bit the Home page (Step 3) and
  Project Dashboard (Step 6). **Any new Server Component page that reads
  frequently-changing data should get `force-dynamic` by default** — this is
  the third time this exact bug has appeared, so treat it as a checklist item
  for every new page going forward, not just a one-off fix.
  **Follow-up bug found while testing this**: the "Conversation from ..."
  timestamp text was showing the raw UTC time unconverted (e.g. "12:40 PM"
  when it was actually 6:10 PM local). Root cause: Postgres returns
  timestamptz values as `"2026-09-12 12:40:45.065517+00"` — space-separated,
  short `+00` offset — which isn't strict ISO 8601, and `new Date(...)` can
  mis-parse that shape as local time instead of UTC. Added
  `src/lib/format-date.ts` (`parsePgTimestamp`/`formatPgTimestamp`) which
  normalizes the string before parsing. **Use this helper anywhere a raw
  Postgres timestamp string needs to become a displayed date/time — never
  call `new Date(value)` directly on a DB string.** Only `tutor/page.tsx`
  needed this so far, but future steps (Growth trends, Analytics, Admin
  Activity timeline) will all render timestamps and should use this helper
  from the start. **Update — the real root cause was different**: Windows
  itself was correctly set to IST; the actual problem was that timestamp
  formatting ran inside a **Server Component**, so `toLocaleString()`
  executed on the Node/WSL2 server process (which defaults to UTC
  internally) rather than in the browser. `formatPgTimestamp`
  (server-side string interpolation) is now unused for display purposes —
  replaced with **`src/components/local-timestamp.tsx`**, a small client
  component (`<LocalTimestamp value={pgTimestampString} />`) that formats on
  mount using the *viewer's actual browser timezone*, which is the only
  reliable source of truth for "what time is it for this person" — the
  server's own clock/timezone should never be trusted for this, whether
  it's WSL2 locally or a deployed Vercel/cloud instance (also typically
  UTC). **Use `<LocalTimestamp>` for every future user-facing timestamp
  display** (Growth trends, Analytics, Admin Activity timeline, etc.) —
  never format a date server-side and print it as text.

- **Step 15 done**: SQL migration `0006_concepts_and_mastery.sql` adds
  `concepts` (unique per `(project_id, name)` — introduced implicitly, no
  dedicated "create concept" UI), `concept_mastery` (one row per concept,
  0-100 `mastery_level`, `evidence_count` tracks how many data points fed
  into the current estimate), and `mastery_history` (append-only, feeds
  Growth trends in Step 20-21). RLS: users can SELECT their own rows; INSERT/
  UPDATE on `concept_mastery`/`mastery_history` also restricted to
  `owner_id = auth.uid()`, but the intent is these are only ever written by
  our own server-side Quiz-evaluation logic (Step 16-19), never exposed as a
  direct user-facing write — a user could otherwise fabricate their own
  mastery. `src/lib/mastery/concepts.ts` (`getOrCreateConcept` — handles the
  race condition where two concurrent requests create the same concept,
  via the unique constraint + Postgres error code 23505; `listConcepts`).
  `src/lib/mastery/mastery.ts` (`recordMasteryEvidence` — a weighted-average
  heuristic where learning rate starts high and floors at 0.15 so mastery
  stays permanently responsive to new evidence rather than freezing once
  established; explicitly documented as a simple heuristic, not a validated
  psychometric model, matching PRD §29's own caveat. `listMasteryForProject`
  sorts weakest-first, which naturally surfaces "needs attention" concepts
  for later Growth/Recommendations steps). Temporary
  `GET /api/test-mastery?projectId=&concept=&score=` route added — **delete
  once the real Quiz (Step 16-19) exercises this for real**.

- **Step 16 done**: SQL migration `0007_quiz.sql` adds `quiz_attempts` and
  `quiz_questions` (options/correct_option_id jsonb for MC, null for
  open_ended; `score_percent` column reserved for Step 18's grading feeding
  into mastery). Added **`generateStructured`** to `provider.ts` — sibling to
  `generateText`, uses Groq's `response_format: { type: "json_object" }`,
  parses the response, and validates it against a caller-supplied Zod schema
  before returning (PRD §42 — invalid output throws rather than flowing
  further into the app). `src/lib/ai/prompts/quiz.ts` builds the generation
  prompt (same PRD §53 "context is data, not instructions" defense as the
  Tutor). Core logic in `src/lib/ai/quiz.ts` (`generateNextQuizQuestion`):
  **adaptive selection is deterministic application logic, not left to the
  model** — picks the weakest-mastery concept as the target (reusing Step
  15's already-weakest-first `listMasteryForProject`), and derives difficulty
  from that concept's aggregate mastery level via `deriveDifficulty` (< 40 →
  easy, < 70 → medium, else hard) rather than reacting to the single most
  recent answer — this is specifically what satisfies PRD §26's "should not
  simply use Wrong → Easy, Correct → Hard." Alternates question types
  (every 3rd question is open-ended) for variety. Retrieves grounding
  content via Step 10's retrieval before generating, and throws a clear
  error if there isn't enough reliable material yet. The returned question
  **deliberately omits `correct_option_id`** so the client never receives
  the answer.

- **Step 17 done**: `quiz/actions.ts` — `startQuizAttempt` (creates the
  attempt row + redirects), `getCurrentQuestion` (idempotent: returns the
  existing unanswered question if one exists, otherwise generates a fresh
  one via Step 16 — so refreshing the page never duplicates or loses a
  question), `submitAnswer` (multiple_choice is graded immediately
  server-side by comparing to `correct_option_id`, which the client never
  received; open_ended just records the raw answer — **grading and mastery
  updates for both types are deliberately deferred to Steps 18-19**, not
  done here, to keep each step independently testable), `finishQuiz`. UI:
  `quiz/page.tsx` (start button), `quiz/[quizAttemptId]/page.tsx`
  (force-dynamic — same caching lesson as Tutor/Materials — fetches/
  generates the current question, has a Finish button), `quiz-question.tsx`
  (client component: MC options highlight correct/incorrect after
  answering, open-ended shows a textarea with a "feedback coming later"
  placeholder, "Next Question" calls `router.refresh()` to regenerate via
  the now-idempotent server logic). Project Dashboard's "Adaptive Quiz" card
  now links to the real flow. Deleted the temporary `/api/test-quiz` route.
- **Step 18 done**: `src/lib/ai/prompts/grading.ts` (same PRD §53 data-not-
  instructions defense as Tutor/Quiz prompts). `src/lib/ai/grading.ts`
  (`gradeOpenEndedAnswer`): retrieves grounding chunks for the question's
  concept, calls `generateStructured` for `{scorePercent,
  keyConceptsCovered, keyConceptsMissing, feedback}`, then **deterministically
  formats** the final feedback string ourselves (paragraph + a "Focus on:"
  bullet list built from `keyConceptsMissing`) rather than trusting the
  model's own prose structure to always come out consistent — matches PRD
  §28's example format reliably. `is_correct` is a simple `scorePercent >=
  70` derived flag for consistency with MC questions elsewhere, but
  `scorePercent` is the real signal. Wired into `submitAnswer`'s open_ended
  branch in `quiz/actions.ts`: the raw answer is saved **before** grading is
  attempted, so a failed AI grading call never loses the student's answer
  (PRD §49) — it just surfaces "Answer saved, but grading failed" instead.
  `quiz-question.tsx` now shows the real score + feedback instead of the
  earlier placeholder text.
- **Step 19 done**: `submitAnswer` in `quiz/actions.ts` now calls Step 15's
  `recordMasteryEvidence` for **both** paths right after each is scored —
  multiple_choice with its instant 100/0, open_ended with whatever
  `gradeOpenEndedAnswer` (Step 18) produced. If open-ended grading itself
  fails, mastery is correctly left untouched (there's no score to record
  evidence from) while the answer is still saved. Deleted the temporary
  `/api/test-mastery` route — the real quiz flow exercises this data model
  now. **This closes the full "Cross-Feature Learning Loop" from PRD §66**:
  materials → knowledge → quiz → mastery is now a real, working pipeline
  end to end, not just individually-tested pieces.
- **Bug fix**: `openai/gpt-oss-120b` is a reasoning model that defaults to
  "medium" reasoning effort — those internal reasoning tokens count against
  `max_tokens`, so structured-output calls (quiz generation, grading) were
  intermittently running out of budget before finishing the JSON
  (`json_validate_failed` / "max completion tokens reached before generating
  a valid document"). Fixed in `provider.ts`: both `generateText` and
  `generateStructured` now pass `reasoning_effort: "low"` (fast, concise
  output — we don't need deep multi-step reasoning for these features), and
  `generateStructured`'s default `maxTokens` was raised from 1024 to 2048 for
  extra headroom. **If this error ever recurs**, it's the same root cause —
  consider adding an automatic one-retry-with-higher-maxTokens fallback in
  `generateStructured` as a future hardening step rather than re-diagnosing
  from scratch.
- **Step 20 done**: SQL migration `0008_activity_events.sql` adds
  `activity_events` — deliberately **no CHECK constraint on `event_type`**
  (PRD §37 requires new event types addable without schema changes;
  type-safety instead lives in the `ActivityEventType` union in
  `src/lib/activity/events.ts`). No client insert policy at all — every
  write goes through `recordActivityEvent()`, which always uses the
  **service-role admin client** (same pattern as material status updates),
  since events get logged from many contexts including Inngest background
  jobs with no user session. `recordActivityEvent` **swallows its own
  errors** (logs, never throws) — activity tracking is secondary and must
  never break the real feature it's attached to. Wired into every existing
  flow: `space_created`/`project_created` (spaces/projects actions),
  `project_accessed` (Project Dashboard page load), `material_uploaded`
  (materials actions), `material_processing_started/completed/failed`
  (Inngest `process-material.ts` — the `onFailure` handler fetches
  owner/project since they're not otherwise in scope there),
  `tutor_conversation_started`/`tutor_question_asked` (tutor actions),
  `quiz_started`/`quiz_question_answered`/`quiz_completed` (quiz actions),
  and **`mastery_updated` centralized inside `recordMasteryEvidence` itself**
  (mastery.ts) rather than duplicated at every call site, so it fires
  consistently regardless of what triggered the mastery change. **No UI yet**
  to actually view this activity — that's what Steps 21-24 (Growth,
  Recommendations, both Analytics dashboards) and Step 60-62 (Admin
  Activity) will read from.


- **Step 21 done**: `src/lib/mastery/growth.ts` (`getGrowthAnalysis`):
  "previous" is each concept's **first-ever** recorded `mastery_history`
  value, "current" is its latest `concept_mastery.mastery_level` — chosen
  over a fixed time window (e.g. "7 days ago") because a rolling window
  shows nothing meaningful for concepts only ever studied within one short
  session, which is the common case early in a project's life. Trend
  (`improving`/`stable`/`needs_attention`) uses a ±5 percentage-point band,
  matching PRD §31's own worked examples (54%→72% Improving, 68%→69%
  Stable, 61%→47% Needs Attention). Does one extra query per concept to
  fetch its first history row — fine at prototype scale, worth batching
  into a single query with a window function if concept counts ever grow
  large. New `src/components/mastery-bar.tsx` (color-coded by level: red
  <40, amber <70, green ≥70) and `growth/page.tsx` (lists every concept,
  previous→current, trend badge, mastery bar, evidence count). Project
  Dashboard's placeholder now links to the real page.
- **Step 22 done**: SQL migration `0009_recommendations.sql` adds
  `recommendations` (nullable `concept_id` — a recommendation may not target
  one specific concept). `src/lib/ai/prompts/recommendation.ts` builds a
  prompt from Growth data (Step 21), the project's learning goal, and the
  **previous recommendation** (explicitly told not to just repeat it — PRD
  §32 lists "previous recommendations" as an input to consider).
  `src/lib/ai/recommendation.ts` (`getOrGenerateRecommendation`) uses
  `generateStructured` (PRD §42 explicitly names Recommendations as a
  structured-output candidate) for `{message, focusConceptName}`, and — since
  Growth data only changes when quizzes are answered — **caches the latest
  recommendation for 10 minutes** rather than regenerating on every page
  view, to avoid burning AI calls on repeat visits with no new evidence.
  Wired into the Project Dashboard as a "Recommended Next Step" banner, but
  **only generated once the project has at least one material** (an empty
  new project has nothing meaningful to recommend, so this skips wasting a
  call); a generation failure is caught and logged rather than breaking the
  rest of the dashboard (PRD §49 pattern, same as elsewhere).

- **Step 23 done**: `src/lib/analytics/project-analytics.ts`
  (`getProjectAnalytics`) — pure aggregation, no new writes/tables. Runs 5
  queries in parallel (`Promise.all`) plus reuses Step 21's
  `getGrowthAnalysis`:
  - **Activity**: counts activity_events rows by `event_type` in JS (one
    query, grouped client-side into a `Map<eventType, count>`) rather than
    5 separate `count`-filtered queries — fine at prototype scale, and
    keeps `ActivityEventType` as the single place new event types get
    added, per PRD §37. "Learning Sessions" is approximated as
    `project_accessed` count (there's no explicit session-boundary concept
    in the data model yet); "Material Interactions" = uploads + completed
    processing.
  - **Performance**: quiz accuracy = average `score_percent` across
    answered `quiz_questions` (falls back to 100/0 from `is_correct` for
    older rows where `score_percent` might be null); mastery
    mastered/attention thresholds reuse the same 70/40 cutoffs as
    `mastery-bar.tsx`'s color coding, so the numbers on this page always
    agree with the bar colors shown elsewhere.
  - **Growth**: `masteryOverTime`/`accuracyOverTime` bucket
    `mastery_history`/answered `quiz_questions` into UTC-day averages via
    a shared `averageByDay()` helper (JS grouping, not SQL — same
    prototype-scale tradeoff as Step 21's per-concept queries, noted there
    as worth moving to SQL if data volume grows). Per-concept
    previous→current is just Step 21's `getGrowthAnalysis` re-used
    as-is, not recomputed.
  - **AI Activity**: every `quiz_questions` row is AI-generated (PRD
    §24), so `aiGeneratedQuestions` is a plain row count; `aiEvaluations`
    counts answered `open_ended` questions specifically (those are the
    ones that went through Step 18's AI grading, unlike multiple_choice
    which is graded deterministically); `recommendationsGenerated` is an
    exact `count: "exact", head: true` query against the `recommendations`
    table (simpler than parsing `recommendation_generated` events out of
    the already-fetched activity_events rows, though both would agree).
  - New dependency-free UI pieces: `src/components/stat-card.tsx` (simple
    label/value/hint card) and `src/components/trend-bars.tsx` (horizontal
    0-100 bars per day, capped to the most recent 14 days, styled to match
    `mastery-bar.tsx` rather than pulling in a charting library for a
    handful of data points — PRD §77's "Improved visual analytics" is a
    should-have, not required for the prototype). Page:
    `analytics/page.tsx`, `force-dynamic` (same reasoning as
    Growth/Tutor/Quiz — this data changes on every quiz answer). Project
    Dashboard's action grid now has a 4th "Analytics →" card.
  - `recommendationsGenerated` counts the `recommendations` table directly
    rather than the `recommendation_generated` activity event (both exist
    and always agree — `getOrGenerateRecommendation` inserts a row and
    logs the event in the same call — the table count was just simpler to
    query alongside the other counts already being fetched by primary key).

- **Bug fix (found while reviewing Growth with real quiz data)**:
  `generateNextQuizQuestion` (Step 16) picked the "weakest known concept"
  as the quiz's target every time — but once exactly one concept exists,
  it is *definitionally* the weakest (nothing else exists to compare it
  to), so the very first answered question locked every future question
  onto that one concept forever. This is why Growth only ever showed one
  concept ("React Hooks") no matter how many questions were answered.
  Fixed in `quiz.ts`: while concept coverage is thin (<3 concepts), or
  periodically even once it isn't (every 3rd question), the model is now
  deliberately left free to introduce a new concept from the material
  instead of being pinned to an existing one (`shouldExploreNewConcept`).
  `prompts/quiz.ts` gained a `preferNewConcept` flag that nudges the model
  toward a concept not already in `EXISTING CONCEPTS` on those rounds. Most
  questions still reinforce the weakest known concept — this just removes
  the structural block on ever discovering a second one.

- **Step 14 done**: `supabase/migrations/0010_learning_context.sql` adds
  `learning_context` — deliberately separate from `conversations`/`messages`
  (short-term chat history, Step 5) and `concept_mastery`/`mastery_history`
  (the numeric estimate, Step 15): this table holds curated,
  human-readable *reasons* worth folding into a prompt (PRD §39's Known
  Strengths/Weaknesses, Assessment Context, Preferences, Tutor Notes), not
  raw transcripts or scores. A partial unique index on
  `(project_id, concept_id, context_type)` — restricted to the two
  mastery-derived types — lets the mastery-derived "status" entry for a
  concept be upserted in place rather than accumulating a growing trail of
  stale notes.
  `src/lib/context/learning-context.ts`:
  - `getRelevantContext(projectId)` — ordered by `relevance_score` then
    recency, capped at 8 entries (PRD §40: avoid sending a project's entire
    history to every AI request). No embedding-based ranking — "most
    important, then most recent" is a reasonable proxy at prototype scale
    without standing up a second retrieval pipeline alongside Step 10's
    material search.
  - `syncConceptMasteryContext()` — called from `recordMasteryEvidence`
    (mastery.ts) after **every** mastery update, not on a schedule, so
    context never lags the number it describes. Uses the same 40/70
    thresholds as `mastery-bar.tsx`'s color coding, so this table's claims
    always agree with the bars shown elsewhere. Mid-range mastery (40-69)
    removes any existing status entry for that concept rather than leaving
    a stale claim.
  - `recordContextEntry()` — used by `grading.ts` to log an
    `assessment_mistake` entry when an open-ended answer scores below the
    pass threshold AND has specific missing concepts named — deliberately
    not logged on every graded answer, to avoid flooding the table with
    routine passing responses.
  - `formatContextForPrompt()` — renders entries as a plain bullet list for
    prompt composition.
  Wired into the Tutor (`tutor.ts`/`prompts/tutor.ts`): `buildTutorPrompt`
  now takes an options object (was positional args; only one caller, so
  safe to refactor) and folds in the project's `goal` (PRD §17's "Learning
  Goal" step, previously never actually reaching the Tutor prompt at all)
  and `getRelevantContext`'s output as a "WHAT WE KNOW ABOUT THIS STUDENT'S
  PROGRESS" block — fetched only after the unsupported-question check
  passes, so a question that's about to be declined doesn't spend two
  extra queries first. New `src/components/learning-context-list.tsx` +
  a "What We Remember About Your Progress" section on the Growth page, so
  this otherwise-invisible AI-engineering concept is actually visible to
  the user, not just consumed silently by prompts.
  **Not yet wired in**: `getOrGenerateRecommendation` (Step 22) doesn't
  pull from `learning_context` yet — it currently only uses Growth data
  directly. Worth revisiting since PRD §32 explicitly lists "previous
  recommendations" and implicitly this kind of context as recommendation
  inputs; low-risk follow-up whenever Step 24 or hardening comes back
  around to that file.

- **Bug fix (found while debugging a "grading failed" report)**:
  `submitAnswer`'s `open_ended` branch in `quiz/actions.ts` called
  `recordMasteryEvidence` **twice in a row** with identical arguments — a
  plain duplicate, pre-existing since Step 19 and unrelated to Step 14's
  changes. Every open-ended answer was writing two `mastery_history` rows
  and applying the weighted mastery update twice for one piece of
  evidence, silently double-weighting open-ended answers vs.
  multiple-choice ones and inflating `evidence_count` by 2 instead of 1
  each time. Removed the duplicate call — multiple_choice was never
  affected (that branch only ever had one call). No data cleanup needed;
  past evidence was double-counted, not corrupted, and future evidence
  will count correctly.
- **Step 24 done**: did the shared-module refactor first — new
  `src/lib/analytics/shared.ts` holds `averageByDay`, new `countByDay`
  (rows-per-day rather than averaged, used for "activity over time"),
  `distinctDayCount` (active-days metric), and `MASTERY_THRESHOLDS`
  (needsAttention: 40, mastered: 70) as the single source of truth —
  `project-analytics.ts` and `mastery-bar.tsx` both now import the
  thresholds from here instead of each hardcoding their own 40/70, so bar
  colors and stat-card numbers can never silently disagree. Also extracted
  `classifyTrend` + `TREND_THRESHOLD` out of `growth.ts` (exported, reused
  by `global-analytics.ts` — same "first-ever vs. current" trend logic,
  just run across every concept the user owns regardless of project,
  instead of duplicating the classification band). New
  `src/lib/analytics/global-analytics.ts` (`getGlobalAnalytics`) —
  deliberately has **no explicit `.eq("owner_id", ...)` anywhere**; every
  query relies on the already-in-place RLS select-own-rows policies, since
  the user-scoped client only ever sees this user's own rows regardless of
  project. AI Usage splits `tutorInteractions` (conversations started) from
  `questionsAsked` (individual tutor questions) — two distinct PRD §36
  bullets that could otherwise collapse into the same number. Page at
  `src/app/(dashboard)/analytics/page.tsx`, `force-dynamic`, reuses Step
  23's `StatCard`/`TrendBars` components as-is. `src/proxy.ts` updated to
  protect `/analytics`. The still-placeholder Home page (untouched since
  Step 3) got minimal nav links to `/spaces` and `/analytics` so the app
  stays navigable — **full Home Dashboard rebuild is Step 25, next**, don't
  mistake these placeholder links for that step being done.

- **Step 25 done**: New `src/lib/home/home-dashboard.ts`
  (`getHomeDashboardData`) — same "pure aggregation, no new writes" shape as
  Project/Global Analytics. Runs 6 queries in parallel:
  - **Continue Learning**: the single most recent `activity_events` row
    with a non-null `project_id` (from a 50-row recent slice, not a
    dedicated query — reused for Recent Projects too). `describeActivity()`
    maps the event's `event_type` to both a human label ("You were chatting
    with the Tutor") and a specific href (`/tutor`, `/quiz`, or the plain
    project dashboard) — so this resumes the actual activity, not just a
    generic "go to this project" link regardless of what the user was last
    doing.
  - **Recent Projects**: walks that same 50-row slice in JS, keeping the
    first (= most recent) occurrence of each distinct `project_id`, capped
    at 5 — avoids a second query and a SQL group-by for what's a small,
    bounded list at prototype scale.
  - **Overall Progress**: space/project counts via `count: "exact",
    head: true`; overall mastery is a plain average across every
    `concept_mastery` row the user owns (RLS-scoped, no explicit
    `owner_id` filter needed — same pattern as Global Analytics, Step 24).
  - **Areas to Improve**: `concept_mastery` rows below
    `MASTERY_THRESHOLDS.needsAttention` (imported from Step 24's
    `shared.ts`, not re-hardcoded), joined to concept + project name,
    weakest-first, capped at 5.
  - **Recommended Next Step**: reads the single most recent row from the
    `recommendations` table across *all* projects — deliberately does
    **not** call `getOrGenerateRecommendation` here, since that would mean
    an AI call on every Home page load; Home only ever surfaces whatever a
    Project Dashboard visit already cached (Step 22's 10-minute cache), so
    it can go stale by a few minutes without ever costing extra AI spend
    just for viewing Home.
  Nested Postgrest joins (`projects(name, spaces(name))`,
  `concepts(name), projects(name)`) come back loosely typed same as
  elsewhere in this codebase (no generated Supabase types) — cast via a
  local row type per query rather than fighting the inferred shape.
  Rewrote `home/page.tsx` (was the Step 3 placeholder): "Continue Learning"
  as a prominent dark CTA card, the recommendation banner reusing the exact
  blue-banner style from the Project Dashboard, `StatCard`s for Overall
  Progress (Step 23's component, reused as-is), `MasteryBar` for Areas to
  Improve (Step 21's component), `LocalTimestamp` for Recent Projects' "last
  active" time (Step 13's component — never format a DB timestamp
  server-side, per that step's note). Every section is conditionally
  rendered — a brand-new user with no activity yet sees a clean empty state
  instead of five empty boxes.

- **Step 26 done**: `src/lib/auth/admin.ts` (`requireAdmin`) — checks
  `profiles.role === 'admin'` for the current session and either
  `redirect("/login")` (no session) or `notFound()` (logged in, not admin).
  `notFound()` rather than a "no permission" page is deliberate: matches
  the same posture `getSpace`/`getProject`'s catch-and-notFound pattern
  already takes when RLS blocks a row — a non-admin shouldn't be able to
  tell "this route doesn't exist" apart from "it exists but I can't see
  it." This is the **app-layer** counterpart to Step 2's `is_admin()` — that
  Postgres function already gates every admin-relevant row at the RLS
  layer regardless of what the app does; this step stops a non-admin from
  reaching an admin *page* in the first place, so Steps 27-30 don't each
  need their own check.
  Deliberately **not** done in `proxy.ts`: role lives in the `profiles`
  table, and proxy.ts currently only checks authentication (session
  exists), not authorization (what can this session do) — adding a DB
  round-trip there would run on every single request site-wide, not just
  the handful of admin routes that need it. A Server Component check is
  the right layer for this, so it went in a layout instead.
  New `src/app/(dashboard)/admin/layout.tsx` calls `requireAdmin()` once —
  every nested admin route (this step's placeholder `admin/page.tsx`, and
  Steps 27-30's real content) inherits the gate automatically, including if
  someone links directly to a nested route rather than going through
  `/admin` first (layouts run on every navigation into the segment, not
  just the first). `admin/page.tsx` itself is intentionally minimal — just
  enough to confirm the gate works — since Step 27 replaces its content
  with the real Admin Overview.
  Also added a conditional "Admin" link on the Home page (only rendered
  when `profiles.role === 'admin'`) — without it there was no way to
  discover `/admin` except by typing the URL directly.
  **To test**: the account promoted to admin via Step 2's SQL snippet
  should see `/admin` render normally; any other account should get a
  clean 404, not a permission-denied page or a broken layout.

- **Step 27 done**: confirmed table-by-table (`grep -l is_admin() supabase/
  migrations/*.sql`) that every relevant table already has an `or
  public.is_admin()` clause on its SELECT policy from Step 2's migration —
  so the plain user-scoped `createClient()` sees every user's rows for an
  admin session, exactly as this file's own Step 27 planning note hoped.
  **Did not** reach for the service-role admin client: it would bypass RLS
  entirely, a strictly bigger blast radius for no benefit, since an admin
  session already gets full visibility through RLS itself — and if
  `requireAdmin()` (Step 26) ever had a bug, RLS remains a second
  independent gate behind it.
  New `src/lib/admin/overview.ts` (`getAdminOverview`): users/spaces/
  projects/materials counts, active-users-in-last-7-days (distinct
  `owner_id` from recent `activity_events`), tutor/quiz activity counts.
  **Deliberately does NOT fake AI usage/system health/background job
  metrics** — those need Langfuse (Step 29) and Inngest run state (Step 30)
  respectively, neither of which is queryable from this app yet. The
  Overview page has an explicit "coming in Step 29/30" placeholder instead
  of approximating with activity-event counts and calling it done — matches
  this project's standing rule of never fabricating a number for a section
  that isn't really wired up.
  New `src/lib/admin/users.ts`: `listUsersForAdmin()` and
  `getUserDetailForAdmin(userId)`. **Resolved this file's own earlier
  planning note** ("N+1 queries per user vs. a SQL view") by fetching each
  aggregate table (spaces, projects, activity_events, concept_mastery) in
  full and grouping by `owner_id` in JS — avoids N+1, and a dedicated SQL
  view felt like premature infrastructure for a prototype's user count.
  **Explicitly flagged in the module's own comment as the one query
  pattern in this codebase that won't scale past a few hundred users**
  (fetches every row across every user at once, unlike everything else
  here which stays RLS-scoped to one owner) — worth revisiting with a real
  SQL aggregation if this ever needs to handle more.
  Pages: `admin/page.tsx` rewritten from Step 26's placeholder into the
  real Overview; new `admin/users/page.tsx` (sortable-by-eye table: email,
  registered, last active, spaces, projects, activity count, overall
  progress — each row links to detail); new
  `admin/users/[userId]/page.tsx` (Learning Overview, Usage, Projects list,
  a 30-event Activity Timeline with a static `EVENT_LABELS` map turning
  raw `event_type` strings into readable text). `admin/layout.tsx` gained a
  small Overview/Users nav bar plus a "← Back to App" link, shared across
  every admin page rather than duplicated per-page.

- **Correction (found during a fresh-session review before Step 29)**:
  Step 28's write-up below was accurate as a *plan*, but the files it
  describes (`event-labels.ts`, `spaces-projects.ts`, `activity.ts`, the
  three admin pages, and the 5-link nav bar) did not actually exist on
  disk — only Step 27's `admin/users/[userId]/page.tsx` (with `EVENT_LABELS`
  still inline, never extracted) was present. Likely cause: the summary
  below was written up as if the step had been completed, but the actual
  file-write turns never happened (or were lost). **Lesson for future
  sessions**: this file is the source of truth for *intent*, not proof of
  *existence* — if resuming after a gap, spot-check that a few of the most
  recently-claimed files are actually present (`find` or `ls`) before
  trusting the checklist and building on top of them, especially after any
  gap where the chat/session may have been interrupted mid-step.
  Rebuilt Step 28 for real in this session, matching the plan below almost
  exactly (the write-up turned out to be a good spec even though the code
  behind it didn't exist yet).
- **Step 28 done**: extracted `EVENT_LABELS` out of the User Detail page
  (Step 27 had defined it inline) into new `src/lib/admin/event-labels.ts`,
  now shared by the User Detail Activity Timeline and this step's Activity
  view — also exports `ALL_EVENT_TYPES` (derived from `EVENT_LABELS`'
  own keys, not a second hardcoded list) for the Activity filter dropdown.
  **Important discovery while building this**: `activity_events.space_id`
  is only ever populated on the single `space_created` event — every other
  event type (materials, Tutor, Quiz, mastery, etc.) only ever carries a
  `project_id`, since that's genuinely where those actions happen. So
  "activity for a Space" can't be read directly off `space_id` — both
  `listSpacesForAdmin()` and the Space filter in `listActivityForAdmin()`
  have to roll it up through that Space's Projects instead (a
  `project_id → space_id` lookup map built from the `projects` table).
  Documented this directly in `spaces-projects.ts`'s module comment so a
  future step doesn't waste time debugging "why is Space activity always
  1" before rediscovering the same thing.
  New `src/lib/admin/spaces-projects.ts`: `listSpacesForAdmin()` (owner,
  project count, activity count, last activity — activity/last-activity
  rolled up via the project→space map above) and `listProjectsForAdmin()`
  (owner, space, materials count, Tutor/Quiz activity counts, progress =
  average mastery across that project's concepts, last activity). Both
  flat tables, no detail drill-down page — PRD §60 only asks for the table
  view itself, unlike Users (§58) which explicitly wanted a detail page.
  New `src/lib/admin/activity.ts`: `listActivityForAdmin(filters)` +
  `getAdminActivityFilterOptions()` (populates the filter dropdowns,
  intentionally a separate query from the row-fetching one so changing one
  filter doesn't force refetching the dropdown option lists themselves).
  Filters: user, space (via the same project→space rollup), project, event
  type, time period (today/7d/30d/all, converted to a `since` timestamp
  server-side rather than accepting a raw date in the URL). Capped at 100
  rows — this is a browse/filter view, not an export; PRD §61 doesn't ask
  for pagination and 100 recent events is plenty to answer "what's
  happening lately" for a prototype's activity volume.
  Pages: `admin/spaces/page.tsx`, `admin/projects/page.tsx` (plain tables,
  same style as Step 27's Users table), `admin/activity/page.tsx` — filters
  implemented as a plain GET `<form>` + `searchParams`, no client-side
  filter state, consistent with this app's server-first approach
  throughout (re-navigating with a new querystring just re-runs the Server
  Component with fresh filtered data). Admin nav bar (`admin/layout.tsx`)
  now has five links: Overview, Users, Spaces, Projects, Activity.

- **Step 29 done**: confirmed first (via web search, since this needed
  info past training-data cutoff) that `package.json`'s existing
  `langfuse@^3.38.20` — the same legacy-v3 package `provider.ts` already
  uses for `.trace()`/`.generation()` ingestion — has query-side methods
  too (`fetchTraces`/`fetchObservations`/etc.), so **no new dependency**
  was needed for this step. New `src/lib/observability/langfuse-query.ts`
  (`getAiUsageSummary(windowHours)`): pages through `GENERATION`-type
  observations via `fetchObservations({ type: "GENERATION", fromStartTime,
  limit, page })` (capped at `MAX_PAGES=5` × `PAGE_SIZE=100` — prototype-
  scale cap, same PRD §64 reasoning as everywhere else in Admin; sets a
  `truncated` flag the UI surfaces rather than silently under-reporting),
  and aggregates request count, error count/rate (`level === "ERROR"`),
  latency (`endTime - startTime`), input/output tokens (`obs.usage`, the
  same field shape `provider.ts` writes), grouped both **by feature**
  (`obs.name`, which is literally provider.ts's `feature:` option — so
  this *is* filtering by product feature) and **by model**. `byFeature`
  seeds every entry in a hardcoded `KNOWN_AI_FEATURES` list at zero first,
  so a feature with no calls this window still shows a `0` row instead of
  silently vanishing from the table.
  **Cost is deliberately nullable, not defaulted to 0**: Langfuse only
  populates `costDetails.total` for models it has registered pricing for,
  and Groq's `openai/gpt-oss-120b` (this project's `TEXT_MODEL`) isn't in
  Langfuse's default model list — so `totalCostUsd` will likely read `null`
  until a custom model price is registered in the Langfuse project
  settings. The Admin page shows "n/a" with a one-line explanation rather
  than a misleading "$0.00" that would imply free — same "never fabricate
  a number for a section that isn't really wired up" rule as Step 27's
  Overview page.
  New page `admin/ai-usage/page.tsx`: Overview stat cards (requests, error
  rate, avg latency, cost), a By-Feature table, a By-Model list, a Recent
  Errors list (`statusMessage` from the failed generation — this is the
  same message `generateText`/`generateStructured`'s `catch` blocks write
  via `generation.end({ level: "ERROR", statusMessage })`), and an
  **honest placeholder** for "Evaluation Results" explaining Step 32's
  evaluation harness doesn't exist yet rather than faking a score. Fetch
  failure (Langfuse unreachable) is caught and shown as an inline error
  banner rather than 500ing the whole Admin section (PRD §49 pattern).
  Linked from `admin/page.tsx`'s former Step 27 "coming in Step 29"
  placeholder, and added to `admin/layout.tsx`'s nav (now 6 links:
  Overview, Users, Spaces, Projects, Activity, AI Usage).

- **`tsc --noEmit` bug sweep (found by actually running it locally, not
  just reviewing by eye)**: fixed 5 real errors across 5 files —
  1. `langfuse-query.ts`: `fetchObservations({ fromStartTime })` wants a
     `Date`, not an ISO string — was calling `.toISOString()` unnecessarily.
  2. `prompts/recommendation.ts`: imported `ConceptGrowth` from
     `"../mastery/growth"`, but this file lives in `src/lib/ai/prompts/`,
     two levels below `src/lib/`, not one — needed `"../../mastery/growth"`.
     Pre-existing since Step 22, never caught because nothing had run
     `tsc` end-to-end since.
  3. `retrieval.ts`: `supabase.rpc("match_material_chunks", ...)` has no
     generated types to infer a row shape from (no `database.types.ts` in
     this project), so `data` came back effectively untyped and `.map()`
     callback params were implicit `any`. Added an explicit
     `MatchedChunkRow` type and cast `data` to it once, right after the
     error check, instead of leaving every downstream `.map()` to infer on
     its own.
  4. `quiz-question.tsx`: `result` state was typed as the full
     `SubmitAnswerResult` (including its `{ error: string }` branch), even
     though `handleSubmit` already guarantees an error result is never
     passed to `setResult` (it returns early instead). TypeScript couldn't
     see that guarantee from the state's declared type, so every
     `result.questionType`/`.isCorrect`/etc. access below failed to
     type-check. Fixed by typing the state as
     `Exclude<SubmitAnswerResult, { error: string }> | null` instead —
     no runtime logic changed, this only tells the type system what the
     code already guaranteed.
  5. `quiz/[quizAttemptId]/page.tsx`: `question` can legitimately be
     `undefined` if `getCurrentQuestion` throws (caught into `loadError`),
     but the render only checked `loadError` before passing `question` to
     `<QuizQuestion>`, which requires it non-optional. Changed the
     condition to `loadError || !question` so the undefined case is
     actually handled instead of assumed away.
  **Process note for future sessions**: none of these were caught by
  reading the code — they only surfaced when the user actually ran
  `npx tsc --noEmit` locally. Ask for that (or run it directly, in a
  session that has the container installed) before considering *any* step
  "done," not just as an optional follow-up — static review alone missed
  all five of these.

- **Full project bug sweep (new session, before Step 30)**: installed deps
  and actually ran `npx tsc --noEmit` and `npx eslint .` end-to-end rather
  than reviewing by eye (same lesson as the sweep above — static reading
  alone keeps missing things). Found and fixed:
  1. `src/app/layout.tsx` used `LayoutProps<"/">`, a Next.js 16 typed-routes
     global type that only exists once `.next/types` has been generated by
     a build/dev run. `tsc --noEmit` on a fresh clone (no prior `next dev`/
     `next build`) fails on this immediately — exactly the "ran it locally
     and it broke" scenario the sweep above warns about, just one layer
     earlier (before any feature code even gets type-checked). Fixed to the
     same explicit `{ children: React.ReactNode }` signature every other
     layout in the app already uses, removing the hidden generated-file
     dependency entirely.
  2. `materials-list.tsx`: `useEffect(() => setMaterials(initialMaterials),
     [initialMaterials])` — syncing state from a prop inside an effect is a
     real one-render-late correctness gap, not just a lint nit: navigating
     between two projects re-renders this client component with new
     `initialMaterials` before the effect fires, so there's a tick where
     the *previous* project's materials list is what's on screen (and where
     the polling effect below it could act on stale data). Fixed using
     React's documented "adjust state during render" pattern (comparing
     against a `prevInitialMaterials` state slot and calling `setMaterials`
     directly in the render body when it changes) instead of an effect.
  3. `local-timestamp.tsx`: same lint rule flagged a setState-in-effect
     here too, but this one's a legitimate hydration-mount guard (format
     the timestamp only once mounted in the browser, so SSR and client
     don't disagree on timezone) with no render-time equivalent — "wait
     until we're on the client" can't be expressed outside an effect. Left
     the logic alone and added a narrowly-scoped, explained
     `eslint-disable-next-line` instead of breaking correctness to satisfy
     the linter.
  4. Three `react/no-unescaped-entities` errors (`projects/[projectId]/
     page.tsx`, `tutor-chat.tsx`, `spaces/page.tsx`) — plain apostrophes in
     JSX text nodes, fixed to `&apos;`.
  5. Deleted `src/app/(dashboard)/spaces/action.ts` — a 0-byte dead file
     sitting next to the real `actions.ts` (typo leftover from some earlier
     step), confirmed unimported anywhere before removing.
  `tsc --noEmit` and `eslint .` both come back completely clean after these.
  Also checked for the stray `supapase` folder the previous session's note
  flagged — not present in what the user actually shared, nothing to do
  there.

- **Step 30 done**: Admin System Health (PRD §64) — the other half of Step
  27's original "AI & System Health" placeholder, now that AI Usage
  (Step 29) is done.
  **Real engineering trade-off made here (documented per PRD §81, not just
  implemented silently)**: the plan below (from the previous session) was
  to pull job queued/running/completed/failed counts from Inngest's own
  run-history API. Investigating that surface turned up a genuine blocker:
  Inngest's REST API for *listing* runs by status/time-range needs a
  separate `INNGEST_API_KEY` (created under Settings → API Keys in the
  Inngest dashboard) — not the `INNGEST_EVENT_KEY`/`INNGEST_SIGNING_KEY`
  already provisioned for this project — and broad run search beyond a
  single event/run ID lookup lives behind Inngest's "Insights" feature,
  which isn't guaranteed available on every plan tier. Adding a new
  required secret and an unverified external dependency for a prototype
  health page is a worse trade than the alternative that was actually
  built: this app already writes a `material_processing_started`/
  `_completed`/`_failed` activity event at every stage of its one
  background pipeline (`process-material.ts`), and every `materials` row
  already carries its own current `status` + `updated_at`. That fully
  answers what PRD §64 actually asks for — job counts, backlog, recent
  failures, processing duration — without a new dependency, using data
  this app already fully controls and trusts.
  New `src/lib/admin/system-health.ts`: `getSystemHealth()` runs three
  independent checks in parallel (one section being down must not blank
  the others — PRD §49 pattern applied to Admin itself):
  - `checkDatabaseHealth()` — one cheap `count`-only read against
    `profiles`, timed for latency; this *is* the "API/Database health"
    check, not a placeholder for one.
  - `getBackgroundJobHealth()` — reads the last 500 `materials` rows
    (same prototype-scale cap used everywhere else in Admin) and buckets
    by status into queued/processing/ready/failed; a material sitting in
    any in-progress status for more than `BACKLOG_STALL_MINUTES` (10) is
    surfaced as "stuck" (backlog) rather than assumed to still be working —
    this app's PDF pipeline normally finishes in well under a minute, so 10
    minutes is a safe "something's actually wrong" threshold, not a normal
    processing-time false positive. Average processing duration is
    computed by pairing each material's `material_processing_started`/
    `_completed` activity events by the `materialId` both carry in
    `metadata` (walked oldest-first so a start is always seen before its
    matching completion, regardless of the descending fetch order used to
    get the most recent 400 events). **Honestly documented gap**:
    per-attempt retry counts aren't tracked — Inngest retries internally
    (`retries: 3`) without this app logging each attempt as its own
    record — so the UI says "not tracked" rather than showing a fabricated
    0, same "never invent a number for a section that isn't really wired
    up" rule as Step 27/29.
  - `getAiProviderHealth()` — reuses Step 29's `getAiUsageSummary()` but
    with a **1-hour** window, not that page's 7-day one: "is the AI
    provider healthy right now" wants a recent signal, and a live outage
    shouldn't get diluted by six days of otherwise-healthy traffic. Kept as
    a separate constant (`AI_HEALTH_WINDOW_HOURS`) rather than sharing the
    AI Usage page's `WINDOW_HOURS` so the two pages' purposes don't get
    silently coupled.
  New page `admin/system-health/page.tsx`: a component-status pill row
  (Database / AI Provider / Background Processing, red or green) at the
  top, then a section per check with the underlying numbers, a "Stuck
  Materials" list when backlog exists, and a "Recent Failures" list.
  Load failure is caught and shown as an inline banner rather than 500ing
  the page (same pattern as `admin/ai-usage/page.tsx`). Linked from
  `admin/page.tsx`'s former "coming in Step 30" placeholder, and added to
  `admin/layout.tsx`'s nav (now 7 links: Overview, Users, Spaces, Projects,
  Activity, AI Usage, System Health).
  Verified with the same tools as the bug sweep above, not just by eye:
  `tsc --noEmit` and `eslint .` both clean after adding these two new files.

- **Step 31 done**: AI usage/cost tracking table (PRD §43) — a first-party
  `ai_requests` table, not just data read back from Langfuse.
  **Scoping decision (this was left open at the end of the last session —
  resolved here, per PRD §81)**: went with the lean/resilience option, not
  a full duplicate of Langfuse's tracing. Two concrete reasons this table
  earns its place alongside Langfuse rather than just being redundant with
  it: (1) **resilience** — Step 29/30's Admin views are currently 100%
  dependent on Langfuse being reachable; this is a record the app fully
  owns, so a Langfuse outage doesn't blank out AI usage visibility, and
  (2) **real cost data** — Langfuse has no registered pricing for Groq's
  `openai/gpt-oss-120b` (Step 29's `totalCostUsd` reads `null` for exactly
  this reason), so this table prices requests itself instead
  (`src/lib/ai/pricing.ts`, rates verified against Groq's current published
  rate card: $0.15/1M input, $0.60/1M output — cross-checked across
  multiple independent trackers agreeing on the same figures as of Sept
  2026). Deliberately does NOT store prompt/output text or duplicate
  Langfuse's full trace tree — that's Langfuse's job, this is just metrics.
  New migration `0011_ai_requests.sql`: `ai_requests` (owner_id, project_id
  — both nullable with `ON DELETE SET NULL`, not `CASCADE`, since a
  cost/usage ledger is historical accounting data that shouldn't vanish
  just because the user/project it happened under was later deleted;
  feature, model, input/output tokens, latency_ms, estimated_cost_usd
  (nullable — null for an unpriced model, never a fabricated 0),
  success/error_message, created_at). RLS: same tamper-proofing pattern as
  `activity_events` — SELECT via `owner_id = auth.uid() or is_admin()`, NO
  insert policy for the `authenticated` role at all, written only via the
  service-role client.
  New `src/lib/ai/pricing.ts` (`estimateCostUsd`) and
  `src/lib/ai/usage-log.ts` (`recordAiRequest` — same
  service-role-client/swallow-its-own-errors pattern as
  `recordActivityEvent`, for the same reason: `provider.ts` gets called
  from multiple execution contexts and can't assume a cookie-based client
  is available; `extractProjectId` — a defensive best-effort pull of
  `projectId` out of `provider.ts`'s free-form `metadata` bag).
  **`provider.ts` now calls `recordAiRequest` at the end of both the
  success and error paths of both `generateText` and `generateStructured`**
  — symmetric with how `generation.end()` is already called in both
  branches for Langfuse. `generateStructured` didn't track its own latency
  locally before this (Langfuse computed it implicitly from its own
  generation lifecycle) — added a `startedAt`/`Date.now()` pair matching
  `generateText`'s existing pattern, since our own table needs a
  `latency_ms` value to write.
  **Bug fixed while wiring this up**: `grading.ts`'s `generateStructured`
  call passed neither `userId` nor a `projectId` in `metadata` — the only
  one of the four `generateStructured`/`generateText` call sites missing
  both (tutor.ts, quiz.ts, and recommendation.ts all correctly pass both).
  This meant every open-ended-grading request was invisible to per-user
  attribution in Langfuse too, not just unattributed in this new table —
  a real, pre-existing gap this step's wiring exposed. Fixed by passing
  `userId: question.owner_id, metadata: { questionId, projectId:
  question.project_id }` (both already in scope from the question row
  already being fetched).
  New `src/lib/admin/ai-requests.ts` (`getAiRequestSummary`) — reads this
  table back the same way `admin/overview.ts` reads its own tables:
  through the plain user-scoped client, relying on RLS's `is_admin()`
  clause rather than reaching for the service-role client to read data an
  admin session can already see anyway.
  `admin/ai-usage/page.tsx` gets a new "Recorded Usage (First-Party Log)"
  section between the Langfuse-based Overview and By-Feature sections —
  explicitly labeled as independent of Langfuse, showing requests/failures/
  **real, non-null cost** plus a cost-coverage percentage (honesty signal:
  what fraction of requests this window had a registered price — matters
  the moment a second, unpriced model gets added later), a by-feature
  table, and a Recent Requests list. Load failure here is caught and shown
  inline exactly like the existing Langfuse section, independently — one
  data source being down doesn't blank the other.
  Verified with `tsc --noEmit` and `eslint .`, both clean.

- **Multi-session review (new session, before Step 32)**: read every new/
  changed file from Steps 29-31 line by line rather than trusting
  CONTEXT.MD's own notes at face value, and independently re-verified each
  claimed fix actually landed in the code (the `LayoutProps` fix, the
  `materials-list.tsx` render-time state adjustment, both quiz type fixes,
  `retrieval.ts`'s `MatchedChunkRow`, the recommendation import path) —
  all confirmed genuinely applied, not just described. No functional bugs
  found; the previous sessions' own `tsc`/`eslint` sweeps were thorough.
  Two small things fixed:
  1. Deleted `DELETE_THESE_FILES.txt` — a stale cleanup note whose target
     file (`spaces/action.ts`) was already gone from what was actually
     shared; the note had done its job and was just clutter now.
  2. `getAiRequestSummary` (Step 31) had a `SCAN_LIMIT` (1000-row) cap with
     no way to know if it had been hit, unlike Step 29's Langfuse module
     which sets an honest `truncated` flag in the same situation. Added
     the matching flag (fetch `SCAN_LIMIT + 1` rows, `truncated` = got more
     than `SCAN_LIMIT` back, slice to `SCAN_LIMIT` for the actual
     aggregation) and surfaced it on the AI Usage page next to the
     first-party stat cards, so this table can't silently under-report
     once usage grows past the cap the same way Langfuse's already
     couldn't.
  Considered also widening `admin/layout.tsx`'s nav to `max-w-4xl` to match
  the AI Usage/System Health pages' wider tables — reverted: 5 of 7 admin
  pages use `max-w-3xl`, so that would trade one minor misalignment for a
  bigger one. Not worth it; left alone.

- **Step 32 done**: `src/lib/eval/runner.ts` — 6 curated test cases across
  Tutor, Quiz Generation, Grading, and Recommendations (PRD §46-47).
  **Scoping decision (documented in the module's own header comment, per
  PRD §81)**: rule-based/structural checks, not a second AI model judging
  the first one's output — PRD §46 explicitly lists rule-based checks as
  valid, and an AI-judges-AI layer would roughly double this feature's AI
  cost while adding its own "how do we know the judge is right" reliability
  question, for a prototype-scale harness. What's actually checked: did
  generation throw a schema-validation error at all (the schema itself,
  reused directly — see below), does grading score a substantive answer at
  least 30 points higher than a near-empty non-answer (a real
  discrimination check, not just "did it return a number"), does a
  generated recommendation actually mention the concept its own input data
  flagged as weak (checks the model used the data it was given, not just
  that it returned syntactically valid JSON).
  **Exported the three schemas that were previously module-private**
  (`QuizQuestionSchema` in `quiz.ts`, `GradingResultSchema` in `grading.ts`,
  `RecommendationSchema` in `recommendation.ts`) so the harness validates
  against the exact real schemas rather than a parallel copy that could
  drift out of sync — the only change made to those three files for this
  step.
  **Non-mutation guarantee, worth restating because it's the trickiest
  part of this step**: Quiz Generation / Grading / Recommendation cases
  call `generateStructured` directly with a synthetic, fixed context
  (`SYNTHETIC_CHUNKS`, a fixed photosynthesis paragraph) — NOT through
  `generateNextQuizQuestion`/`gradeOpenEndedAnswer`/
  `getOrGenerateRecommendation`, which persist to real `quiz_questions`/
  `recommendations` rows. Running an eval must never overwrite a real
  user's actual quiz question, grade, or cached recommendation. Trade-off
  accepted: this tests "does the prompt+schema reliably produce valid,
  sensible output" rather than the full retrieval-to-persistence pipeline
  for those three — acceptable since retrieval itself is exactly what the
  Tutor cases below exercise for real.
  **Tutor cases are the one exception**: they call the real
  `answerTutorQuestion` against one of the admin's own real projects (found
  via `findEvalProject` — needs at least one concept, so there's something
  real to ask about; **skipped**, not failed, if none exists — an empty
  account isn't a Tutor pipeline problem), to genuinely exercise retrieval
  + groundedness + citation-building end to end, which can't be
  meaningfully faked with synthetic chunks the way schema checks can. This
  creates a real `conversations` row — mitigated by titling it clearly
  ("Eval Run (temporary — auto-deleted)") and deleting it in a `finally`
  block regardless of pass/fail, so no artifact lingers in the admin's
  real Tutor conversation list (messages cascade-delete with it).
  **One accepted imprecision, documented rather than silently left**:
  `answerTutorQuestion` hardcodes `feature: "tutor_response"` internally
  (not parameterized), so the 1-2 Tutor calls per run DO mix into the real
  "tutor_response" AI Usage numbers — unlike Quiz/Grading/Recommendation
  cases, which use `eval_`-prefixed feature names (`eval_quiz_generation`,
  `eval_open_ended_grading`, `eval_recommendation_generation`) specifically
  to keep eval traffic out of production usage stats. Not worth changing
  `tutor.ts`'s signature just for this one case.
  New migration `0012_eval_runs.sql`: one row per run, results stored as
  jsonb (an array of `{id, category, name, status, detail, latencyMs}`)
  rather than a normalized results table — a run's cases are a small,
  fixed, always-read-together unit, so normalizing would add join overhead
  for no benefit at this scale; admin-only SELECT via `is_admin()`, no
  insert policy (service-role client only, same tamper-proofing pattern as
  `activity_events`/`ai_requests`).
  `runEvaluation(adminUserId)` runs all 4 categories in parallel via
  `Promise.all`, then writes one row via the service-role client (mirrors
  `usage-log.ts`'s reasoning — this needs to work regardless of exactly
  which context it's called from). `listEvalRuns(limit)` reads them back
  through the plain user-scoped client, relying on RLS same as every other
  Admin read module.
  New `admin/evaluation/actions.ts` (`triggerEvalRun`) — deliberately NOT
  run automatically on page load, since every case makes real, billed Groq
  calls; only runs when an admin explicitly clicks the button, same
  "real cost = explicit action" principle as everything else with a cost
  attached in this app. New `admin/evaluation/page.tsx`: a "Run Evaluation
  Now" button, the latest run expanded in full (every case's status +
  detail text), and previous runs collapsed to a one-line summary — framed
  explicitly as "compare against the latest run to spot a regression"
  (PRD §47), not just a log.
  Replaced `admin/ai-usage/page.tsx`'s "Evaluation Results" honest-
  placeholder (from Step 29) with a real summary of the latest run + a link
  to the full Evaluation page, and added the `eval_`-prefixed features to
  that page's existing `FEATURE_LABELS` map so eval traffic reads clearly
  as eval traffic in the by-feature tables rather than an unlabeled raw
  string. Admin nav (`admin/layout.tsx`) now has 8 links: Overview, Users,
  Spaces, Projects, Activity, AI Usage, System Health, Evaluation.

- **Step 33 done**: an audit pass, not one feature — went through the app
  against PRD §49's failure-point list and §50's idempotency list, and
  confirmed via actual research (not assumption) what groq-sdk already
  does before deciding what to build. Four real gaps found and fixed, one
  documented as an accepted limitation.
  **Checked first, before writing anything**: `groq-sdk` already retries
  connection errors, 408/409/429, and >=500 automatically 2× with backoff,
  and times out at 1 minute by default (confirmed from the SDK's own
  README, not assumed) — so `provider.ts`'s Groq calls already had real
  resilience to transient failures. Good thing this was checked first:
  wrapping `generateText`/`generateStructured` in a second, app-level retry
  loop on top of the SDK's own would have silently multiplied a single
  failure into up to 3×3=9 attempts — worth remembering for any future
  "should we add retry logic here" question about a real SDK, not just
  this one.
  1. **`embeddings.ts` had zero retry logic** on its raw `fetch()` to
     Google's embedding API — a real, asymmetric gap, since the Groq LLM
     call sitting right next to it in the same live Tutor/Quiz/Grading/
     Recommendation request already got 2 free retries via the SDK, but a
     transient blip on the embedding call failed the whole request
     outright. Background material processing was already fine (Inngest
     retries the whole `step.run()` around `embedTexts` at the job level)
     — this fix specifically targets the synchronous, request-time
     embedding calls in `retrieval.ts` that had no safety net. Mirrors the
     SDK's own retry criteria rather than inventing new ones: retry
     connection errors, 408, 409, 429, >=500; never retry other 4xx (bad
     API key, bad request — retrying won't fix those). 3 attempts, short
     linear backoff (300ms/600ms).
  2. **`submitAnswer` (quiz/actions.ts) had no protection against being
     called twice for the same question** — a double-click, or a retried
     request after a slow response, would both pass the "not yet answered"
     read and both call `recordMasteryEvidence`, double-counting evidence
     for one logical answer. **Same bug class as the duplicate-call bug
     fixed earlier this build, but via a race instead of an accidental
     literal duplicate function call** — worth noting since it means that
     earlier fix didn't fully close this door. Fixed with an atomic claim,
     not a check-then-act (which still has a race window): `.update(...).
     eq("id", questionId).is("answered_at", null)` — only whichever
     request reaches Postgres first actually flips the row; the loser gets
     zero rows back and takes a separate branch instead of reprocessing.
     For multiple_choice, the loser safely reads back and returns the
     winner's already-complete result (grading is synchronous, so it's
     definitely done by the time the loser checks). For open_ended, the
     loser instead gets an honest "already submitted — refresh to see your
     result" message rather than a fabricated one — grading is an async AI
     call that takes 1-3 seconds, so a near-simultaneous loser will almost
     always arrive before the winner's grading finishes; building a
     wait-and-poll mechanism for a double-click edge case wasn't worth it,
     and the honest message still correctly prevents the double
     mastery-evidence write, which was the actual bug.
  3. **`finishQuiz` had the identical issue** for `quiz_completed` — a
     double-click would log the activity event twice for one logical
     completion (PRD §50 explicitly lists analytics events as needing
     this). Same atomic-claim fix: `.update(...).eq("id", quizAttemptId).
     neq("status", "completed")` — only the request that actually
     transitions the attempt from `in_progress` to `completed` logs the
     event; a second call just redirects.
  4. **`generateNextQuizQuestion` (quiz.ts) had a structurally identical
     race**: `getCurrentQuestion`'s check-then-generate flow means two
     concurrent loads of the same quiz attempt (two tabs, a fast reload)
     could both see "no unanswered question" and both generate one,
     leaving an orphaned duplicate that `getCurrentQuestion` would never
     actually surface (it always returns the lowest `order_index`) —
     silently inflating AI-generated-question counts for a question no one
     ever saw. Fixed at the database level: new migration
     `0013_quiz_question_uniqueness.sql` adds a partial unique index on
     `quiz_questions(quiz_attempt_id) WHERE answered_at IS NULL` — "at most
     one unanswered question per attempt" is now a real DB invariant, not
     an app-level assumption. The losing insert fails with Postgres 23505,
     caught and handled by fetching and returning the winner's question
     instead — **the exact same pattern `getOrCreateConcept` (Step 15)**
     already used for its own analogous concept-creation race, just
     applied here for the first time to quiz questions.
     **Real-world confirmation**: the migration failed on first attempt —
     `could not create unique index ... Key (quiz_attempt_id)=(...) is
     duplicated` — meaning this exact race had already happened at least
     once in real usage before the fix existed, not just a theoretical
     risk. Added a cleanup step to the same migration: for any attempt
     with more than one unanswered question, keep the one
     `getCurrentQuestion` would actually have surfaced (lowest
     `order_index` — the one the user actually saw) and delete the
     orphaned duplicate(s) before creating the index.
  5. **Accepted, documented limitation (not fixed)**: `getOrGenerateRecommendation`
     has the same shape of check-then-generate race as #4 above — two
     near-simultaneous project-dashboard loads could both miss the
     freshness-window cache and both generate + insert a recommendation.
     Deliberately left as-is rather than adding a Postgres advisory lock:
     unlike #2-4, this can't corrupt learning state (mastery, quiz
     progress) — worst case is one extra AI call and one extra history
     row, and it requires the same user to load the same project dashboard
     twice within milliseconds, a much rarer trigger than a button
     double-click. Building a lock for this specific risk profile isn't
     worth the complexity in a prototype; flagged here so it's a documented
     trade-off (PRD §81) rather than a silently-unexamined gap.
  Also verified (no changes needed): Tutor's `sendMessage` doesn't have
  this class of bug — each call is a genuinely distinct user message, so a
  "duplicate" send just creates an extra, separate Q&A turn, not corrupted
  aggregate state. Both `tutor-chat.tsx` and `quiz-question.tsx` already
  had client-side pending-state guards (disabled inputs during a
  submission) before this audit — the fixes above are server-side defense
  in depth for what client-side disabling can't prevent (two open tabs, a
  network-level retry), not a response to a missing client-side guard.

- **Bug fix (found via user report — stale hover/active styling surviving
  into the next question)**: `quiz-question.tsx`'s Submit/Next button was a
  ternary rendering two different `<button>`s at the same tree position
  with no `key` — React doesn't treat that as "remove one element, add a
  different one," it reuses the same underlying DOM node and just patches
  its text/handler/attributes in place, since the tag type and position
  match. If the mouse was sitting still over that spot while it silently
  morphed from "Submit Answer" into "Next Question" (and back into "Submit
  Answer" for the next question), the browser kept treating it as one
  continuously-hovered element, carrying hover/active visual state along
  with it rather than resetting. Fixed two ways, deliberately
  complementary rather than redundant: (1) `key="submit"`/`key="next"` on
  the two button branches themselves, so React properly unmounts/remounts
  across that specific transition; (2) `key={question.id}` added on
  `<QuizQuestion>` where it's rendered in `[quizAttemptId]/page.tsx` (had
  no key at all before), guaranteeing the *entire* component — all local
  state, not just this one button — starts genuinely fresh on every new
  question, rather than relying solely on `handleNext`'s manual
  `setSelectedOption(null)`-style resets. Fix (1) alone wouldn't have
  covered every case (the Submit→Next transition happens *within* one
  question, before `question.id` changes, so the outer key wouldn't catch
  that moment) — both were needed.

- **Bug fix (found via user report, new session — same-looking symptom,
  different root cause than the hover-state fix directly above)**: the
  user reported the Submit button still looking "stuck" after clicking
  Next Question. The keying fix above was already in place and correct —
  the actual remaining cause was that `handleNext` had **zero loading
  feedback** for the wait it triggers: `router.refresh()` re-runs the
  server component, which calls `getCurrentQuestion` →
  `generateNextQuizQuestion`, a real `generateStructured` AI call
  (hundreds of ms to a few seconds), not an instant local update. Worse,
  the old `handleNext` reset `result`/`selectedOption` to `null`
  *immediately*, flipping the UI straight back to the disabled "Submit
  Answer" branch (nothing selected yet) — so for the entire wait, the
  screen showed a disabled, inert Submit button with no indication
  anything was happening. Completely reasonable to read that as "the
  previous click's effect is stuck," since visually nothing distinguishes
  it from a genuinely frozen UI.
  Fixed properly rather than papering over it: added a second, separate
  `useTransition()` (`isLoadingNext`/`startNextTransition`) just for this
  wait — kept distinct from the existing submit-answer `isPending` because
  the two waits mean different things ("grading your answer" vs
  "generating the next question") and sharing one flag would show the
  wrong label during one of them. `handleNext` no longer manually resets
  any state at all: the parent already remounts this whole component
  fresh via `key={question.id}` the moment the new question actually
  arrives, so the manual resets were redundant *and* were the actual
  source of the premature UI flip described above. Until the new question
  arrives, the just-answered question and its "Next Question" button now
  stay visible exactly as the user left them, just disabled with a
  "Loading next question..." label — accurate, visible feedback for the
  entire wait instead of an ambiguous early reset.
  Verified with `tsc --noEmit` and `eslint .`, both clean.

- **Step 34 done**: Tests (PRD §73) — Vitest as the runner (decided in the
  previous session's next-step note: less config friction than Jest for a
  Next.js App Router + ESM/TS codebase). Installed `vitest@^2.1.9`
  specifically, not the current major — `vitest@5`'s peer dependencies
  require `@types/node@^22 || >=24`, which conflicts with this project's
  pinned `@types/node@^20`; confirmed via the actual install error, not
  assumed, before picking a version rather than forcing past a real peer
  conflict with `--force`.
  **Scope, matching PRD §73's own framing ("awareness of what needs to be
  tested," not exhaustive coverage)**: prioritized pure, high-stakes,
  previously-buggy logic over broad shallow coverage. Three small
  refactors extracted testable pure functions out of code that was
  previously DB-coupled inline logic, with no behavior change:
  - `quiz.ts`: `selectQuizFocus()` — pulled the adaptive concept/difficulty
    decision (previously inline in `generateNextQuizQuestion`) into its own
    function. This is the exact logic behind the "always picks the only
    concept" regression documented earlier in this file — `quiz.test.ts`
    includes that scenario as an explicit regression test, which would
    have caught the original bug immediately had it existed at the time,
    per PRD §73's own reasoning for prioritizing this function.
  - `mastery.ts`: `computeUpdatedMastery()` — pulled the weighted-average
    mastery math out of `recordMasteryEvidence`. Tests cover first-evidence
    behavior (full jump to the score), the `MIN_LEARNING_RATE` floor after
    many data points, downward movement (not just upward), and a no-op
    case.
  - `retrieval.ts`'s `hasReliableEvidence` needed no refactor — already a
    pure, exported function. Tests cover both real calibration data points
    named in its own doc comment (~0.49 relevant, ~0.40 unrelated), the
    inclusive-threshold boundary, custom threshold overrides, and that only
    the best (first) match is checked, not the whole batch.
  22 tests total across `quiz.test.ts`, `mastery.test.ts`, `retrieval.test.ts`
  — all passing, verified by actually running `npx vitest run`, not just
  written and assumed correct.
  **Real bug found and fixed while wiring this up**: importing `quiz.ts`
  in a test transitively imports `provider.ts`, which constructed its Groq
  and Langfuse clients **at module load time** — `new Groq({ apiKey:
  process.env.GROQ_API_KEY })` throws immediately if that env var isn't
  loaded, which it isn't in a bare `vitest run` invocation. This meant
  `quiz.test.ts` failed outright before any test body ran, confirmed by
  actually running the suite rather than assuming the tests would pass
  once written. Fixed by making both clients lazy singletons
  (`getGroq()`/`getLangfuse()`, constructed on first actual use inside
  `generateText`/`generateStructured`) instead of module-scope constants —
  neither client is used at import time in that file anyway, so this is a
  pure robustness improvement with no behavior change for the real app,
  not just a test-environment workaround.
  **Project isolation (PRD §52) — the one thing that genuinely needs a
  live database, not a mock**: new `tests/integration/rls-isolation.test.ts`.
  RLS policies live in Postgres itself, not in this codebase's TypeScript,
  so there's no meaningful way to unit-test "can user B read user A's
  project" without a real Postgres instance enforcing real policies.
  Creates two real throwaway users + a Space/Project via the service-role
  client, then asserts: user A can read their own project; user B's read
  of the same project id comes back as an **empty result, not an error**
  (the actual RLS behavior worth asserting — a permission error would be
  the wrong thing to test for, since that's not how RLS row-filtering
  actually manifests); and the cross-user block holds through the
  space→project join too, not just a direct project lookup. Cleanup
  (`afterAll`) deletes both test users regardless of pass/fail; the
  Space/Project rows clean up automatically via the schema's existing
  `on delete cascade` on `owner_id`.
  **Honestly self-skipping, not silently passing**: reuses this app's
  existing `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY`/
  `SUPABASE_SERVICE_ROLE_KEY` env vars (a prototype doesn't warrant
  maintaining a second parallel Supabase project just for tests) rather
  than inventing separate `SUPABASE_TEST_*` ones — but that means this
  test creates and deletes real rows against whatever project those vars
  point to, so it's documented in the file's own header to point them at a
  dev/staging project rather than production before running it with real
  credentials loaded. `describe.skipIf(!hasLiveCredentials)` means `npm
  test` still passes cleanly with zero live credentials configured (e.g. a
  fresh clone, or CI without secrets) — confirmed by actually running it
  both ways: 22 passed with credentials absent (this session's sandbox has
  no Supabase network access), 3 additional isolation tests would run
  once real credentials are loaded locally.
  New `vitest.config.ts` (node environment, `@/*` alias matching
  `tsconfig.json`, includes both `src/**/*.test.ts` and
  `tests/**/*.test.ts`). `package.json` gets `"test": "vitest run"` and
  `"test:watch": "vitest"`.

- **Bug fix (Step 35, deployment) — production 500 on `/api/inngest`,
  found via the user's actual Vercel Runtime Logs, not guessed**: after
  deploying to Vercel, materials stayed stuck at `queued` forever. Initial
  hypotheses (Inngest env vars missing, `INNGEST_DEV` leaking into
  production, Vercel Deployment Protection blocking the sync) were each
  ruled out one at a time by having the user check them directly — all
  came back clean/already-correct. Visiting `/api/inngest` in the browser
  first appeared to redirect to `/login`, which looked like `proxy.ts`
  (this app's own auth gate) was the culprit — but re-checking `proxy.ts`
  showed `/api/inngest` isn't in `PROTECTED_PREFIXES` at all, so that
  couldn't be it either, and a clean re-test in incognito showed the real
  behavior: a genuine HTTP 500, not a redirect (the earlier `/login`
  sighting was almost certainly a stale tab/navigation artifact, not
  reproducible). Vercel's Runtime Logs gave the actual answer: `Error:
  Failed to load external module pdf-parse-<hash>`.
  This is a documented Next.js 16 + Turbopack issue (confirmed via web
  search against multiple open `vercel/next.js` GitHub issues describing
  the identical `Failed to load external module <package>-<hash>`
  signature for other packages too — pino, axios/get-intrinsic,
  @opentelemetry/instrumentation), not something specific to this app's
  code: packages listed in `serverExternalPackages` (this project already
  correctly lists `pdf-parse`/`pdfjs-dist` there, per Step 17's PDF-parsing
  work) are told not to be bundled and instead loaded directly from
  `node_modules` at runtime — but Turbopack's production/standalone file
  tracing frequently fails to actually copy those packages' real files
  into the deployed serverless function, so the runtime `require()` for
  the externalized module finds nothing there and throws exactly this
  error. `pdfjs-dist` (a `pdf-parse` dependency) has its own additional
  documented Turbopack-specific issues (top-level `await` handling) on top
  of this. Since `route.ts` for `/api/inngest` imports `processMaterial`
  from `process-material.ts`, which imports `pdf-parse`, the crash at
  import time took down the *entire* Inngest route — both the GET
  introspection endpoint Inngest Cloud uses to sync, and the PUT endpoint
  that actually runs jobs. This is why the symptom looked like "Inngest
  isn't syncing" even though the real problem had nothing to do with
  Inngest configuration at all.
  **Fix**: `package.json`'s `build` script changed from `"next build"` to
  `"next build --webpack"` — the standard, widely-reported workaround
  across the GitHub issues found above (Turbopack is Next.js 16's new
  default; Webpack's older, more mature file-tracing handles
  `serverExternalPackages` correctly for this class of package). Left
  `dev` as plain `next dev` (Turbopack) — this class of bug is specific to
  production's standalone/serverless file tracing, not dev mode, which is
  consistent with local `npm run dev` having processed materials
  successfully for the user throughout this entire build.
  **Not yet confirmed against a real redeploy** — the user needs to push
  this change, let Vercel redeploy with the new build command, and
  re-test a PDF upload end-to-end. Worth checking, if Vercel doesn't pick
  it up automatically: Vercel's Project Settings → Build & Development
  Settings → "Override Build Command" — if a custom command is set there
  instead of "inherited from package.json," it needs to be cleared (or
  updated to `next build --webpack` directly) for this fix to actually
  take effect.
  **Update: redeployed, and this fix alone was not sufficient.** The
  redeploy did succeed, but `/api/inngest` still 500'd — and the fresh
  stack trace from Vercel's logs still showed `[turbopack]_runtime.js`,
  meaning the `--webpack` build-command change never actually took effect
  (this needs to be re-checked against Vercel's "Override Build Command"
  setting per the note directly above — likely still unresolved). More
  importantly, that same fresh log revealed a *second*, more specific
  error underneath the generic "Failed to load external module" one:
  `ReferenceError: DOMMatrix is not defined`.
  **Real root cause, confirmed by actually reproducing and fixing it
  locally, not just pattern-matching a blog post**: `pdf-parse` v2 wraps
  `pdfjs-dist` internally, which touches browser-only globals (`DOMMatrix`,
  `Path2D`, `ImageData`) the moment its module evaluates — not when a
  function is called. In Node, `pdfjs-dist` auto-detects it's not in a
  browser and falls back to a `NodeCanvasFactory` backed by
  `@napi-rs/canvas` (a native addon) to supply those globals instead — but
  this project's code never told `PDFParse` to use that factory
  explicitly, and `@napi-rs/canvas` existed only as a *transitive*
  dependency (pulled in by `pdf-parse`, not listed in this project's own
  `package.json`) and wasn't in `serverExternalPackages` at all. Locally,
  Node's default module resolution finds `@napi-rs/canvas` naturally
  regardless, so it silently worked (confirmed by literally running the
  unmodified extraction code against this project's own
  `Project_Requirements.pdf` in this sandbox — it succeeded even without
  passing `CanvasFactory` explicitly). Vercel's serverless bundler doesn't
  reliably carry that same implicit resolution through for a native addon,
  so the fallback silently failed there instead, throwing
  `DOMMatrix is not defined`. Confirmed the fix resolves it by testing
  the corrected code against the same real PDF in this same sandbox: with
  `CanvasFactory` from `pdf-parse/worker` explicitly imported (before
  `pdf-parse` itself — import order matters, since `pdf-parse/worker` is
  what installs the polyfilled globals) and passed into `PDFParse` as
  `{ data: buffer, CanvasFactory }`, extraction succeeded — 52,297
  characters out of that PDF, both with and without the fix locally
  (expected, since local Node was never the environment exhibiting the
  bug) — the actual value of this fix is specifically for Vercel's
  environment, which this sandbox can't reproduce directly, so the
  fix is grounded in the pdf-parse's own official troubleshooting docs and
  pdfjs-dist's own source (confirmed by reading
  `node_modules/pdfjs-dist/legacy/build/pdf.mjs` directly: it does
  `new CanvasFactory({...})` internally, meaning the constructor param
  must be a *class reference*, not an instance — corrected an initial
  wrong guess at the option name/shape before checking pdf-parse's actual
  shipped `.d.ts` files, rather than trusting a blog post's paraphrase).
  **Three-part fix**:
  1. `process-material.ts`: `import { CanvasFactory } from "pdf-parse/worker"`
     placed *before* `import { PDFParse } from "pdf-parse"`, and
     `new PDFParse({ data: buffer, CanvasFactory })` instead of
     `new PDFParse({ data: buffer })`.
  2. `next.config.ts`: added `@napi-rs/canvas` to `serverExternalPackages`
     alongside the existing `pdf-parse`/`pdfjs-dist` entries — without
     this, Vercel's bundler tries to bundle the native binary itself
     rather than loading it from `node_modules` at runtime, which doesn't
     work for a native addon.
  3. `package.json`: added `@napi-rs/canvas` as an explicit direct
     dependency (pinned to `0.1.80`, the version already resolved
     transitively via `pdf-parse` — matches what's already tested rather
     than introducing a new, unverified version) rather than leaving it
     implicit. A package a build config explicitly references
     (`serverExternalPackages`) should be a direct dependency, not rely on
     a specific transitive resolution that could change if `pdf-parse`
     itself changes its own dependency later.
  **Still not yet confirmed against an actual Vercel redeploy** — the
  `--webpack` build command issue from the entry above this one is also
  still unresolved and needs the user to check Vercel's Override Build
  Command setting. Both fixes should be verified together on the next
  deploy: confirm the runtime log no longer says `[turbopack]_runtime.js`
  (webpack fix took effect) AND that a real PDF upload reaches `ready`
  without a `DOMMatrix` error (canvas fix took effect).

## 5. Next Immediate Step

Step 35: Deployment (Vercel + Supabase + Inngest Cloud). This is the first
step that needs the user's own action alongside the code (creating
accounts/projects on each platform, setting production env vars, pointing
Inngest Cloud at the deployed URL's `/api/inngest` endpoint) rather than
being fully self-contained — worth walking through as a checklist together
rather than shipping a zip, since some of it (env var values, Vercel
project settings) can't be done from inside this sandbox at all. After
that: Step 36 (architecture doc + README + AI tools/prompts documentation)
is the last purely-writing step before PRD §82-90's final submission
package (demo video, deployed URL, public repo, docs) — worth doing after
deployment rather than before, so the architecture doc can describe what
was actually deployed rather than a plan.
