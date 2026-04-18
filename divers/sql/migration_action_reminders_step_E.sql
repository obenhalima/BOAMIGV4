-- ============================================================
-- Etape E - Journalisation des relances actions
-- A executer dans Supabase SQL Editor
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.action_reminders (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id          text NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  action_db_id        uuid NULL REFERENCES public.actions(id) ON DELETE SET NULL,
  action_code         text NOT NULL,
  recipient_to        text NOT NULL,
  recipient_cc        text NULL,
  subject             text NOT NULL,
  body_text           text NOT NULL,
  provider            text NOT NULL DEFAULT 'resend',
  provider_message_id text NULL,
  status              text NOT NULL DEFAULT 'sent',
  sent_by             text NOT NULL,
  error_message       text NULL,
  sent_at             timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_action_reminders_project_id
  ON public.action_reminders(project_id, sent_at DESC);

CREATE INDEX IF NOT EXISTS idx_action_reminders_action_code
  ON public.action_reminders(action_code, sent_at DESC);

ALTER TABLE public.action_reminders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "action_reminders_no_direct_anon" ON public.action_reminders;

CREATE POLICY "action_reminders_no_direct_anon"
  ON public.action_reminders
  FOR ALL
  TO anon
  USING (false)
  WITH CHECK (false);

COMMIT;
