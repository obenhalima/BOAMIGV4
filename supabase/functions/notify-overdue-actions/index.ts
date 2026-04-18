// ═══════════════════════════════════════════════════════════════════════════
// notify-overdue-actions  — Edge Function Supabase
// Déclenché par cron-job.org (POST quotidien)
// Envoie 1 email par projet actif avec :
//   • les actions en retard  (echeance < aujourd'hui, statut ≠ done)
//   • les actions à échéance dans les 15 prochains jours
//
// Structure réelle des données (projet BOA CI - Upgrade) :
//   projectData[pid].customActions[]   → définitions : id, action, label,
//                                        resp, echeance, rag, urgence …
//   projectData[pid].actions{}         → suivi : {status, pct, duree, dateDebut}
//                                        clé = action.id
// ═══════════════════════════════════════════════════════════════════════════

const SUPABASE_URL          = Deno.env.get("SUPABASE_URL")             ?? "";
const SUPABASE_SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const RESEND_API_KEY        = Deno.env.get("RESEND_API_KEY")            ?? "";
const CRON_SECRET           = Deno.env.get("CRON_SECRET")               ?? "";
const FROM_EMAIL            = Deno.env.get("FROM_EMAIL")                ?? "onboarding@resend.dev";
const FROM_NAME             = Deno.env.get("FROM_NAME")                 ?? "BOA Pilotage";
const ALERT_EMAIL           = Deno.env.get("ALERT_EMAIL")               ?? "";

// ─── Helpers ────────────────────────────────────────────────────────────────

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function isValidDate(d: unknown): d is string {
  if (typeof d !== "string" || !d.trim()) return false;
  return !isNaN(Date.parse(d));
}

function daysBetween(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / 86_400_000);
}

function isDone(status: string, pct: number): boolean {
  return /^(done|completed|terminé|termine|closed|annulé|annule|cancelled)/i.test(status)
    || pct >= 100;
}

// ─── Lire l'état applicatif depuis project_state ───────────────────────────
// Récupère les 50 dernières lignes et retourne la première avec "programme"

