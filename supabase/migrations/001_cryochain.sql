-- CryoChain managed backend (Supabase / Postgres).
-- Escrow rows store an external reference and a funding instruction.
-- There is intentionally no wallet or escrow balance column.

create extension if not exists pgcrypto;

create type public.app_role as enum ('farmer', 'offtaker', 'field_agent', 'driver', 'ops');
create type public.order_state as enum (
  'LISTED', 'AGGREGATING', 'LOT_CREATED', 'COMMITTED', 'ESCROW_PENDING', 'ESCROW_FUNDED',
  'COLLECTION_SCHEDULED', 'FIELD_CONFIRMED', 'COLLECTED', 'IN_TRANSIT', 'DELIVERED',
  'ACCEPTED', 'ESCROW_RELEASE_REQUESTED', 'ESCROW_RELEASED', 'SETTLEMENT_PROCESSING',
  'SETTLED', 'EXCEPTION', 'CANCELLED'
);
create type public.escrow_status as enum ('PENDING', 'FUNDED', 'RELEASE_REQUESTED', 'RELEASED', 'FAILED', 'CANCELLED');

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role public.app_role not null,
  full_name text not null,
  phone text unique,
  email text unique,
  location text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.farmer_profiles (
  id text primary key,
  user_id uuid not null unique references public.profiles (id),
  village text not null,
  community text not null,
  phone_verified boolean not null default false
);

create table public.produce (
  id text primary key,
  name text not null unique
);

create table public.produce_listings (
  id text primary key,
  farmer_id text not null references public.farmer_profiles (id),
  produce_id text not null references public.produce (id),
  quantity numeric not null check (quantity > 0),
  unit text not null,
  status text not null,
  created_at timestamptz not null default now()
);

create table public.lots (
  id text primary key,
  code text not null unique,
  produce_id text not null references public.produce (id),
  price_per_unit numeric not null check (price_per_unit > 0),
  collection_fee_per_stop numeric not null check (collection_fee_per_stop >= 0),
  status text not null,
  order_state public.order_state not null,
  created_by uuid not null references public.profiles (id)
);

create table public.consignments (
  id text primary key,
  lot_id text not null references public.lots (id),
  listing_id text not null unique references public.produce_listings (id),
  farmer_id text not null references public.farmer_profiles (id),
  expected_quantity numeric not null check (expected_quantity > 0),
  agreed_price_per_unit numeric not null check (agreed_price_per_unit > 0),
  accepted_weight numeric check (accepted_weight is null or accepted_weight >= 0)
);

create table public.commitments (
  id text primary key,
  lot_id text not null unique references public.lots (id),
  offtaker_id text not null,
  order_state public.order_state not null,
  accepted_at timestamptz
);

create table public.escrows (
  id text primary key,
  commitment_id text not null unique references public.commitments (id),
  provider text not null,
  bank_label text not null,
  external_reference text not null unique,
  status public.escrow_status not null,
  instructed_amount_ghs numeric not null check (instructed_amount_ghs >= 0),
  external_transaction_ref text,
  release_idempotency_key text unique,
  funded_at timestamptz,
  released_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.settlements (
  id text primary key,
  consignment_id text not null unique references public.consignments (id),
  farmer_id text not null references public.farmer_profiles (id),
  commitment_id text not null references public.commitments (id),
  gross_value numeric not null,
  collection_fee numeric not null check (collection_fee >= 0),
  net_settlement numeric not null,
  status text not null
);

create table public.payments (
  id text primary key,
  settlement_id text not null references public.settlements (id),
  consignment_id text not null references public.consignments (id),
  provider text not null,
  amount_ghs numeric not null check (amount_ghs >= 0),
  status text not null,
  idempotency_key text not null unique,
  external_reference text
);

create table public.audit_logs (
  id text primary key,
  actor_id uuid not null,
  role public.app_role not null,
  action text not null,
  entity text not null,
  entity_id text not null,
  previous_state text,
  new_state text,
  created_at timestamptz not null default now(),
  metadata jsonb
);

alter table public.profiles enable row level security;
alter table public.lots enable row level security;
alter table public.consignments enable row level security;
alter table public.escrows enable row level security;
alter table public.settlements enable row level security;
alter table public.payments enable row level security;
alter table public.produce_listings enable row level security;

create or replace function public.current_app_role()
returns public.app_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid()
$$;

create policy "ops read profiles" on public.profiles
  for select using (public.current_app_role() = 'ops' or id = auth.uid());

create policy "read own listings" on public.produce_listings
  for select using (
    public.current_app_role() = 'ops'
    or farmer_id in (select id from public.farmer_profiles where user_id = auth.uid())
  );

create policy "read visible lots" on public.lots
  for select using (public.current_app_role() in ('ops', 'offtaker', 'field_agent', 'driver'));

create policy "no direct escrow updates" on public.escrows
  for select using (public.current_app_role() in ('ops', 'offtaker'));

-- Collection cannot be scheduled unless the external escrow is funded.
create or replace function public.schedule_collection(p_lot_id text, p_actor uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role public.app_role;
  v_status public.escrow_status;
  v_state public.order_state;
begin
  select role into v_role from public.profiles where id = p_actor;
  if v_role is distinct from 'ops' then
    raise exception 'Only operations can schedule a collection.';
  end if;
  select e.status, c.order_state into v_status, v_state
  from public.commitments c
  join public.escrows e on e.commitment_id = c.id
  where c.lot_id = p_lot_id;
  if v_status is distinct from 'FUNDED' or v_state is distinct from 'ESCROW_FUNDED' then
    raise exception 'Collection cannot begin because escrow funding has not been confirmed.';
  end if;
  update public.lots set order_state = 'COLLECTION_SCHEDULED' where id = p_lot_id;
  update public.commitments set order_state = 'COLLECTION_SCHEDULED' where lot_id = p_lot_id;
end;
$$;

-- Only operations can release, and only after offtaker acceptance. One release key per escrow.
create or replace function public.release_escrow(p_lot_id text, p_actor uuid, p_idempotency_key text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role public.app_role;
  v_state public.order_state;
  v_escrow_id text;
  v_existing text;
begin
  select role into v_role from public.profiles where id = p_actor;
  if v_role is distinct from 'ops' then
    raise exception 'Only the operations team can release escrow.';
  end if;
  select c.order_state, e.id, e.release_idempotency_key
    into v_state, v_escrow_id, v_existing
  from public.commitments c
  join public.escrows e on e.commitment_id = c.id
  where c.lot_id = p_lot_id;
  if v_existing is not null then
    return;
  end if;
  if v_state is distinct from 'ACCEPTED' then
    raise exception 'Escrow can be released only after the offtaker accepts the delivery.';
  end if;
  if exists (
    select 1 from public.consignments
    where lot_id = p_lot_id and accepted_weight is null
  ) then
    raise exception 'Escrow cannot be released until every consignment has a confirmed weight.';
  end if;
  update public.escrows
    set status = 'RELEASED',
        release_idempotency_key = p_idempotency_key,
        released_at = now()
    where id = v_escrow_id;
  update public.lots set order_state = 'ESCROW_RELEASED' where id = p_lot_id;
  update public.commitments set order_state = 'ESCROW_RELEASED' where lot_id = p_lot_id;
end;
$$;

revoke all on function public.schedule_collection(text, uuid) from public;
revoke all on function public.release_escrow(text, uuid, text) from public;
grant execute on function public.schedule_collection(text, uuid) to authenticated;
grant execute on function public.release_escrow(text, uuid, text) to authenticated;
