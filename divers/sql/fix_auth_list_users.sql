-- ============================================================
-- Fix : auth_list_users — ajouter la colonne permissions
-- BOA Afrique — IGOR V2→V4
-- À exécuter dans : Supabase > SQL Editor
-- ============================================================

-- auth_list_users doit retourner permissions pour que le
-- modal ⚙️ Accès affiche les permissions courantes de chaque user

DROP FUNCTION IF EXISTS public.auth_list_users(text, text);

CREATE FUNCTION public.auth_list_users(
  p_admin_username text,
  p_admin_hash     text
)
RETURNS TABLE(
  username             text,
  display_name         text,
  role                 text,
  must_change_password boolean,
  created_at           timestamptz,
  last_login           timestamptz,
  permissions          jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_admin_role text;
BEGIN
  SELECT role INTO v_admin_role
  FROM public.app_users
  WHERE username      = p_admin_username
    AND password_hash = p_admin_hash;

  IF v_admin_role IS NULL OR v_admin_role NOT IN ('editor', 'admin') THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    u.username,
    u.display_name,
    u.role,
    u.must_change_password,
    u.created_at,
    u.last_login,
    u.permissions
  FROM public.app_users u
  ORDER BY u.created_at;
END;
$$;

-- Vérification
SELECT proname, pronargs FROM pg_proc WHERE proname = 'auth_list_users';
