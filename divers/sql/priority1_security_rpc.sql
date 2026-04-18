-- ============================================================
-- Priorite 1 - Securisation minimale Supabase
-- BOA Pilotage Programme
--
-- Objectif:
--   - Ne PAS recreer les utilisateurs.
--   - Ne PAS modifier les roles existants.
--   - Ne PAS remplacer les fonctions auth_* existantes.
--   - Sauvegarder les tables sensibles avant durcissement.
--   - Remplacer les ecritures directes anonymes par des RPC verifiees.
--
-- A executer dans Supabase SQL Editor.
-- Date de reference backup: 2026_04_15
-- ============================================================

BEGIN;

-- ============================================================
-- 0. BACKUPS AVANT MODIFICATION
-- ============================================================
-- Ces backups sont crees une seule fois. Si vous relancez le script,
-- les tables de backup existantes ne sont pas ecrasees.

CREATE TABLE IF NOT EXISTS public.backup_app_users_priority1_20260415 AS
SELECT *
FROM public.app_users;

CREATE TABLE IF NOT EXISTS public.backup_project_state_priority1_20260415 AS
SELECT *
FROM public.project_state;

CREATE TABLE IF NOT EXISTS public.backup_app_defaults_priority1_20260415 AS
SELECT *
FROM public.app_defaults;

CREATE TABLE IF NOT EXISTS public.backup_rls_policies_priority1_20260415 AS
SELECT *
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('app_users', 'project_state', 'app_defaults');

-- ============================================================
-- 1. PREPARATION MINIMALE
-- ============================================================
-- N'ajoute que la colonne d'audit utilisee par app_state_save.
-- Aucune ligne utilisateur n'est modifiee.

ALTER TABLE public.project_state
  ADD COLUMN IF NOT EXISTS updated_by text;

ALTER TABLE public.app_users
  ADD COLUMN IF NOT EXISTS is_active boolean;

UPDATE public.app_users
SET is_active = true
WHERE is_active IS NULL;

ALTER TABLE public.app_users
  ALTER COLUMN is_active SET DEFAULT true;

ALTER TABLE public.app_users
  ADD COLUMN IF NOT EXISTS suspended_at timestamptz,
  ADD COLUMN IF NOT EXISTS suspended_by text;

-- ============================================================
-- 2. RPC SECURISEES POUR L'ETAT APPLICATIF
-- ============================================================
-- Lecture: tout utilisateur applicatif valide peut lire.
-- Ecriture: seuls editor et admin peuvent sauvegarder.

