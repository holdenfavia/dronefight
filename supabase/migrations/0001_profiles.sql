-- dronefight profiles (ADR-0030, ADR-0031). Run once in the Supabase SQL editor (or `supabase db push`).
-- A signed-in pilot can read and write only their own row. Progression (XP, levels, unlocks) will live in a
-- separate table that only the room server writes (step 3), so a client can never award itself XP.

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  -- Same rules as cleanPilotName() in shared/cosmetics.ts.
  pilot_name text not null default ''
    check (char_length(pilot_name) <= 16 and pilot_name ~ '^[A-Za-z0-9 _-]*$'),
  -- Drone looks per class, validated by the client against shared/cosmetics.ts; small by construction.
  looks jsonb not null default '{}'::jsonb check (pg_column_size(looks) < 4096),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "Pilots read their own profile" on public.profiles;
create policy "Pilots read their own profile" on public.profiles
  for select using (auth.uid() = id);

drop policy if exists "Pilots create their own profile" on public.profiles;
create policy "Pilots create their own profile" on public.profiles
  for insert with check (auth.uid() = id);

drop policy if exists "Pilots update their own profile" on public.profiles;
create policy "Pilots update their own profile" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- Keep updated_at current.
create or replace function public.touch_updated_at() returns trigger
  language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();
