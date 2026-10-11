-- App-owned data. Replace the project entity when building a new product;
-- preserve the ownership policies and server-side validation pattern.
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 80),
  description text not null default '' check (char_length(description) <= 400),
  created_at timestamptz not null default now()
);
create index projects_user_id_idx on public.projects(user_id, created_at desc);
alter table public.projects enable row level security;
revoke all on public.projects from anon, authenticated;
grant select, insert, delete on public.projects to authenticated;
grant all on public.projects to service_role;
create policy projects_read on public.projects for select to authenticated
  using (user_id = (select auth.uid()));
create policy projects_create on public.projects for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy projects_delete on public.projects for delete to authenticated
  using (user_id = (select auth.uid()));

-- Only our server creates this mapping. Never associate accounts by webhook
-- metadata, an email match, or a browser-supplied customer ID.
create table public.billing_customers (
  user_id uuid primary key references auth.users(id) on delete cascade,
  customer_id text not null unique,
  created_at timestamptz not null default now(),
  unique (user_id, customer_id)
);
create table public.billing_subscriptions (
  subscription_id text primary key,
  user_id uuid not null,
  customer_id text not null,
  product_id text not null,
  status text not null check (status in
    ('pending', 'active', 'past_due', 'on_hold', 'paused', 'failed', 'cancelled', 'expired')),
  next_billing_date timestamptz,
  expires_at timestamptz,
  past_due_ends_at timestamptz,
  cancel_at_next_billing_date boolean not null default false,
  last_event_at timestamptz not null,
  foreign key (user_id, customer_id) references public.billing_customers(user_id, customer_id) on delete cascade
);
create index billing_subscriptions_user_idx on public.billing_subscriptions(user_id);
create table public.billing_events (
  event_id text primary key,
  event_type text not null,
  occurred_at timestamptz not null,
  processed_at timestamptz not null default now(),
  outcome text not null check (outcome in ('applied', 'stale'))
);

alter table public.billing_customers enable row level security;
alter table public.billing_subscriptions enable row level security;
alter table public.billing_events enable row level security;
revoke all on public.billing_customers, public.billing_subscriptions, public.billing_events from anon, authenticated;
grant select on public.billing_customers, public.billing_subscriptions to authenticated;
grant all on public.billing_customers, public.billing_subscriptions, public.billing_events to service_role;
create policy customers_read on public.billing_customers for select to authenticated
  using (user_id = (select auth.uid()));
create policy subscriptions_read on public.billing_subscriptions for select to authenticated
  using (user_id = (select auth.uid()));

-- Event receipt and state transition commit together. Failure rolls both back.
-- A per-customer transaction lock serializes concurrent deliveries. A durable
-- event primary key protects replay after restarts. Older events cannot restore
-- revoked access; at equal timestamps a restrictive state wins conservatively.
create function public.apply_dodo_subscription_event(
  p_event_id text, p_event_type text, p_event_at timestamptz,
  p_customer_id text, p_subscription_id text, p_product_id text,
  p_status text, p_next_billing_date timestamptz, p_expires_at timestamptz,
  p_past_due_ends_at timestamptz, p_cancel_at_next_billing_date boolean
) returns text language plpgsql security definer set search_path = '' as $$
declare
  v_user_id uuid;
  v_existing public.billing_subscriptions;
begin
  if p_event_id is null or p_event_id = '' or p_event_at is null then
    raise exception 'Invalid event envelope';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_customer_id, 0));
  if exists (select 1 from public.billing_events where event_id = p_event_id) then
    return 'duplicate';
  end if;
  select user_id into v_user_id from public.billing_customers where customer_id = p_customer_id;
  if v_user_id is null then
    raise exception 'Customer mapping not available';
  end if;
  select * into v_existing from public.billing_subscriptions where subscription_id = p_subscription_id;
  if v_existing.subscription_id is not null and v_existing.user_id <> v_user_id then
    raise exception 'Subscription ownership mismatch';
  end if;
  if v_existing.subscription_id is not null and (
    v_existing.last_event_at > p_event_at or
    (v_existing.last_event_at = p_event_at and
      (v_existing.status not in ('active', 'past_due') or p_status in ('active', 'past_due')))
  ) then
    insert into public.billing_events(event_id, event_type, occurred_at, outcome)
      values (p_event_id, p_event_type, p_event_at, 'stale');
    return 'stale';
  end if;
  insert into public.billing_subscriptions (
    subscription_id, user_id, customer_id, product_id, status,
    next_billing_date, expires_at, past_due_ends_at,
    cancel_at_next_billing_date, last_event_at
  ) values (
    p_subscription_id, v_user_id, p_customer_id, p_product_id, p_status,
    p_next_billing_date, p_expires_at, p_past_due_ends_at,
    p_cancel_at_next_billing_date, p_event_at
  ) on conflict (subscription_id) do update set
    product_id = excluded.product_id,
    status = excluded.status,
    next_billing_date = excluded.next_billing_date,
    expires_at = excluded.expires_at,
    past_due_ends_at = excluded.past_due_ends_at,
    cancel_at_next_billing_date = excluded.cancel_at_next_billing_date,
    last_event_at = excluded.last_event_at;
  insert into public.billing_events(event_id, event_type, occurred_at, outcome)
    values (p_event_id, p_event_type, p_event_at, 'applied');
  -- This checkout has completed; do not reuse its URL for another purchase.
  if p_status <> 'pending' then
    update public.billing_checkout_sessions set checkout_url = null, expires_at = now()
      where user_id = v_user_id;
  end if;
  return 'applied';
