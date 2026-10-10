-- Katef — database schema for live mode (Supabase / Postgres).
-- Run once in the Supabase SQL editor of a new project. Safe to re-run.
--
-- Privacy model, enforced here (not only in the UI):
--   • requests            public summary: anyone can read (except closed ones)
--   • request_private     name/phone/email/notes: only the owner and the
--                         verified organization that took the request
--   • messages            only the owner and the handling organization
--   • organizations       anyone can read; only an admin can set verified
--   • taking / releasing / status changes go through SECURITY DEFINER
--     functions that check who is calling, and log every step.

create extension if not exists pgcrypto;

-- ───────────── tables ─────────────

create table if not exists public.profiles (
  id uuid primary key references auth.users on delete cascade,
  role text not null default 'person' check (role in ('person', 'org', 'admin')),
  display_name text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.organizations (
  id uuid primary key references public.profiles on delete cascade,
  name text not null check (char_length(name) between 2 and 80),
  description text not null default '' check (char_length(description) <= 800),
  categories text[] not null default '{}',
  regions text[] not null default '{all}',
  audiences text[] not null default '{}',
  phone text not null default '',
  website text not null default '',
  email text not null default '',
  reg_number text not null default '' check (reg_number ~ '^(5\d{8})?$'),
  verified boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.requests (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references public.profiles on delete cascade,
  title text not null check (char_length(title) between 3 and 80),
  description text not null check (char_length(description) between 3 and 1500),
  categories text[] not null check (cardinality(categories) between 1 and 18),
  audience text not null,
  region text not null,
  city text not null default '',
  lat double precision,
  lng double precision,
  urgency text not null default 'normal' check (urgency in ('low', 'normal', 'high', 'critical')),
  status text not null default 'open' check (status in ('open', 'in_progress', 'resolved', 'closed')),
  display_name text not null default 'אנונימי' check (char_length(display_name) <= 40),
  on_behalf boolean not null default false,
  assigned_org uuid references public.organizations on delete set null,
  assigned_org_name text,
  demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists requests_status_idx on public.requests (status, region);
create index if not exists requests_owner_idx on public.requests (owner_id);
create index if not exists requests_org_idx on public.requests (assigned_org);

create table if not exists public.request_private (
  request_id uuid primary key references public.requests on delete cascade,
  full_name text not null default '',
  phone text not null default '',
  email text not null default '',
  pref text not null default 'phone',
  notes text not null default '' check (char_length(notes) <= 1500)
);

create table if not exists public.request_events (
  id bigint generated always as identity primary key,
  request_id uuid not null references public.requests on delete cascade,
  actor_id uuid default auth.uid(),
  actor_name text not null default '',
  kind text not null,
  note text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists request_events_req_idx on public.request_events (request_id);

create table if not exists public.messages (
  id bigint generated always as identity primary key,
  request_id uuid not null references public.requests on delete cascade,
  sender_id uuid not null default auth.uid() references public.profiles on delete cascade,
  sender_name text not null default '',
  sender_role text not null default 'person',
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index if not exists messages_req_idx on public.messages (request_id);

create table if not exists public.offers (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default auth.uid() references public.organizations on delete cascade,
  org_name text not null default '',
  title text not null check (char_length(title) between 3 and 80),
  description text not null default '' check (char_length(description) <= 800),
  categories text[] not null default '{}',
  regions text[] not null default '{all}',
  audiences text[] not null default '{}',
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.reports (
  id bigint generated always as identity primary key,
  target_type text not null,
  target_id text not null,
  reason text not null check (char_length(reason) between 1 and 1000),
  reporter_id uuid default auth.uid(),
  created_at timestamptz not null default now()
);

-- ───────────── helpers ─────────────

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'admin');
$$;

-- True in the SQL editor or with the service-role key (the project owner), never for app users or visitors.
create or replace function public.is_backend() returns boolean
language sql stable as $$ select coalesce(auth.role(), '') not in ('anon', 'authenticated'); $$;

create or replace function public.is_verified_org() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from organizations where id = auth.uid() and verified);
$$;

-- New auth user → profile. Nobody can sign themselves up as admin.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, role, display_name)
  values (
    new.id,
    case when new.raw_user_meta_data->>'role' = 'org' then 'org' else 'person' end,
    left(coalesce(new.raw_user_meta_data->>'display_name', ''), 40)
  )
  on conflict (id) do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Only admins may change role or verified flags.
create or replace function public.guard_profile() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.role is distinct from old.role and not (is_admin() or is_backend()) then new.role := old.role; end if;
  return new;
end $$;
drop trigger if exists guard_profile on public.profiles;
create trigger guard_profile before update on public.profiles for each row execute function public.guard_profile();

create or replace function public.guard_org() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if not (is_admin() or is_backend()) then new.verified := false; end if;
    if (select role from profiles where id = new.id) <> 'org' then raise exception 'not an organization account'; end if;
  elsif new.verified is distinct from old.verified and not (is_admin() or is_backend()) then
    new.verified := old.verified;
  end if;
  return new;
end $$;
drop trigger if exists guard_org on public.organizations;
create trigger guard_org before insert or update on public.organizations for each row execute function public.guard_org();

-- Owners edit content only; status and assignment change through the functions below.
create or replace function public.guard_request() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if is_backend() then return new; end if;
  if tg_op = 'INSERT' then
    new.owner_id := auth.uid();
    new.status := 'open'; new.assigned_org := null; new.assigned_org_name := null; new.demo := false;
    new.created_at := now(); new.updated_at := now();
  elsif current_setting('katef.internal', true) is distinct from '1' then
    new.status := old.status; new.assigned_org := old.assigned_org; new.assigned_org_name := old.assigned_org_name;
    new.owner_id := old.owner_id; new.created_at := old.created_at; new.demo := old.demo;
    new.updated_at := now();
  end if;
  return new;
end $$;
drop trigger if exists guard_request on public.requests;
create trigger guard_request before insert or update on public.requests for each row execute function public.guard_request();

create or replace function public.log_request_created() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into request_events (request_id, actor_name, kind) values (new.id, new.display_name, 'created');
  return new;
end $$;
drop trigger if exists log_request_created on public.requests;
create trigger log_request_created after insert on public.requests for each row execute function public.log_request_created();

-- ───────────── actions ─────────────

-- A verified organization takes an open request (or one nobody updated for 7 days).
create or replace function public.take_request(req_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare r requests; o organizations; was_stale boolean;
begin
  select * into o from organizations where id = auth.uid();
  if o.id is null or not o.verified then raise exception 'רק עמותה מאומתת יכולה לקחת בקשות'; end if;
  select * into r from requests where id = req_id for update;
  if r.id is null then raise exception 'הבקשה לא נמצאה'; end if;
  if r.status not in ('open', 'in_progress') then raise exception 'הבקשה כבר אינה פתוחה'; end if;
  was_stale := r.assigned_org is not null and r.updated_at < now() - interval '7 days';
  if r.assigned_org is not null and r.assigned_org <> o.id and not was_stale then
    raise exception 'עמותה אחרת כבר מטפלת בבקשה';
  end if;
  perform set_config('katef.internal', '1', true);
  update requests set assigned_org = o.id, assigned_org_name = o.name, status = 'in_progress', updated_at = now() where id = req_id;
  insert into request_events (request_id, actor_name, kind, note)
  values (req_id, o.name, 'taken', case when was_stale then 'הבקשה הועברה אחרי שלא עודכנה זמן רב' else '' end);
end $$;

-- The handling organization gives the request back (kind 'released' or 'referred').
create or replace function public.release_request(req_id uuid, note text, kind text) returns void
language plpgsql security definer set search_path = public as $$
declare r requests;
begin
  select * into r from requests where id = req_id for update;
  if r.assigned_org is distinct from auth.uid() then raise exception 'אין הרשאה'; end if;
  perform set_config('katef.internal', '1', true);
  update requests set assigned_org = null, assigned_org_name = null, status = 'open', updated_at = now() where id = req_id;
  insert into request_events (request_id, actor_name, kind, note)
  values (req_id, coalesce(r.assigned_org_name, ''), case when kind = 'referred' then 'referred' else 'released' end, left(coalesce(note, ''), 1000));
end $$;

create or replace function public.set_request_status(req_id uuid, new_status text, note text) returns void
language plpgsql security definer set search_path = public as $$
declare r requests; who text;
begin
  if new_status not in ('open', 'in_progress', 'resolved', 'closed') then raise exception 'bad status'; end if;
  select * into r from requests where id = req_id for update;
  if r.id is null then raise exception 'הבקשה לא נמצאה'; end if;
  if r.owner_id = auth.uid() then who := r.display_name;
  elsif r.assigned_org = auth.uid() then who := r.assigned_org_name;
  elsif is_admin() then who := 'מנהל/ת';
  else raise exception 'אין הרשאה'; end if;
  if new_status = 'in_progress' and r.assigned_org is null then raise exception 'אין עמותה מטפלת'; end if;
  perform set_config('katef.internal', '1', true);
  update requests set status = new_status, updated_at = now(),
    assigned_org = case when new_status = 'open' and r.owner_id = auth.uid() then null else assigned_org end,
    assigned_org_name = case when new_status = 'open' and r.owner_id = auth.uid() then null else assigned_org_name end
  where id = req_id;
  insert into request_events (request_id, actor_name, kind, note) values (req_id, who, 'status:' || new_status, left(coalesce(note, ''), 1000));
end $$;

create or replace function public.touch_request(req_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare r requests;
begin
  select * into r from requests where id = req_id;
  if r.owner_id is distinct from auth.uid() and r.assigned_org is distinct from auth.uid() then raise exception 'אין הרשאה'; end if;
  perform set_config('katef.internal', '1', true);
  update requests set updated_at = now() where id = req_id;
  insert into request_events (request_id, actor_name, kind)
  values (req_id, case when r.owner_id = auth.uid() then r.display_name else r.assigned_org_name end, 'still_relevant');
end $$;

-- Contact details: owner, or the organization handling the request. Every org view is logged.
create or replace function public.get_request_private(req_id uuid) returns setof request_private
language plpgsql security definer set search_path = public as $$
declare r requests;
begin
  select * into r from requests where id = req_id;
  if r.id is null then return; end if;
  if r.owner_id = auth.uid() then
    return query select * from request_private where request_id = req_id;
  elsif r.assigned_org = auth.uid() and r.status in ('in_progress', 'resolved') then
    -- log each organization's access, at most once an hour
    if not exists (select 1 from request_events where request_id = req_id and kind = 'contact_viewed'
                   and actor_id = auth.uid() and created_at > now() - interval '1 hour') then
      insert into request_events (request_id, actor_id, actor_name, kind) values (req_id, auth.uid(), r.assigned_org_name, 'contact_viewed');
    end if;
    return query select * from request_private where request_id = req_id;
  end if;
end $$;

create or replace function public.send_message(req_id uuid, body text) returns void
language plpgsql security definer set search_path = public as $$
declare r requests; is_org boolean;
begin
  select * into r from requests where id = req_id;
  if r.id is null or r.status not in ('open', 'in_progress') then raise exception 'אי אפשר לשלוח הודעה לבקשה הזו'; end if;
  is_org := r.assigned_org = auth.uid();
  if r.owner_id is distinct from auth.uid() and not is_org then raise exception 'אין הרשאה'; end if;
  insert into messages (request_id, sender_id, sender_name, sender_role, body)
  values (req_id, auth.uid(), case when is_org then r.assigned_org_name else r.display_name end,
          case when is_org then 'org' else 'person' end, left(body, 2000));
  perform set_config('katef.internal', '1', true);
  update requests set updated_at = now() where id = req_id;
end $$;

-- Data minimisation: wipe contact details 90 days after a request is resolved or closed.
-- Schedule with pg_cron:  select cron.schedule('katef-purge', '0 3 * * *', 'select public.purge_old_private()');
create or replace function public.purge_old_private() returns void
language sql security definer set search_path = public as $$
  delete from request_private p using requests r
  where p.request_id = r.id and r.status in ('resolved', 'closed') and r.updated_at < now() - interval '90 days';
$$;

-- ───────────── row-level security ─────────────

alter table public.profiles enable row level security;
alter table public.organizations enable row level security;
alter table public.requests enable row level security;
alter table public.request_private enable row level security;
alter table public.request_events enable row level security;
alter table public.messages enable row level security;
alter table public.offers enable row level security;
alter table public.reports enable row level security;

drop policy if exists "profiles: self read" on public.profiles;
create policy "profiles: self read" on public.profiles for select using (id = auth.uid() or is_admin());
drop policy if exists "profiles: self update" on public.profiles;
create policy "profiles: self update" on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists "orgs: public read" on public.organizations;
create policy "orgs: public read" on public.organizations for select using (true);
drop policy if exists "orgs: self insert" on public.organizations;
create policy "orgs: self insert" on public.organizations for insert with check (id = auth.uid());
drop policy if exists "orgs: self or admin update" on public.organizations;
create policy "orgs: self or admin update" on public.organizations for update using (id = auth.uid() or is_admin());

drop policy if exists "requests: read" on public.requests;
create policy "requests: read" on public.requests for select
  using (status <> 'closed' or owner_id = auth.uid() or assigned_org = auth.uid() or is_admin());
drop policy if exists "requests: owner insert" on public.requests;
create policy "requests: owner insert" on public.requests for insert
  with check (auth.uid() is not null and (select role from profiles where id = auth.uid()) = 'person');
drop policy if exists "requests: owner update" on public.requests;
create policy "requests: owner update" on public.requests for update using (owner_id = auth.uid());
drop policy if exists "requests: owner delete" on public.requests;
create policy "requests: owner delete" on public.requests for delete using (owner_id = auth.uid() or is_admin());

-- request_private: direct access for the owner only; organizations read it through get_request_private().
drop policy if exists "private: owner all" on public.request_private;
create policy "private: owner all" on public.request_private for all
  using (exists (select 1 from requests r where r.id = request_id and r.owner_id = auth.uid()))
  with check (exists (select 1 from requests r where r.id = request_id and r.owner_id = auth.uid()));

-- Timeline: everyone sees the lifecycle; contact-view entries only the people involved.
drop policy if exists "events: read" on public.request_events;
create policy "events: read" on public.request_events for select using (
  kind <> 'contact_viewed' or is_admin() or exists (
    select 1 from requests r where r.id = request_id and (r.owner_id = auth.uid() or r.assigned_org = auth.uid())));

drop policy if exists "messages: participants read" on public.messages;
create policy "messages: participants read" on public.messages for select using (
  exists (select 1 from requests r where r.id = request_id and (r.owner_id = auth.uid() or r.assigned_org = auth.uid())));

drop policy if exists "offers: read" on public.offers;
create policy "offers: read" on public.offers for select using (true);
drop policy if exists "offers: verified org insert" on public.offers;
create policy "offers: verified org insert" on public.offers for insert with check (org_id = auth.uid() and is_verified_org());
drop policy if exists "offers: own delete" on public.offers;
create policy "offers: own delete" on public.offers for delete using (org_id = auth.uid() or is_admin());

drop policy if exists "reports: anyone insert" on public.reports;
create policy "reports: anyone insert" on public.reports for insert with check (true);
drop policy if exists "reports: admin read" on public.reports;
create policy "reports: admin read" on public.reports for select using (is_admin());

grant execute on function public.take_request(uuid), public.release_request(uuid, text, text),
  public.set_request_status(uuid, text, text), public.touch_request(uuid),
  public.get_request_private(uuid), public.send_message(uuid, text) to authenticated;
revoke execute on function public.purge_old_private() from public, anon, authenticated;

-- ───────────── make yourself admin ─────────────
-- After signing up in the app, run (with your email):
--   update public.profiles set role = 'admin' where id = (select id from auth.users where email = 'you@example.com');
