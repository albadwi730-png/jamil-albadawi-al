-- JAMIL AI initial production-oriented schema
-- Apply with Supabase CLI: supabase db push
create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text,
  avatar_url text,
  role text not null default 'user' check (role in ('user','admin','owner')),
  locale text not null default 'ar' check (locale in ('ar','en')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.wallets (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  balance bigint not null default 0 check (balance >= 0),
  currency text not null default 'credits',
  updated_at timestamptz not null default now()
);

create table if not exists public.wallet_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  amount bigint not null check (amount <> 0),
  balance_after bigint not null check (balance_after >= 0),
  kind text not null check (kind in ('credit','debit','refund','adjustment')),
  description text,
  idempotency_key text not null unique,
  created_at timestamptz not null default now()
);
create index if not exists wallet_transactions_user_created_idx on public.wallet_transactions(user_id, created_at desc);

create table if not exists public.plans (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  credits bigint not null check (credits >= 0),
  price_minor bigint not null default 0 check (price_minor >= 0),
  currency text not null default 'USD',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.payment_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  plan_id uuid references public.plans(id) on delete set null,
  amount_minor bigint not null check (amount_minor >= 0),
  currency text not null default 'USD',
  receipt_path text,
  status text not null default 'pending' check (status in ('pending','approved','rejected','cancelled')),
  reviewed_by uuid references public.profiles(id) on delete set null,
  review_note text,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);
create index if not exists payment_requests_status_created_idx on public.payment_requests(status, created_at desc);

create table if not exists public.ai_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  service text not null,
  engine text,
  status text not null default 'pending' check (status in ('pending','running','completed','failed')),
  input jsonb not null default '{}'::jsonb,
  result jsonb,
  error_message text,
  reserved_credits bigint not null default 0 check (reserved_credits >= 0),
  idempotency_key text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  unique(user_id, idempotency_key)
);
create index if not exists ai_jobs_user_created_idx on public.ai_jobs(user_id, created_at desc);
create index if not exists ai_jobs_status_created_idx on public.ai_jobs(status, created_at);

create table if not exists public.assets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  bucket text not null default 'user-assets',
  object_path text not null unique,
  file_name text not null,
  mime_type text,
  size_bytes bigint check (size_bytes is null or size_bytes >= 0),
  asset_type text not null check (asset_type in ('audio','image','video','document','other')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists assets_user_type_created_idx on public.assets(user_id, asset_type, created_at desc);

create table if not exists public.voice_models (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  provider text not null,
  provider_model_id text,
  status text not null default 'pending' check (status in ('pending','ready','failed','disabled')),
  consent_confirmed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists voice_models_user_created_idx on public.voice_models(user_id, created_at desc);

create table if not exists public.user_settings (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  theme text not null default 'dark' check (theme in ('dark','light','system')),
  locale text not null default 'ar' check (locale in ('ar','en')),
  preferences jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  body text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists notifications_user_created_idx on public.notifications(user_id, created_at desc);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null,
  target_type text,
  target_id text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists audit_logs_created_idx on public.audit_logs(created_at desc);

create or replace function public.is_admin_or_owner()
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role in ('admin','owner'));
$$;

-- Profile/Wallet creation and trusted owner assignment. Never trust client-supplied role metadata.
create or replace function public.handle_auth_user()
returns trigger language plpgsql security definer set search_path = public
as $$
declare verified_owner boolean;
begin
  verified_owner := lower(coalesce(new.email, '')) = 'albadawi730@gmail.com'
    and new.email_confirmed_at is not null;

  insert into public.profiles(id, email, display_name, role)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'name', split_part(coalesce(new.email,''),'@',1)),
    case when verified_owner then 'owner' else 'user' end)
  on conflict (id) do update set
    email = excluded.email,
    role = case when verified_owner then 'owner' else public.profiles.role end,
    updated_at = now();

  insert into public.wallets(user_id) values (new.id) on conflict (user_id) do nothing;
  insert into public.user_settings(user_id) values (new.id) on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_or_verified on auth.users;
create trigger on_auth_user_created_or_verified
  after insert or update of email_confirmed_at on auth.users
  for each row execute procedure public.handle_auth_user();