CREATE OR REPLACE FUNCTION public.app_state_get(
  p_username      text,
  p_password_hash text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_exists boolean;
  v_state jsonb;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM public.app_users
    WHERE username = p_username
      AND password_hash = p_password_hash
  ) INTO v_exists;

  IF NOT v_exists THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;

  SELECT state_data INTO v_state
  FROM public.project_state
  WHERE id = 'boa_ci_v4';

  RETURN COALESCE(v_state, '{}'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.app_state_save(
  p_username      text,
  p_password_hash text,
  p_state         jsonb
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
BEGIN
  SELECT role INTO v_role
  FROM public.app_users
  WHERE username = p_username
    AND password_hash = p_password_hash;

  IF v_role NOT IN ('editor', 'admin') THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.project_state (id, state_data, updated_at, updated_by)
  VALUES ('boa_ci_v4', COALESCE(p_state, '{}'::jsonb), now(), p_username)
  ON CONFLICT (id)
  DO UPDATE SET
    state_data = EXCLUDED.state_data,
    updated_at = now(),
    updated_by = EXCLUDED.updated_by;

  RETURN true;
END;
$$;

-- ============================================================
-- 3. RPC SECURISEE POUR LES REFERENTIELS APP_DEFAULTS
-- ============================================================
-- Ecriture reservee aux admins. Les lectures directes restent autorisees
-- pour que l'application puisse charger les referentiels.

CREATE OR REPLACE FUNCTION public.app_default_save(
  p_username      text,
  p_password_hash text,
  p_key           text,
  p_data          jsonb
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
BEGIN
  SELECT role INTO v_role
  FROM public.app_users
  WHERE username = p_username
    AND password_hash = p_password_hash;

  IF v_role IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.app_defaults (key, data, updated_at)
  VALUES (p_key, COALESCE(p_data, 'null'::jsonb), now())
  ON CONFLICT (key)
  DO UPDATE SET
    data = EXCLUDED.data,
    updated_at = now();

  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.app_state_get(text, text) TO anon;
GRANT EXECUTE ON FUNCTION public.app_state_save(text, text, jsonb) TO anon;
GRANT EXECUTE ON FUNCTION public.app_default_save(text, text, text, jsonb) TO anon;

-- ============================================================
-- 3B. RPC POUR LA SUSPENSION / REACTIVATION UTILISATEURS
-- ============================================================
-- Ne remplace pas les auth_* existantes.
-- Permet au front de gérer un statut actif/inactif avec écran de masse.

CREATE OR REPLACE FUNCTION public.app_user_status_get(
  p_username      text,
  p_password_hash text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user record;
BEGIN
  SELECT username, COALESCE(is_active, true) AS is_active, suspended_at, suspended_by
  INTO v_user
  FROM public.app_users
  WHERE username = p_username
    AND password_hash = p_password_hash;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;

  RETURN jsonb_build_object(
    'username', v_user.username,
    'is_active', v_user.is_active,
    'suspended_at', v_user.suspended_at,
    'suspended_by', v_user.suspended_by
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.app_admin_list_user_status(
  p_admin_username text,
  p_admin_hash     text
)
RETURNS TABLE (
  username text,
  is_active boolean,
  suspended_at timestamptz,
  suspended_by text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
BEGIN
  SELECT role INTO v_role
  FROM public.app_users
  WHERE username = p_admin_username
    AND password_hash = p_admin_hash;

  IF v_role IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    u.username,
    COALESCE(u.is_active, true) AS is_active,
    u.suspended_at,
    u.suspended_by
  FROM public.app_users u
  ORDER BY lower(u.display_name), lower(u.username);
END;
$$;

CREATE OR REPLACE FUNCTION public.app_admin_set_users_active(
  p_admin_username text,
  p_admin_hash     text,
  p_usernames      text[],
  p_is_active      boolean
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
  v_count integer := 0;
BEGIN
  SELECT role INTO v_role
  FROM public.app_users
  WHERE username = p_admin_username
    AND password_hash = p_admin_hash;

  IF v_role IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;

  IF p_usernames IS NULL OR array_length(p_usernames, 1) IS NULL THEN
    RETURN 0;
  END IF;

  IF NOT p_is_active AND p_admin_username = ANY(p_usernames) THEN
    RAISE EXCEPTION 'cannot_suspend_self' USING ERRCODE = '22023';
  END IF;

  UPDATE public.app_users
  SET
    is_active = p_is_active,
    suspended_at = CASE WHEN p_is_active THEN NULL ELSE now() END,
    suspended_by = CASE WHEN p_is_active THEN NULL ELSE p_admin_username END
  WHERE username = ANY(p_usernames);

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.app_user_status_get(text, text) TO anon;
GRANT EXECUTE ON FUNCTION public.app_admin_list_user_status(text, text) TO anon;
GRANT EXECUTE ON FUNCTION public.app_admin_set_users_active(text, text, text[], boolean) TO anon;

-- ============================================================
-- 4. RPC SECURISEE POUR LE PLAN D'ACTION
-- ============================================================
-- Ecriture reservee aux editor et admin.
-- L'application utilise cette RPC car le client Supabase est en role anon.

CREATE OR REPLACE FUNCTION public.app_action_save(
  p_username      text,
  p_password_hash text,
  p_action        jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
  v_id uuid;
  v_project_id text;
  v_action_code text;
BEGIN
  SELECT role INTO v_role
  FROM public.app_users
  WHERE username = p_username
    AND password_hash = p_password_hash;

  IF v_role NOT IN ('editor', 'admin') THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;

  v_project_id := NULLIF(p_action->>'project_id', '');
  v_action_code := NULLIF(p_action->>'action_code', '');

  IF v_project_id IS NULL OR v_action_code IS NULL OR NULLIF(p_action->>'label', '') IS NULL THEN
    RAISE EXCEPTION 'project_id, action_code and label are required' USING ERRCODE = '22023';
  END IF;

  SELECT id INTO v_id
  FROM public.actions
  WHERE project_id = v_project_id
    AND action_code = v_action_code
  ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST
  LIMIT 1;

  IF v_id IS NULL THEN
    INSERT INTO public.actions (
      project_id, action_code, label, domain, domains, resp,
      deadline, urgency, rag, pct, commentaire, source, email,
      date_fin, is_custom, updated_at
    )
    VALUES (
      v_project_id,
      v_action_code,
      p_action->>'label',
      NULLIF(p_action->>'domain', ''),
      COALESCE(p_action->'domains', '[]'::jsonb),
      NULLIF(p_action->>'resp', ''),
      NULLIF(p_action->>'deadline', '')::date,
      COALESCE(NULLIF(p_action->>'urgency', ''), 'Normale'),
      COALESCE(NULLIF(p_action->>'rag', ''), 'X'),
      COALESCE(NULLIF(p_action->>'pct', '')::integer, 0),
      NULLIF(p_action->>'commentaire', ''),
      NULLIF(p_action->>'source', ''),
      NULLIF(p_action->>'email', ''),
      NULLIF(p_action->>'date_fin', '')::date,
      COALESCE((p_action->>'is_custom')::boolean, true),
      now()
    )
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.actions
    SET
      label = p_action->>'label',
      domain = NULLIF(p_action->>'domain', ''),
      domains = COALESCE(p_action->'domains', '[]'::jsonb),
      resp = NULLIF(p_action->>'resp', ''),
      deadline = NULLIF(p_action->>'deadline', '')::date,
      urgency = COALESCE(NULLIF(p_action->>'urgency', ''), 'Normale'),
      rag = COALESCE(NULLIF(p_action->>'rag', ''), 'X'),
      pct = COALESCE(NULLIF(p_action->>'pct', '')::integer, 0),
      commentaire = NULLIF(p_action->>'commentaire', ''),
      source = NULLIF(p_action->>'source', ''),
      email = NULLIF(p_action->>'email', ''),
      date_fin = NULLIF(p_action->>'date_fin', '')::date,
      is_custom = COALESCE((p_action->>'is_custom')::boolean, true),
      updated_at = now()
    WHERE id = v_id;
  END IF;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.app_action_save(text, text, jsonb) TO anon;

-- ============================================================
-- 5. VERROUILLAGE DES ACCES DIRECTS ANON
-- ============================================================
-- Important: les policies RLS sont permissives par defaut (OR logique).
-- On supprime donc les anciennes policies anon/public de project_state
-- avant d'ajouter une policy explicitement bloquante pour anon.

ALTER TABLE public.project_state ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  p record;
BEGIN
  FOR p IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'project_state'
      AND ('anon' = ANY(roles) OR 'public' = ANY(roles))
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.project_state', p.policyname);
  END LOOP;
END;
$$;

DROP POLICY IF EXISTS "project_state_no_direct_anon" ON public.project_state;

CREATE POLICY "project_state_no_direct_anon"
  ON public.project_state
  FOR ALL
  TO anon
  USING (false)
  WITH CHECK (false);

-- app_defaults: garder la lecture directe, bloquer seulement les ecritures
-- directes anonymes. L'application ecrit via app_default_save().

ALTER TABLE public.app_defaults ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "app_defaults_write_auth" ON public.app_defaults;
DROP POLICY IF EXISTS "app_defaults_no_direct_anon_insert" ON public.app_defaults;
DROP POLICY IF EXISTS "app_defaults_no_direct_anon_update" ON public.app_defaults;
DROP POLICY IF EXISTS "app_defaults_no_direct_anon_delete" ON public.app_defaults;

CREATE POLICY "app_defaults_no_direct_anon_insert"
  ON public.app_defaults
  FOR INSERT
  TO anon
  WITH CHECK (false);

CREATE POLICY "app_defaults_no_direct_anon_update"
  ON public.app_defaults
  FOR UPDATE
  TO anon
  USING (false)
  WITH CHECK (false);

CREATE POLICY "app_defaults_no_direct_anon_delete"
  ON public.app_defaults
  FOR DELETE
  TO anon
  USING (false);

COMMIT;

-- ============================================================
-- VERIFICATIONS MANUELLES APRES EXECUTION
-- ============================================================
-- 1. Verifier les backups:
-- SELECT count(*) FROM public.backup_app_users_priority1_20260415;
-- SELECT count(*) FROM public.backup_project_state_priority1_20260415;
-- SELECT count(*) FROM public.backup_app_defaults_priority1_20260415;
--
-- 2. Verifier les nouvelles RPC:
-- SELECT public.app_state_get('<username>', '<sha256_password_hash>');
--
-- 3. Verifier que l'ecriture directe anon est bloquee:
-- depuis l'application, les sauvegardes doivent passer par app_state_save().
-- ============================================================
