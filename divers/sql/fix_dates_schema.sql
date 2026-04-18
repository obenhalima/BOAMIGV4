-- ═══════════════════════════════════════════════════════════════════════════════
-- FIX — Colonnes deadline/date en TEXT (formats mixtes fr/iso dans les données)
-- À exécuter dans Supabase SQL Editor avant de relancer migrate_to_v2.sql
-- ═══════════════════════════════════════════════════════════════════════════════

-- Arbitrages : deadline TEXT
ALTER TABLE arbitrages ALTER COLUMN deadline TYPE TEXT USING deadline::TEXT;

-- Actions : deadline + date_fin TEXT
ALTER TABLE actions ALTER COLUMN deadline  TYPE TEXT USING deadline::TEXT;
ALTER TABLE actions ALTER COLUMN date_fin  TYPE TEXT USING date_fin::TEXT;

-- Gantt tasks : start_date + end_date TEXT
ALTER TABLE gantt_tasks ALTER COLUMN start_date TYPE TEXT USING start_date::TEXT;
ALTER TABLE gantt_tasks ALTER COLUMN end_date   TYPE TEXT USING end_date::TEXT;

-- Gantt subtasks
ALTER TABLE gantt_subtasks ALTER COLUMN start_date TYPE TEXT USING start_date::TEXT;
ALTER TABLE gantt_subtasks ALTER COLUMN end_date   TYPE TEXT USING end_date::TEXT;

-- Interfaces : target_date TEXT
ALTER TABLE interfaces ALTER COLUMN target_date TYPE TEXT USING target_date::TEXT;

-- Risks : pas de date → OK

-- Programme milestones : value reste DATE (saisie contrôlée dans l'UI)
-- (pas de modification nécessaire)

SELECT 'Colonnes dates converties en TEXT ✅';