async function fetchAppState(): Promise<Record<string, unknown> | null> {
  const url = `${SUPABASE_URL}/rest/v1/project_state?select=state_data&order=id.desc&limit=50`;
  const res = await fetch(url, {
    headers: {
      apikey: SUPABASE_SERVICE_ROLE,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE}`,
    },
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`project_state fetch error ${res.status}: ${txt}`);
  }
  const rows: Array<{ state_data: unknown }> = await res.json();
  for (const row of rows) {
    const sd = row?.state_data as Record<string, unknown> | null;
    if (sd && typeof sd === "object" && sd.programme) return sd;
  }
  return null;
}

// ─── Types ───────────────────────────────────────────────────────────────────

interface ActionDef {
  id:           string;
  action?:      string;
  label?:       string;
  resp?:        string;
  echeance?:    string | null;
  dateFin?:     string | null;
  rag?:         string;
  urgence?:     string;
  _ganttTaskId?: string;
}

interface ActionTracking {
  status?:    string;
  pct?:       number;
  duree?:     number;      // durée en jours calendaires
  dateDebut?: string;      // date de début (YYYY-MM-DD)
}

interface GanttTask {
  start?: string;
  end?:   string;
}

interface AlertAction {
  id:          string;
  libelle:     string;
  echeance:    string;
  status:      string;
  pct:         number;
  resp:        string;
  rag:         string;
  urgence:     string;
}

interface ProjectResult {
  projectName:  string;
  overdueCount: number;
  upcomingCount:number;
  emailSent:    boolean;
  resendId?:    string;
  error?:       string;
}

// ─── Email HTML ───────────────────────────────────────────────────────────────

function esc(s: string): string {
  return s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
}

function ragBadge(rag: string): string {
  const map: Record<string, string> = {
    R: "background:#fee2e2;color:#991b1b",
    A: "background:#fef3c7;color:#92400e",
    G: "background:#d1fae5;color:#065f46",
    X: "background:#f3f4f6;color:#6b7280",
  };
  const style = map[rag.toUpperCase()] ?? map["X"];
  return `<span style="display:inline-block;padding:1px 7px;border-radius:10px;font-size:11px;font-weight:700;${style}">${esc(rag||"—")}</span>`;
}

function tableHtml(actions: AlertAction[], color: string, title: string,
                   today: Date, isOverdue: boolean): string {
  if (actions.length === 0) return "";
  const rows = actions.map(a => {
    const dl = new Date(a.echeance);
    const days = isOverdue ? daysBetween(dl, today) : daysBetween(today, dl);
    const delaiLabel = isOverdue ? `${days}j de retard` : `dans ${days}j`;
    const delaiColor = isOverdue ? "#dc2626" : (days <= 5 ? "#d97706" : "#059669");
    return `<tr>
      <td style="padding:5px 10px;border:1px solid #e5e7eb;font-size:12px">${ragBadge(a.rag)}</td>
      <td style="padding:5px 10px;border:1px solid #e5e7eb">${esc(a.id)}</td>
      <td style="padding:5px 10px;border:1px solid #e5e7eb">${esc(a.libelle)}</td>
      <td style="padding:5px 10px;border:1px solid #e5e7eb">${dl.toLocaleDateString("fr-FR")}</td>
      <td style="padding:5px 10px;border:1px solid #e5e7eb;color:${delaiColor};font-weight:600">${delaiLabel}</td>
      <td style="padding:5px 10px;border:1px solid #e5e7eb">${esc(a.status)}&nbsp;(${a.pct}%)</td>
      <td style="padding:5px 10px;border:1px solid #e5e7eb">${esc(a.resp)}</td>
    </tr>`;
  }).join("");

  return `
<h3 style="color:${color};margin:24px 0 8px;font-size:15px">${title} (${actions.length})</h3>
<table style="width:100%;border-collapse:collapse;font-size:13px">
  <thead><tr style="background:#f3f4f6">
    <th style="padding:6px 10px;text-align:left;border:1px solid #e5e7eb">RAG</th>
    <th style="padding:6px 10px;text-align:left;border:1px solid #e5e7eb">ID</th>
    <th style="padding:6px 10px;text-align:left;border:1px solid #e5e7eb">Action</th>
    <th style="padding:6px 10px;text-align:left;border:1px solid #e5e7eb">Échéance</th>
    <th style="padding:6px 10px;text-align:left;border:1px solid #e5e7eb">Délai</th>
    <th style="padding:6px 10px;text-align:left;border:1px solid #e5e7eb">Statut</th>
    <th style="padding:6px 10px;text-align:left;border:1px solid #e5e7eb">Responsable</th>
  </tr></thead>
  <tbody>${rows}</tbody>
</table>`;
}

async function sendProjectEmail(
  projectName: string,
  overdue: AlertAction[],
  upcoming: AlertAction[],
  today: Date,
  recipients: string[],
): Promise<{ ok: boolean; id?: string; error?: string }> {

  const dateStr = today.toLocaleDateString("fr-FR");
  const subject = overdue.length > 0
    ? `🔴 [BOA] ${projectName} — ${overdue.length} action(s) en retard`
    : `🟡 [BOA] ${projectName} — ${upcoming.length} échéance(s) dans les 15j`;

  const bodyHtml = `
<div style="font-family:Arial,sans-serif;max-width:860px;margin:0 auto;color:#111827">
  <div style="background:#1e3a5f;color:white;padding:16px 24px;border-radius:8px 8px 0 0">
    <h2 style="margin:0;font-size:18px">📋 BOA Programme Pilotage</h2>
    <p style="margin:4px 0 0;opacity:.8;font-size:13px">Rapport du ${dateStr} — ${esc(projectName)}</p>
  </div>
  <div style="padding:20px 24px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px">
    ${tableHtml(overdue,  "#dc2626", "🔴 Actions en retard",              today, true)}
    ${tableHtml(upcoming, "#d97706", "🟡 Échéances dans les 15 prochains jours", today, false)}
    <p style="margin-top:24px;font-size:11px;color:#9ca3af;border-top:1px solid #f3f4f6;padding-top:12px">
      Notification automatique — BOA Programme Pilotage
    </p>
  </div>
</div>`;

  // Texte brut
  const lines = [
    `BOA Programme Pilotage — Rapport du ${dateStr} — ${projectName}`,
    "=".repeat(60),
  ];
  for (const a of overdue) {
    const days = daysBetween(new Date(a.echeance), today);
    lines.push(`[RETARD ${days}j] ${a.id} — ${a.libelle} (échéance ${a.echeance}) | ${a.resp}`);
  }
  for (const a of upcoming) {
    const days = daysBetween(today, new Date(a.echeance));
    lines.push(`[DANS ${days}j] ${a.id} — ${a.libelle} (échéance ${a.echeance}) | ${a.resp}`);
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${RESEND_API_KEY}`,
    },
    body: JSON.stringify({
      from: `${FROM_NAME} <${FROM_EMAIL}>`,
      to: recipients,
      subject,
      text: lines.join("\n"),
      html: bodyHtml,
    }),
  });

  const data = await res.json().catch(() => ({})) as Record<string, unknown>;
  if (!res.ok) {
    return { ok: false, error: String(data?.message ?? data?.error ?? `Resend ${res.status}`) };
  }
  return { ok: true, id: String(data.id ?? "") };
}

