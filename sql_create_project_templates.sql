-- ============================================================
-- BOA Programme Pilotage — Table project_templates
-- À exécuter une fois dans Supabase SQL Editor
-- ============================================================

CREATE TABLE IF NOT EXISTS project_templates (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT        NOT NULL,
  description  TEXT,
  icon         TEXT        DEFAULT '📋',
  created_by   TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW(),
  template_data JSONB      NOT NULL DEFAULT '{}'::JSONB
);

-- Index pour lecture rapide (ordre chrono)
CREATE INDEX IF NOT EXISTS idx_project_templates_created_at
  ON project_templates (created_at DESC);

-- Row Level Security (optionnel — à activer si vous utilisez RLS)
-- ALTER TABLE project_templates ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "All users can read templates" ON project_templates
--   FOR SELECT USING (true);
-- CREATE POLICY "Admins can write templates" ON project_templates
--   FOR ALL USING (true);
