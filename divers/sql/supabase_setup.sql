-- ══════════════════════════════════════════════════════════════════════════
-- BOA CI — Pilotage IGOR V4 · Schéma Supabase
-- Exécutez ce script dans : Supabase Dashboard → SQL Editor → New Query
-- ══════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────
-- 1. TABLE PROJECT_STATE (état partagé du tableau de bord)
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists public.project_state (
  id          text not null primary key default 'boa_ci_v4',
  state_data  jsonb not null default '{}',
  updated_at  timestamp with time zone default now()
);

comment on table public.project_state is 'État partagé : arbitrages, Gantt, GAPs, actions';

-- RLS : accès en lecture/écriture via clé anon (contrôle dans le code)
alter table public.project_state enable row level security;

create policy "Lecture état anon"
  on public.project_state for select
  using (true);

create policy "Écriture état anon"
  on public.project_state for all
  using (true);

-- État initial (une seule ligne)
insert into public.project_state (id, state_data)
values ('boa_ci_v4', '{}')
on conflict (id) do nothing;

-- ─────────────────────────────────────────────────────────────────────────
-- 2. TABLE APP_USERS (authentification applicative)
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists public.app_users (
  id                  uuid primary key default gen_random_uuid(),
  username            text unique not null,
  display_name        text not null,
  password_hash       text not null,                          -- SHA-256 hex
  role                text not null default 'reader'
                      check (role in ('editor', 'reader')),
  must_change_password boolean not null default true,
  created_at          timestamptz default now(),
  last_login          timestamptz
);

comment on table public.app_users is 'Comptes applicatifs (auth sans Supabase Auth)';

-- RLS : accès uniquement via les fonctions SECURITY DEFINER
alter table public.app_users enable row level security;

-- Bloquer tout accès direct (les RPCs passent en SECURITY DEFINER)
create policy "Pas d accès direct"
  on public.app_users
  using (false);

-- Compte éditeur par défaut : editeur / Editeur@BOA2026
-- (must_change_password=false pour ne pas forcer le changement sur ce compte initial)
insert into public.app_users (username, display_name, role, password_hash, must_change_password)
values (
  'editeur',
  'Équipe BOA',
  'editor',
  'ddc9b180f54b117b9985f7b8f0122f9b53c545c352dae5e288fb8f791f9649e4',
  false
)
on conflict (username) do nothing;

-- ─────────────────────────────────────────────────────────────────────────
-- 3. FONCTIONS RPC D'AUTHENTIFICATION (SECURITY DEFINER)
-- ─────────────────────────────────────────────────────────────────────────

-- 3a. LOGIN — vérifie les identifiants, retourne le profil si OK
create or replace function public.auth_login(
  p_username      text,
  p_password_hash text
)
returns table(
  display_name         text,
  role                 text,
  must_change_password boolean
)
language plpgsql security definer
set search_path = public
as $$
begin
  -- Mise à jour de last_login si les identifiants sont corrects
  update public.app_users
  set last_login = now()
  where username = p_username
    and password_hash = p_password_hash;

  -- Retourner le profil si la ligne existe
  return query
    select u.display_name, u.role, u.must_change_password
    from public.app_users u
    where u.username = p_username
      and u.password_hash = p_password_hash;
end;
$$;

-- 3b. CHANGEMENT DE MOT DE PASSE (utilisateur lui-même)
create or replace function public.auth_change_password(
  p_username  text,
  p_old_hash  text,
  p_new_hash  text
)
returns boolean
language plpgsql security definer
set search_path = public
as $$
declare
  v_rows int;
begin
  update public.app_users
  set password_hash = p_new_hash,
      must_change_password = false
  where username = p_username
    and password_hash = p_old_hash;

  get diagnostics v_rows = row_count;
  return v_rows > 0;
end;
$$;

-- 3c. RESET MDP PAR ADMIN (éditeur uniquement)
create or replace function public.auth_admin_reset(
  p_admin_username  text,
  p_admin_hash      text,
  p_target_username text,
  p_temp_hash       text
)
returns boolean
language plpgsql security definer
set search_path = public
as $$
declare
  v_admin_role text;
  v_rows       int;
begin
  select role into v_admin_role
  from public.app_users
  where username = p_admin_username
    and password_hash = p_admin_hash;

  if v_admin_role is null or v_admin_role != 'editor' then
    return false;
  end if;

  update public.app_users
  set password_hash = p_temp_hash,
      must_change_password = true
  where username = p_target_username;

  get diagnostics v_rows = row_count;
  return v_rows > 0;
