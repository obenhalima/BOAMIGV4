-- ═══════════════════════════════════════════════════════════════════════════════
-- MIGRATION v2 — app_defaults → tables relationnelles
-- Prérequis : supabase_schema_v2.sql + fix_dates_schema.sql déjà exécutés
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- Nettoyage préalable (pour pouvoir relancer sans erreur de doublons)
-- ─────────────────────────────────────────────────────────────────────────────
DELETE FROM gaps        WHERE project_id = 'proj_boa_ci';
DELETE FROM arbitrages  WHERE project_id = 'proj_boa_ci';
DELETE FROM actions     WHERE project_id = 'proj_boa_ci';
DELETE FROM interfaces  WHERE project_id = 'proj_boa_ci';

-- ─────────────────────────────────────────────────────────────────────────────
-- ÉTAPE 1 : Gaps
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO gaps (
  project_id, ref, domain, domains, processus, description,
  priority, phase, bm, resp, decision, note, is_custom
)
SELECT
  'proj_boa_ci',
  item->>'ref',
  COALESCE(item->>'domain', ''),
  COALESCE(item->'domains', '[]'::jsonb),
  COALESCE(item->>'processus', ''),
  COALESCE(item->>'desc', item->>'description', ''),
  COALESCE(item->>'prio', item->>'priority', 'P2'),
  COALESCE(item->>'phase', 'I'),
  COALESCE(item->>'bm', ''),
  COALESCE(item->>'resp', ''),
  COALESCE(item->>'decision', 'En attente'),
  COALESCE(item->>'note', ''),
  COALESCE((item->>'_custom')::boolean, false)
FROM app_defaults, jsonb_array_elements(data) AS item
WHERE key = 'gaps' AND (item->>'ref') IS NOT NULL;

SELECT 'GAPS : ' || COUNT(*) || ' lignes insérées' AS resultat
FROM gaps WHERE project_id = 'proj_boa_ci';

-- ─────────────────────────────────────────────────────────────────────────────
-- ÉTAPE 2 : Arbitrages (deadline conservé tel quel en TEXT)
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO arbitrages (
  project_id, label, domain, priority, resp,
  deadline, decision, commentaire, is_custom
)
SELECT
  'proj_boa_ci',
  COALESCE(item->>'label', 'Sans titre'),
  COALESCE(item->>'domain', ''),
  COALESCE(item->>'prio', item->>'priority', 'P2'),
  COALESCE(item->>'resp', ''),
  NULLIF(item->>'deadline', ''),          -- TEXT, pas de cast DATE
  COALESCE(item->>'decision', 'en_cours'),
  COALESCE(item->>'commentaire', ''),
  COALESCE((item->>'_custom')::boolean, false)
FROM app_defaults, jsonb_array_elements(data) AS item
WHERE key = 'arbitrages' AND (item->>'label') IS NOT NULL;

SELECT 'ARBITRAGES : ' || COUNT(*) || ' lignes insérées' AS resultat
FROM arbitrages WHERE project_id = 'proj_boa_ci';

-- ─────────────────────────────────────────────────────────────────────────────
-- ÉTAPE 3 : Actions (deadline en TEXT)
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO actions (
  project_id, action_code, label, domain, domains,
  resp, deadline, urgency, rag, pct, commentaire, source, is_custom
)
SELECT
  'proj_boa_ci',
  COALESCE(item->>'id', 'ACT_' || gen_random_uuid()::text),
  COALESCE(item->>'action', item->>'label', 'Action'),
  COALESCE(item->>'domain', ''),
  COALESCE(item->'domains', '[]'::jsonb),
  COALESCE(item->>'resp', ''),
  NULLIF(item->>'echeance', NULLIF(item->>'deadline', '')),   -- TEXT
  COALESCE(item->>'urgence', item->>'urgency', 'Normale'),
  COALESCE(item->>'rag', 'X'),
  COALESCE((item->>'pct')::integer, 0),
  COALESCE(item->>'commentaire', ''),
  COALESCE(item->>'source', ''),
  COALESCE((item->>'_custom')::boolean, false)
FROM app_defaults, jsonb_array_elements(data) AS item
WHERE key = 'actions'
  AND (item->>'action' IS NOT NULL OR item->>'label' IS NOT NULL);

SELECT 'ACTIONS : ' || COUNT(*) || ' lignes insérées' AS resultat
FROM actions WHERE project_id = 'proj_boa_ci';

-- ─────────────────────────────────────────────────────────────────────────────
-- ÉTAPE 4 : Interfaces (target_date en TEXT)
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO interfaces (
  project_id, name, status, impact, comments, resp, target_date, actions
)
SELECT
  'proj_boa_ci',
  COALESCE(item->>'name', 'Interface'),
  COALESCE(item->>'status', 'pending_boa'),
  COALESCE(item->>'impact', 'tbd'),
  COALESCE(item->'comments', '[]'::jsonb),
  COALESCE(item->>'resp', ''),
  NULLIF(item->>'targetDate', ''),        -- TEXT
  COALESCE(item->'actions', '[]'::jsonb)
FROM app_defaults, jsonb_array_elements(data) AS item
WHERE key = 'interfaces' AND (item->>'name') IS NOT NULL;

SELECT 'INTERFACES : ' || COUNT(*) || ' lignes insérées' AS resultat
FROM interfaces WHERE project_id = 'proj_boa_ci';

-- ─────────────────────────────────────────────────────────────────────────────
-- ÉTAPE 5 : Owners & Streams
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO owners (name)
SELECT DISTINCT jsonb_array_elements_text(data)
FROM app_defaults WHERE key = 'owners'
ON CONFLICT (name) DO NOTHING;

INSERT INTO streams (name)
SELECT DISTINCT
  CASE
    WHEN jsonb_typeof(elem) = 'object' THEN elem->>'name'
    ELSE elem #>> '{}'
  END
FROM app_defaults, jsonb_array_elements(data) AS elem
WHERE key = 'streams'
  AND (CASE WHEN jsonb_typeof(elem) = 'object' THEN elem->>'name' ELSE elem #>> '{}' END) IS NOT NULL
ON CONFLICT (name) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- RÉSUMÉ
-- ─────────────────────────────────────────────────────────────────────────────
SELECT table_name, lignes FROM (
  SELECT 'gaps'        AS table_name, COUNT(*) AS lignes FROM gaps       WHERE project_id='proj_boa_ci' UNION ALL
  SELECT 'arbitrages',                COUNT(*)            FROM arbitrages WHERE project_id='proj_boa_ci' UNION ALL
  SELECT 'actions',                   COUNT(*)            FROM actions    WHERE project_id='proj_boa_ci' UNION ALL
  SELECT 'interfaces',                COUNT(*)            FROM interfaces WHERE project_id='proj_boa_ci' UNION ALL
  SELECT 'owners',                    COUNT(*)            FROM owners                                    UNION ALL
  SELECT 'streams',                   COUNT(*)            FROM streams
) t ORDER BY table_name;
