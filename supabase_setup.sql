-- ══════════════════════════════════════════════════════════════════════════
-- BOA CI — Pilotage IGOR V4 · Schéma Supabase
-- Exécutez ce script dans : Supabase Dashboard → SQL Editor → New Query
-- ══════════════════════════════════════════════════════════════════════════

-- 1. TABLE PROFILES (liée à auth.users)
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists public.profiles (
  id          uuid references auth.users not null primary key,
  email       text not null,
  full_name   text,
  role        text not null default 'viewer'
              check (role in ('owner', 'editor', 'viewer')),
  created_at  timestamp with time zone default now()
);

comment on table public.profiles is 'Profils utilisateurs avec gestion des rôles';
comment on column public.profiles.role is 'owner = accès total | editor = modification | viewer = lecture seule';

-- 2. TABLE PROJECT_STATE (état partagé du tableau de bord)
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists public.project_state (
  id          text not null primary key default 'boa_ci_v4',
  state_data  jsonb not null default '{}',
  updated_at  timestamp with time zone default now(),
  updated_by  uuid references auth.users
);

comment on table public.project_state is 'État partagé : arbitrages, Gantt, GAPs, actions';

-- 3. TABLE PENDING_INVITES (invitations en attente)
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists public.pending_invites (
  email       text not null primary key,
  role        text not null default 'viewer'
              check (role in ('owner', 'editor', 'viewer')),
  invited_by  uuid references auth.users,
  created_at  timestamp with time zone default now()
);

-- 4. ROW LEVEL SECURITY
-- ─────────────────────────────────────────────────────────────────────────
alter table public.profiles       enable row level security;
alter table public.project_state  enable row level security;
alter table public.pending_invites enable row level security;

-- Profiles : tout utilisateur connecté peut lire tous les profils
create policy "Profiles lisibles par les connectés"
  on public.profiles for select
  using (auth.role() = 'authenticated');

-- Profiles : chaque utilisateur peut créer son propre profil (signup)
create policy "Création de profil au signup"
  on public.profiles for insert
  with check (auth.uid() = id);

-- Profiles : chaque utilisateur peut modifier son propre profil
create policy "MAJ son propre profil"
  on public.profiles for update
  using (auth.uid() = id);

-- Profiles : les owners peuvent modifier le rôle de n'importe qui
create policy "Owner peut modifier tous les rôles"
  on public.profiles for update
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'owner'
    )
  );

-- Project state : tout utilisateur connecté peut lire
create policy "État lisible par les connectés"
  on public.project_state for select
  using (auth.role() = 'authenticated');

-- Project state : seulement owner/editor peuvent écrire
create policy "Owner et Editor peuvent écrire l'état"
  on public.project_state for all
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role in ('owner', 'editor')
    )
  );

-- Pending invites : owners peuvent lire/écrire
create policy "Owner gère les invitations"
  on public.pending_invites for all
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'owner'
    )
  );

-- 5. TRIGGER — auto-création de profil au signup
-- ─────────────────────────────────────────────────────────────────────────
create or replace function public.handle_new_user()
returns trigger as $$
declare
  user_count   int;
  pending_role text;
begin
  -- Compter les utilisateurs existants
  select count(*) into user_count from public.profiles;

  -- Vérifier s'il y a une invitation en attente pour cet email
  select role into pending_role from public.pending_invites where email = new.email;

  -- Insérer le profil :
  --   - Premier utilisateur → owner automatiquement
  --   - Utilisateur invité  → rôle de l'invitation
  --   - Sinon              → viewer par défaut
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    case
      when user_count = 0        then 'owner'
      when pending_role is not null then pending_role
      else 'viewer'
    end
  );

  -- Supprimer l'invitation utilisée
  delete from public.pending_invites where email = new.email;

  return new;
end;
$$ language plpgsql security definer;

-- Supprimer le trigger s'il existe déjà (évite les erreurs sur re-run)
drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- 6. ÉTAT INITIAL du projet (une seule ligne)
-- ─────────────────────────────────────────────────────────────────────────
insert into public.project_state (id, state_data)
values ('boa_ci_v4', '{}')
on conflict (id) do nothing;

-- ══════════════════════════════════════════════════════════════════════════
-- FIN DU SCRIPT
-- Vérification : SELECT * FROM public.profiles; → doit être vide pour l'instant
-- ══════════════════════════════════════════════════════════════════════════
