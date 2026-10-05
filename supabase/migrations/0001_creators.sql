-- One row per Shopify customer who has opened the HEX Crew portal.
-- Only the server (secret key) touches this table; RLS is on with no
-- policies, so the public/publishable key can't read or write it.
create table if not exists public.creators (
  shop text not null,
  shopify_customer_id bigint not null,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  visit_count integer not null default 1,
  primary key (shop, shopify_customer_id)
);

alter table public.creators enable row level security;

-- New tables aren't auto-exposed to the API roles, so grant the server
-- role (secret key) what it needs. anon/authenticated get nothing.
grant select, insert, update on public.creators to service_role;

-- Insert on first visit, otherwise bump last_seen_at and visit_count.
create or replace function public.record_creator_visit(p_shop text, p_customer_id bigint)
returns public.creators
language sql
security invoker
set search_path = ''
as $$
  insert into public.creators as c (shop, shopify_customer_id)
  values (p_shop, p_customer_id)
  on conflict (shop, shopify_customer_id) do update
    set last_seen_at = now(), visit_count = c.visit_count + 1
  returning *;
$$;

revoke execute on function public.record_creator_visit(text, bigint) from public, anon, authenticated;
grant execute on function public.record_creator_visit(text, bigint) to service_role;
