-- ══════════════════════════════════════════════════════════════════════════════
-- BOA PROGRAMME PILOTAGE — Script d'installation Supabase (FRESH INSTALL)
-- Version consolidée — à exécuter sur un projet Supabase vierge
-- ══════════════════════════════════════════════════════════════════════════════
--
-- COMMENT L'UTILISER :
--   1. Aller sur https://supabase.com → créer un projet gratuit
--   2. Aller dans : Database → SQL Editor → New Query
--   3. Coller ce script complet et cliquer "Run"
--   4. Copier l'URL et la clé "anon" depuis Project Settings → API
--   5. Les coller dans config.js de l'application
--
-- COMPTE ADMINISTRATEUR CRÉÉ PAR DÉFAUT :
--   Identifiant : editeur
--   Mot de passe : Editeur@BOA2026
--   Rôle         : editor (admin complet)
-- ══════════════════════════════════════════════════════════════════════════════

-- Extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ──────────────────────────────────────────────────────────────────────────────
-- PARTIE 1 : ÉTAT GLOBAL (legacy — rétrocompatibilité)
-- ──────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.project_state (
  id         TEXT NOT NULL PRIMARY KEY DEFAULT 'boa_ci_v4',
  state_data JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.project_state ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Lecture état anon"  ON public.project_state;
DROP POLICY IF EXISTS "Écriture état anon" ON public.project_state;
CREATE POLICY "Lecture état anon"  ON public.project_state FOR SELECT USING (true);
CREATE POLICY "Écriture état anon" ON public.project_state FOR ALL    USING (true);

INSERT INTO public.project_state (id, state_data)
VALUES ('boa_ci_v4', '{}')
ON CONFLICT (id) DO NOTHING;

-- ──────────────────────────────────────────────────────────────────────────────
-- PARTIE 2 : UTILISATEURS (authentification applicative)
-- ──────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.app_users (
  id                   UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  username             TEXT    UNIQUE NOT NULL,
  display_name         TEXT    NOT NULL,
  password_hash        TEXT    NOT NULL,
  role                 TEXT    NOT NULL DEFAULT 'reader'
                       CHECK (role IN ('admin', 'editor', 'reader')),
  must_change_password BOOLEAN NOT NULL DEFAULT TRUE,
  permissions          JSONB   DEFAULT NULL,
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  last_login           TIMESTAMPTZ
);

ALTER TABLE public.app_users ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Pas d accès direct" ON public.app_users;
CREATE POLICY "Pas d accès direct" ON public.app_users USING (false);

-- Compte administrateur par défaut (mot de passe : Editeur@BOA2026)
INSERT INTO public.app_users (username, display_name, role, password_hash, must_change_password)
VALUES (
  'editeur', 'Équipe BOA', 'editor',
  'ddc9b180f54b117b9985f7b8f0122f9b53c545c352dae5e288fb8f791f9649e4',
  false
)
ON CONFLICT (username) DO NOTHING;

-- ──────────────────────────────────────────────────────────────────────────────
-- PARTIE 3 : FONCTIONS RPC D'AUTHENTIFICATION
-- ──────────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.auth_login(text, text);
CREATE FUNCTION public.auth_login(p_username TEXT, p_password_hash TEXT)
RETURNS TABLE(display_name TEXT, role TEXT, must_change_password BOOLEAN, permissions JSONB)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
    SELECT u.display_name, u.role, u.must_change_password, u.permissions
    FROM public.app_users u
    WHERE u.username = p_username AND u.password_hash = p_password_hash;
  IF FOUND THEN
    UPDATE public.app_users SET last_login = NOW() WHERE username = p_username;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.auth_change_password(p_username TEXT, p_old_hash TEXT, p_new_hash TEXT)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_rows INT;
BEGIN
  UPDATE public.app_users SET password_hash = p_new_hash, must_change_password = FALSE
  WHERE username = p_username AND password_hash = p_old_hash;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows > 0;
END;
$$;

CREATE OR REPLACE FUNCTION public.auth_admin_reset(p_admin_username TEXT, p_admin_hash TEXT, p_target_username TEXT, p_temp_hash TEXT)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_admin_role TEXT; v_rows INT;
BEGIN
  SELECT role INTO v_admin_role FROM public.app_users WHERE username = p_admin_username AND password_hash = p_admin_hash;
  IF v_admin_role IS NULL OR v_admin_role NOT IN ('editor','admin') THEN RETURN FALSE; END IF;
  UPDATE public.app_users SET password_hash = p_temp_hash, must_change_password = TRUE WHERE username = p_target_username;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows > 0;
END;
$$;

CREATE OR REPLACE FUNCTION public.auth_create_user(p_admin_username TEXT, p_admin_hash TEXT, p_new_username TEXT, p_display_name TEXT, p_role TEXT, p_temp_hash TEXT)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_admin_role TEXT;
BEGIN
  SELECT role INTO v_admin_role FROM public.app_users WHERE username = p_admin_username AND password_hash = p_admin_hash;
  IF v_admin_role IS NULL OR v_admin_role NOT IN ('editor','admin') THEN RETURN FALSE; END IF;
  INSERT INTO public.app_users (username, display_name, role, password_hash, must_change_password)
  VALUES (p_new_username, p_display_name, p_role, p_temp_hash, TRUE);
  RETURN TRUE;
EXCEPTION WHEN unique_violation THEN RETURN FALSE;
END;
$$;

CREATE OR REPLACE FUNCTION public.auth_delete_user(p_admin_username TEXT, p_admin_hash TEXT, p_target_username TEXT)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_admin_role TEXT; v_rows INT;
BEGIN
  SELECT role INTO v_admin_role FROM public.app_users WHERE username = p_admin_username AND password_hash = p_admin_hash;
  IF v_admin_role IS NULL OR v_admin_role NOT IN ('editor','admin') THEN RETURN FALSE; END IF;
  IF p_target_username = p_admin_username THEN RETURN FALSE; END IF;
  DELETE FROM public.app_users WHERE username = p_target_username;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows > 0;
END;
$$;

CREATE OR REPLACE FUNCTION public.auth_list_users(p_admin_username TEXT, p_admin_hash TEXT)
RETURNS TABLE(username TEXT, display_name TEXT, role TEXT, must_change_password BOOLEAN, last_login TIMESTAMPTZ, created_at TIMESTAMPTZ)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_admin_role TEXT;
BEGIN
  SELECT u.role INTO v_admin_role FROM public.app_users u WHERE u.username = p_admin_username AND u.password_hash = p_admin_hash;
  IF v_admin_role IS NULL OR v_admin_role NOT IN ('editor','admin') THEN RETURN; END IF;
  RETURN QUERY SELECT u.username, u.display_name, u.role, u.must_change_password, u.last_login, u.created_at FROM public.app_users u ORDER BY u.created_at;
END;
$$;

CREATE OR REPLACE FUNCTION public.auth_update_role(p_admin_username TEXT, p_admin_hash TEXT, p_target_username TEXT, p_new_role TEXT)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_admin_role TEXT; v_rows INT;
BEGIN
  SELECT role INTO v_admin_role FROM public.app_users WHERE username = p_admin_username AND password_hash = p_admin_hash;
  IF v_admin_role IS NULL OR v_admin_role NOT IN ('editor','admin') THEN RETURN FALSE; END IF;
  IF p_target_username = p_admin_username THEN RETURN FALSE; END IF;
  IF p_new_role NOT IN ('admin','editor','reader') THEN RETURN FALSE; END IF;
  UPDATE public.app_users SET role = p_new_role WHERE username = p_target_username;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows > 0;
END;
$$;

CREATE OR REPLACE FUNCTION public.auth_update_permissions(p_admin_username TEXT, p_admin_hash TEXT, p_target_username TEXT, p_permissions JSONB)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_admin_role TEXT;
BEGIN
  SELECT role INTO v_admin_role FROM public.app_users WHERE username = p_admin_username AND password_hash = p_admin_hash;
  IF v_admin_role IS NULL OR v_admin_role NOT IN ('editor','admin') THEN RETURN FALSE; END IF;
  UPDATE public.app_users SET permissions = p_permissions WHERE username = p_target_username;
  RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.auth_login             TO anon;
GRANT EXECUTE ON FUNCTION public.auth_change_password   TO anon;
GRANT EXECUTE ON FUNCTION public.auth_admin_reset       TO anon;
GRANT EXECUTE ON FUNCTION public.auth_create_user       TO anon;
GRANT EXECUTE ON FUNCTION public.auth_delete_user       TO anon;
GRANT EXECUTE ON FUNCTION public.auth_list_users        TO anon;
GRANT EXECUTE ON FUNCTION public.auth_update_role       TO anon;
GRANT EXECUTE ON FUNCTION public.auth_update_permissions TO anon;

-- ──────────────────────────────────────────────────────────────────────────────
-- PARTIE 4 : SCHÉMA RELATIONNEL COMPLET
-- ──────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS programmes (
  id          TEXT PRIMARY KEY DEFAULT 'prog_main',
  name        TEXT NOT NULL DEFAULT 'Mon Programme',
  description TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS programme_milestones (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  programme_id TEXT NOT NULL REFERENCES programmes(id) ON DELETE CASCADE,
  key          TEXT NOT NULL,
  value        DATE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(programme_id, key)
);

CREATE TABLE IF NOT EXISTS projects (
  id              TEXT PRIMARY KEY,
  programme_id    TEXT NOT NULL REFERENCES programmes(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  color           TEXT DEFAULT '#1565C0',
  status          TEXT DEFAULT 'active',
  description     TEXT,
  data_source     TEXT DEFAULT 'blank',
  enabled_modules JSONB DEFAULT '[]',
  sort_order      INTEGER DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS owners (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL UNIQUE,
  email      TEXT,
  role       TEXT,
  domain     TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS streams (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL UNIQUE,
  color      TEXT DEFAULT '#1565C0',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS gaps (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  TEXT REFERENCES projects(id) ON DELETE CASCADE,
  ref         TEXT NOT NULL,
  domain      TEXT,
  domains     JSONB DEFAULT '[]',
  processus   TEXT,
  description TEXT NOT NULL,
  priority    TEXT DEFAULT 'P2',
  phase       TEXT DEFAULT 'I',
  bm          TEXT,
  resp        TEXT,
  decision    TEXT DEFAULT 'En attente',
  note        TEXT,
  is_custom   BOOLEAN DEFAULT FALSE,
  sort_order  INTEGER DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(project_id, ref)
);

CREATE TABLE IF NOT EXISTS arbitrages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  TEXT REFERENCES projects(id) ON DELETE CASCADE,
  label       TEXT NOT NULL,
  domain      TEXT,
  priority    TEXT DEFAULT 'P2',
  resp        TEXT,
  deadline    TEXT,
  decision    TEXT DEFAULT 'en_cours',
  commentaire TEXT,
  is_custom   BOOLEAN DEFAULT FALSE,
  sort_order  INTEGER DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS actions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  TEXT REFERENCES projects(id) ON DELETE CASCADE,
  action_code TEXT NOT NULL,
  label       TEXT NOT NULL,
  domain      TEXT,
  domains     JSONB DEFAULT '[]',
  resp        TEXT,
  deadline    TEXT,
  urgency     TEXT DEFAULT 'Normale',
  rag         TEXT DEFAULT 'X',
  pct         INTEGER DEFAULT 0,
  commentaire TEXT,
  source      TEXT,
  email       TEXT,
  date_fin    TEXT,
  is_custom   BOOLEAN DEFAULT FALSE,
  sort_order  INTEGER DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS interfaces (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  TEXT REFERENCES projects(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  status      TEXT DEFAULT 'pending_boa',
  impact      TEXT DEFAULT 'tbd',
  comments    JSONB DEFAULT '[]',
  resp        TEXT,
  target_date TEXT,
  actions     JSONB DEFAULT '[]',
  sort_order  INTEGER DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS gantt_tasks (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  TEXT REFERENCES projects(id) ON DELETE CASCADE,
  task_key    TEXT NOT NULL,
  label       TEXT NOT NULL,
  type        TEXT DEFAULT 'task',
  start_date  TEXT,
  end_date    TEXT,
  progress    INTEGER DEFAULT 0,
  parent_key  TEXT,
  sort_order  INTEGER DEFAULT 0,
  is_custom   BOOLEAN DEFAULT FALSE,
  is_hidden   BOOLEAN DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(project_id, task_key)
);

CREATE TABLE IF NOT EXISTS gantt_subtasks (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gantt_task_id UUID NOT NULL REFERENCES gantt_tasks(id) ON DELETE CASCADE,
  project_id    TEXT REFERENCES projects(id) ON DELETE CASCADE,
  label         TEXT NOT NULL,
  owner         TEXT,
  start_date    TEXT,
  end_date      TEXT,
  progress      INTEGER DEFAULT 0,
  sort_order    INTEGER DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS risks (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  TEXT REFERENCES projects(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  probability TEXT DEFAULT 'Moyen',
  impact      TEXT DEFAULT 'Moyen',
  mitigation  TEXT,
  status      TEXT DEFAULT 'Ouvert',
  owner       TEXT,
  category    TEXT,
  sort_order  INTEGER DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS perimeter_modules (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  TEXT REFERENCES projects(id) ON DELETE CASCADE,
  module_key  TEXT NOT NULL,
  commentaire TEXT,
  decision    TEXT,
  data        JSONB DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(project_id, module_key)
);

CREATE TABLE IF NOT EXISTS architecture (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  TEXT REFERENCES projects(id) ON DELETE CASCADE,
  type        TEXT NOT NULL,
  label       TEXT NOT NULL,
  description TEXT,
  status      TEXT DEFAULT 'active',
  data        JSONB DEFAULT '{}',
  sort_order  INTEGER DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS history (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL,
  entity_id   UUID,
  entity_ref  TEXT,
  project_id  TEXT REFERENCES projects(id) ON DELETE SET NULL,
  changed_by  TEXT DEFAULT 'Utilisateur',
  changed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  action_type TEXT NOT NULL,
  changes     JSONB DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS public.action_reminders (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id          TEXT NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  action_db_id        UUID NULL REFERENCES public.actions(id) ON DELETE SET NULL,
  action_code         TEXT NOT NULL,
  recipient_to        TEXT NOT NULL,
  recipient_cc        TEXT NULL,
  subject             TEXT NOT NULL,
  body_text           TEXT NOT NULL,
  provider            TEXT NOT NULL DEFAULT 'resend',
  provider_message_id TEXT NULL,
  status              TEXT NOT NULL DEFAULT 'sent',
  sent_by             TEXT NOT NULL,
  error_message       TEXT NULL,
  sent_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ──────────────────────────────────────────────────────────────────────────────
-- PARTIE 5 : TEMPLATES DE RÉFÉRENCE (environnements réutilisables)
-- ──────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS project_templates (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  description   TEXT,
  icon          TEXT DEFAULT '📋',
  created_by    TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW(),
  template_data JSONB NOT NULL DEFAULT '{}'::JSONB
);

-- ──────────────────────────────────────────────────────────────────────────────
-- PARTIE 6 : INDEX
-- ──────────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_gaps_project       ON gaps(project_id);
CREATE INDEX IF NOT EXISTS idx_arb_project        ON arbitrages(project_id);
CREATE INDEX IF NOT EXISTS idx_actions_project    ON actions(project_id);
CREATE INDEX IF NOT EXISTS idx_interfaces_project ON interfaces(project_id);
CREATE INDEX IF NOT EXISTS idx_gantt_project      ON gantt_tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_risks_project      ON risks(project_id);
CREATE INDEX IF NOT EXISTS idx_history_project    ON history(project_id);
CREATE INDEX IF NOT EXISTS idx_history_date       ON history(changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_action_reminders_project ON public.action_reminders(project_id, sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_templates_created  ON project_templates(created_at DESC);

-- ──────────────────────────────────────────────────────────────────────────────
-- PARTIE 7 : TRIGGER updated_at automatique
-- ──────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION trigger_set_updated_at()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$ LANGUAGE plpgsql;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'programmes','projects','gaps','arbitrages','actions','interfaces',
    'gantt_tasks','gantt_subtasks','risks','perimeter_modules','architecture',
    'programme_milestones','project_templates'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS set_updated_at ON %I; CREATE TRIGGER set_updated_at BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();', t, t);
  END LOOP;
END;
$$;

-- ──────────────────────────────────────────────────────────────────────────────
-- PARTIE 8 : ROW LEVEL SECURITY
-- ──────────────────────────────────────────────────────────────────────────────
ALTER TABLE programmes          ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects            ENABLE ROW LEVEL SECURITY;
ALTER TABLE gaps                ENABLE ROW LEVEL SECURITY;
ALTER TABLE arbitrages          ENABLE ROW LEVEL SECURITY;
ALTER TABLE actions             ENABLE ROW LEVEL SECURITY;
ALTER TABLE interfaces          ENABLE ROW LEVEL SECURITY;
ALTER TABLE gantt_tasks         ENABLE ROW LEVEL SECURITY;
ALTER TABLE gantt_subtasks      ENABLE ROW LEVEL SECURITY;
ALTER TABLE risks               ENABLE ROW LEVEL SECURITY;
ALTER TABLE perimeter_modules   ENABLE ROW LEVEL SECURITY;
ALTER TABLE architecture        ENABLE ROW LEVEL SECURITY;
ALTER TABLE history             ENABLE ROW LEVEL SECURITY;
ALTER TABLE owners              ENABLE ROW LEVEL SECURITY;
ALTER TABLE streams             ENABLE ROW LEVEL SECURITY;
ALTER TABLE programme_milestones ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_templates   ENABLE ROW LEVEL SECURITY;
ALTER TABLE action_reminders    ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'programmes','projects','gaps','arbitrages','actions','interfaces',
    'gantt_tasks','gantt_subtasks','risks','perimeter_modules','architecture',
    'history','owners','streams','programme_milestones','project_templates'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "anon_all" ON %I; CREATE POLICY "anon_all" ON %I FOR ALL TO anon USING (true) WITH CHECK (true);', t, t);
  END LOOP;
END;
$$;

-- action_reminders : pas d'accès direct anon
DROP POLICY IF EXISTS "action_reminders_no_direct_anon" ON public.action_reminders;
CREATE POLICY "action_reminders_no_direct_anon" ON public.action_reminders FOR ALL TO anon USING (false) WITH CHECK (false);

-- ──────────────────────────────────────────────────────────────────────────────
-- PARTIE 9 : SEED — Programme et projet par défaut (PERSONNALISEZ ICI)
-- ──────────────────────────────────────────────────────────────────────────────
-- Modifiez le nom du programme et du projet pour votre contexte
INSERT INTO programmes (id, name, description)
VALUES ('prog_main', 'Mon Programme', 'Décrivez votre programme ici')
ON CONFLICT (id) DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════════════
-- FIN DE L'INSTALLATION
-- ══════════════════════════════════════════════════════════════════════════════
-- Vérification :
--   SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name;
--   SELECT username, role FROM public.app_users;
-- ══════════════════════════════════════════════════════════════════════════════
SELECT 'Installation BOA Programme Pilotage terminée ✅' AS status;