end;
$$;

-- 3d. CRÉATION D'UTILISATEUR PAR ADMIN
create or replace function public.auth_create_user(
  p_admin_username  text,
  p_admin_hash      text,
  p_new_username    text,
  p_display_name    text,
  p_role            text,
  p_temp_hash       text
)
returns boolean
language plpgsql security definer
set search_path = public
as $$
declare
  v_admin_role text;
begin
  select role into v_admin_role
  from public.app_users
  where username = p_admin_username
    and password_hash = p_admin_hash;

  if v_admin_role is null or v_admin_role != 'editor' then
    return false;
  end if;

  insert into public.app_users
    (username, display_name, role, password_hash, must_change_password)
  values
    (p_new_username, p_display_name, p_role, p_temp_hash, true);

  return true;
exception
  when unique_violation then return false;
end;
$$;

-- 3e. SUPPRESSION D'UTILISATEUR PAR ADMIN
create or replace function public.auth_delete_user(
  p_admin_username  text,
  p_admin_hash      text,
  p_target_username text
)
returns boolean
language plpgsql security definer
set search_path = public
as $$
declare
  v_admin_role text;
  v_rows       int;
begin
  select role into v_admin_role
  from public.app_users
  where username = p_admin_username
    and password_hash = p_admin_hash;

  if v_admin_role is null or v_admin_role != 'editor' then
    return false;
  end if;

  -- Empêcher l'auto-suppression
  if p_target_username = p_admin_username then
    return false;
  end if;

  delete from public.app_users
  where username = p_target_username;

  get diagnostics v_rows = row_count;
  return v_rows > 0;
end;
$$;

-- 3f. LISTE DES UTILISATEURS (admin seulement)
create or replace function public.auth_list_users(
  p_admin_username text,
  p_admin_hash     text
)
returns table(
  username             text,
  display_name         text,
  role                 text,
  must_change_password boolean,
  last_login           timestamptz,
  created_at           timestamptz
)
language plpgsql security definer
set search_path = public
as $$
declare
  v_admin_role text;
begin
  select u.role into v_admin_role
  from public.app_users u
  where u.username = p_admin_username
    and u.password_hash = p_admin_hash;

  if v_admin_role is null or v_admin_role != 'editor' then
    return;
  end if;

  return query
    select u.username, u.display_name, u.role,
           u.must_change_password, u.last_login, u.created_at
    from public.app_users u
    order by u.created_at;
end;
$$;

-- 3g. MODIFICATION DU RÔLE D'UN UTILISATEUR (admin seulement)
create or replace function public.auth_update_role(
  p_admin_username  text,
  p_admin_hash      text,
  p_target_username text,
  p_new_role        text
)
returns boolean
language plpgsql security definer
set search_path = public
as $$
declare
  v_admin_role text;
  v_rows       int;
begin
  select role into v_admin_role
  from public.app_users
  where username = p_admin_username
    and password_hash = p_admin_hash;

  if v_admin_role is null or v_admin_role != 'editor' then
    return false;
  end if;

  if p_target_username = p_admin_username then
    return false; -- pas de modification de son propre rôle
  end if;

  if p_new_role not in ('editor', 'reader') then
    return false;
  end if;

  update public.app_users
  set role = p_new_role
  where username = p_target_username;

  get diagnostics v_rows = row_count;
  return v_rows > 0;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────
-- 4. GRANTS — autoriser l'exécution via clé anon
-- ─────────────────────────────────────────────────────────────────────────
grant execute on function public.auth_login             to anon;
grant execute on function public.auth_change_password   to anon;
grant execute on function public.auth_admin_reset       to anon;
grant execute on function public.auth_create_user       to anon;
grant execute on function public.auth_delete_user       to anon;
grant execute on function public.auth_list_users        to anon;
grant execute on function public.auth_update_role       to anon;

-- ══════════════════════════════════════════════════════════════════════════
-- FIN DU SCRIPT
-- ─────────────────────────────────────────────────────────────────────────
-- Compte par défaut créé :
--   Identifiant : editeur
--   Mot de passe : Editeur@BOA2026
--   Rôle         : editor
--   Changement MDP requis : non
--
-- Vérification :
--   SELECT username, role, must_change_password FROM public.app_users;
-- ══════════════════════════════════════════════════════════════════════════
