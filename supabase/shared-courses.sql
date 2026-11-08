-- Courses a teacher shares with students. Paste into Supabase → SQL Editor → Run. Safe to run again.
--
-- The teacher's app publishes a snapshot of the course (name, languages, words)
-- under a short random code. Students fetch it by code through
-- get_shared_course(), so nobody can list or browse other people's courses –
-- you need the code (or the link that contains it).

create table if not exists public.shared_courses (
  code text primary key,
  owner uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null,
  source_lang text not null,
  target_lang text not null,
  words jsonb not null default '[]',
  updated_at timestamptz not null default now()
);

alter table public.shared_courses enable row level security;

drop policy if exists "owner manages shared courses" on public.shared_courses;
create policy "owner manages shared courses" on public.shared_courses
  for all
  to authenticated
  using (owner = auth.uid())
  with check (owner = auth.uid());

grant select, insert, update, delete on public.shared_courses to authenticated;

-- Read one course by its code. Works for signed-in and signed-out students alike.
create or replace function public.get_shared_course(p_code text)
returns table (code text, name text, source_lang text, target_lang text, words jsonb, updated_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select code, name, source_lang, target_lang, words, updated_at
  from public.shared_courses
  where code = upper(trim(p_code));
$$;

grant execute on function public.get_shared_course(text) to anon, authenticated;