// ═══════════════════════════════════════════════════════════════════════════
// Handler principal
// ═══════════════════════════════════════════════════════════════════════════

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*" },
    });
  }
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  // ── Sécurité : secret cron via header x-cron-secret ──
  const cronSecret = req.headers.get("x-cron-secret") ?? "";
  if (CRON_SECRET && cronSecret !== CRON_SECRET) {
    return json({ error: "unauthorized" }, 401);
  }

  // ── Récupérer l'état applicatif ──
  let sd: Record<string, unknown>;
  try {
    const fetched = await fetchAppState();
    if (!fetched) {
      return json({ ok: false, message: "Aucun état applicatif trouvé dans project_state." });
    }
    sd = fetched;
  } catch (err) {
    return json({ error: String(err) }, 500);
  }

  const programme   = sd.programme    as Record<string, unknown>;
  const projectData = sd.projectData  as Record<string, Record<string, unknown>>;
  const projects    = (programme.projects as Array<Record<string, unknown>>) ?? [];
  // Gantt global (top-level) — contient les dates planifiées par tâche
  const ganttGlobal = (sd.gantt ?? {}) as Record<string, GanttTask>;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const in15 = new Date(today);
  in15.setDate(in15.getDate() + 15);

  const recipients = ALERT_EMAIL
    ? ALERT_EMAIL.split(/[;,]/).map(e => e.trim()).filter(Boolean)
    : [];

  if (recipients.length === 0) {
    return json({ error: "ALERT_EMAIL non configuré dans les secrets Supabase." }, 500);
  }

  const results: ProjectResult[] = [];
  let totalSent = 0;

  for (const proj of projects) {
    const pid    = String(proj.id ?? proj.projectId ?? "");
    const pname  = String(proj.name ?? proj.nom ?? pid ?? "Projet inconnu");
    const status = String(proj.status ?? "").toLowerCase();
    if (!pid) continue;

    // ── Projets actifs uniquement ──
    if (status !== "active") continue;

    const pData     = projectData?.[pid];
    const actionDefs: ActionDef[] = Array.isArray(pData?.customActions)
      ? (pData.customActions as ActionDef[])
      : [];
    const tracking: Record<string, ActionTracking> =
      (pData?.actions && typeof pData.actions === "object" && !Array.isArray(pData.actions))
        ? (pData.actions as Record<string, ActionTracking>)
        : {};
    // Gantt du projet (peut aussi exister en top-level)
    const ganttLocal = (pData?.gantt ?? {}) as Record<string, GanttTask>;

    const overdue:   AlertAction[] = [];
    const upcoming:  AlertAction[] = [];

    for (const def of actionDefs) {
      // ── Récupérer le suivi (statut, pct) ──
      const track  = tracking[def.id] ?? {} as ActionTracking;
      const status = String(track.status ?? "todo");
      const pct    = Number(track.pct ?? 0);

      if (isDone(status, pct)) continue;

      // ── Récupérer l'échéance (priorité : echeance > dateFin > gantt.end > dateDebut+duree) ──
      let dl: string | null = null;

      // 1. Champ explicite sur l'action
      if (isValidDate(def.echeance)) dl = String(def.echeance);
      else if (isValidDate(def.dateFin)) dl = String(def.dateFin);

      // 2. Date de fin dans le gantt (via _ganttTaskId)
      if (!dl && def._ganttTaskId) {
        const ganttTask = ganttGlobal[def._ganttTaskId] ?? ganttLocal[def._ganttTaskId];
        if (ganttTask?.end && isValidDate(ganttTask.end)) dl = ganttTask.end;
      }

      // 3. Calcul dateDebut + duree (fallback)
      if (!dl && isValidDate(track.dateDebut) && track.duree && track.duree > 0) {
        const d = new Date(String(track.dateDebut));
        d.setDate(d.getDate() + Number(track.duree));
        dl = d.toISOString().slice(0, 10);
      }

      if (!dl) continue;

      const dlDate = new Date(String(dl));
      dlDate.setHours(0, 0, 0, 0);

      const entry: AlertAction = {
        id:       def.id,
        libelle:  String(def.label ?? def.action ?? def.id),
        echeance: String(dl),
        status,
        pct,
        resp:     String(def.resp ?? "—"),
        rag:      String(def.rag  ?? "X"),
        urgence:  String(def.urgence ?? "—"),
      };

      if (dlDate < today)       overdue.push(entry);
      else if (dlDate <= in15)  upcoming.push(entry);
    }

    // ── Trier : retards les plus anciens en premier, échéances les plus proches en premier ──
    overdue.sort((a, b) => new Date(a.echeance).getTime() - new Date(b.echeance).getTime());
    upcoming.sort((a, b) => new Date(a.echeance).getTime() - new Date(b.echeance).getTime());

    if (overdue.length === 0 && upcoming.length === 0) {
      results.push({ projectName: pname, overdueCount: 0, upcomingCount: 0, emailSent: false });
      continue;
    }

    try {
      const r = await sendProjectEmail(pname, overdue, upcoming, today, recipients);
      if (r.ok) {
        totalSent++;
        results.push({ projectName: pname, overdueCount: overdue.length, upcomingCount: upcoming.length, emailSent: true, resendId: r.id });
      } else {
        results.push({ projectName: pname, overdueCount: overdue.length, upcomingCount: upcoming.length, emailSent: false, error: r.error });
      }
    } catch (err) {
      results.push({ projectName: pname, overdueCount: overdue.length, upcomingCount: upcoming.length, emailSent: false, error: String(err) });
    }
  }

  return json({
    ok: true,
    date: today.toISOString().slice(0, 10),
    projectsScanned: projects.length,
    emailsSent: totalSent,
    results,
  });
});
