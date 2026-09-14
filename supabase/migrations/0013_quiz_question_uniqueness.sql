-- ============================================================
-- 0013_quiz_question_uniqueness.sql
-- Step 33 idempotency fix: at most one unanswered question per attempt
-- ============================================================
--
-- Found during Step 33's audit: `getCurrentQuestion` checks for an
-- existing unanswered question and only generates a new one if none
-- exists — but that check-then-generate flow has a race window. Two
-- concurrent loads of the same quiz attempt (two tabs, a fast reload) could
-- both see "no unanswered question" and both call `generateNextQuizQuestion`,
-- producing two unanswered rows for one attempt. `getCurrentQuestion`
-- always returns the lowest `order_index` first, so the second row would
-- silently become an orphaned, unanswerable phantom question — never
-- corrupting real data, but quietly inflating AI-generated-question counts
-- for a request that was never actually shown to the user.
--
-- This partial unique index makes "at most one unanswered question per
-- attempt" a real database invariant instead of an app-level assumption —
-- the second concurrent insert now fails with Postgres error 23505, caught
-- and handled in `generateNextQuizQuestion` the exact same way
-- `getOrCreateConcept` (Step 15) already handles its own analogous race.
--
-- **Cleanup step required first**: this exact race has apparently already
-- happened at least once in real data before this migration existed — some
-- quiz_attempt already has more than one unanswered question sitting in
-- the table, which makes the index below impossible to create as-is
-- (Postgres can't build a unique index over data that already violates
-- it). For each affected attempt, keep the one question `getCurrentQuestion`
-- would actually have surfaced anyway (lowest order_index — that's the
-- one the user has actually seen and could still answer) and delete the
-- orphaned duplicate(s), which were never shown to anyone and can't be
-- answered retroactively in a meaningful way.
delete from public.quiz_questions
where answered_at is null
  and id not in (
    select distinct on (quiz_attempt_id) id
    from public.quiz_questions
    where answered_at is null
    order by quiz_attempt_id, order_index asc
  );

create unique index if not exists idx_quiz_questions_one_unanswered_per_attempt
  on public.quiz_questions(quiz_attempt_id)
  where answered_at is null;
