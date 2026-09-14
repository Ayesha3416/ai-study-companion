-- ============================================================
-- 0007_quiz.sql
-- Adaptive Quiz data model (PRD §24-27)
-- ============================================================

create table if not exists public.quiz_attempts (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid not null references public.projects(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'in_progress' check (status in ('in_progress', 'completed', 'abandoned')),
  started_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists idx_quiz_attempts_project on public.quiz_attempts(project_id);

create table if not exists public.quiz_questions (
  id uuid primary key default uuid_generate_v4(),
  quiz_attempt_id uuid not null references public.quiz_attempts(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  concept_id uuid not null references public.concepts(id) on delete cascade,
  question_type text not null check (question_type in ('multiple_choice', 'open_ended')),
  difficulty text not null check (difficulty in ('easy', 'medium', 'hard')),
  prompt text not null,
  -- Multiple-choice only: [{id, text}]. Null for open_ended.
  options jsonb,
  -- Multiple-choice only: the correct option's id. Null for open_ended
  -- (graded by AI instead — see open_ended_feedback).
  correct_option_id text,
  -- Populated once answered.
  user_answer text,
  is_correct boolean,
  -- AI-generated explanation/feedback shown after answering (PRD §27-28).
  -- For open_ended questions this includes the full grading feedback.
  feedback text,
  score_percent int check (score_percent between 0 and 100), -- used for mastery weighting; 100/0 for MC, graded value for open-ended
  order_index int not null, -- position within the quiz attempt
  created_at timestamptz not null default now(),
  answered_at timestamptz
);

create index if not exists idx_quiz_questions_attempt on public.quiz_questions(quiz_attempt_id, order_index);
create index if not exists idx_quiz_questions_concept on public.quiz_questions(concept_id);

alter table public.quiz_attempts enable row level security;
alter table public.quiz_questions enable row level security;

create policy "Users can view their own quiz attempts"
  on public.quiz_attempts for select
  using (auth.uid() = owner_id or public.is_admin());

create policy "Users can create their own quiz attempts"
  on public.quiz_attempts for insert
  with check (auth.uid() = owner_id);

create policy "Users can update their own quiz attempts"
  on public.quiz_attempts for update
  using (auth.uid() = owner_id);

create policy "Users can view their own quiz questions"
  on public.quiz_questions for select
  using (auth.uid() = owner_id or public.is_admin());

create policy "Users can create their own quiz questions"
  on public.quiz_questions for insert
  with check (auth.uid() = owner_id);

create policy "Users can update their own quiz questions"
  on public.quiz_questions for update
  using (auth.uid() = owner_id);