end;
$$;
revoke all on function public.apply_dodo_subscription_event(text,text,timestamptz,text,text,text,text,timestamptz,timestamptz,timestamptz,boolean) from public, anon, authenticated;
grant execute on function public.apply_dodo_subscription_event(text,text,timestamptz,text,text,text,text,timestamptz,timestamptz,timestamptz,boolean) to service_role;

-- Server-only fixed-window limiter, shared by replicas rather than in memory.
create table public.request_limits (
  key text primary key,
  window_start timestamptz not null,
  requests integer not null
);
alter table public.request_limits enable row level security;
revoke all on public.request_limits from anon, authenticated;
grant all on public.request_limits to service_role;
create function public.take_request_slot(p_key text, p_limit integer, p_seconds integer)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_count integer;
begin
  if p_limit < 1 or p_seconds < 1 then raise exception 'Invalid limit'; end if;
  insert into public.request_limits(key, window_start, requests) values (p_key, now(), 1)
  on conflict (key) do update set
    requests = case when public.request_limits.window_start <= now() - make_interval(secs => p_seconds)
      then 1 else public.request_limits.requests + 1 end,
    window_start = case when public.request_limits.window_start <= now() - make_interval(secs => p_seconds)
      then now() else public.request_limits.window_start end
  returning requests into v_count;
  return v_count <= p_limit;
end;
$$;
revoke all on function public.take_request_slot(text,integer,integer) from public, anon, authenticated;
grant execute on function public.take_request_slot(text,integer,integer) to service_role;

create table public.billing_checkout_sessions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  checkout_url text,
  session_id text,
  expires_at timestamptz,
  lock_until timestamptz not null default now()
);
alter table public.billing_checkout_sessions enable row level security;
revoke all on public.billing_checkout_sessions from anon, authenticated;
grant all on public.billing_checkout_sessions to service_role;
create function public.claim_checkout(p_user_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_row public.billing_checkout_sessions;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 1));
  if exists (select 1 from public.billing_subscriptions where user_id = p_user_id
    and status in ('active','past_due','pending','paused','on_hold')) then
    return jsonb_build_object('result', 'subscribed');
  end if;
  select * into v_row from public.billing_checkout_sessions where user_id = p_user_id;
  if v_row.checkout_url is not null and v_row.expires_at > now() then
    return jsonb_build_object('result', 'existing', 'url', v_row.checkout_url);
  end if;
  if v_row.lock_until > now() then return jsonb_build_object('result', 'busy'); end if;
  insert into public.billing_checkout_sessions(user_id, lock_until) values(p_user_id, now() + interval '5 minutes')
    on conflict (user_id) do update set lock_until = excluded.lock_until, checkout_url = null, session_id = null, expires_at = null;
  return jsonb_build_object('result', 'claimed');
end;
$$;
revoke all on function public.claim_checkout(uuid) from public, anon, authenticated;
grant execute on function public.claim_checkout(uuid) to service_role;

-- Account deletion must not leave an external recurring charge running or an
-- outstanding checkout that can create a subscription after ownership is gone.
create function public.guard_account_billing_deletion() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.billing_subscriptions where user_id = old.id
    and status in ('pending','active','past_due','on_hold','paused')) or exists (
    select 1 from public.billing_checkout_sessions where user_id = old.id
    and ((checkout_url is not null and expires_at > now()) or lock_until > now())
  ) then
    raise exception 'Cancel existing billing and finish or expire outstanding checkout before deleting your account.';
  end if;
  return old;
end;
$$;
revoke all on function public.guard_account_billing_deletion() from public, anon, authenticated;
create trigger guard_account_billing_deletion before delete on auth.users
  for each row execute function public.guard_account_billing_deletion();
