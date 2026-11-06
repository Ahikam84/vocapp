-- VocApp cloud sync schema. Paste into Supabase → SQL Editor → Run. Safe to run again.
--
-- Every synced record (deck, word, progress, review) is stored as one row with
-- its JSON data. Each device pushes rows changed since its last push and pulls
-- rows whose "seq" is above the last one it saw. Conflicts: last write wins,
-- by the time the record was changed on the device (client_updated_at).

create table if not exists public.records (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  tbl text not null check (tbl in ('decks', 'words', 'progress', 'reviews')),
  id text not null,
  data jsonb,
  deleted boolean not null default false,
  client_updated_at bigint not null,
  seq bigint not null default 0,
  primary key (user_id, tbl, id)
);

create sequence if not exists public.records_seq;
create index if not exists records_user_seq on public.records (user_id, seq);

-- Give every insert/update a fresh, increasing seq so devices can pull "everything after N".
-- An update carrying an older device timestamp than what is stored is ignored.
create or replace function public.records_before_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and new.client_updated_at < old.client_updated_at then
    return old;
  end if;
  new.seq := nextval('public.records_seq');
  return new;
end;
$$;

drop trigger if exists records_before_write on public.records;
create trigger records_before_write
  before insert or update on public.records
  for each row execute function public.records_before_write();

-- Each user can only see and change their own rows.
alter table public.records enable row level security;

drop policy if exists "own records" on public.records;
create policy "own records" on public.records
  for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

grant select, insert, update, delete on public.records to authenticated;
