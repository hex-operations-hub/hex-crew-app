-- Pitches submitted from the portal's Pitches & Collabs tab. The app saves
-- the pitch here first, then mirrors it to ClickUp for triage.
create table if not exists public.pitches (
  id uuid primary key default gen_random_uuid(),
  shop text not null,
  shopify_customer_id bigint not null,
  creator_name text,
  creator_email text,
  category text not null,
  suggested_value text,
  title text not null,
  body text not null,
  status text not null default 'new',
  clickup_task_id text,
  clickup_error text,
  created_at timestamptz not null default now()
);

create index if not exists pitches_created_at_idx on public.pitches (created_at desc);
create index if not exists pitches_creator_idx on public.pitches (shop, shopify_customer_id);

alter table public.pitches enable row level security;

grant select, insert, update on public.pitches to service_role;