-- Atomic ledger operation. Callable only by trusted server/service-role code.
create or replace function public.apply_wallet_transaction(
  p_user_id uuid,
  p_amount bigint,
  p_kind text,
  p_idempotency_key text,
  p_description text default null
) returns public.wallet_transactions
language plpgsql security definer set search_path = public
as $$
declare current_balance bigint;
declare inserted public.wallet_transactions;
begin
  if p_amount = 0 or p_idempotency_key is null or length(p_idempotency_key) < 8 then
    raise exception 'Invalid wallet transaction parameters';
  end if;
  if p_kind not in ('credit','debit','refund','adjustment') then
    raise exception 'Invalid transaction kind';
  end if;

  perform 1 from public.wallets where user_id = p_user_id for update;
  if not found then raise exception 'Wallet not found'; end if;

  select * into inserted from public.wallet_transactions where idempotency_key = p_idempotency_key;
  if found then return inserted; end if;

  select balance into current_balance from public.wallets where user_id = p_user_id;
  if current_balance + p_amount < 0 then raise exception 'Insufficient credits'; end if;

  update public.wallets set balance = balance + p_amount, updated_at = now()
    where user_id = p_user_id returning balance into current_balance;

  insert into public.wallet_transactions(user_id, amount, balance_after, kind, description, idempotency_key)
    values (p_user_id, p_amount, current_balance, p_kind, p_description, p_idempotency_key)
    returning * into inserted;
  return inserted;
end;
$$;
revoke all on function public.apply_wallet_transaction(uuid,bigint,text,text,text) from public, anon, authenticated;
grant execute on function public.apply_wallet_transaction(uuid,bigint,text,text,text) to service_role;

-- Row-level security: users can access only their own rows; privileged reads require a server-verified role.
alter table public.profiles enable row level security;
alter table public.wallets enable row level security;
alter table public.wallet_transactions enable row level security;
alter table public.plans enable row level security;
alter table public.payment_requests enable row level security;
alter table public.ai_jobs enable row level security;
alter table public.assets enable row level security;
alter table public.voice_models enable row level security;
alter table public.user_settings enable row level security;
alter table public.notifications enable row level security;
alter table public.audit_logs enable row level security;

create policy "profiles_select_self_or_admin" on public.profiles for select to authenticated using (id = auth.uid() or public.is_admin_or_owner());
create or replace function public.prevent_self_role_change()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is not null and new.role is distinct from old.role
     and not exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin','owner')) then
    raise exception 'Role changes require an administrator';
  end if;
  return new;
end;
$$;
drop trigger if exists protect_profile_role on public.profiles;
create trigger protect_profile_role before update on public.profiles
for each row execute procedure public.prevent_self_role_change();

create policy "profiles_update_self" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
create policy "wallet_select_self_or_admin" on public.wallets for select to authenticated using (user_id = auth.uid() or public.is_admin_or_owner());
create policy "wallet_transactions_select_self_or_admin" on public.wallet_transactions for select to authenticated using (user_id = auth.uid() or public.is_admin_or_owner());
create policy "plans_read_active_or_admin" on public.plans for select to authenticated using (active or public.is_admin_or_owner());
create policy "payment_requests_select_self_or_admin" on public.payment_requests for select to authenticated using (user_id = auth.uid() or public.is_admin_or_owner());
create policy "payment_requests_insert_self" on public.payment_requests for insert to authenticated with check (user_id = auth.uid() and status = 'pending');
create policy "ai_jobs_select_self_or_admin" on public.ai_jobs for select to authenticated using (user_id = auth.uid() or public.is_admin_or_owner());
create policy "assets_owner_all" on public.assets for all to authenticated using (user_id = auth.uid() or public.is_admin_or_owner()) with check (user_id = auth.uid() or public.is_admin_or_owner());
create policy "voice_models_owner_all" on public.voice_models for all to authenticated using (user_id = auth.uid() or public.is_admin_or_owner()) with check (user_id = auth.uid() or public.is_admin_or_owner());
create policy "settings_owner_all" on public.user_settings for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "notifications_select_self" on public.notifications for select to authenticated using (user_id = auth.uid() or public.is_admin_or_owner());
create policy "notifications_update_self" on public.notifications for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "audit_logs_admin_read" on public.audit_logs for select to authenticated using (public.is_admin_or_owner());

-- Private bucket. Storage access is restricted to the authenticated user's UUID prefix.
insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('user-assets', 'user-assets', false, 104857600,
  array['audio/mpeg','audio/wav','audio/ogg','audio/mp4','image/png','image/jpeg','image/webp','video/mp4','application/pdf'])
on conflict (id) do nothing;

create policy "user_assets_read_own" on storage.objects for select to authenticated
using (bucket_id = 'user-assets' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "user_assets_upload_own" on storage.objects for insert to authenticated
with check (bucket_id = 'user-assets' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "user_assets_delete_own" on storage.objects for delete to authenticated
using (bucket_id = 'user-assets' and (storage.foldername(name))[1] = auth.uid()::text);
