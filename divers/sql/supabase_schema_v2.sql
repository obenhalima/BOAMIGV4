-- ═══════════════════════════════════════════════════════════════════════════════
-- BOA Programme Pilotage — Schéma relationnel Supabase v2
-- Généré le : 2026-03-20
-- ═══════════════════════════════════════════════════════════════════════════════

-- Extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. PROGRAMME
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS programmes (
  id           TEXT PRIMARY KEY DEFAULT 'prog_main',
  name         TEXT NOT NULL DEFAULT 'Mon Programme',
  description  TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. MILESTONES DU PROGRAMME
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS programme_milestones (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  programme_id   TEXT NOT NULL REFERENCES programmes(id) ON DELETE CASCADE,
  key            TEXT NOT NULL,        -- 'design_freeze' | 'go_live' | 'gantt_start' | 'gantt_end'
  value          DATE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(programme_id, key)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. PROJETS
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS projects (
  id               TEXT PRIMARY KEY,
  programme_id     TEXT NOT NULL REFERENCES programmes(id) ON DELETE CASCADE,
  name             TEXT NOT NULL,
  color            TEXT DEFAULT '#1565C0',
  status           TEXT DEFAULT 'active',   -- 'active' | 'closed' | 'on_hold'
  description      TEXT,
  data_source      TEXT DEFAULT 'blank',    -- 'blank' | 'cbs'
  enabled_modules  JSONB DEFAULT '[]',
  sort_order       INTEGER DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. OWNERS (référentiel partagé)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS owners (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL UNIQUE,
  email       TEXT,
  role        TEXT,
  domain      TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. STREAMS (référentiel partagé)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS streams (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL UNIQUE,
  color       TEXT DEFAULT '#1565C0',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. GAPS
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS gaps (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  TEXT REFERENCES projects(id) ON DELETE CASCADE,
  ref         TEXT NOT NULL,
  domain      TEXT,
  domains     JSONB DEFAULT '[]',
  processus   TEXT,
  description TEXT NOT NULL,
  priority    TEXT DEFAULT 'P2',      -- 'P1' | 'P2' | 'P3'
  phase       TEXT DEFAULT 'I',       -- 'I' | 'II' | 'III'
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

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. ARBITRAGES
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS arbitrages (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id   TEXT REFERENCES projects(id) ON DELETE CASCADE,
  label        TEXT NOT NULL,
  domain       TEXT,
  priority     TEXT DEFAULT 'P2',
  resp         TEXT,
  deadline     DATE,
  decision     TEXT DEFAULT 'en_cours',  -- 'en_cours' | 'maintien' | 'integration' | 'abandon'
  commentaire  TEXT,
  is_custom    BOOLEAN DEFAULT FALSE,
  sort_order   INTEGER DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. ACTIONS
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS actions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id   TEXT REFERENCES projects(id) ON DELETE CASCADE,
  action_code  TEXT NOT NULL,           -- code affiché dans l'UI (ex: "A001")
  label        TEXT NOT NULL,
  domain       TEXT,
  domains      JSONB DEFAULT '[]',
  resp         TEXT,
  deadline     DATE,
  urgency      TEXT DEFAULT 'Normale',
  rag          TEXT DEFAULT 'X',        -- 'G' | 'O' | 'R' | 'X'
  pct          INTEGER DEFAULT 0,
  commentaire  TEXT,
  source       TEXT,
  email        TEXT,
  date_fin     DATE,
  is_custom    BOOLEAN DEFAULT FALSE,
  sort_order   INTEGER DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 9. INTERFACES TECHNIQUES
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS interfaces (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id   TEXT REFERENCES projects(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  status       TEXT DEFAULT 'pending_boa',  -- 'done' | 'partial' | 'pending_boa' | 'pending_cbs'
  impact       TEXT DEFAULT 'tbd',          -- 'no_impact' | 'minor' | 'multiple' | 'tbd'
  comments     JSONB DEFAULT '[]',
  resp         TEXT,
  target_date  DATE,
  actions      JSONB DEFAULT '[]',
  sort_order   INTEGER DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 10. TÂCHES GANTT
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS gantt_tasks (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id   TEXT REFERENCES projects(id) ON DELETE CASCADE,
  task_key     TEXT NOT NULL,            -- clé interne (ex: "phase_deploiement")
  label        TEXT NOT NULL,
  type         TEXT DEFAULT 'task',      -- 'phase' | 'task' | 'milestone'
  start_date   DATE,
  end_date     DATE,
  progress     INTEGER DEFAULT 0,
  parent_key   TEXT,                     -- référence à task_key du parent
  sort_order   INTEGER DEFAULT 0,
  is_custom    BOOLEAN DEFAULT FALSE,
  is_hidden    BOOLEAN DEFAULT FALSE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(project_id, task_key)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 11. SOUS-TÂCHES GANTT
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS gantt_subtasks (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gantt_task_id   UUID NOT NULL REFERENCES gantt_tasks(id) ON DELETE CASCADE,
  project_id      TEXT REFERENCES projects(id) ON DELETE CASCADE,
  label           TEXT NOT NULL,
  owner           TEXT,
  start_date      DATE,
  end_date        DATE,
  progress        INTEGER DEFAULT 0,
  sort_order      INTEGER DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 12. RISQUES
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS risks (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id   TEXT REFERENCES projects(id) ON DELETE CASCADE,
  description  TEXT NOT NULL,
  probability  TEXT DEFAULT 'Moyen',    -- 'Faible' | 'Moyen' | 'Élevé'
  impact       TEXT DEFAULT 'Moyen',    -- 'Faible' | 'Moyen' | 'Élevé'
  mitigation   TEXT,
  status       TEXT DEFAULT 'Ouvert',   -- 'Ouvert' | 'En cours' | 'Mitigé' | 'Fermé'
  owner        TEXT,
  category     TEXT,
  sort_order   INTEGER DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 13. PÉRIMÈTRE MODULES
-- ─────────────────────────────────────────────────────────────────────────────
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

-- ─────────────────────────────────────────────────────────────────────────────
-- 14. ARCHITECTURE TECHNIQUE
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS architecture (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  TEXT REFERENCES projects(id) ON DELETE CASCADE,
  type        TEXT NOT NULL,   -- 'component' | 'layer' | 'dependency'
  label       TEXT NOT NULL,
  description TEXT,
  status      TEXT DEFAULT 'active',
  data        JSONB DEFAULT '{}',
  sort_order  INTEGER DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 15. HISTORIQUE DES MODIFICATIONS
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS history (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type   TEXT NOT NULL,    -- 'gap' | 'arbitrage' | 'action' | 'interface' | 'risk' | ...
  entity_id     UUID,
  entity_ref    TEXT,             -- ref lisible (ex: "GAP-RC-001") pour traçabilité
  project_id    TEXT REFERENCES projects(id) ON DELETE SET NULL,
  changed_by    TEXT DEFAULT 'Utilisateur',
  changed_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  action_type   TEXT NOT NULL,    -- 'created' | 'updated' | 'deleted'
  changes       JSONB DEFAULT '[]'  -- [{field, label, old, new}]
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 16. INDEX DE PERFORMANCE
-- ─────────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_gaps_project        ON gaps(project_id);
CREATE INDEX IF NOT EXISTS idx_gaps_priority       ON gaps(priority);
CREATE INDEX IF NOT EXISTS idx_gaps_decision       ON gaps(decision);
CREATE INDEX IF NOT EXISTS idx_arb_project         ON arbitrages(project_id);
CREATE INDEX IF NOT EXISTS idx_arb_decision        ON arbitrages(decision);
CREATE INDEX IF NOT EXISTS idx_actions_project     ON actions(project_id);
CREATE INDEX IF NOT EXISTS idx_actions_rag         ON actions(rag);
CREATE INDEX IF NOT EXISTS idx_interfaces_project  ON interfaces(project_id);
CREATE INDEX IF NOT EXISTS idx_gantt_project       ON gantt_tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_risks_project       ON risks(project_id);
CREATE INDEX IF NOT EXISTS idx_history_entity      ON history(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_history_project     ON history(project_id);
CREATE INDEX IF NOT EXISTS idx_history_date        ON history(changed_at DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- 17. TRIGGERS — updated_at automatique
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION trigger_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'programmes','projects','gaps','arbitrages','actions',
    'interfaces','gantt_tasks','gantt_subtasks','risks',
    'perimeter_modules','architecture','programme_milestones'
  ] LOOP
    EXECUTE format('
      DROP TRIGGER IF EXISTS set_updated_at ON %I;
      CREATE TRIGGER set_updated_at
        BEFORE UPDATE ON %I
        FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
    ', t, t);
  END LOOP;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 18. ROW LEVEL SECURITY (RLS)
-- ─────────────────────────────────────────────────────────────────────────────
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

-- Politique par défaut : accès complet pour les utilisateurs authentifiés
-- (à affiner selon les rôles métier : admin, éditeur, lecteur)
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'programmes','projects','gaps','arbitrages','actions','interfaces',
    'gantt_tasks','gantt_subtasks','risks','perimeter_modules',
    'architecture','history','owners','streams','programme_milestones'
  ] LOOP
    EXECUTE format('
      DROP POLICY IF EXISTS "auth_full_access" ON %I;
      CREATE POLICY "auth_full_access" ON %I
        FOR ALL TO authenticated USING (true) WITH CHECK (true);
    ', t, t);
    -- Lecture publique temporaire (à retirer en production)
    EXECUTE format('
      DROP POLICY IF EXISTS "anon_read" ON %I;
      CREATE POLICY "anon_read" ON %I
        FOR SELECT TO anon USING (true);
    ', t, t);
  END LOOP;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 19. SEED — Programme et projet par défaut
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO programmes (id, name, description)
VALUES ('prog_main', 'Programme BOA Côte d''Ivoire', 'Upgrade IGOR V2 → V4 — CBS CapitalBanker')
ON CONFLICT (id) DO NOTHING;

INSERT INTO projects (id, programme_id, name, color, status, description, data_source)
VALUES (
  'proj_boa_ci', 'prog_main',
  'BOA CI — IGOR V4', '#1565C0', 'active',
  'Projet de migration CBS CapitalBanker', 'cbs'
)
ON CONFLICT (id) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- FIN DU SCHÉMA
-- ═══════════════════════════════════════════════════════════════════════════════
