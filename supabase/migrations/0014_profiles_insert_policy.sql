-- Bug fix: profiles had SELECT and UPDATE policies (0001_core_schema.sql)
-- but no INSERT policy at all. profiles rows are normally created by the
-- `on_auth_user_created` trigger (security definer, so it bypasses RLS) —
-- but that trigger fires asynchronously relative to the signup request
-- completing. A brand-new user who immediately creates their first Space
-- (the fastest possible path through the app) can have their Space insert
-- fail its `owner_id references public.profiles(id)` foreign key if the
-- trigger hasn't committed yet — a real race, confirmed via a user report
-- of "some users" hitting an error specifically on their first-ever Space.
--
-- This policy lets the app defensively upsert its own profile row from the
-- user's own client (see src/lib/supabase/profile.ts's ensureProfile,
-- called at the top of createSpace) as a safety net alongside the trigger,
-- not a replacement for it — the trigger still handles the common case;
-- this just closes the race for the rare case where it hasn't won yet.
create policy "Users can insert their own profile"
  on public.profiles for insert
  with check (auth.uid() = id);
