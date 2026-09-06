-- Required extension for UUID defaults
create extension if not exists "pgcrypto";

-- Profiles table for OTP users
create table if not exists public.profiles (
    id uuid primary key references auth.users(id) on delete cascade,
    full_name text,
    email text,
    phone text,
    location text,
    created_at timestamp with time zone default now()
);

alter table public.profiles add column if not exists email text;

alter table public.profiles enable row level security;

drop policy if exists "Profiles are viewable by owner" on public.profiles;
drop policy if exists "Profiles are insertable by owner" on public.profiles;
drop policy if exists "Profiles are updatable by owner" on public.profiles;

create policy "Profiles are viewable by owner"
    on public.profiles
    for select
    using (auth.uid() = id);

create policy "Profiles are insertable by owner"
    on public.profiles
    for insert
    with check (auth.uid() = id);

create policy "Profiles are updatable by owner"
    on public.profiles
    for update
    using (auth.uid() = id);

-- Products table
create table if not exists public.products (
    id uuid primary key default gen_random_uuid(),
    user_id uuid references auth.users(id) on delete set null,
    name text not null,
    price numeric,
    tags text,
    category text,
    size text,
    condition text,
    color text,
    material text,
    location text,
    seller_phone text,
    description text,
    image_url text,
    created_at timestamp with time zone default now()
);

alter table public.products add column if not exists active boolean default true;
alter table public.products enable row level security;

drop policy if exists "Products are viewable by everyone" on public.products;
drop policy if exists "Products are insertable by owner" on public.products;
drop policy if exists "Products are updatable by owner" on public.products;
drop policy if exists "Products are deletable by owner" on public.products;

create policy "Products are viewable by everyone"
    on public.products
    for select
    using (coalesce(active, true) = true);

-- VEYRO POD catalog fields. Existing marketplace columns remain for compatibility.
alter table public.products add column if not exists active boolean default true;
alter table public.products add column if not exists printify_product_id text;
alter table public.products add column if not exists sizes text;
alter table public.products add column if not exists colors text;
alter table public.products add column if not exists badge text;
alter table public.products add column if not exists supplier_type text not null default 'printify' check (supplier_type in ('printify', 'meesho', 'manual'));
alter table public.products add column if not exists supplier_product_id text;
alter table public.products add column if not exists supplier_url text;
alter table public.products add column if not exists supplier_cost numeric check (supplier_cost is null or supplier_cost >= 0);
alter table public.products add column if not exists reseller_margin numeric default 0 check (reseller_margin is null or reseller_margin >= 0);

create table if not exists public.product_variants (
    id uuid primary key default gen_random_uuid(),
    product_id uuid not null references public.products(id) on delete cascade,
    printify_variant_id text,
    size text not null,
    color text not null,
    price numeric not null check (price >= 0),
    image_url text,
    available boolean not null default true,
    created_at timestamp with time zone default now(),
    unique (product_id, size, color)
);

alter table public.product_variants add column if not exists supplier_variant_id text;

alter table public.product_variants enable row level security;
drop policy if exists "Active product variants are viewable" on public.product_variants;
create policy "Active product variants are viewable"
    on public.product_variants for select
    using (available = true and exists (
        select 1 from public.products
        where products.id = product_variants.product_id
          and coalesce(products.active, true) = true
    ));

create table if not exists public.product_images (
    id uuid primary key default gen_random_uuid(),
    product_id uuid not null references public.products(id) on delete cascade,
    image_url text not null,
    cloudflare_image_id text,
    alt_text text,
    sort_order integer not null default 0,
    is_primary boolean not null default false,
    created_at timestamp with time zone default now()
);

alter table public.product_images enable row level security;
drop policy if exists "Product images are viewable for active products" on public.product_images;
create policy "Product images are viewable for active products"
    on public.product_images for select
    using (exists (
        select 1 from public.products
        where products.id = product_images.product_id
          and coalesce(products.active, true) = true
    ));

-- Product Reviews & Ratings
create table if not exists public.reviews (
    id uuid primary key default gen_random_uuid(),
    product_id uuid references public.products(id) on delete cascade,
    user_id uuid references auth.users(id) on delete cascade,
    rating integer not null check (rating >= 1 and rating <= 5),
    text text,
    created_at timestamp with time zone default now()
);

alter table public.reviews enable row level security;

drop policy if exists "Reviews are viewable by everyone" on public.reviews;
drop policy if exists "Reviews are insertable by owner" on public.reviews;

create policy "Reviews are viewable by everyone"
    on public.reviews
    for select
    using (true);

create policy "Reviews are insertable by owner"
    on public.reviews
    for insert
    with check (auth.uid() = user_id);

