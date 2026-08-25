-- =====================================================================
--  יומן הפקה — סכימת סנכרון צוות ל-Supabase
--  WorkApp — team sync schema for Supabase
--
--  הריצו את הקובץ הזה פעם אחת ב-SQL Editor של פרויקט Supabase שלכם.
--  Run this once in your project's SQL Editor.
-- =====================================================================

-- Each record is stored whole in a jsonb `data` column. The app's model can
-- grow new fields without a migration here, and the client already treats the
-- record as the unit of conflict resolution.

create table if not exists public.people (
  id          text primary key,
  project_id  text        not null default 'default',
  updated_at  bigint      not null,          -- epoch ms, from the client
  data        jsonb       not null,
  synced_at   timestamptz not null default now()
);

create table if not exists public.locations (
  id          text primary key,
  project_id  text        not null default 'default',
  updated_at  bigint      not null,
  data        jsonb       not null,
  synced_at   timestamptz not null default now()
);

create table if not exists public.days (
  id          text primary key,
  project_id  text        not null default 'default',
  updated_at  bigint      not null,
  data        jsonb       not null,
  synced_at   timestamptz not null default now()
);

create index if not exists people_project_idx    on public.people    (project_id);
create index if not exists locations_project_idx on public.locations (project_id);
create index if not exists days_project_idx      on public.days      (project_id);
create index if not exists days_updated_idx      on public.days      (project_id, updated_at desc);

-- ---------------------------------------------------------------------
--  Row Level Security
--
--  The policies below let anyone holding the project's anon key read and
--  write. That is deliberate for a small closed crew who share one key
--  privately, and it is the trade-off that keeps setup to one paste with no
--  accounts to manage.
--
--  It also means: anyone who obtains the key can read the whole production —
--  names, phone numbers and locations. Do not post the key publicly, and see
--  "Locking it down" at the bottom before using this for anything sensitive.
-- ---------------------------------------------------------------------

alter table public.people    enable row level security;
alter table public.locations enable row level security;
alter table public.days      enable row level security;

do $$
declare t text;
begin
  foreach t in array array['people','locations','days'] loop
    execute format('drop policy if exists %I on public.%I', t || '_anon_all', t);
    execute format(
      'create policy %I on public.%I for all to anon using (true) with check (true)',
      t || '_anon_all', t);
  end loop;
end $$;

-- Keep synced_at honest regardless of what the client sends.
create or replace function public.touch_synced_at()
returns trigger language plpgsql as $$
begin
  new.synced_at := now();
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['people','locations','days'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_touch', t);
    execute format(
      'create trigger %I before insert or update on public.%I
       for each row execute function public.touch_synced_at()',
      t || '_touch', t);
  end loop;
end $$;

-- =====================================================================
--  Locking it down (optional, recommended beyond a small trusted crew)
--
--  1. Turn on Supabase Auth (email magic links are enough).
--  2. Replace the policies above with authenticated-only versions:
--
--       drop policy people_anon_all on public.people;
--       create policy people_auth_all on public.people
--         for all to authenticated using (true) with check (true);
--
--     …and the same for locations and days.
--
--  3. The app would then need to sign in and send the user's access token
--     instead of the anon key. That is a change in web/js/sync.js —
--     swap the Authorization header for the session token.
-- =====================================================================
