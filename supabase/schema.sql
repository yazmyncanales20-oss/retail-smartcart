-- Retail SmartCart — schema for an academic demo.
-- Review and run manually in the Supabase SQL Editor only after creating a separate project.
create extension if not exists pgcrypto;

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  description text not null default '',
  category text not null,
  image_url text,
  price_clp integer not null check (price_clp >= 0),
  compare_at_price_clp integer check (compare_at_price_clp is null or compare_at_price_clp >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  color_name text not null,
  color_hex text not null default '#dddddd',
  size_label text not null,
  stock integer not null default 0 check (stock >= 0),
  sku text unique,
  updated_at timestamptz not null default now(),
  unique(product_id, color_name, size_label)
);

create table if not exists public.customer_profiles (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  display_name text not null default 'Cliente demo',
  marketing_consent boolean not null default false,
  cart_reminder_consent boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.carts (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references public.customer_profiles(id) on delete set null,
  status text not null default 'active' check (status in ('active','abandoned','converted','expired')),
  subtotal_clp integer not null default 0 check (subtotal_clp >= 0),
  shipping_clp integer not null default 0 check (shipping_clp >= 0),
  last_activity_at timestamptz not null default now(),
  reminder_sent_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.cart_items (
  id uuid primary key default gen_random_uuid(),
  cart_id uuid not null references public.carts(id) on delete cascade,
  variant_id uuid not null references public.product_variants(id),
  quantity integer not null check (quantity > 0),
  unit_price_clp integer not null check (unit_price_clp >= 0),
  unique(cart_id, variant_id)
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number text unique not null,
  customer_id uuid references public.customer_profiles(id) on delete set null,
  customer_email text not null,
  status text not null default 'pending' check (status in ('pending','preparing','ready','shipped','delivered','cancelled')),
  delivery_method text not null check (delivery_method in ('home_delivery','store_pickup')),
  subtotal_clp integer not null check (subtotal_clp >= 0),
  shipping_clp integer not null default 0 check (shipping_clp >= 0),
  total_clp integer not null check (total_clp >= 0),
  payment_mode text not null default 'simulated' check (payment_mode = 'simulated'),
  created_at timestamptz not null default now()
);

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  variant_id uuid references public.product_variants(id) on delete set null,
  product_name_snapshot text not null,
  color_name_snapshot text not null,
  size_snapshot text not null,
  quantity integer not null check (quantity > 0),
  unit_price_clp integer not null check (unit_price_clp >= 0)
);

create table if not exists public.store_metrics_snapshots (
  id uuid primary key default gen_random_uuid(),
  metric_key text not null,
  metric_value numeric not null default 0,
  is_illustrative boolean not null default true,
  captured_at timestamptz not null default now()
);

create index if not exists product_variants_product_id_idx on public.product_variants(product_id);
create index if not exists carts_status_activity_idx on public.carts(status, last_activity_at desc);
create index if not exists orders_created_at_idx on public.orders(created_at desc);
create index if not exists orders_status_idx on public.orders(status);

-- Security note:
-- Do not enable anonymous write access to inventory or orders.
-- Configure Supabase Auth and Row Level Security policies for each role before connecting
-- a public frontend. This schema intentionally does not create permissive RLS policies.