-- Liked items
create table if not exists public.liked_items (
    id uuid primary key default gen_random_uuid(),
    user_id uuid references auth.users(id) on delete cascade,
    product_id uuid references public.products(id) on delete cascade,
    created_at timestamp with time zone default now(),
    unique (user_id, product_id)
);

alter table public.liked_items enable row level security;

drop policy if exists "Liked items are viewable by owner" on public.liked_items;
drop policy if exists "Liked items are insertable by owner" on public.liked_items;
drop policy if exists "Liked items are deletable by owner" on public.liked_items;

create policy "Liked items are viewable by owner"
    on public.liked_items
    for select
    using (auth.uid() = user_id);

create policy "Liked items are insertable by owner"
    on public.liked_items
    for insert
    with check (auth.uid() = user_id);

create policy "Liked items are deletable by owner"
    on public.liked_items
    for delete
    using (auth.uid() = user_id);

-- Cart items
create table if not exists public.cart_items (
    id uuid primary key default gen_random_uuid(),
    user_id uuid references auth.users(id) on delete cascade,
    product_id uuid references public.products(id) on delete cascade,
    quantity integer default 1,
    created_at timestamp with time zone default now(),
    unique (user_id, product_id)
);

alter table public.cart_items add column if not exists variant_id uuid references public.product_variants(id) on delete set null;
alter table public.cart_items add column if not exists printify_variant_id text;
alter table public.cart_items add column if not exists supplier_type text not null default 'printify' check (supplier_type in ('printify', 'meesho', 'manual'));
alter table public.cart_items add column if not exists supplier_product_id text;
alter table public.cart_items drop constraint if exists cart_items_user_id_product_id_key;
create unique index if not exists cart_items_user_product_variant_key
    on public.cart_items (user_id, product_id, coalesce(variant_id::text, 'base'));

alter table public.cart_items enable row level security;

drop policy if exists "Cart items are viewable by owner" on public.cart_items;
drop policy if exists "Cart items are insertable by owner" on public.cart_items;
drop policy if exists "Cart items are updatable by owner" on public.cart_items;
drop policy if exists "Cart items are deletable by owner" on public.cart_items;

create policy "Cart items are viewable by owner"
    on public.cart_items
    for select
    using (auth.uid() = user_id);

create policy "Cart items are insertable by owner"
    on public.cart_items
    for insert
    with check (auth.uid() = user_id);

create policy "Cart items are updatable by owner"
    on public.cart_items
    for update
    using (auth.uid() = user_id);

create policy "Cart items are deletable by owner"
    on public.cart_items
    for delete
    using (auth.uid() = user_id);

-- Checkout and fulfillment records are created by trusted server-side functions.
create table if not exists public.orders (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    order_number text not null unique,
    payment_status text not null default 'pending',
    fulfillment_status text not null default 'pending',
    printify_order_id text,
    subtotal numeric not null default 0 check (subtotal >= 0),
    shipping_amount numeric not null default 0 check (shipping_amount >= 0),
    total_amount numeric not null default 0 check (total_amount >= 0),
    currency text not null default 'INR',
    customer_name text not null,
    customer_email text not null,
    customer_phone text,
    shipping_address text not null,
    city text not null,
    state text not null,
    postal_code text not null,
    country text not null,
    tracking_number text,
    tracking_carrier text,
    tracking_url text,
    created_at timestamp with time zone default now(),
    updated_at timestamp with time zone default now()
);

create table if not exists public.order_items (
    id uuid primary key default gen_random_uuid(),
    order_id uuid not null references public.orders(id) on delete cascade,
    product_id uuid references public.products(id) on delete set null,
    variant_id uuid references public.product_variants(id) on delete set null,
    printify_variant_id text,
    product_name text not null,
    size text,
    color text,
    quantity integer not null check (quantity > 0),
    unit_price numeric not null check (unit_price >= 0),
    image_url text
);

alter table public.order_items add column if not exists supplier_type text not null default 'printify' check (supplier_type in ('printify', 'meesho', 'manual'));
alter table public.order_items add column if not exists supplier_product_id text;

alter table public.orders enable row level security;
alter table public.order_items enable row level security;
drop policy if exists "Customers can view their own orders" on public.orders;
create policy "Customers can view their own orders"
    on public.orders for select using (auth.uid() = user_id);
drop policy if exists "Customers can view their own order items" on public.order_items;
create policy "Customers can view their own order items"
    on public.order_items for select using (exists (
        select 1 from public.orders
        where orders.id = order_items.order_id and orders.user_id = auth.uid()
    ));
