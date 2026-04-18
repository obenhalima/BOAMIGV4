-- ============================================================
-- Migration Permissions par utilisateur
-- BOA Afrique — IGOR V2→V4
-- À exécuter dans : Supabase > SQL Editor
-- ============================================================

-- 1. Ajouter la colonne permissions dans app_users
ALTER TABLE public.app_users
  ADD COLUMN IF NOT EXISTS permissions jsonb DEFAULT NULL;

-- 2. RPC pour mettre à jour les permissions (admin only)
CREATE OR REPLACE FUNCTION public.auth_update_permissions(
  p_admin_username  text,
  p_admin_hash      text,
  p_target_username text,
  p_permissions     jsonb
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_admin_role text;
BEGIN
  SELECT role INTO v_admin_role
  FROM public.app_users
  WHERE username = p_admin_username
    AND password_hash = p_admin_hash;

  IF v_admin_role IS NULL OR v_admin_role <> 'admin' THEN
    RETURN false;
  END IF;

  UPDATE public.app_users
    SET permissions = p_permissions
  WHERE username = p_target_username;

  RETURN true;
END;
$$;

-- 3. Mettre à jour auth_login pour retourner aussi permissions
-- (DROP requis car le type de retour change — PostgreSQL ne permet pas CREATE OR REPLACE dans ce cas)
DROP FUNCTION IF EXISTS public.auth_login(text, text);

CREATE FUNCTION public.auth_login(
  p_username      text,
  p_password_hash text
)
RETURNS TABLE(
  display_name        text,
  role                text,
  must_change_password boolean,
  permissions         jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    u.display_name,
    u.role,
    u.must_change_password,
    u.permissions
  FROM public.app_users u
  WHERE u.username      = p_username
    AND u.password_hash = p_password_hash;

  IF FOUND THEN
    UPDATE public.app_users
      SET last_login = now()
    WHERE username = p_username;
  END IF;
END;
$$;

-- 4. Vérification
SELECT username, display_name, role,
       CASE WHEN permissions IS NULL THEN '(accès total)' ELSE permissions::text END AS permissions
FROM public.app_users
ORDER BY role, username;
