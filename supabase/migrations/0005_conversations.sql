-- ============================================================
-- 0005_conversations.sql
-- Tutor conversation storage (PRD §16-21)
-- ============================================================

create table if not exists public.conversations (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid not null references public.projects(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  title text, -- optional, can be auto-derived from the first message later
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_conversations_project on public.conversations(project_id);
create index if not exists idx_conversations_owner on public.conversations(owner_id);

drop trigger if exists touch_conversations on public.conversations;
create trigger touch_conversations before update on public.conversations
  for each row execute function public.touch_updated_at();

create table if not exists public.messages (
  id uuid primary key default uuid_generate_v4(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade, -- denormalized for RLS
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  -- Citations for assistant messages: array of {fileName, pageNumber, materialId}
  -- (PRD §19 — "Source: Document Name — Page 14"). Null for user messages,
  -- and for assistant messages that hit the unsupported-question fallback.
  citations jsonb,
  -- True when the Tutor declined to answer due to insufficient evidence
  -- (PRD §20). Lets the UI/analytics distinguish this from a normal answer
  -- without parsing message text.
  is_unsupported boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_messages_conversation on public.messages(conversation_id);
create index if not exists idx_messages_owner on public.messages(owner_id);

alter table public.conversations enable row level security;
alter table public.messages enable row level security;

create policy "Users can view their own conversations"
  on public.conversations for select
  using (auth.uid() = owner_id or public.is_admin());

create policy "Users can create their own conversations"
  on public.conversations for insert
  with check (auth.uid() = owner_id);

create policy "Users can update their own conversations"
  on public.conversations for update
  using (auth.uid() = owner_id);

create policy "Users can delete their own conversations"
  on public.conversations for delete
  using (auth.uid() = owner_id);

create policy "Users can view their own messages"
  on public.messages for select
  using (auth.uid() = owner_id or public.is_admin());

create policy "Users can create their own messages"
  on public.messages for insert
  with check (auth.uid() = owner_id);
