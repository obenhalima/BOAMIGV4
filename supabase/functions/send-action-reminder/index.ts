import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type ReminderPayload = {
  admin_username: string;
  admin_hash: string;
  project_id: string;
  action_id?: string;
  action_db_id?: string | null;
  to: string;
  cc?: string | null;
  subject: string;
  body: string;
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const REMINDER_FROM_EMAIL = Deno.env.get("REMINDER_FROM_EMAIL") ?? "";
const REMINDER_FROM_NAME = Deno.env.get("REMINDER_FROM_NAME") ?? "BOA Pilotage Programme";

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function bodyToHtml(body: string) {
  return escapeHtml(body).replace(/\r?\n/g, "<br>");
}

function parseRecipients(value?: string | null) {
  return String(value || "")
    .split(/[;,]/)
    .map((v) => v.trim())
    .filter(Boolean);
}

async function sendViaResend(payload: ReminderPayload) {
  const to = parseRecipients(payload.to);
  const cc = parseRecipients(payload.cc);

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${RESEND_API_KEY}`,
    },
    body: JSON.stringify({
      from: `${REMINDER_FROM_NAME} <${REMINDER_FROM_EMAIL}>`,
      to,
      cc: cc.length ? cc : undefined,
      subject: payload.subject,
      text: payload.body,
      html: `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.6;color:#111827;">${bodyToHtml(payload.body)}</div>`,
    }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.message || data?.error || `Resend error ${response.status}`);
  }
  return data;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return json({ error: "missing_supabase_env" }, 500);
  }
  if (!RESEND_API_KEY || !REMINDER_FROM_EMAIL) {
    return json({ error: "missing_mail_env" }, 500);
  }

  let payload: ReminderPayload;
  try {
    payload = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  if (
    !payload?.admin_username ||
    !payload?.admin_hash ||
    !payload?.project_id ||
    !payload?.to ||
    !payload?.subject ||
    !payload?.body
  ) {
    return json({ error: "missing_required_fields" }, 400);
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: user, error: userError } = await admin
    .from("app_users")
    .select("username, role, is_active")
    .eq("username", payload.admin_username)
    .eq("password_hash", payload.admin_hash)
    .maybeSingle();

  if (userError) return json({ error: userError.message }, 500);
  if (!user || !["admin", "editor"].includes(String(user.role || "")) || user.is_active === false) {
    return json({ error: "unauthorized" }, 403);
  }

  let resendResult: Record<string, unknown> | null = null;
  try {
    resendResult = await sendViaResend(payload);

    const { error: logError } = await admin.from("action_reminders").insert({
      project_id: payload.project_id,
      action_db_id: payload.action_db_id || null,
      action_code: payload.action_id || "",
      recipient_to: payload.to,
      recipient_cc: payload.cc || null,
      subject: payload.subject,
      body_text: payload.body,
      provider: "resend",
      provider_message_id: String(resendResult?.id || ""),
      status: "sent",
      sent_by: payload.admin_username,
    });

    if (logError) console.warn("[send-action-reminder] log insert:", logError.message);

    return json({
      ok: true,
      provider: "resend",
      id: resendResult?.id ?? null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    const { error: logError } = await admin.from("action_reminders").insert({
      project_id: payload.project_id,
      action_db_id: payload.action_db_id || null,
      action_code: payload.action_id || "",
      recipient_to: payload.to,
      recipient_cc: payload.cc || null,
      subject: payload.subject,
      body_text: payload.body,
      provider: "resend",
      provider_message_id: String(resendResult?.id || ""),
      status: "failed",
      sent_by: payload.admin_username,
      error_message: message,
    });

    if (logError) console.warn("[send-action-reminder] failed log insert:", logError.message);
    return json({ error: message }, 502);
  }
});
