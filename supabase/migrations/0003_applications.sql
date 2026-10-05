-- HEX Crew intake submitted from the portal's Onboarding tab. Saved here
-- first; the app then links it to a Shopify customer (tag + profile
-- metafields). GoAffPro application comes later.
create table if not exists public.applications (
  id uuid primary key default gen_random_uuid(),
  shop text not null,
  -- Shopify customer this intake is linked to (null until linked).
  shopify_customer_id bigint,
  -- signed_in: submitted while logged in; created: new customer created;
  -- existing_unverified: email matches an existing customer but the person
  -- wasn't signed in, so their record was not changed; pending/error: see shopify_error.
  customer_link text not null default 'pending',
  name text not null,
  email text not null,
  tribe text not null,
  training_location text not null,
  quote text,
  quote_source text,
  content_link text not null,
  status text not null default 'new',
  shopify_error text,
  created_at timestamptz not null default now()
);

create index if not exists applications_created_at_idx on public.applications (created_at desc);
create index if not exists applications_email_idx on public.applications (shop, email);

alter table public.applications enable row level security;

grant select, insert, update on public.applications to service_role;
