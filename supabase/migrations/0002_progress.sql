-- dronefight progression (ADR-0032). Run once in the Supabase SQL editor after 0001_profiles.sql.
-- Pilots can READ their own row. There are no insert/update policies, so a browser can never change XP;
-- only the room server, using the project's secret key, writes through award_progress().

create table if not exists public.progress (
  id uuid primary key references auth.users (id) on delete cascade,
  xp bigint not null default 0 check (xp >= 0),
  kills integer not null default 0 check (kills >= 0),
  deaths integer not null default 0 check (deaths >= 0),
  wins integer not null default 0 check (wins >= 0),
  matches integer not null default 0 check (matches >= 0),
  updated_at timestamptz not null default now()
);

alter table public.progress enable row level security;

drop policy if exists "Pilots read their own progress" on public.progress;
create policy "Pilots read their own progress" on public.progress
  for select using (auth.uid() = id);

-- Add to a pilot's totals (creating the row on first award) and return the new XP. Server only.
create or replace function public.award_progress(
  p_user uuid, p_xp integer, p_kills integer, p_deaths integer, p_wins integer, p_matches integer
) returns bigint
  language sql
  security definer
  set search_path = public
as $$
  insert into public.progress as pr (id, xp, kills, deaths, wins, matches)
  values (p_user, greatest(p_xp, 0), greatest(p_kills, 0), greatest(p_deaths, 0), greatest(p_wins, 0), greatest(p_matches, 0))
  on conflict (id) do update set
    xp = pr.xp + greatest(p_xp, 0),
    kills = pr.kills + greatest(p_kills, 0),
    deaths = pr.deaths + greatest(p_deaths, 0),
    wins = pr.wins + greatest(p_wins, 0),
    matches = pr.matches + greatest(p_matches, 0),
    updated_at = now()
  returning xp;
$$;

revoke all on function public.award_progress(uuid, integer, integer, integer, integer, integer) from public, anon, authenticated;
grant execute on function public.award_progress(uuid, integer, integer, integer, integer, integer) to service_role;
