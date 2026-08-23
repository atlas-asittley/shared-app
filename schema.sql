-- ============================================================
--  Drew & Jill — shared app schema
--  Paste this whole file into the Supabase SQL editor and Run.
--  Safe to re-run.
-- ============================================================

-- ── 1. Who is allowed in ────────────────────────────────────
-- Adding a person later = one INSERT here. Nothing else changes.
create table if not exists public.shared_members (
  email      text primary key,
  label      text,
  created_at timestamptz not null default now()
);

insert into public.shared_members (email, label) values
  ('asittley@gmail.com', 'Drew'),
  ('jilllechien@gmail.com', 'Jill')
on conflict (email) do nothing;

alter table public.shared_members enable row level security;

-- Members can see the roster; nobody can change it from the browser.
drop policy if exists "members can read roster" on public.shared_members;
create policy "members can read roster" on public.shared_members
  for select to authenticated
  using (email = lower(auth.jwt() ->> 'email')
         or exists (select 1 from public.shared_members m
                    where m.email = lower(auth.jwt() ->> 'email')));

-- The gate every other table uses.
create or replace function public.shared_is_member()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.shared_members m
    where m.email = lower(auth.jwt() ->> 'email')
  );
$$;

grant execute on function public.shared_is_member() to authenticated;

-- ── 2. Shopping list ────────────────────────────────────────
create table if not exists public.shared_shopping_items (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (length(btrim(name)) between 1 and 200),
  bought     boolean not null default false,
  bought_at  timestamptz,
  bought_by  text,
  created_at timestamptz not null default now(),
  created_by text not null default lower(auth.jwt() ->> 'email')
);

create index if not exists shared_shopping_items_created_at_idx
  on public.shared_shopping_items (created_at);

alter table public.shared_shopping_items enable row level security;

-- One policy: if you're on the roster, the list is yours. Otherwise you
-- can't see or touch a single row — even with the public anon key.
drop policy if exists "members full access" on public.shared_shopping_items;
create policy "members full access" on public.shared_shopping_items
  for all to authenticated
  using (public.shared_is_member())
  with check (public.shared_is_member());

-- ── 3. Live updates (so both phones refresh themselves) ─────
do $$
begin
  alter publication supabase_realtime add table public.shared_shopping_items;
exception
  when duplicate_object then null;
end $$;

-- ── 4. Feedback / notes to Claude ───────────────────────────
-- Drew or Jill drop a note here; a daily job on Drew's box reads the
-- 'new' ones, acts on them, and writes back a reply the app displays.
create table if not exists public.shared_feedback (
  id         uuid primary key default gen_random_uuid(),
  body       text not null check (length(btrim(body)) between 1 and 2000),
  created_at timestamptz not null default now(),
  created_by text not null default lower(auth.jwt() ->> 'email'),
  status     text not null default 'new' check (status in ('new', 'seen', 'done')),
  reply      text,
  replied_at timestamptz
);

create index if not exists shared_feedback_status_idx
  on public.shared_feedback (status, created_at);

alter table public.shared_feedback enable row level security;

drop policy if exists "members full access" on public.shared_feedback;
create policy "members full access" on public.shared_feedback
  for all to authenticated
  using (public.shared_is_member())
  with check (public.shared_is_member());

do $$
begin
  alter publication supabase_realtime add table public.shared_feedback;
exception
  when duplicate_object then null;
end $$;

-- ── 5. Multiple lists in one table ──────────────────────────
-- Every item belongs to a named list ('shopping', 'camping', …). Adding a
-- new list is a new tool in the UI — no schema change needed.
alter table public.shared_shopping_items
  add column if not exists list text not null default 'shopping';

create index if not exists shared_shopping_items_list_idx
  on public.shared_shopping_items (list, bought, created_at);
