// ═══════════════════════════════════════════════════════════════════════════
// BOA Programme Pilotage — Logique applicative principale
// Dépendances (chargées avant ce fichier) :
//   config.js       → SUPABASE_URL, SUPABASE_ANON_KEY, CONFIG
//   @supabase/supabase-js, pptxgenjs, exceljs, jspdf, chart.js (CDN)
// ═══════════════════════════════════════════════════════════════════════════

// ════════════════════════════════════════════════════════════════════════
// DATA
// ════════════════════════════════════════════════════════════════════════

// DESIGN_FREEZE et GO_LIVE lus depuis state.programme.milestones (configurable)
function _getMilestone(key) {
  return (state.programme && state.programme.milestones && state.programme.milestones[key])
    ? new Date(state.programme.milestones[key]) : null;
}
const TODAY = new Date();

// ─── GANTT TASKS (43 tâches – source: BOA_MIGV4_RetroPlanning_V1.0.xlsx) ────
// ─── GANTT — chargé depuis Supabase (app_defaults) au démarrage ─────────────
let ganttTasks = []; // Peuplé par loadGanttFromSupabase() — voir table app_defaults
let ganttSubtasksDefault = {}; // Sous-tâches par défaut {taskId:[{id,label,owner,start,end,pct}]}

// ─── ARBITRAGES — chargés depuis Supabase (app_defaults) au démarrage ─────────
let arbitrages = []; // Peuplé par loadArbitragesFromSupabase() — voir table app_defaults

// ─── Décisions d'arbitrage — valeurs par défaut (remplacées par state.arbDecisions si non vide) ──
const ARB_DECISIONS_DEFAULT = [
  { key: 'en_cours',    label: "En cours d'arbitrage", icon: '⏳', color: '#E8702A', bg: '#FEF3E2', isDefault: true },
  { key: 'maintien',    label: 'Maintien hybride',      icon: '🔵', color: '#3949AB', bg: '#EEF0F8' },
  { key: 'integration', label: 'Intégration V4',        icon: '🟢', color: '#2E7D52', bg: '#E8F5ED' },
  { key: 'abandon',     label: 'Abandon',               icon: '🔴', color: '#E63329', bg: '#FDEEEC' },
];
function _getArbDecisions() {
  return (state.arbDecisions && state.arbDecisions.length > 0) ? state.arbDecisions : ARB_DECISIONS_DEFAULT;
}
function _getArbDefaultKey() {
  const decs = _getArbDecisions();
  const def = decs.find(d => d.isDefault);
  return def ? def.key : (decs[0] ? decs[0].key : 'en_cours');
}
function _arbDecByKey(key) {
  return _getArbDecisions().find(d => d.key === key)
    || { key: key, label: key, icon: '', color: '#888', bg: '#f5f5f5' };
}
// Applique inline-style couleur sur un select de décision
function _applyArbDecSelectStyle(sel) {
  if (!sel) return;
  const d = _arbDecByKey(sel.value);
  sel.style.background = d.bg;
  sel.style.color = d.color;
  sel.style.borderColor = d.color;
}


// ─── Décisions GAP (Décision BOA) — valeurs par défaut ──────────────────────────
const GAP_DECISIONS_DEFAULT = [
  { key: 'En attente',         label: 'En attente',         icon: '⏳', color: '#54565A', bg: '#F5F5F5', isDefault: true },
  { key: 'En analyse',         label: 'En analyse',         icon: '🔍', color: '#E8702A', bg: '#FEF3E2' },
  { key: 'Validé V4 Standard', label: 'Validé V4 Standard', icon: '✅', color: '#2E7D52', bg: '#E8F5ED' },
  { key: 'Validé Spécifique',  label: 'Validé Spécifique',  icon: '🔵', color: '#3949AB', bg: '#EEF0F8' },
  { key: 'Reporté Phase II',   label: 'Reporté Phase II',   icon: '📅', color: '#E8702A', bg: '#FEF3E2' },
  { key: 'Exclu périmètre',    label: 'Exclu périmètre',    icon: '🚫', color: '#E63329', bg: '#FDEEEC', isExclusion: true },
];
function _getGapDecisions() {
  return (state.gapDecisions && state.gapDecisions.length > 0) ? state.gapDecisions : GAP_DECISIONS_DEFAULT;
}
function _getGapDefaultKey() {
  const decs = _getGapDecisions();
  const def = decs.find(d => d.isDefault);
  return def ? def.key : (decs[0] ? decs[0].key : '');
}
function _gapDecByKey(key) {
  return _getGapDecisions().find(d => d.key === key)
    || { key: key, label: key, icon: '', color: '#54565A', bg: '#F5F5F5' };
}
function _applyGapDecSelectStyle(sel) {
  if (!sel) return;
  const d = _gapDecByKey(sel.value);
  sel.style.background  = d.bg;
  sel.style.color       = d.color;
  sel.style.borderColor = d.color;
}

// ─── ACTIONS — chargées depuis Supabase (app_defaults) au démarrage ────────────
let actions = []; // Ancien référentiel app_defaults.actions, conservé hors Plan d'action projet

// ─── GAPS — chargés depuis Supabase (app_defaults) au démarrage ──────────────
let gaps = []; // Peuplé par loadGapsFromSupabase() — voir table app_defaults

// ─── RÉFÉRENTIEL OWNERS ──────────────────────────────────────────────────────
// Owners chargés depuis state.shared.owners (Supabase) — plus de liste CBS hardcodée
function _normalizeOwnerRecord(raw) {
  if (typeof raw === 'string') {
    return { name: raw.trim(), side: '', interventionType: '', domain: '' };
  }
  if (!raw || typeof raw !== 'object') {
    return { name: '', side: '', interventionType: '', domain: '' };
  }
  const rec = {
    name: String(raw.name || raw.label || raw.owner || '').trim(),
    side: String(raw.side || raw.org || raw.entity || '').trim(),
    interventionType: String(raw.interventionType || raw.type || raw.intervention || '').trim(),
    domain: String(raw.domain || raw.stream || raw.area || '').trim(),
    email: String(raw.email || raw.mail || '').trim(),
  };
  if (raw._placeholder) rec._placeholder = true;
  return rec;
}
function _normalizeOwnerRecords(list) {
  const seen = new Set();
  return (Array.isArray(list) ? list : [])
    .map(_normalizeOwnerRecord)
    .filter(o => o.name)
    .filter(o => {
      const key = o.name.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' }));
}
function getOwnerRecords() {
  const owners = (state.shared && state.shared.owners) || [];
  return _normalizeOwnerRecords(owners);
}
function getOwnersList() {
  return getOwnerRecords().map(o => o.name);
}
function getOwnerRecord(name) {
  const key = String(name || '').trim().toLowerCase();
  if (!key) return null;
  return getOwnerRecords().find(o => o.name.toLowerCase() === key) || null;
}
function _ownerMetaLabel(owner) {
  return [owner.side, owner.interventionType, owner.domain].filter(Boolean).join(' | ');
}
function _setOwnerRecords(records) {
  const normalized = _normalizeOwnerRecords(records);
  if (!state.shared) state.shared = { owners: [], streams: [] };
  state.shared.owners = normalized;
  state.owners = normalized;
}
function _scheduleOwnersReferentialSave(reason) {
  saveState(reason || 'Référentiel responsables');
  clearTimeout(window._ownersSaveTimer);
  window._ownersSaveTimer = setTimeout(async () => {
    const ok = await _saveAppDefault('owners', getOwnerRecords());
    if (!ok) console.warn('[owners] sauvegarde app_defaults impossible');
  }, 350);
}
function _refreshOwnersReferentialUI() {
  renderOwnerDatalist();
  _renderOwnerDomainDatalist();
  _loadSystemUsersDatalist();
  if (document.getElementById('owners-modal')?.style.display === 'flex') renderOwnersModal();
  // Rafraîchir aussi l'onglet Paramétrage si actif
  if (document.getElementById('tab-parametrage')?.classList.contains('active')) _renderOwnersInParam();
}

// ─── STREAMS / DOMAINES FONCTIONNELS ─────────────────────────────────────────
// Streams chargés depuis state.shared.streams (Supabase) — plus de liste CBS hardcodée
function getAllStreams() {
  return (state.shared && state.shared.streams) || [];
}
function renderOwnerDatalist() {
  const dl = document.getElementById('dl-owners');
  if (!dl) return;
  dl.innerHTML = getOwnerRecords().map(o => {
    const label = _ownerMetaLabel(o);
    return `<option value="${_esc(o.name)}"${label ? ` label="${_esc(label)}"` : ''}>`;
  }).join('');
}
function _renderOwnerDomainDatalist() {
  const dl = document.getElementById('dl-owner-domains');
  if (!dl) return;
  const domains = [...new Set([
    ...getAllStreams().map(s => String((s && s.name) || '').trim()),
    ...getOwnerRecords().map(o => String(o.domain || '').trim())
  ].filter(Boolean))].sort((a, b) => a.localeCompare(b, 'fr', { sensitivity: 'base' }));
  dl.innerHTML = domains.map(d => `<option value="${_esc(d)}">`).join('');
}

// ─────────────────────────────────────────────────────────────────────────
// API et sb sont déclarés et initialisés par api.js (chargé avant ce fichier).
// Pour changer de backend : modifiez uniquement config.js -> backendType

let currentUser = null;
let currentRole = 'owner';

// ─── STATE ────────────────────────────────────────────────────────────────
// ─── Données interfaces par défaut ───────────────────────────────────────────
let DEFAULT_INTERFACES = []; // Chargé depuis Supabase app_defaults (clé 'interfaces')

// ─── PÉRIMÈTRE — chargé depuis Supabase (app_defaults) au démarrage ─────────
let DEFAULT_PERIMETER = []; // Peuplé par loadPerimeterFromSupabase() — voir table app_defaults

let state = {
  arbitrages:        {},  // {id: {decision, commentaire}}
  customArbitrages:  [],  // arbitrages créés manuellement [{id,label,domain,prio,resp,deadline,_custom}]
  arbitragesHidden:  [],  // IDs d'arbitrages statiques masqués (suppression réversible)
  arbDecisions:      [],  // décisions paramétrables [{key,label,icon,color,bg,isDefault}] — vide = defaults
  gapDecisions:      [],  // décisions GAP paramétrables [{key,label,icon,color,bg,isDefault,isExclusion}] — vide = defaults
  actions:       {},  // {id: {rag, pct, commentaire, source}}
  gantt:         {},  // {id: {start, end}}
  gaps:          {},  // {ref: {decision, note, prio, phase, bm}}
  ganttCustom:   [],  // [{id, label, phase, start, end, resp}]
  ganttHidden:   [],  // IDs de tâches statiques masquées (suppression côté affichage)
  customActions: [],  // actions ajoutées manuellement
  customGaps:    [],  // GAPs ajoutés manuellement
  ganttChain:    false,
  ganttCollapsed:{},
  ganttSubsCollapsed:{},
  ganttSubtasks: {},   // {parentId: [{id,label,start,end,pct,owner}]}
  ganttZoom:     'month',
  owners:        [],   // référentiel responsables (paramétrable)
  risks:         [],   // registre risques custom
  impacts:       [],   // registre impacts projet (planning, budget, périmètre…)
  perimetre:     { data: {} }, // données éditables périmètre modules (par index)
  ganttReference:{ isSet: false, setAt: null, dates: {} }, // planning de référence
  technique: {
    interfaces: null, // null = use DEFAULT_INTERFACES until user modifies
    archi:      [],   // items architecture & environnements
  },
  auditLog:  [],  // piste d'audit
  loginLogs: [],  // logs de connexion
  // ════ PROGRAMME MULTI-PROJETS (nouveau) ═════════════════════════════════
  programme: {
    name:        'Mon Programme',
    description: '',
    createdAt:   null,
    projects:    []  // [{id, name, color, description, status:'active'|'archived', createdAt}]
  },
  currentProjectId: null,   // null → écran Programme affiché
  projectData:      {},     // {[projectId]: {...stateChampsDuProjet}}
  shared: {
    owners:  [],            // référentiel responsables partagé entre projets
    streams: []             // streams personnalisés supplémentaires (au-delà des DEFAULT_STREAMS)
  },
};

// Champs d'état appartenant à un projet (pas au programme)
const _PROJECT_STATE_KEYS = [
  'arbitrages','customArbitrages','arbitragesHidden','arbDecisions','gapDecisions',
  'actions','gantt','gaps','ganttCustom','ganttHidden',
  'customActions','customGaps','ganttChain','ganttCollapsed',
  'ganttSubsCollapsed','ganttSubtasks','ganttZoom',
  'ganttSubphases','ganttSubphasesCollapsed',
  'risks','impacts','perimetre','ganttReference','technique',
  'auditLog','loginLogs','savedTcds',
];

// Extrait les champs projet depuis un objet state
function _extractProjectData(src) {
  const out = {};
  _PROJECT_STATE_KEYS.forEach(k => { if (src[k] !== undefined) out[k] = src[k]; });
  return out;
}

// Etat par défaut d'un nouveau projet vierge
function _defaultProjectState() {
  return {
    arbitrages:{}, customArbitrages:[], arbitragesHidden:[], arbDecisions:[], gapDecisions:[],
    actions:{}, gantt:{}, gaps:{}, ganttCustom:[], ganttHidden:[],
    customActions:[], customGaps:[], ganttChain:false, ganttCollapsed:{},
    ganttSubsCollapsed:{}, ganttSubtasks:{}, ganttZoom:'month',
    ganttSubphases:[], ganttSubphasesCollapsed:{},
    risks:[], impacts:[], perimetre:{data:{}},
    ganttReference:{isSet:false, setAt:null, dates:{}},
    technique:{interfaces:null, archi:[]},
    auditLog:[], loginLogs:[], savedTcds:[],
  };
}

function applyParsedState(parsed) {
  state = {
    arbitrages:        parsed.arbitrages        || {},
    customArbitrages:  parsed.customArbitrages  || [],
    arbitragesHidden:  parsed.arbitragesHidden  || [],
    arbDecisions:      parsed.arbDecisions      || [],
    gapDecisions:      parsed.gapDecisions      || [],
    actions:        parsed.actions        || {},
    gantt:          parsed.gantt          || {},
    gaps:           parsed.gaps           || {},
    ganttCustom:    parsed.ganttCustom    || [],
    ganttHidden:    parsed.ganttHidden    || [],
    customActions:  parsed.customActions  || [],
    customGaps:     parsed.customGaps     || [],
    ganttChain:     parsed.ganttChain     || false,
    ganttCollapsed:    parsed.ganttCollapsed    || {},
    ganttSubsCollapsed:      parsed.ganttSubsCollapsed      || {},
    ganttSubtasks:           parsed.ganttSubtasks           || {},
    ganttSubphases:          parsed.ganttSubphases          || [],
    ganttSubphasesCollapsed: parsed.ganttSubphasesCollapsed || {},
    ganttZoom:      parsed.ganttZoom      || 'month',
    owners:         parsed.owners         || [],
    risks:          parsed.risks          || [],
    impacts:        parsed.impacts        || [],
    perimetre: (() => {
      const p = parsed.perimetre || {};
      // Migrate old comments structure to new data structure
      if (p.comments && !p.data) {
        const data = {};
        Object.keys(p.comments).forEach(k => { data[k] = { commentaire: p.comments[k] }; });
        return { data };
      }
      return { data: p.data || {} };
    })(),
    ganttReference: parsed.ganttReference || { isSet: false, setAt: null, dates: {} },
    technique: {
      interfaces: (parsed.technique && parsed.technique.interfaces) || null,
      archi:      (parsed.technique && parsed.technique.archi)      || [],
    },
    auditLog:   parsed.auditLog   || [],  // piste d'audit (restaurée à chaque chargement)
    loginLogs:  parsed.loginLogs  || [],  // logs connexion (restaurés à chaque chargement)
    savedTcds:  parsed.savedTcds  || [],
  };

  // ── Restauration du niveau Programme ─────────────────────────────────────
  const prog = parsed.programme || {};
  state.programme = {
    name:        prog.name        || 'Mon Programme',
    description: prog.description || '',
    createdAt:   prog.createdAt   || new Date().toISOString(),
    projects:    Array.isArray(prog.projects) ? prog.projects : [],
    milestones: {
      design_freeze: (prog.milestones && prog.milestones.design_freeze) || null,
      go_live:       (prog.milestones && prog.milestones.go_live)       || null,
      gantt_start:   (prog.milestones && prog.milestones.gantt_start)   || null,
      gantt_end:     (prog.milestones && prog.milestones.gantt_end)     || null,
    },
  };

  // Migration : si aucun projet, on crée un projet par défaut avec les données existantes
  if (state.programme.projects.length === 0) {
    const defaultId = 'proj_default';
    state.programme.projects.push({
      id:          defaultId,
      name:        'Projet principal',
      color:       '#1565C0',
      description: '',
      status:      'active',
      createdAt:   new Date().toISOString(),
    });
    state.projectData = {};
    state.projectData[defaultId] = _extractProjectData(parsed);
  } else {
    state.projectData = parsed.projectData || {};
  }

  // Shared resources (owners + streams partagés)
  state.shared = {
    owners:  (parsed.shared && parsed.shared.owners)  || state.owners || [],
    streams: (parsed.shared && parsed.shared.streams) || [],
  };

  // On démarre toujours sur l'écran Programme (pas directement dans un projet)
  state.currentProjectId = null;
}

// Helper: get interfaces (state or defaults)
function getTechInterfaces() {
  if (state.technique.interfaces) return state.technique.interfaces;
  return _projUsesCBS() ? DEFAULT_INTERFACES : [];
}

function loadState() {
  // Fallback: localStorage only (used before Supabase is ready)
  try {
    const saved = localStorage.getItem('boa_v4_state');
    if (saved) applyParsedState(JSON.parse(saved));
  } catch(e) {}
}

function canEdit() { return !!(currentSession && (currentSession.role === 'editor' || currentSession.role === 'admin') && hasFunctionAccess('edit_data')); }

// ── Piste d'audit ─────────────────────────────────────────────────────────────
// Ajoute une entrée dans state.auditLog (300 entrées max, LIFO)
function logAudit(action, detail) {
  if (!state.auditLog) state.auditLog = [];
  state.auditLog.unshift({
    ts:     new Date().toISOString(),
    user:   currentSession ? (currentSession.displayName || currentSession.username) : 'Système',
    role:   currentSession ? (currentSession.role || '—') : '—',
    action: action || '—',
    detail: String(detail || '').substring(0, 120)
  });
  if (state.auditLog.length > 300) state.auditLog.length = 300;
}

// ── Logs de connexion ────────────────────────────────────────────────────────
// Enregistre un événement login/logout dans state.loginLogs (500 max, LIFO)
function _addLoginLog(action, username, displayName, role) {
  if (!state.loginLogs) state.loginLogs = [];
  state.loginLogs.unshift({
    ts:          new Date().toISOString(),
    action:      action,
    username:    username    || '—',
    displayName: displayName || '—',
    role:        role        || '—',
    ua:          (navigator.userAgent || '').substring(0, 120)
  });
  if (state.loginLogs.length > 500) state.loginLogs.length = 500;
  // Persist directement (sans passer par saveState pour éviter récursion)
  try { localStorage.setItem('boa_v4_state', JSON.stringify(state)); } catch(e) {}
  if (API && window._sbWriteOK && currentSession) {
    _saveProjectStateCloud('Login log persist');
  }
}

function saveState(action, detail) {
  if (!canEdit()) return;           // Lecteur ne peut pas modifier l'état
  if (action) logAudit(action, detail);
  // Sync données projet courant dans projectData avant de sauvegarder
  if (state.currentProjectId && typeof _extractProjectData === 'function') {
    if (!state.projectData) state.projectData = {};
    state.projectData[state.currentProjectId] = _extractProjectData(state);
  }
  // Always backup to localStorage
  try { localStorage.setItem('boa_v4_state', JSON.stringify(state)); } catch(e) {}
  // Cloud save (async, fire-and-forget)
  if (API && canEdit() && window._sbWriteOK && !window._boaInitializing) {
    _saveProjectStateCloud('Cloud save');
  }
  const indicator = document.getElementById('save-indicator');
  if (indicator) { indicator.style.display = 'block'; setTimeout(() => indicator.style.display = 'none', 1500); }
}

function showSyncIndicator() {
  const el = document.getElementById('sync-indicator');
  if (el) { el.style.display = 'block'; setTimeout(() => el.style.display = 'none', 3000); }
}

function applyRoleUI() {
  document.body.classList.remove('viewer-mode', 'editor-mode', 'owner-mode');
  document.body.classList.add('owner-mode');
  // Owner-only controls
  document.querySelectorAll('.owner-only').forEach(el => {
    el.style.display = currentRole === 'owner' ? '' : 'none';
  });
  // Readonly banner

}

// ════════════════════════════════════════════════════════════════════════
// HELPERS
// ════════════════════════════════════════════════════════════════════════

function daysBetween(d1, d2) {
  return Math.round((d2 - d1) / 86400000);
}

// Plage Gantt depuis les dates du programme (ou valeurs par défaut glissantes)
function _getGanttRange() {
  const now = new Date();
  const startStr = (state.programme && state.programme.milestones && state.programme.milestones.gantt_start)
    || (new Date(now.getFullYear(), 0, 1)).toISOString().split('T')[0];
  const endStr = (state.programme && state.programme.milestones && state.programme.milestones.gantt_end)
    || (new Date(now.getFullYear(), 11, 31)).toISOString().split('T')[0];
  return { start: new Date(startStr), end: new Date(endStr) };
}
let GANTT_RANGE_START = _getGanttRange().start;
let GANTT_RANGE_END   = _getGanttRange().end;
let GANTT_TOTAL_DAYS  = daysBetween(GANTT_RANGE_START, GANTT_RANGE_END);

/** Recalcule la plage Gantt — à appeler après chargement de l'état Supabase.
 *  Étend aussi la plage pour couvrir les tâches importées les plus éloignées. */
function _refreshGanttRange() {
  const base = _getGanttRange();
  let start = base.start;
  let end   = base.end;
  // Étendre si des tâches custom ont des dates hors plage
  (state.ganttCustom || []).forEach(t => {
    if (t.start) { const d = new Date(t.start); if (d < start) start = d; }
    if (t.end)   { const d = new Date(t.end);   if (d > end)   end   = d; }
  });
  GANTT_RANGE_START = start;
  GANTT_RANGE_END   = end;
  GANTT_TOTAL_DAYS  = Math.max(1, daysBetween(GANTT_RANGE_START, GANTT_RANGE_END));
}

function ganttPct(dateStr) {
  const d = new Date(dateStr);
  return Math.max(0, Math.min(100, daysBetween(GANTT_RANGE_START, d) / GANTT_TOTAL_DAYS * 100));
}

function ganttWidthPct(startStr, endStr) {
  const s = new Date(startStr), e = new Date(endStr);
  const days = Math.max(1, daysBetween(s, e));
  return Math.min(100 - ganttPct(startStr), days / GANTT_TOTAL_DAYS * 100);
}

const MONTH_NAMES_FR = ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc'];

/** Génère dynamiquement les colonnes mois entre GANTT_RANGE_START et GANTT_RANGE_END */
function _buildMonthCols() {
  const cols = [];
  const start = new Date(GANTT_RANGE_START);
  const end   = new Date(GANTT_RANGE_END);
  let cur = new Date(start.getFullYear(), start.getMonth(), 1);
  while (cur <= end) {
    const y = cur.getFullYear(), mo = cur.getMonth();
    const monthStart = new Date(Math.max(cur.getTime(), start.getTime()));
    const nextMonth  = new Date(y, mo + 1, 1);
    const monthEnd   = new Date(Math.min(nextMonth.getTime() - 86400000, end.getTime()));
    const days = Math.max(1, Math.round((monthEnd - monthStart) / 86400000) + 1);
    cols.push({ name: MONTH_NAMES_FR[mo], days });
    cur = nextMonth;
  }
  return cols;
}

// ── Gantt column builder (zoom: 'month' | 'week' | 'day') ────────────────
function buildGanttCols(zoom) {
  zoom = zoom || 'month';

  if (zoom === 'month') {
    const MONTHS = _buildMonthCols();
    const header = MONTHS.map((m,i) =>
      '<div class="gantt-month-header" style="flex:' + m.days + ';background:' + (i%2===0?'#c8d0e0':'#d8e0f0') + ';border-right:1px solid #b0bcd0;display:flex;align-items:center;justify-content:center;">' + m.name + '</div>'
    ).join('');
    const bg = MONTHS.map((m,i) =>
      '<div class="month-col ' + (i%2===1?'alt':'') + '" style="flex:' + m.days + '"></div>'
    ).join('');
    return { headerHtml: header, bgHtml: bg, minWidth: _scaleGanttPx(900) };
  }

  if (zoom === 'week') {
    const weeks = [];
    const d = new Date(GANTT_RANGE_START);
    let wi = 0;
    while (d <= GANTT_RANGE_END) {
      const ws = new Date(d);
      const we = new Date(d);
      we.setDate(we.getDate() + 6);
      if (we > GANTT_RANGE_END) we.setTime(GANTT_RANGE_END.getTime());
      const days = Math.max(1, Math.round((we - ws) / 86400000) + 1);
      const wNum = String(wi + 1).padStart(2, '0');
      const mon  = ws.toLocaleDateString('fr-FR', {month:'short'});
      weeks.push({ label: 'S' + wNum + ' ' + mon, days, alt: wi % 2 === 1 });
      d.setDate(d.getDate() + 7);
      wi++;
      if (d > GANTT_RANGE_END) break;
    }
    const header = weeks.map(w =>
      '<div class="gantt-month-header" style="flex:' + w.days + ';background:' + (w.alt?'#d8e0f0':'#c8d0e0') + ';border-right:1px solid #b0bcd0;display:flex;align-items:center;justify-content:center;font-size:9px;white-space:nowrap;">' + w.label + '</div>'
    ).join('');
    const bg = weeks.map(w =>
      '<div class="month-col ' + (w.alt?'alt':'') + '" style="flex:' + w.days + '"></div>'
    ).join('');
    return { headerHtml: header, bgHtml: bg, minWidth: _scaleGanttPx(1200) };
  }

  if (zoom === 'day') {
    const days = [];
    const d = new Date(GANTT_RANGE_START);
    let di = 0;
    while (d <= GANTT_RANGE_END) {
      const dow = d.getDay();
      const isWe = (dow === 0 || dow === 6);
      days.push({ label: d.getDate(), alt: di % 2 === 1, isWe });
      d.setDate(d.getDate() + 1);
      di++;
    }
    const header = days.map(dd =>
      '<div class="gantt-month-header" style="flex:1;min-width:11px;background:' + (dd.isWe?'#dfc8c8':(dd.alt?'#d8e0f0':'#c8d0e0')) + ';border-right:1px solid #b0bcd0;display:flex;align-items:center;justify-content:center;font-size:8px;overflow:hidden;">' + dd.label + '</div>'
    ).join('');
    const bg = days.map(dd =>
      '<div class="month-col ' + (dd.alt?'alt':'') + '" style="flex:1;min-width:11px;' + (dd.isWe?'background:rgba(200,0,0,.05);':'') + '"></div>'
    ).join('');
    return { headerHtml: header, bgHtml: bg, minWidth: _scaleGanttPx(2720) };
  }

  return buildGanttCols('month');
}

function setGanttZoom(z) {
  state.ganttZoom = z;
  saveState();
  ['month','week','day'].forEach(k => {
    const btn = document.getElementById('zoom-btn-' + k);
    if (btn) btn.classList.toggle('active', k === z);
  });
  renderGantt();
}

function _getGanttScale() {
  const raw = Number(state.ganttScale);
  return Number.isFinite(raw) && raw > 0 ? raw : 1;
}

function _scaleGanttPx(px) {
  return Math.round(px * _getGanttScale()) + 'px';
}

function changeGanttScale(delta) {
  const next = Math.max(0.5, Math.min(4, Math.round((_getGanttScale() + delta) * 100) / 100));
  state.ganttScale = next;
  saveState();
  const label = document.getElementById('gantt-scale-label');
  if (label) label.textContent = Math.round(next * 100) + '%';
  renderGantt();
}

function resetGanttScale() {
  state.ganttScale = 1;
  saveState();
  const label = document.getElementById('gantt-scale-label');
  if (label) label.textContent = '100%';
  renderGantt();
}

function phaseClass(phase) {
  return {freeze:'ph-freeze',build:'ph-build',sit:'ph-sit',uat:'ph-uat',live:'ph-live',copil:'ph-copil'}[phase] || '';
}

function countdowns() {
  const today = new Date(); today.setHours(0,0,0,0);
  const todayEl = document.getElementById('today-label');
  if (todayEl) todayEl.textContent = today.toLocaleDateString('fr-FR',{day:'numeric',month:'long',year:'numeric'});

  const dfMilestone = _getMilestone('design_freeze');
  const glMilestone = _getMilestone('go_live');
  const hasMilestones = dfMilestone || glMilestone;
  // Pour les projets vierges sans jalons configurés, masquer les badges
  const _cbsCtx = _projUsesCBS();

  const freezeBadge = document.getElementById('countdown-freeze');
  const liveBadge   = document.getElementById('countdown-live');
  if (freezeBadge) freezeBadge.style.display = (dfMilestone || _cbsCtx) ? '' : 'none';
  if (liveBadge)   liveBadge.style.display   = (glMilestone || _cbsCtx) ? '' : 'none';

  if (dfMilestone || _cbsCtx) {
    const df = daysBetween(today, dfMilestone || new Date('2099-01-01'));
    const daysFreeze = document.getElementById('days-freeze');
    if (daysFreeze) daysFreeze.textContent = dfMilestone
      ? (df > 0 ? `J-${df}` : (df === 0 ? 'Aujourd\'hui' : `J+${-df}`))
      : '—';
    if (freezeBadge && df < 0 && dfMilestone) freezeBadge.style.background = '#aaa';
  }
  if (glMilestone || _cbsCtx) {
    const gl = daysBetween(today, glMilestone || new Date('2099-01-01'));
    const daysLive = document.getElementById('days-live');
    if (daysLive) daysLive.textContent = glMilestone
      ? (gl > 0 ? `J-${gl}` : 'Go Live!')
      : '—';
  }
}

// ════════════════════════════════════════════════════════════════════════
// LAYOUT & DARK MODE
// ════════════════════════════════════════════════════════════════════════

function toggleLayout() {
  const isSidebar = document.body.classList.toggle('layout-sidebar');
  try { localStorage.setItem('boa_layout', isSidebar ? 'sidebar' : 'tabs'); } catch(e) {}
  const btn = document.getElementById('btn-layout-toggle');
  if (btn) btn.textContent = isSidebar ? '▤ Onglets' : '☰ Menu latéral';
  // Si le Gantt est actif, re-render pour s'adapter à la nouvelle largeur disponible
  const ganttTab = document.getElementById('tab-gantt');
  if (ganttTab && ganttTab.classList.contains('active')) renderGantt();
}

function toggleDarkMode() {
  const isDark = document.body.classList.toggle('dark-mode');
  try { localStorage.setItem('boa_dark', isDark ? '1' : '0'); } catch(e) {}
  const btn = document.getElementById('btn-dark-toggle');
  if (btn) btn.textContent = isDark ? '☀ Clair' : '🌙 Sombre';
}

function loadUIPreferences() {
  try {
    if (localStorage.getItem('boa_layout') === 'sidebar') {
      document.body.classList.add('layout-sidebar');
      const btn = document.getElementById('btn-layout-toggle');
      if (btn) btn.textContent = '▤ Onglets';
    }
    if (localStorage.getItem('boa_dark') === '1') {
      document.body.classList.add('dark-mode');
      const btn = document.getElementById('btn-dark-toggle');
      if (btn) btn.textContent = '☀ Clair';
    }
  } catch(e) {}
}

// ════════════════════════════════════════════════════════════════════════
// TAB SWITCHING
// ════════════════════════════════════════════════════════════════════════

function switchTab(name, btn) {
  document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
  document.getElementById('tab-' + name).classList.add('active');
  // Sync active state in both tabs-nav and sidebar-nav using data-tab
  document.querySelectorAll('.tab-btn[data-tab="' + name + '"]').forEach(b => b.classList.add('active'));
  if (name === 'dashboard')        renderDashboard();
  if (name === 'gantt')            renderGantt();
  if (name === 'gaps')             renderGaps();
  if (name === 'arbitrages')       renderArbitrages();
  if (name === 'actions')          renderActions();
  if (name === 'risques')          renderRisques();
  if (name === 'impacts')          renderImpacts();
  if (name === 'technique')        renderTechnique();
  if (name === 'perimetremodules') renderPerimetre();
  if (name === 'analyse')          renderAnalyse();
  if (name === 'parametrage')      renderParametrageTab();
}

// ════════════════════════════════════════════════════════════════════════
// PARAMÉTRAGE
// ════════════════════════════════════════════════════════════════════════

function renderParametrageTab() {
  const container = document.getElementById('parametrage-render');
  if (!container) return;

  // ── Projet courant ────────────────────────────────────────────────────
  const proj   = (state.programme && state.programme.projects || []).find(p => p.id === state.currentProjectId);
  const projName  = proj ? (proj.name || proj.id || '—') : '— aucun projet ouvert —';
  const projStart = proj ? (proj.dateDebut || '—') : '—';
  const projEnd   = proj ? (proj.dateFin   || '—') : '—';
  const cpName    = proj ? (proj.chefDeProjet || '') : '';
  const canEditCfg = typeof canEdit === 'function' ? canEdit() : false;

  // ── Responsables ──────────────────────────────────────────────────────
  const owners       = getOwnerRecords();
  const placeholders = owners.filter(o => o._placeholder);
  const realOwners   = owners.filter(o => !o._placeholder);

  // ── Domaines fonctionnels ─────────────────────────────────────────────
  const streams = (typeof getAllStreams === 'function') ? getAllStreams() : [];

  // ── Backend ───────────────────────────────────────────────────────────
  const backendType = (typeof CONFIG !== 'undefined' && CONFIG.backendType) || 'local';
  const backendLabel = { supabase: '☁️ Supabase', rest: '🔌 REST API', local: '💾 Local / Fichier' }[backendType] || backendType;

  // ── Helper HTML ───────────────────────────────────────────────────────
  const section = (icon, title, content, extra) => `
    <div style="background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:20px 24px;box-shadow:0 1px 4px rgba(0,0,0,.05);">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;">
        <div style="font-size:14px;font-weight:700;color:#1e293b;">${icon}&nbsp; ${title}</div>
        ${extra || ''}
      </div>
      ${content}
    </div>`;

  const row = (label, value) => `
    <div style="display:flex;align-items:baseline;gap:10px;padding:6px 0;border-bottom:1px solid #f1f5f9;">
      <span style="font-size:11px;font-weight:700;color:#64748b;min-width:160px;">${label}</span>
      <span style="font-size:12px;color:#334155;">${value}</span>
    </div>`;

  // ── Section 1 : Configuration projet ─────────────────────────────────
  const cpEditHtml = canEditCfg ? `
    <div style="margin-top:12px;">
      <label style="font-size:11px;font-weight:700;color:#64748b;display:block;margin-bottom:4px;">
        👤 Chef de Projet
        <span style="font-weight:400;color:#94a3b8;font-size:10px;margin-left:5px;">— affectataire par défaut à l'import si responsable inconnu</span>
      </label>
      <div style="display:grid;grid-template-columns:1fr auto;gap:8px;align-items:center;max-width:420px;">
        <input id="param-chef-input" type="text" list="dl-owners" value="${_esc(cpName)}"
          placeholder="Choisir parmi le référentiel…"
          style="padding:7px 10px;border:1.5px solid #cbd5e1;border-radius:8px;font-size:12px;box-sizing:border-box;outline:none;">
        <button onclick="_saveParamChef()" class="btn btn-primary btn-sm">Enregistrer</button>
      </div>
      <div id="param-cp-quickpick" style="display:flex;flex-wrap:wrap;gap:5px;margin-top:6px;"></div>
    </div>` : `
    <div style="margin-top:8px;">
      <span style="font-size:11px;font-weight:700;color:#64748b;">👤 Chef de Projet : </span>
      <span style="font-size:12px;color:#334155;">${cpName || '<em style="color:#94a3b8;">non défini</em>'}</span>
    </div>`;

  const sec1 = section('🗂️', 'Configuration du Projet',
    row('Projet', projName) +
    row('Date début', projStart) +
    row('Date fin', projEnd) +
    cpEditHtml,
    canEditCfg ? `<button onclick="openEditProjectModal()" class="btn btn-secondary btn-sm">✏️ Modifier le projet</button>` : ''
  );

  // ── Section 2 : Référentiel Responsables (éditeur intégré) ───────────────
  const badgeHtml = placeholders.length
    ? `<div style="background:#fef2f2;border:1px solid #fca5a5;border-radius:8px;padding:8px 12px;margin-bottom:10px;display:flex;align-items:center;justify-content:space-between;">
        <span style="font-size:12px;font-weight:600;color:#b91c1c;">⚠️ ${placeholders.length} responsable(s) provisoire(s) à qualifier</span>
        <button onclick="_openOwnerMappingModal()" class="btn btn-secondary btn-sm" style="border-color:#fca5a5;color:#b91c1c;">🗺️ Mapper</button>
      </div>`
    : '';

  const addFormCols = 'minmax(120px,1.4fr) 80px 90px minmax(100px,1fr) minmax(130px,1.1fr) auto';
  const addFormHtml = canEditCfg ? `
    <div style="background:#f8fafc;border:1px dashed #c7d2fe;border-radius:8px;padding:8px 10px;margin-top:8px;">
      <div style="font-size:10px;font-weight:700;color:#6366f1;margin-bottom:5px;text-transform:uppercase;">➕ Nouveau responsable</div>
      <div style="display:grid;grid-template-columns:${addFormCols};gap:5px;align-items:end;">
        <input id="param-owner-new-input" type="text" placeholder="Nom / équipe…" style="width:100%;padding:6px 7px;border:1px solid #c7d2fe;border-radius:4px;font-size:11px;box-sizing:border-box;" onkeydown="if(event.key==='Enter')addOwner('param-owner-new')">
        <select id="param-owner-new-side" style="width:100%;padding:6px 5px;border:1px solid #c7d2fe;border-radius:4px;font-size:11px;box-sizing:border-box;">
          <option value="">Entité</option>
          <option value="BOA">BOA</option>
          <option value="CBS">CBS</option>
          <option value="BOA + CBS">BOA+CBS</option>
          <option value="Externe">Externe</option>
        </select>
        <select id="param-owner-new-type" style="width:100%;padding:6px 5px;border:1px solid #c7d2fe;border-radius:4px;font-size:11px;box-sizing:border-box;">
          <option value="">Intervention</option>
          <option value="Métier">Métier</option>
          <option value="Technique">Technique</option>
          <option value="Mixte">Mixte</option>
        </select>
        <input id="param-owner-new-domain" list="dl-owner-domains" type="text" placeholder="Domaine…" style="width:100%;padding:6px 7px;border:1px solid #c7d2fe;border-radius:4px;font-size:11px;box-sizing:border-box;" onkeydown="if(event.key==='Enter')addOwner('param-owner-new')">
        <input id="param-owner-new-email" type="email" placeholder="prenom.nom@…" style="width:100%;padding:6px 7px;border:1px solid #c7d2fe;border-radius:4px;font-size:11px;box-sizing:border-box;" onkeydown="if(event.key==='Enter')addOwner('param-owner-new')">
        <button onclick="addOwner('param-owner-new')" class="btn btn-primary btn-sm" style="white-space:nowrap;">+ Ajouter</button>
      </div>
    </div>` : '';

  const sec2 = section('👥', `Référentiel Responsables (${realOwners.length})`,
    badgeHtml +
    `<div id="param-owners-render" style="max-height:360px;overflow-y:auto;"></div>` +
    addFormHtml,
    ''
  );

  // ── Section 3 : Hub Import / Export ──────────────────────────────────
  const _importCards = [
    { key:'risques',    icon:'⚠️',  color:'#E63329', bg:'#FDEEEC', label:'Risques',
      desc:'Catégorie · Description · Probabilité · Impact · Owner · Statut · Plan d\'atténuation' },
    { key:'actions',    icon:'✅',  color:'#1565C0', bg:'#E8F0FE', label:'Plan d\'Actions',
      desc:'Libellé · Domaine · Responsable · Catégorie · Entité · Urgence · Dates · Statut' },
    { key:'arbitrages', icon:'⚖️', color:'#6d28d9', bg:'#ede9fe', label:'Arbitrages',
      desc:'Libellé · Source · Domaine · Priorité · Responsable · Échéance · Décision' },
    { key:'gaps',       icon:'📋', color:'#0f766e', bg:'#ccfbf1', label:'GAPs',
      desc:'Description · Référence · Domaine · Processus · Priorité · Phase · BM' },
  ];
  const importHub = _importCards.map(c => `
    <div style="background:${c.bg};border:1px solid ${c.color}33;border-radius:10px;padding:14px 16px;display:flex;flex-direction:column;gap:10px;">
      <div style="display:flex;align-items:center;gap:8px;">
        <span style="font-size:18px;">${c.icon}</span>
        <span style="font-size:13px;font-weight:700;color:${c.color};">${c.label}</span>
      </div>
      <div style="font-size:11px;color:#64748b;line-height:1.5;flex:1;">${c.desc}</div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;">
        <button onclick="_openDynImport('${c.key}')"
          style="flex:1;padding:6px 10px;background:${c.color};color:white;border:none;border-radius:6px;font-size:11px;font-weight:600;cursor:pointer;white-space:nowrap;">
          📥 Importer
        </button>
        <button onclick="_dynDownloadTemplateFor('${c.key}')"
          style="padding:6px 10px;background:white;color:${c.color};border:1.5px solid ${c.color};border-radius:6px;font-size:11px;font-weight:600;cursor:pointer;white-space:nowrap;">
          📄 Template
        </button>
      </div>
    </div>`).join('');

  const sec3 = section('📥', 'Import des Données',
    `<div style="font-size:12px;color:#64748b;margin-bottom:14px;">
       Importez vos données depuis un fichier <b>CSV</b> ou <b>Excel (.xlsx)</b>. L'outil détecte automatiquement
       les colonnes et vous permet de mapper manuellement les cas ambigus. Les fichiers multi-onglets sont supportés.
     </div>
     <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px;">
       ${importHub}
     </div>
     <div style="margin-top:16px;padding-top:14px;border-top:1px solid #e2e8f0;">
       <div style="font-size:12px;font-weight:700;color:#374151;margin-bottom:8px;">📤 Exports &amp; Planning</div>
       <div style="display:flex;flex-wrap:wrap;gap:8px;">
         <button onclick="_downloadImportTemplate()" class="btn btn-secondary btn-sm">📄 Template Planning Excel</button>
         <button onclick="_openImportDataModal()" class="btn btn-secondary btn-sm">📥 Importer un planning Gantt</button>
         <button onclick="exportGapsCSV()" class="btn btn-secondary btn-sm">📊 Export GAPs (CSV)</button>
         <button onclick="exportPivotCSV()" class="btn btn-secondary btn-sm">📊 Export Analyse (CSV)</button>
       </div>
     </div>`,
    ''
  );

  // ── Section 4 : Domaines fonctionnels ─────────────────────────────────
  const streamCount = streams.length;
  const streamListHtml = streamCount === 0
    ? '<div style="font-size:12px;color:#94a3b8;font-style:italic;">Aucun domaine défini.</div>'
    : `<div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:4px;">
        ${streams.map(s => {
          const sname = (typeof s === 'string') ? s : (s.name || s.label || JSON.stringify(s));
          return `<span style="background:#f0f4ff;color:#1565C0;border:1px solid #c5d8ff;border-radius:999px;padding:3px 10px;font-size:11px;font-weight:600;">${escHtml(sname)}</span>`;
        }).join('')}
       </div>`;

  const sec4 = section('🏷️', `Domaines fonctionnels (${streamCount})`,
    streamListHtml,
    ''
  );

  // ── Section 5 : Connexion / Backend ──────────────────────────────────
  const projectCount = (state.programme && state.programme.projects || []).length;
  const connRows = row('Type de backend', backendLabel)
    + row('Projets chargés', String(projectCount))
    + row('Projet actif', projName);

  const sec5 = section('🔌', 'Connexion & Source de données', connRows, '');

  // ── Layout en grille 2 colonnes ───────────────────────────────────────
  container.innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;padding:4px 2px;">
      <div style="display:flex;flex-direction:column;gap:20px;">
        ${sec1}
        ${sec3}
        ${sec5}
      </div>
      <div style="display:flex;flex-direction:column;gap:20px;">
        ${sec2}
        ${sec4}
      </div>
    </div>`;

  // Remplir les éléments dynamiques après injection du HTML
  _renderOwnersInParam();
  // Quick pick pour le CP (cliquable → renseigne le champ Chef de Projet)
  _renderOwnerQuickPick('param-cp-quickpick', '_paramSetChef');
}

function _paramSetChef(name) {
  const input = document.getElementById('param-chef-input');
  if (input) { input.value = name; input.focus(); }
}

function _saveParamChef() {
  const input = document.getElementById('param-chef-input');
  if (!input) return;
  const name = input.value.trim();
  const proj = (state.programme && state.programme.projects || []).find(p => p.id === state.currentProjectId);
  if (!proj) { showToast('⚠️ Aucun projet ouvert.', 2000); return; }
  proj.chefDeProjet = name;
  saveState('Chef de projet mis à jour');
  showToast('✅ Chef de Projet enregistré : ' + (name || '(vide)'), 2500);
  renderParametrageTab();
}

// ════════════════════════════════════════════════════════════════════════
// DASHBOARD
// ════════════════════════════════════════════════════════════════════════

function renderDashboardInterfaces() {
  const kpiBox  = document.getElementById('dash-iface-kpis');
  const arbBox  = document.getElementById('dash-iface-arb');
  if (!kpiBox && !arbBox) return;

  // Projet vierge sans interfaces définies — afficher état vide
  if (!_projUsesCBS()) {
    const techIfaces = state.technique && state.technique.interfaces;
    if (!techIfaces || techIfaces.length === 0) {
      if (kpiBox) kpiBox.innerHTML = '<div style="font-size:12px;color:#94a3b8;padding:8px 0;">Aucune interface technique définie — ajoutez des interfaces dans l\'onglet Technique.</div>';
      if (arbBox) arbBox.innerHTML = '';
      return;
    }
  }

  const ifaces = getTechInterfaces();

  // ── KPI counts ────────────────────────────────────────────────────────
  const total      = ifaces.length;
  const done       = ifaces.filter(i => i.status === 'done').length;
  const partial    = ifaces.filter(i => i.status === 'partial').length;
  const pendBOA    = ifaces.filter(i => i.status === 'pending_boa').length;
  const pendCBS    = ifaces.filter(i => i.status === 'pending_cbs').length;
  const withAction = ifaces.filter(i => i.actions && i.actions.length > 0).length;

  // Arbitrage counts across all interface actions
  let arbVal = 0, arbSub = 0, arbPend = 0, arbRej = 0;
  ifaces.forEach(iface => {
    (iface.actions || []).forEach(a => {
      if      (a.arbitrage === 'validated')  arbVal++;
      else if (a.arbitrage === 'submitted')  arbSub++;
      else if (a.arbitrage === 'rejected')   arbRej++;
      else                                    arbPend++;
    });
  });
  const arbTotal = arbVal + arbSub + arbPend + arbRej;

  // ── KPI tiles ─────────────────────────────────────────────────────────
  const tiles = [
    { label:'Total interfaces', val: total,      color:'#3b82f6' },
    { label:'Intégrées (done)', val: done,        color:'#22c55e' },
    { label:'Partielles',       val: partial,     color:'#f59e0b' },
    { label:'En attente BOA',   val: pendBOA,     color:'#ef4444' },
    { label:'En attente CBS',   val: pendCBS,     color:'#8b5cf6' },
    { label:'Avec actions',     val: withAction,  color:'#06b6d4' },
    { label:'Arb. validés',     val: arbVal,      color:'#16a34a' },
    { label:'Arb. en cours',    val: arbSub + arbPend, color:'#d97706' },
  ];

  if (kpiBox) {
    kpiBox.innerHTML = tiles.map(t => `
      <div style="background:#fff;border:1px solid #e8ecf4;border-radius:8px;padding:10px 14px;min-width:110px;text-align:center;flex:1;">
        <div style="font-size:22px;font-weight:700;color:${t.color};line-height:1.1;">${t.val}</div>
        <div style="font-size:10px;color:#666;margin-top:3px;text-transform:uppercase;letter-spacing:.4px;">${t.label}</div>
      </div>`).join('');
  }

  // ── Arbitrage stacked bar ──────────────────────────────────────────────
  if (arbBox) {
    if (arbTotal === 0) {
      arbBox.innerHTML = '<p style="color:#aaa;font-size:12px;margin:0;">Aucune action d\'arbitrage sur les interfaces.</p>';
    } else {
      const pct = v => Math.round(v / arbTotal * 100);
      const segments = [
        { val: arbVal,  label:'Validés',  color:'#16a34a' },
        { val: arbSub,  label:'Soumis',   color:'#3b82f6' },
        { val: arbPend, label:'En attente',color:'#f59e0b' },
        { val: arbRej,  label:'Rejetés',  color:'#ef4444' },
      ].filter(s => s.val > 0);

      const barHtml = segments.map(s =>
        `<div title="${s.label}: ${s.val}" style="width:${pct(s.val)}%;background:${s.color};height:100%;display:inline-block;"></div>`
      ).join('');

      const legendHtml = segments.map(s =>
        `<span style="display:inline-flex;align-items:center;gap:4px;font-size:11px;color:#444;margin-right:12px;">
          <span style="width:10px;height:10px;border-radius:2px;background:${s.color};display:inline-block;"></span>
          ${s.label} <strong>${s.val}</strong> (${pct(s.val)}%)
        </span>`
      ).join('');

      arbBox.innerHTML = `
        <div style="font-size:11px;color:#888;text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px;">
          Arbitrages sur actions interfaces — ${arbTotal} au total
        </div>
        <div style="width:100%;height:14px;border-radius:7px;overflow:hidden;background:#f0f0f0;margin-bottom:8px;">
          ${barHtml}
        </div>
        <div style="display:flex;flex-wrap:wrap;">${legendHtml}</div>`;
    }
  }
}

/**
 * Génère dynamiquement les alertes critiques dans le dashboard.
 * Remplace le HTML statique CBS par des alertes calculées depuis les données réelles.
 */
function renderDashboardAlerts(_cbsMode, _allArbs, _allActs, _allGaps) {
  const container = document.getElementById('alerts-container');
  if (!container) return;

  const alerts = [];

  // 1. Arbitrages P1 non décidés
  _allArbs.filter(a => a.prio === 'P1').forEach(a => {
    const dec = (state.arbitrages[a.id] || {}).decision || _getArbDefaultKey();
    if (dec === _getArbDefaultKey()) alerts.push({
      cls: 'alert-red', icon: '🔴',
      title: 'Arbitrage P1 non décidé — ' + (a.label || a.id),
      sub: 'Domaine: ' + (a.domain || '—') + ' · Resp: ' + (a.resp || '?'),
    });
  });

  // 2. Actions bloquées (status=blocked ou ancien RAG R)
  _allActs.forEach(a => {
    const sv = state.actions[a.id] || {};
    const isBlocked = sv.status === 'blocked' || (!sv.status && sv.rag === 'R');
    if (isBlocked) alerts.push({
      cls: 'alert-red', icon: '🔴',
      title: 'Action bloquée — ' + a.id + ' : ' + (a.action || '').slice(0, 60) + ((a.action||'').length > 60 ? '…' : ''),
      sub: 'Resp: ' + (a.resp || sv.responsable || '?') + ' · Domaine: ' + (a.domain || '—'),
    });
  });

  // 3. GAPs P1 non résolus (max 5 pour ne pas surcharger)
  const unresolvedP1 = _allGaps.filter(g => {
    const saved = state.gaps[g.ref] || {};
    const prio = saved.prio || g.prio;
    const statut = saved.statut || g.statut || '';
    const resolved = ['Couvert','Validé','Adoption','Exclu','couvert','validé'].some(kw => statut.includes(kw));
    return prio === 'P1' && !resolved;
  });
  if (unresolvedP1.length > 0) alerts.push({
    cls: 'alert-orange', icon: '🟠',
    title: unresolvedP1.length + ' GAP' + (unresolvedP1.length > 1 ? 's' : '') + ' P1 non résolus',
    sub: unresolvedP1.slice(0, 3).map(g => (g.ref || g.id || '')).join(', ') + (unresolvedP1.length > 3 ? '…' : ''),
  });

  // 4. Actions critiques non démarrées
  const critTodo = _allActs.filter(a => {
    const sv = state.actions[a.id] || {};
    const status = sv.status || (!sv.status && sv.rag ? {R:'blocked',O:'in_progress',G:'done',X:'todo'}[sv.rag] : 'todo');
    return a.urgence === 'Critique' && (!status || status === 'todo');
  });
  if (critTodo.length > 0) alerts.push({
    cls: 'alert-orange', icon: '🟡',
    title: critTodo.length + ' action' + (critTodo.length > 1 ? 's' : '') + ' critique' + (critTodo.length > 1 ? 's' : '') + ' non démarrée' + (critTodo.length > 1 ? 's' : ''),
    sub: critTodo.slice(0, 3).map(a => a.id).join(', ') + (critTodo.length > 3 ? '…' : ''),
  });

  // 5. Milestone Design Freeze dans moins de 30 jours
  const dfMilestone = _getMilestone('design_freeze');
  if (dfMilestone) {
    const today = new Date(); today.setHours(0,0,0,0);
    const daysLeft = Math.round((dfMilestone - today) / 86400000);
    if (daysLeft >= 0 && daysLeft <= 30) {
      const _adf = _getArbDefaultKey(); const pendingArbs = _allArbs.filter(a => { const d = (state.arbitrages[a.id]||{}).decision; return !d || d === _adf; }).length;
      alerts.push({
        cls: daysLeft <= 7 ? 'alert-red' : 'alert-orange', icon: daysLeft <= 7 ? '🔴' : '🟠',
        title: 'Design Freeze dans J-' + daysLeft + ' — ' + dfMilestone.toLocaleDateString('fr-FR', {day:'numeric',month:'long',year:'numeric'}),
        sub: pendingArbs > 0 ? pendingArbs + ' arbitrage' + (pendingArbs > 1 ? 's' : '') + ' encore en cours · Finalisation requise' : 'Arbitrages OK',
      });
    }
  }

  // 6. Go Live passé
  const glMilestone = _getMilestone('go_live');
  if (glMilestone) {
    const today = new Date(); today.setHours(0,0,0,0);
    if (glMilestone < today) {
      alerts.push({
        cls: 'alert-red', icon: '⚠️',
        title: 'Go Live dépassé — ' + glMilestone.toLocaleDateString('fr-FR', {day:'numeric',month:'long',year:'numeric'}),
        sub: 'Le projet a dépassé sa date de Go Live cible',
      });
    }
  }

  if (alerts.length === 0) {
    container.innerHTML = '<div style="text-align:center;padding:20px 12px;color:#2E7D52;font-size:12px;">✅ Aucune alerte critique — situation sous contrôle.</div>';
    return;
  }

  container.innerHTML = alerts.map(a => `
    <div class="alert-item ${a.cls}">
      <span class="alert-icon">${a.icon}</span>
      <div class="alert-text">
        <div class="alert-title">${a.title}</div>
        <div class="alert-sub">${a.sub}</div>
      </div>
    </div>`).join('');
}

function renderDashboard() {
  renderOwnerDatalist();
  _renderOwnerDomainDatalist();
  renderRisques();
  // Mettre à jour le badge du chatbot
  setTimeout(_chatUpdateBadge, 200);

  // ── Source de données selon le projet ─────────────────────────────────────
  const _cbsMode = _projUsesCBS();
  const _allGaps = _cbsMode ? [...gaps, ...(state.customGaps||[])]        : (state.customGaps||[]);
  const _allArbs = _cbsMode ? [...arbitrages, ...(state.customArbitrages||[])] : (state.customArbitrages||[]);
  const _allActs = _cbsMode ? [...actions, ...(state.customActions||[])]  : (state.customActions||[]);

  // ── Dynamic totals ────────────────────────────────────────────────────────
  const gapsTotal  = _allGaps.length;
  const gapsP1     = _allGaps.filter(g => g.prio === 'P1').length;
  const gapsDomains = new Set(_allGaps.map(g => g.domain || g.domaine)).size;
  const arbTotal   = _allArbs.length;
  const actTotal   = _allActs.length;
  const el = id => document.getElementById(id);
  if (el('kpi-gaps-total'))    el('kpi-gaps-total').textContent    = gapsTotal || '—';
  if (el('kpi-gaps-p1'))       el('kpi-gaps-p1').textContent       = gapsTotal ? gapsP1 : '—';
  if (el('kpi-gaps-sub'))      el('kpi-gaps-sub').textContent      = gapsTotal ? gapsDomains + ' domaine' + (gapsDomains > 1 ? 's' : '') : '—';
  if (el('kpi-arb-total'))     el('kpi-arb-total').textContent     = arbTotal || '—';
  if (el('kpi-actions-total')) el('kpi-actions-total').textContent = actTotal || '—';
  if (el('kpi-actions-hdr'))   el('kpi-actions-hdr').textContent   = actTotal;
  // GAPs tab badge
  if (el('tab-gaps-badge'))    el('tab-gaps-badge').textContent    = gapsTotal ? '(' + gapsTotal + ')' : '';
  // GAPs tab header title
  if (el('gaps-header-title')) el('gaps-header-title').textContent = '📋 Matrice des GAPs' + (gapsTotal ? ' (' + gapsTotal + ')' : '') + ' — Arbitrage & Suivi';

  // ── Alertes critiques (générées dynamiquement depuis les données réelles) ──
  renderDashboardAlerts(_cbsMode, _allArbs, _allActs, _allGaps);

  // ── Jalons / Countdown : masquer si pas de milestones configurés pour ce projet ─
  const _df = state.programme && state.programme.milestones && state.programme.milestones.design_freeze;
  const _gl = state.programme && state.programme.milestones && state.programme.milestones.go_live;
  const _freezeBadge = el('countdown-freeze');
  const _liveBadge   = el('countdown-live');
  if (_freezeBadge) _freezeBadge.style.display = (_df || _cbsMode) ? '' : 'none';
  if (_liveBadge)   _liveBadge.style.display   = (_gl || _cbsMode) ? '' : 'none';

  // ── Interfaces KPIs ───────────────────────────────────────────────────────
  renderDashboardInterfaces();

  // ── Périmètre Modules KPIs ────────────────────────────────────────────────
  renderPerimetreKpiDash();

  // ── Arbitrages stats ──────────────────────────────────────────────────────
  const _dashArbDecs = _getArbDecisions();
  const _dashArbDefKey = _getArbDefaultKey();
  let decided = 0, byDec = {};
  _dashArbDecs.forEach(d => { byDec[d.key] = 0; });
  _allArbs.forEach(a => {
    const s = (state.arbitrages[a.id] || {}).decision || _dashArbDefKey;
    byDec[s] = (byDec[s] || 0) + 1;
    if (s !== _dashArbDefKey) decided++;
  });
  if (el('dash-arb-done')) el('dash-arb-done').textContent = decided;
  const arbPct = arbTotal > 0 ? Math.round(decided / arbTotal * 100) : 0;
  if (el('arb-prog-fill'))  el('arb-prog-fill').style.width      = arbPct + '%';
  if (el('arb-prog-text'))  el('arb-prog-text').textContent      = arbPct + '%';
  if (el('arb-prog-count')) el('arb-prog-count').textContent     = decided + ' / ' + arbTotal;
  if (el('arb-by-decision')) el('arb-by-decision').innerHTML = _dashArbDecs
    .map(d => `<div style="background:${d.color}10;border:1px solid ${d.color};color:${d.color};
    border-radius:4px;padding:4px 10px;font-size:11px;font-weight:700;">
    ${byDec[d.key]||0} ${d.label}</div>`).join('');

  // ── Actions stats (utilise le nouveau système status) ─────────────────────
  let actTodo=0, actInProg=0, actOverdue=0, actDone=0, actCancelled=0;
  _allActs.forEach(a => {
    const sv = state.actions[a.id] || {};
    let status = sv.status;
    if (!status && sv.rag) {
      status = {R:'blocked',O:'in_progress',G:'done',X:'todo'}[sv.rag] || 'todo';
    }
    status = status || 'todo';
    if (status === 'in_progress') actInProg++;
    else if (status === 'done')        actDone++;
    else if (status === 'cancelled')   actCancelled++;
    else actTodo++;
    // Overdue = date fin calculée < aujourd'hui (même logique que Plan d'Action)
    if (_isActionOverdue(a, _allActs)) actOverdue++;
  });
  if (el('act-red'))           el('act-red').textContent           = actOverdue;
  if (el('act-orange'))        el('act-orange').textContent        = actInProg;
  if (el('act-green'))         el('act-green').textContent         = actDone;
  if (el('act-gray'))          el('act-gray').textContent          = actTodo;
  if (el('dash-actions-done')) el('dash-actions-done').textContent = actDone;

  // ── Tab badge arbitrages ──────────────────────────────────────────────────
  const pending = _allArbs.filter(a => {
    const dec = (state.arbitrages[a.id] || {}).decision || _dashArbDefKey;
    return dec === _dashArbDefKey;
  }).length;
  if (el('tab-arb-badge')) el('tab-arb-badge').textContent = pending;
  const _sb = el('sidebar-arb-badge'); if (_sb) _sb.textContent = pending;

  // ── Domain progress (GAPs par domaine) ───────────────────────────────────
  const dpEl = el('domain-progress');
  if (dpEl) {
    if (_cbsMode) {
      // Données CBS statiques
      const domainData = [
        {name:'Engagements & Risques',  p1:8,  closed:0},
        {name:'Poste Agence & Guichet', p1:6,  closed:0},
        {name:'Négoce International',   p1:6,  closed:0},
        {name:'Conformité LAB/FT',      p1:5,  closed:0},
        {name:'Moyens de Paiement',     p1:4,  closed:0},
        {name:'Réf. Clients & Comptes', p1:7,  closed:0},
        {name:'TFJ courus',             p1:3,  closed:0},
        {name:'Comptabilité & Finance', p1:1,  closed:0},
        {name:'Trésorerie & Change',    p1:2,  closed:0},
        {name:'Habilitations',          p1:1,  closed:0},
      ];
      dpEl.innerHTML = domainData.map(d => {
        const pct = Math.round(d.closed / d.p1 * 100);
        return `<div class="domain-row">
          <div class="domain-name">${d.name}</div>
          <div class="domain-bar">
            <div class="domain-bar-fill" style="width:${pct}%">
              ${pct > 10 ? `<span class="domain-bar-text">${pct}%</span>` : ''}
            </div>
          </div>
          <div class="domain-stats">${d.closed}/${d.p1} P1</div>
        </div>`;
      }).join('');
    } else {
      // Projet vierge — domaines calculés depuis les GAPs custom
      const customDomains = {};
      _allGaps.forEach(g => {
        const dom = g.domain || g.domaine || 'Autre';
        if (!customDomains[dom]) customDomains[dom] = {total:0, closed:0};
        customDomains[dom].total++;
        if (g.status === 'closed' || g.statut === 'closed') customDomains[dom].closed++;
      });
      const domEntries = Object.entries(customDomains);
      if (domEntries.length === 0) {
        dpEl.innerHTML = '<div style="font-size:11px;color:#94a3b8;text-align:center;padding:16px 0;">Aucun GAP défini — ajoutez des GAPs dans l\'onglet Analyse de Gaps</div>';
      } else {
        dpEl.innerHTML = domEntries.map(([name, d]) => {
          const pct = d.total > 0 ? Math.round(d.closed / d.total * 100) : 0;
          return `<div class="domain-row">
            <div class="domain-name">${name}</div>
            <div class="domain-bar">
              <div class="domain-bar-fill" style="width:${pct}%">
                ${pct > 10 ? `<span class="domain-bar-text">${pct}%</span>` : ''}
              </div>
            </div>
            <div class="domain-stats">${d.closed}/${d.total}</div>
          </div>`;
        }).join('');
      }
    }
  }

  // ── Actions en retard (même logique que Plan d'Action) ──────────────────
  const overdueActs = _allActs.filter(a => _isActionOverdue(a, _allActs));
  const todayMs = new Date(TODAY.toISOString().split('T')[0]).getTime();
  if (el('critical-actions-list')) el('critical-actions-list').innerHTML = overdueActs.length > 0
    ? `<div style="font-size:10px;font-weight:700;color:#b91c1c;margin-bottom:6px;">⚠️ ${overdueActs.length} action${overdueActs.length>1?'s':''} en retard</div>`
      + overdueActs.map(a => {
          const sv  = state.actions[a.id] || {};
          const end = _calcActionEndDate(a.id, _allActs) || sv.dateFin || a.dateFin || '';
          const daysLate = end ? Math.round((todayMs - new Date(end).getTime()) / 86400000) : null;
          const resp = a.resp || sv.resp || '—';
          return `<div onclick="switchTab('actions', document.querySelector('.tab-btn[data-tab=actions]')); setTimeout(()=>openEditActionModal('${a.id}'),200);"
            style="display:flex;align-items:center;gap:8px;padding:6px 8px;border-bottom:1px solid #fee2e2;cursor:pointer;border-radius:4px;transition:background .15s;"
            onmouseover="this.style.background='#fef2f2'" onmouseout="this.style.background=''">
            <span style="background:#dc2626;color:white;padding:1px 6px;border-radius:3px;font-size:9px;font-weight:700;flex-shrink:0;">${escHtml(a.id)}</span>
            <span style="flex:1;font-size:11px;font-weight:500;color:#1e293b;">${escHtml(a.action)}</span>
            <span style="font-size:10px;color:#64748b;white-space:nowrap;flex-shrink:0;">${escHtml(resp)}</span>
            ${daysLate != null ? `<span style="font-size:9px;font-weight:700;color:#dc2626;white-space:nowrap;flex-shrink:0;">+${daysLate}j</span>` : ''}
            <span style="font-size:10px;color:#94a3b8;flex-shrink:0;" title="Ouvrir l'action">↗</span>
          </div>`;
        }).join('')
    : '<div style="font-size:11px;color:var(--green);padding:6px 0;">✓ Aucune action en retard</div>';

  // ── Masquer les sections dashboard dont l'onglet est absent (permissions / CBS) ──────
  const _moduleTabMap = { gaps:'gaps', arbitrages:'arbitrages', actions:'actions',
                          gantt:'gantt', technique:'technique', perimetre:'perimetremodules' };
  // Collecte la visibilité de chaque onglet (display:none → masqué)
  const _tabVisible = {};
  document.querySelectorAll('.tab-btn[data-tab]').forEach(b => {
    const tid = b.dataset.tab;
    // Si déjà connu visible on garde visible ; sinon on prend l'état courant
    if (!_tabVisible[tid]) _tabVisible[tid] = (b.style.display !== 'none');
  });
  // Sections de la grille dashboard
  document.querySelectorAll('#tab-dashboard [data-module]').forEach(sec => {
    const tabId = _moduleTabMap[sec.dataset.module];
    if (tabId !== undefined) sec.style.display = (_tabVisible[tabId] !== false) ? '' : 'none';
  });
  // KPI cards dans la kpi-row
  document.querySelectorAll('#tab-dashboard .kpi-card[data-module]').forEach(kpi => {
    const tabId = _moduleTabMap[kpi.dataset.module];
    if (tabId !== undefined) kpi.style.display = (_tabVisible[tabId] !== false) ? '' : 'none';
  });

  // ── Récap Planning dynamique ──────────────────────────────────────────────────
  const retroBody = el('dash-retroplanning-body');
  if (retroBody) {
    const _phaseColors = ['#E63329','#E8702A','#54565A','#2E7D52','#1565C0','#7B1FA2','#00838F','#558B2F','#3949AB','#00897B'];
    const hiddenSet    = new Set(state.ganttHidden || []);
    const allTasks     = [...ganttTasks, ...(state.ganttCustom || [])];

    // Collecter phases et jalons
    const phases    = [];
    const jalons    = [];
    let phaseIdx    = 0;
    allTasks.filter(t => !hiddenSet.has(t.id)).forEach(t => {
      if (t.type === 'phase') {
        const {start, end} = getTaskDates(t);
        if (!start) return;
        const ov = !t._custom ? (state.gantt[t.id] || {}) : {};
        const label = ov._label || t.label || '';
        // Avancement : moyenne des tâches de cette phase
        const subT = allTasks.filter(s => s.phase === t.phase && s.type === 'task' && !hiddenSet.has(s.id));
        let phasePct = 0;
        if (subT.length > 0) {
          const sum = subT.reduce((acc, s) => {
            const ov2 = !s._custom ? (state.gantt[s.id] || {}) : {};
            return acc + (ov2._pct != null ? ov2._pct : Math.round((s.pct || 0) * 100));
          }, 0);
          phasePct = Math.round(sum / subT.length);
        } else {
          // Phase sans sous-tâches : lire le pct de la phase elle-même
          phasePct = !t._custom
            ? (ov._pct != null ? ov._pct : Math.round((t.pct || 0) * 100))
            : Math.round((t.pct || 0) * 100);
        }
        phases.push({ label, start, end, pct: phasePct, color: _phaseColors[phaseIdx++ % _phaseColors.length] });
      } else if (t.type === 'jalon') {
        const {start} = getTaskDates(t);
        if (!start) return;
        const ov = !t._custom ? (state.gantt[t.id] || {}) : {};
        jalons.push({ label: ov._label || t.label || '', date: start });
      }
    });

    if (phases.length === 0) {
      retroBody.innerHTML = '<div style="font-size:11px;color:#94a3b8;text-align:center;padding:20px;">Aucune phase définie dans le Gantt — ajoutez des phases pour voir le récap planning.</div>';
    } else {
      const todayStr   = TODAY.toISOString().split('T')[0];
      const fmt        = d => new Date(d).toLocaleDateString('fr-FR', {day:'numeric', month:'short'});
      const fmtMo      = d => new Date(d).toLocaleDateString('fr-FR', {month:'short', year:'2-digit'});

      // Plage totale
      const allDates   = phases.flatMap(p => [p.start, p.end]).concat(jalons.map(j => j.date)).filter(Boolean);
      const rangeStart = allDates.reduce((a,b) => a < b ? a : b);
      const rangeEnd   = allDates.reduce((a,b) => a > b ? a : b);
      const rsMs       = new Date(rangeStart).getTime();
      const reMs       = new Date(rangeEnd).getTime();
      const totalMs    = Math.max(reMs - rsMs, 1);
      const toPct      = d => Math.max(0, Math.min(100, (new Date(d) - rsMs) / totalMs * 100));
      const todayPct   = toPct(todayStr);

      // Stats globales
      const globalPct    = Math.round(phases.reduce((s,p) => s+p.pct, 0) / phases.length);
      const currentPhase = phases.find(p => p.start <= todayStr && todayStr <= p.end);
      const latePhases   = phases.filter(p => p.end < todayStr && p.pct < 100);
      const donePhases   = phases.filter(p => p.pct >= 100);

      // Étiquettes mensuelles de l'axe
      const axisLabels = [];
      const _cur = new Date(rangeStart); _cur.setDate(1);
      const _end = new Date(rangeEnd);
      while (_cur <= _end) {
        axisLabels.push({ label: fmtMo(_cur.toISOString().split('T')[0]), pct: toPct(_cur.toISOString().split('T')[0]) });
        _cur.setMonth(_cur.getMonth() + 1);
      }

      // ── Bandeau stats ─────────────────────────────────────────────────
      const arc = (pct) => {
        const r = 16, circ = 2 * Math.PI * r;
        const dash = (pct / 100) * circ;
        return `<svg width="42" height="42" style="transform:rotate(-90deg)">
          <circle cx="21" cy="21" r="${r}" fill="none" stroke="#e2e8f0" stroke-width="4"/>
          <circle cx="21" cy="21" r="${r}" fill="none" stroke="${pct>=100?'#16a34a':pct>0?'#1565C0':'#94a3b8'}" stroke-width="4"
            stroke-dasharray="${dash.toFixed(1)} ${circ.toFixed(1)}" stroke-linecap="round"/>
        </svg>
        <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:900;color:#1e293b;">${pct}%</div>`;
      };

      let statsHtml = `<div style="display:flex;gap:10px;flex-wrap:wrap;padding:12px 16px;border-bottom:1px solid #e2e8f0;background:#f8fafc;">`;

      // Avancement global
      statsHtml += `<div style="display:flex;align-items:center;gap:10px;background:#fff;border:1px solid #e2e8f0;border-radius:8px;padding:8px 14px;flex:1;min-width:160px;">
        <div style="position:relative;width:42px;height:42px;flex-shrink:0;">${arc(globalPct)}</div>
        <div><div style="font-size:12px;font-weight:700;color:#1e293b;">Avancement global</div>
          <div style="font-size:10px;color:#64748b;">${phases.length} phase${phases.length>1?'s':''} · ${donePhases.length} terminée${donePhases.length>1?'s':''}</div></div>
      </div>`;

      // Phase en cours
      if (currentPhase) {
        statsHtml += `<div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:8px 14px;flex:1;min-width:160px;">
          <div style="font-size:10px;font-weight:700;color:#1d4ed8;">📌 Phase en cours</div>
          <div style="font-size:12px;font-weight:700;color:#1e293b;margin-top:2px;">${escHtml(currentPhase.label.substring(0,30))}</div>
          <div style="font-size:10px;color:#64748b;">→ ${fmt(currentPhase.end)} · ${currentPhase.pct}%</div>
        </div>`;
      }

      // Phases en retard
      if (latePhases.length > 0) {
        statsHtml += `<div style="background:#fef2f2;border:1px solid #fca5a5;border-radius:8px;padding:8px 14px;flex:1;min-width:130px;">
          <div style="font-size:10px;font-weight:700;color:#b91c1c;">⚠️ En retard</div>
          <div style="font-size:22px;font-weight:900;color:#b91c1c;">${latePhases.length}</div>
          <div style="font-size:10px;color:#b91c1c;">${latePhases.map(p => escHtml(p.label.substring(0,18))).join(', ')}</div>
        </div>`;
      }

      // Jalons à venir (30 jours)
      const upcomingJ = jalons.filter(j => j.date >= todayStr && j.date <= addDays(todayStr, 30));
      if (upcomingJ.length > 0) {
        statsHtml += `<div style="background:#faf5ff;border:1px solid #d8b4fe;border-radius:8px;padding:8px 14px;flex:1;min-width:130px;">
          <div style="font-size:10px;font-weight:700;color:#7c3aed;">🔷 Jalons &lt; 30j</div>
          ${upcomingJ.slice(0,3).map(j => `<div style="font-size:10px;color:#1e293b;margin-top:3px;"><strong>${fmt(j.date)}</strong> ${escHtml(j.label.substring(0,22))}</div>`).join('')}
        </div>`;
      }

      statsHtml += `</div>`;

      // ── Timeline des phases ────────────────────────────────────────────
      const LABEL_W = 148;
      let timelineHtml = `<div style="padding:14px 16px 10px;">`;

      phases.forEach(p => {
        const left  = toPct(p.start).toFixed(1);
        const width = Math.max(0.5, toPct(p.end) - toPct(p.start)).toFixed(1);
        const isDone    = p.pct >= 100;
        const isLate    = p.end < todayStr && !isDone;
        const isCurrent = p.start <= todayStr && todayStr <= p.end;
        const barColor  = isLate ? '#dc2626' : p.color;
        const statusIcon = isDone ? '✓' : isLate ? '⚠' : isCurrent ? '▶' : '';
        const statusColor = isDone ? '#16a34a' : isLate ? '#dc2626' : '#64748b';

        timelineHtml += `<div style="display:flex;align-items:center;gap:8px;margin-bottom:5px;">
          <div style="width:${LABEL_W}px;font-size:10px;font-weight:600;color:#334155;text-align:right;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex-shrink:0;" title="${escAttr(p.label)}">${escHtml(p.label.substring(0,22))}</div>
          <div style="flex:1;position:relative;height:20px;">
            <div style="position:absolute;left:${left}%;width:${width}%;height:100%;background:${barColor};border-radius:4px;overflow:hidden;" title="${escAttr(p.label)}: ${fmt(p.start)} → ${fmt(p.end)} (${p.pct}%)">
              <div style="width:${p.pct}%;height:100%;background:rgba(255,255,255,.22);"></div>
              ${parseFloat(width) > 10 ? `<div style="position:absolute;inset:0;display:flex;align-items:center;padding:0 5px;font-size:9px;font-weight:700;color:#fff;">${p.pct}%</div>` : ''}
            </div>
          </div>
          <div style="width:22px;text-align:center;font-size:10px;font-weight:700;color:${statusColor};flex-shrink:0;">${statusIcon}</div>
        </div>`;
      });

      // Jalons
      if (jalons.length > 0) {
        timelineHtml += `<div style="display:flex;align-items:center;gap:8px;margin-bottom:5px;">
          <div style="width:${LABEL_W}px;font-size:10px;font-weight:600;color:#7c3aed;text-align:right;flex-shrink:0;">Jalons</div>
          <div style="flex:1;position:relative;height:16px;">`;
        jalons.forEach(j => {
          const lp = toPct(j.date).toFixed(1);
          timelineHtml += `<div style="position:absolute;left:calc(${lp}% - 6px);top:0;width:12px;height:12px;background:#7c3aed;transform:rotate(45deg);border-radius:2px;" title="${escAttr(j.label)}: ${fmt(j.date)}"></div>`;
        });
        timelineHtml += `</div><div style="width:22px;flex-shrink:0;"></div></div>`;
      }

      // Marqueur aujourd'hui + axe temporel
      timelineHtml += `<div style="display:flex;align-items:flex-start;gap:8px;margin-top:6px;">
        <div style="width:${LABEL_W}px;flex-shrink:0;"></div>
        <div style="flex:1;position:relative;height:28px;border-top:1px solid #e2e8f0;">
          <div style="position:absolute;left:${todayPct.toFixed(1)}%;top:-1px;width:2px;height:14px;background:#ef4444;"></div>
          <div style="position:absolute;left:${todayPct.toFixed(1)}%;transform:translateX(-50%);top:14px;font-size:8px;color:#ef4444;font-weight:700;white-space:nowrap;">▲ Auj.</div>
          ${axisLabels.map(a => `<div style="position:absolute;left:${a.pct.toFixed(1)}%;transform:translateX(-50%);top:2px;font-size:9px;color:#94a3b8;white-space:nowrap;">${escHtml(a.label)}</div>`).join('')}
        </div>
        <div style="width:22px;flex-shrink:0;"></div>
      </div>`;

      timelineHtml += `</div>`;

      retroBody.innerHTML = statsHtml + timelineHtml;
    }
  }
}

// ════════════════════════════════════════════════════════════════════════
// GANTT
// ════════════════════════════════════════════════════════════════════════

function getTaskDates(task) {
  // Pour les tâches custom (_custom:true), les dates vivent UNIQUEMENT sur l'objet tâche.
  // state.gantt[id] est réservé aux overrides des tâches statiques (template CBS).
  const s = task._custom ? null : state.gantt[task.id];
  const rawStart = (s && s.start) || task.start || '';
  const rawEnd   = (s && s.end)   || task.end   || '';
  // Normaliser en YYYY-MM-DD : Supabase peut retourner '2026-03-31T00:00:00'
  // que <input type="date"> refuse silencieusement → champ vide
  const start = rawStart ? String(rawStart).slice(0, 10) : '';
  const end   = rawEnd   ? String(rawEnd).slice(0, 10)   : start;
  return { start, end };
}

function taskDuration(task) {
  const {start, end} = getTaskDates(task);
  const s = new Date(start), e = new Date(end);
  return Math.max(1, Math.round((e - s) / 86400000));
}

function addDays(dateStr, days) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

function toggleChain(on) {
  state.ganttChain = on;
  saveState();
}

// Peuple dynamiquement le select "Phase de rattachement" avec les phases existantes du Gantt.
// option.value        = clé CSS couleur (ex: "p0", "p1" … ou "p0" dérivé si phase custom)
// option.dataset.phaseId = id réel de la phase (pour ancrer la tâche via insertAfterId)
// selectedValue peut être : une clé CSS ("p0"…) ou un id de phase ("1", "custom_xxx")
function _populateGanttPhaseSelect(selectedValue) {
  const sel = document.getElementById('new-task-phase');
  if (!sel) return;

  const hiddenSet = new Set(state.ganttHidden || []);
  // Phases personnalisées (importées ou créées manuellement) — toujours prioritaires
  const _customPhases = (state.ganttCustom || []).filter(function(t){
    return t.type === 'phase' && !hiddenSet.has(t.id);
  });
  // Phases statiques du template (ganttTasks) : uniquement si CBS actif ET aucune phase custom
  // → évite d'afficher des phases du template Supabase quand l'utilisateur a importé son propre planning
  const _staticPhases = (_projUsesCBS() && _customPhases.length === 0)
    ? ganttTasks.filter(function(t){ return t.type === 'phase' && !hiddenSet.has(t.id); })
    : [];
  const phases = [..._staticPhases, ..._customPhases];

  sel.innerHTML = '';

  if (phases.length === 0) {
    const opt = document.createElement('option');
    opt.value = ''; opt.dataset.phaseId = '';
    opt.textContent = '— Aucune phase disponible —';
    sel.appendChild(opt);
    return;
  }

  const blank = document.createElement('option');
  blank.value = ''; blank.dataset.phaseId = '';
  blank.textContent = '— Choisir une phase —';
  sel.appendChild(blank);

  phases.forEach((p, idx) => {
    const opt = document.createElement('option');
    // Clé CSS : si la phase a un code p0..p5 valide, on le garde; sinon on dérive de l'index
    const colorKey = (p.phase && /^p\d+$/.test(p.phase)) ? p.phase : ('p' + (idx % 6));
    opt.value          = colorKey;   // utilisé pour la couleur de la barre
    opt.dataset.phaseId = p.id;      // utilisé pour le positionnement (insertAfterId)
    opt.textContent    = p.label || p.id;
    sel.appendChild(opt);
  });

  // Sélection : accepte colorKey OU phaseId comme selectedValue
  if (selectedValue) {
    // Essai 1 : correspondance directe par value (colorKey)
    let found = Array.from(sel.options).find(o => o.value === selectedValue);
    // Essai 2 : correspondance par phaseId (dataset)
    if (!found) found = Array.from(sel.options).find(o => o.dataset.phaseId === selectedValue);
    if (found) sel.value = found.value;
    else sel.selectedIndex = 1; // fallback sur 1ère phase réelle (index 1, après le blank)
  } else {
    sel.selectedIndex = 1; // par défaut : 1ère phase du Gantt
  }
}

/**
 * Adapte l'affichage du modal selon le type sélectionné.
 * Jalon → une seule date (début = date de l'événement), fin et durée masquées.
 */
function _updateGanttModalForType(type) {
  const isJalon = (type === 'jalon');
  const endCol     = document.getElementById('gantt-end-col');
  const durCol     = document.getElementById('gantt-dur-col');
  const startLabel = document.getElementById('gantt-start-label');
  const datesRow   = document.getElementById('gantt-dates-row');
  if (endCol)     endCol.style.display   = isJalon ? 'none' : '';
  if (durCol)     durCol.style.display   = isJalon ? 'none' : '';
  if (startLabel) startLabel.textContent = isJalon ? 'Date *' : 'Début *';
  if (datesRow)   datesRow.style.gridTemplateColumns = isJalon ? '1fr' : '1fr 1fr 90px';
}

function _ganttTypeChange() {
  _updateGanttModalForType(document.getElementById('new-task-type').value);
}

function _resetGanttModal() {
  document.getElementById('new-task-edit-id').value       = '';
  document.getElementById('new-task-insert-after-id').value = '';
  const _typeSelect = document.getElementById('new-task-type');
  if (_typeSelect) {
    _typeSelect.value    = 'task';
    // Attacher l'écouteur programmatiquement (indépendant du cache HTML)
    _typeSelect.onchange = function() { _updateGanttModalForType(this.value); };
  }
  document.getElementById('new-task-label').value         = '';
  _updateGanttModalForType('task'); // réinitialiser l'affichage des champs de date
  _populateGanttPhaseSelect();  // peuple dynamiquement depuis les phases du Gantt
  document.getElementById('new-task-resp').value          = '';
  document.getElementById('new-task-side').value          = '';
  document.getElementById('new-task-start').value         = '';
  document.getElementById('new-task-end').value           = '';
  document.getElementById('new-task-dur').value           = '';
  document.getElementById('new-task-pred').value          = '';
  if (document.getElementById('new-task-pred-search')) document.getElementById('new-task-pred-search').value = '';
  document.getElementById('new-task-pct').value           = '0';
  _renderItemDomainChips('gantt-task-domains-chips', null);
  _renderGanttPredOptions('');
  _renderGanttPredSelection();
  _setGanttParticipants([]);
  const _rEl = document.getElementById('new-task-rag');
  if (_rEl) _rEl.value = '';
  const _cEl = document.getElementById('new-task-commentaire');
  if (_cEl) _cEl.value = '';
  const _piEl = document.getElementById('new-task-participant-input');
  if (_piEl) _piEl.value = '';
  _renderOwnerQuickPick('new-task-quickpick', '_ganttQuickPick', 'new-task-participants');
}

function _ganttDependencyCandidates(editId) {
  const hidden = new Set(state.ganttHidden || []);
  const seen = new Set();
  return [...ganttTasks, ...(state.ganttCustom || [])]
    .filter(t => t && t.id && t.id !== editId)
    .filter(t => !hidden.has(t.id))
    .filter(t => !['phase', 'jalon', 'milestone', 'subtask', 'sous-tache', 'sous-tâche'].includes(String(t.type || '').toLowerCase()))
    .filter(t => {
      if (seen.has(t.id)) return false;
      seen.add(t.id);
      return true;
    })
    .map(t => {
      const rowNum = _ganttIdMap[t.id];
      const label = t.label || t._label || t.id;
      const owner = t.owner || t.resp || '—';
      const dates = getTaskDates(t);
      return {
        id: t.id,
        rowNum,
        label,
        owner,
        start: dates.start || '',
        end: dates.end || ''
      };
    })
    .sort((a, b) => {
      const ra = parseInt(a.rowNum || '999999', 10);
      const rb = parseInt(b.rowNum || '999999', 10);
      return ra - rb || a.label.localeCompare(b.label);
    });
}

function _getGanttTaskSide(task, ov) {
  const saved = ov || ((!task? null : (!task._custom && state.gantt[task.id]) ? state.gantt[task.id] : {}));
  return (saved && saved._side) || (task && task.side) || '';
}

function _renderGanttPredSelection() {
  const host = document.getElementById('new-task-pred-selected');
  if (!host) return;
  const selectedIds = (document.getElementById('new-task-pred')?.value || '').split(',').map(s => s.trim()).filter(Boolean);
  if (selectedIds.length === 0) {
    host.innerHTML = '<div style="font-size:10px;color:#94a3b8;">Aucune dépendance sélectionnée.</div>';
    return;
  }
  const map = new Map(_ganttDependencyCandidates(document.getElementById('new-task-edit-id')?.value || '').map(t => [t.id, t]));
  host.innerHTML = selectedIds.map(id => {
    const t = map.get(id) || { id, label: id, rowNum: '' };
    const rowInfo = t.rowNum ? 'Ligne ' + t.rowNum : t.id;
    return '<span style="display:inline-flex;align-items:center;gap:6px;background:#eef2ff;color:#3730a3;border:1px solid #c7d2fe;border-radius:999px;padding:4px 8px;font-size:10px;font-weight:700;">'
      + escHtml(rowInfo + ' · ' + (t.label || id))
      + '<button type="button" onclick="_removeGanttPredSelection(\'' + id.replace(/'/g, "\\'") + '\')" style="background:none;border:none;color:#4338ca;cursor:pointer;font-size:12px;line-height:1;padding:0;">×</button>'
      + '</span>';
  }).join('');
}

function _removeGanttPredSelection(id) {
  const input = document.getElementById('new-task-pred');
  if (!input) return;
  input.value = (input.value || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
    .filter(v => v !== id)
    .join(', ');
  _renderGanttPredOptions(document.getElementById('new-task-pred-search')?.value || '');
  _renderGanttPredSelection();
}

function _renderGanttPredOptions(filterValue) {
  const container = document.getElementById('new-task-pred-options');
  if (!container) return;
  const selected = new Set((document.getElementById('new-task-pred')?.value || '').split(',').map(s => s.trim()).filter(Boolean));
  const editId = document.getElementById('new-task-edit-id')?.value || '';
  const filter = String(filterValue || '').trim().toLowerCase();
  const candidates = _ganttDependencyCandidates(editId).filter(t => {
    if (!filter) return true;
    return [t.id, t.label, t.owner, t.rowNum, t.start, t.end].some(v => String(v || '').toLowerCase().includes(filter));
  });

  if (candidates.length === 0) {
    container.innerHTML = '<div style="font-size:11px;color:#94a3b8;padding:4px;">Aucune tâche trouvée pour ce projet.</div>';
    _renderGanttPredSelection();
    return;
  }

  container.innerHTML = candidates.map(t => {
    const checked = selected.has(t.id);
    const rowInfo = t.rowNum ? 'Ligne ' + t.rowNum : t.id;
    const dateInfo = [t.start, t.end].filter(Boolean).join(' → ') || 'Dates non renseignées';
    return `<label style="display:flex;align-items:flex-start;gap:8px;padding:7px 8px;border-radius:6px;border:1px solid ${checked ? '#c7d2fe' : '#e2e8f0'};background:${checked ? '#eef2ff' : '#fff'};cursor:pointer;">
      <input type="checkbox" value="${escHtml(t.id)}" ${checked ? 'checked' : ''} style="margin-top:2px;" onchange="_syncGanttPredInput()">
      <div style="min-width:0;display:flex;flex-direction:column;gap:2px;">
        <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;">
          <span style="font-size:10px;font-weight:700;color:#4338ca;background:#eef2ff;border-radius:999px;padding:1px 6px;">${escHtml(rowInfo)}</span>
          <span style="font-size:11px;font-weight:700;color:#0f172a;">${escHtml(t.label)}</span>
        </div>
        <div style="font-size:10px;color:#64748b;">${escHtml(t.owner)} · ${escHtml(dateInfo)}</div>
      </div>
    </label>`;
  }).join('');
  _renderGanttPredSelection();
}

function _syncGanttPredInput() {
  const container = document.getElementById('new-task-pred-options');
  if (!container) return;

  // IDs actuellement VISIBLES dans la liste filtrée (cochés ou non)
  const visibleIds  = new Set([...container.querySelectorAll('input[type=checkbox]')].map(i => i.value));
  // IDs COCHÉS parmi les visibles
  const checkedIds  = new Set([...container.querySelectorAll('input:checked')].map(i => i.value));

  // Partir de la sélection déjà mémorisée dans le champ caché
  const existing = new Set(
    (document.getElementById('new-task-pred')?.value || '').split(',').map(s => s.trim()).filter(Boolean)
  );

  // Pour les IDs visibles : ajouter les cochés, retirer les décochés
  // Les IDs non visibles (filtrés hors vue) restent intacts dans la sélection
  visibleIds.forEach(id => {
    if (checkedIds.has(id)) existing.add(id);
    else existing.delete(id);
  });

  document.getElementById('new-task-pred').value = [...existing].join(', ');
  _renderGanttPredSelection();
}

function filterGanttPredOptions() {
  _renderGanttPredOptions(document.getElementById('new-task-pred-search')?.value || '');
}

function _applyOwnerMetadataToGanttModal() {
  const owner = getOwnerRecord(document.getElementById('new-task-resp')?.value || '');
  if (!owner) return;
  const sideEl = document.getElementById('new-task-side');
  if (sideEl && !sideEl.value && owner.side) sideEl.value = owner.side;
}

function openAddTask() {
  _resetGanttModal();
  document.getElementById('gantt-modal-title').textContent = '➕ Ajouter une tâche';
  document.getElementById('gantt-modal-btn').textContent   = 'Ajouter au Gantt';
  _renderGanttPredOptions('');
  document.getElementById('add-task-modal').style.display  = 'flex';
}

// Ouvre le modal pour insérer une tâche APRÈS la ligne donnée
function openAddTaskAfter(afterTaskId) {
  _resetGanttModal();
  const rowNum = _ganttIdMap[afterTaskId];
  document.getElementById('gantt-modal-title').textContent = '➕ Insérer après la ligne ' + (rowNum || '');
  document.getElementById('gantt-modal-btn').textContent   = 'Insérer au Gantt';
  document.getElementById('new-task-insert-after-id').value = afterTaskId;
  // Pré-remplir la phase depuis la tâche de référence
  const allT = [...ganttTasks, ...(state.ganttCustom || [])];
  const ref  = allT.find(t => t.id === afterTaskId);
  // Pré-sélectionner la phase de la tâche de référence (si elle existe dans la liste)
  if (ref && ref.phase) _populateGanttPhaseSelect(ref.phase);
  _renderGanttPredOptions('');
  document.getElementById('add-task-modal').style.display = 'flex';
}

function openEditGanttTask(id) {
  const allTasks = [...ganttTasks, ...(state.ganttCustom || [])];
  const task = allTasks.find(t => t.id === id);
  if (!task) return;
  const isCustom = !!task._custom;
  // getTaskDates normalise déjà en YYYY-MM-DD (slice(0,10) inclus)
  const { start, end } = getTaskDates(task);
  const isJalon = task.type === 'jalon';
  const dur = isJalon ? 0 : Math.max(0, Math.round((new Date(end) - new Date(start)) / 86400000));

  // Pour les tâches statiques : lire les overrides stockés dans state.gantt[id]
  const ov    = (!isCustom && state.gantt[id]) ? state.gantt[id] : {};
  const label = ov._label != null  ? ov._label : (task.label || '');
  const owner = ov._owner != null  ? ov._owner : (task.owner || task.resp || '');
  const side  = _getGanttTaskSide(task, ov);
  const pct   = ov._pct   != null  ? ov._pct   : Math.round((task.pct || 0) * 100);
  const pred  = ov._pred  != null  ? ov._pred  : (task.pred || []);

  const predIds = pred.join(', ');

  _resetGanttModal();
  // Peupler les chips domaine depuis la tâche (custom : task.domains, statique : ov._domains)
  const taskDomains = isCustom ? (task.domains || null) : ((ov._domains !== undefined) ? ov._domains : null);
  _renderItemDomainChips('gantt-task-domains-chips', taskDomains);
  document.getElementById('gantt-modal-title').textContent   = isCustom ? "\u270F\uFE0F Modifier la t\u00e2che" : "\u270F\uFE0F Modifier la t\u00e2che (statique)";
  document.getElementById('gantt-modal-btn').textContent     = 'Enregistrer';
  document.getElementById('new-task-edit-id').value          = id;
  document.getElementById('new-task-type').value             = task.type  || 'task';
  _updateGanttModalForType(task.type || 'task'); // adapter les champs date au type
  document.getElementById('new-task-label').value            = label;
  _populateGanttPhaseSelect(task.phase || '');  // sélectionne la phase actuelle de la tâche
  document.getElementById('new-task-resp').value             = owner;
  document.getElementById('new-task-side').value             = side;
  document.getElementById('new-task-start').value            = start;
  document.getElementById('new-task-end').value              = end;
  document.getElementById('new-task-dur').value              = dur;
  document.getElementById('new-task-pred').value             = predIds;
  if (document.getElementById('new-task-pred-search')) document.getElementById('new-task-pred-search').value = '';
  _renderGanttPredOptions('');
  _renderGanttPredSelection();
  document.getElementById('new-task-pct').value              = pct;
  // Participants, RAG, commentaire
  const _editParts = isCustom ? (task.participants || []) : (ov._participants || task.participants || []);
  _setGanttParticipants(Array.isArray(_editParts) ? _editParts : []);
  const _ragEl = document.getElementById('new-task-rag');
  if (_ragEl) _ragEl.value = isCustom ? (task.rag || '') : (ov._rag || task.rag || '');
  const _commEl = document.getElementById('new-task-commentaire');
  if (_commEl) _commEl.value = isCustom ? (task.commentaire || '') : (ov._commentaire || task.commentaire || '');
  document.getElementById('add-task-modal').style.display    = 'flex';
}

function closeAddTask() {
  document.getElementById('add-task-modal').style.display = 'none';
}

// Sync Début / Fin / Durée dans le modal
function ganttModalDateChange(source) {
  const s   = document.getElementById('new-task-start').value;
  const e   = document.getElementById('new-task-end').value;
  const dur = parseInt(document.getElementById('new-task-dur').value);
  if (source === 'dur') {
    if (s && !isNaN(dur) && dur >= 0)
      document.getElementById('new-task-end').value = addDays(s, dur);
  } else {
    if (s && e)
      document.getElementById('new-task-dur').value = Math.max(0, Math.round((new Date(e) - new Date(s)) / 86400000));
  }
}

// Convertit un token (N° de ligne ou ID direct) en taskId
function _resolveTaskRef(token) {
  const num = parseInt(token);
  if (!isNaN(num) && _ganttRowMap[num]) return _ganttRowMap[num];
  return token; // déjà un ID
}

/**
 * Trouve la dernière tâche/jalon appartenant à une phase, en suivant la chaîne des ancres.
 * IMPORTANT : s'arrête dès qu'une tâche de type 'phase' est rencontrée dans la chaîne,
 * car dans un planning importé les phases sont chainées bout-à-bout (P1→T1→T2→P2→T3…).
 * Sans ce garde-fou, la traversée dépasse la fin de la phase cible.
 *
 * @param {string} phaseId     - ID de la phase dans laquelle chercher
 * @param {string} [excludeId] - ID à exclure du parcours (tâche en cours d'édition)
 * @returns {string|null}      - ID de la dernière tâche de la phase, ou null si vide
 */
function _findLastTaskInPhase(phaseId, excludeId) {
  const customs = (state.ganttCustom || []).filter(function(t){ return t.id !== excludeId; });
  const _allIds = new Set(customs.map(function(t){ return t.id; }));

  // Construire la map ancre → enfants directs
  const customAfter = {};
  customs.forEach(function(ct) {
    const anchor = ct.insertAfterId || null;
    if (anchor && (anchor === phaseId || _allIds.has(anchor))) {
      if (!customAfter[anchor]) customAfter[anchor] = [];
      customAfter[anchor].push(ct);
    }
  });

  // Traversée récursive en s'arrêtant dès qu'un enfant est une phase/sous-phase
  // (signe que l'on sort du bloc courant)
  function _lastInChain(id) {
    const children = (customAfter[id] || []).filter(function(c) {
      return c.type !== 'phase' && c.type !== 'subphase';
    });
    if (children.length === 0) return id;
    return _lastInChain(children[children.length - 1].id);
  }

  const lastId = _lastInChain(phaseId);
  return (lastId === phaseId) ? null : lastId;
}

async function submitAddTask() {
  if (!state.currentProjectId) {
    showToast('⚠️ Ouvrez un projet avant de créer une tâche Gantt.', 2500);
    return;
  }

  const editId        = document.getElementById('new-task-edit-id').value;
  const insertAfterId = document.getElementById('new-task-insert-after-id').value;
  const label         = document.getElementById('new-task-label').value.trim();
  let   start         = document.getElementById('new-task-start').value;
  const type          = document.getElementById('new-task-type').value;
  // phase : clé CSS couleur (ex: "p0", "p1"…) — lire depuis value ou data-phaseId
  const _phSel        = document.getElementById('new-task-phase');
  const _phOpt        = _phSel ? _phSel.options[_phSel.selectedIndex] : null;
  const phase         = (_phOpt && _phOpt.value) ? _phOpt.value : 'p0'; // clé CSS
  const _phaseAnchorId = (_phOpt && _phOpt.dataset.phaseId) ? _phOpt.dataset.phaseId : null; // id phase
  const resp          = document.getElementById('new-task-resp').value.trim();
  const side          = document.getElementById('new-task-side').value.trim();
  const predRaw       = document.getElementById('new-task-pred').value.trim();
  const pct           = Math.min(1, Math.max(0, (parseFloat(document.getElementById('new-task-pct').value) || 0) / 100));
  let   end           = document.getElementById('new-task-end').value;
  const domains       = _readItemDomainChips('gantt-task-domains-chips');
  const _partsRaw     = (document.getElementById('new-task-participants')?.value || '').trim();
  const participants  = _partsRaw ? _partsRaw.split(/[,;]+/).map(s => s.trim()).filter(Boolean) : [];
  const rag           = (document.getElementById('new-task-rag')?.value || '').trim();
  const commentaire   = (document.getElementById('new-task-commentaire')?.value || '').trim();

  if (!label) { alert('Veuillez renseigner le libellé.'); return; }
  if (!start) { alert('Veuillez renseigner la date de début.'); return; }
  // Pour les jalons : date de fin = date de début (un jalon est ponctuel)
  if (type === 'jalon') end = start;
  if (!end) end = start;

  // Convertir tokens (N° ou IDs) en IDs internes
  const pred = predRaw
    ? predRaw.split(',').map(s => _resolveTaskRef(s.trim())).filter(Boolean)
    : [];

  // ── Appliquer la contrainte prédécesseur : la tâche doit démarrer après la fin du dernier prédécesseur ──
  if (pred.length > 0) {
    const allTasksAll = [...ganttTasks, ...(state.ganttCustom || [])];
    let maxPredEnd = null;
    pred.forEach(pid => {
      const pt = allTasksAll.find(t => t.id === pid);
      if (pt) {
        const {end: pe} = getTaskDates(pt);
        if (!maxPredEnd || pe > maxPredEnd) maxPredEnd = pe;
      }
    });
    if (maxPredEnd) {
      const constrainedStart = addDays(maxPredEnd, 1);
      if (constrainedStart > start) {
        const dur = Math.max(0, Math.round((new Date(end) - new Date(start)) / 86400000));
        start = constrainedStart;
        end   = addDays(start, dur);
      }
    }
  }

  if (editId) {
    // ── Édition ──
    const ct = (state.ganttCustom || []).find(t => t.id === editId);
    if (ct) {
      // Tâche custom : mise à jour UNIQUEMENT sur l'objet dans ganttCustom.
      // Ne pas écrire dans state.gantt[id] pour éviter les conflits de priorité.
      ct.type  = type;  ct.label = label; ct.phase = phase;
      ct.owner = resp || '—'; ct.resp = resp || '—';
      ct.side  = side || '';
      ct.start = start; ct.end = end; ct.pred = pred; ct.pct = pct;
      ct.domains = domains;
      ct.participants = participants;
      ct.rag = rag || null;
      ct.commentaire = commentaire;
      // Détecter si la phase a changé → repositionner à la FIN de la nouvelle phase
      const _phaseChanged = _phaseAnchorId && (
        (ct._phaseId !== undefined && ct._phaseId !== _phaseAnchorId) ||
        (ct._phaseId === undefined && ct.phase !== phase)
      );
      if (_phaseChanged) {
        ct._phaseId = _phaseAnchorId;
        const _lastInNewPhase = _findLastTaskInPhase(_phaseAnchorId, editId);
        ct.insertAfterId = _lastInNewPhase || _phaseAnchorId;
      }
      // Supprimer tout override résiduel dans state.gantt pour cette tâche
      if (state.gantt[editId]) delete state.gantt[editId];
    } else {
      // Tâche statique : stocker les overrides dans state.gantt[id]
      if (!state.gantt[editId]) state.gantt[editId] = {};
      state.gantt[editId].start         = start;
      state.gantt[editId].end           = end;
      state.gantt[editId]._label        = label;
      state.gantt[editId]._owner        = resp || '—';
      state.gantt[editId]._side         = side || '';
      state.gantt[editId]._pct          = pct;
      state.gantt[editId]._pred         = pred;
      state.gantt[editId]._domains      = domains;
      state.gantt[editId]._participants = participants;
      state.gantt[editId]._rag          = rag || null;
      state.gantt[editId]._commentaire  = commentaire;
    }
  } else {
    // ── Ajout ──
    const id = 'custom_' + Date.now();
    if (!state.ganttCustom) state.ganttCustom = [];
    state.ganttCustom.push({
      id, type, label, phase, domains, start, end, pred, pct,
      owner: resp || '—', resp: resp || '—', side: side || '',
      participants, rag: rag || null, commentaire,
      _phaseId: _phaseAnchorId || null,
      insertAfterId: insertAfterId || (_phaseAnchorId ? (_findLastTaskInPhase(_phaseAnchorId) || _phaseAnchorId) : null),
      _custom: true
    });

    // ── Créer automatiquement une action liée pour les tâches (pas phases/jalons) ──
    if (type === 'task') {
      if (!state.customActions) state.customActions = [];
      const actId  = 'ACT_' + id.replace('custom_', '');
      const initPct = Math.round(pct * 100); // pct 0-1 → 0-100
      const initStatus = pct >= 1 ? 'done' : pct > 0 ? 'in_progress' : 'todo';
      const dur = Math.max(0, Math.round((new Date(end) - new Date(start)) / 86400000));
      const newAct = {
        id: actId, category: 'metier',
        _dbProjectId: state.currentProjectId || '',
        domain: (domains && domains.length > 0) ? domains[0] : '',
        action: label, resp: resp || '—', side: side || '',
        dependsOn: [], _custom: true, _history: [],
        _ganttTaskId: id   // ← lien vers la tâche Gantt
      };
      _pushHistory(newAct, 'created');
      state.customActions.push(newAct);
      if (!state.actions[actId]) state.actions[actId] = {};
      Object.assign(state.actions[actId], { status: initStatus, pct: initPct, dateDebut: start, duree: dur });
      if (typeof DB !== 'undefined' && typeof DB.saveAction === 'function') {
        const dbId = await DB.saveAction(newAct);
        if (dbId) newAct._dbId = dbId;
      }
      _saveCurrentProjectData();
      showToast('📅 Tâche ajoutée au plan d\'action (' + actId + ')', 2500);
    }
  }

  // ── Sync bidirectionnel Gantt ↔ Plan d'action (édition uniquement) ─────
  if (editId) {
    _syncGanttTaskToAction(editId, {
      label: label, resp: resp || '—', side: side || '',
      pct, start, end, participants,
      rag: rag || null, commentaire
    });
  }

  saveState();
  closeAddTask();

  // ── Cascade vers l'avant (successeurs de la tâche éditée/ajoutée) ──
  const finalId  = editId || ((state.ganttCustom || []).slice(-1)[0] || {}).id;
  const finalEnd = (editId && state.gantt[editId] && state.gantt[editId].end) || end;
  if (finalId) {
    cascadeSuccessors(finalId, finalEnd, new Set([finalId]));
    saveState();
  }

  // ── Recalcul en arrière si une dépendance a été supprimée ──
  // Quand on retire un prédécesseur, les dates ne doivent plus être "bloquées" par lui.
  // On recalcule la date de début contrainte par les prédécesseurs RESTANTS.
  if (editId && pred !== undefined) {
    const allTasksAll = [...ganttTasks, ...(state.ganttCustom || [])];
    const edited = allTasksAll.find(t => t.id === editId);
    if (edited) {
      let maxPredEnd = null;
      pred.forEach(pid => {
        const pt = allTasksAll.find(t => t.id === pid);
        if (pt) {
          const {end: pe} = getTaskDates(pt);
          if (!maxPredEnd || pe > maxPredEnd) maxPredEnd = pe;
        }
      });
      // Si plus de prédécesseurs : revenir à la date originale de la tâche (issue de ganttTasks ou custom)
      if (pred.length === 0) {
        const origStart = edited.start || start;
        const dur2 = Math.max(0, Math.round((new Date(end) - new Date(start)) / 86400000));
        if (!state.gantt[editId]) state.gantt[editId] = {};
        state.gantt[editId].start = origStart;
        state.gantt[editId].end   = addDays(origStart, dur2);
        // Recascade depuis la nouvelle fin
        cascadeSuccessors(editId, state.gantt[editId].end, new Set([editId]));
        saveState();
      }
    }
  }

  renderGantt();
  renderDashboard();
}

function removeCustomTask(id) {
  deleteGanttTask(id);
}

function deleteGanttTask(id) {
  if (!canAddDelete()) return;
  const allTasks = [...ganttTasks, ...(state.ganttCustom || [])];
  const task = allTasks.find(t => t.id === id);
  if (!task) return;
  const label = task.label || task._label || id;

  // Vérifier si une action liée existe
  const linkedAct = (state.customActions || []).find(a => a._ganttTaskId === id);
  const confirmMsg = linkedAct
    ? 'Supprimer "' + label + '" du planning Gantt ?\n\n⚠️ Une action liée (' + linkedAct.id + ') existe dans le Plan d\'Action — elle sera délinkée mais conservée.\n\nCette suppression de tâche est réversible via "Restaurer les tâches supprimées".'
    : 'Supprimer "' + label + '" du planning Gantt ?\n\nCette action est réversible via le bouton "Restaurer les tâches supprimées".';
  if (!confirm(confirmMsg)) return;

  if (task._custom) {
    // Tâche custom → retrait définitif de la liste
    state.ganttCustom = (state.ganttCustom || []).filter(t => t.id !== id);
  } else {
    // Tâche statique → masquage (réversible)
    if (!state.ganttHidden) state.ganttHidden = [];
    if (!state.ganttHidden.includes(id)) state.ganttHidden.push(id);
  }
  delete state.gantt[id];

  // ── Délinkage de l'action Plan d'Action associée ─────────────────────────
  if (linkedAct) {
    // On conserve l'action mais on retire le lien Gantt
    delete linkedAct._ganttTaskId;
    if (state.actions[linkedAct.id]) {
      state.actions[linkedAct.id]._orphan = true;  // Marquer comme orpheline
    }
    showToast('ℹ️ Action ' + linkedAct.id + ' conservée dans le Plan d\'Action (lien Gantt retiré)', 3000);
  }

  saveState();
  renderGantt();
  renderDashboard();
}

function restoreAllHiddenGantt() {
  if (!(state.ganttHidden && state.ganttHidden.length)) {
    alert('Aucune tâche masquée à restaurer.');
    return;
  }
  if (!confirm('Restaurer les ' + state.ganttHidden.length + ' tâche(s) masquée(s) ?')) return;
  const restoredIds = new Set(state.ganttHidden);
  state.ganttHidden = [];
  // Re-synchroniser les actions qui pointaient vers des tâches restaurées
  (state.customActions || []).forEach(a => {
    if (a._ganttTaskId && restoredIds.has(a._ganttTaskId)) {
      // Recalcule pct/dates Gantt depuis l'état de l'action
      _syncActionToGanttTask(a.id);
    }
  });
  saveState();
  renderGantt();
  renderDashboard();
}

// ── Sous-tâches Gantt ─────────────────────────────────────────────────────
function _resetSubtaskModal() {
  document.getElementById('subtask-label').value = '';
  document.getElementById('subtask-owner').value = '';
  document.getElementById('subtask-start').value = '';
  document.getElementById('subtask-end').value   = '';
  document.getElementById('subtask-pct').value   = '0';
}

function closeSubtaskModal() {
  document.getElementById('subtask-modal').style.display = 'none';
}

function openAddSubtask(parentId) {
  if (!canEdit()) return;
  _resetSubtaskModal();
  document.getElementById('subtask-parent-id').value = parentId;
  document.getElementById('subtask-edit-id').value   = '';
  document.getElementById('subtask-modal-title').textContent = '\u2295 Ajouter une sous-t\u00e2che';
  document.getElementById('subtask-modal-btn').textContent   = 'Ajouter';
  // Pre-fill dates from parent task
  const allT = [...ganttTasks, ...(state.ganttCustom||[])];
  const par  = allT.find(t => t.id === parentId);
  if (par) {
    const {start: ps, end: pe} = getTaskDates(par);
    document.getElementById('subtask-start').value = ps;
    document.getElementById('subtask-end').value   = pe;
  }
  document.getElementById('subtask-modal').style.display = 'flex';
}

function openEditSubtask(parentId, subId) {
  if (!canEdit()) return;
  const subs = (state.ganttSubtasks || {})[parentId] || [];
  const sub  = subs.find(s => s.id === subId);
  if (!sub) return;
  _resetSubtaskModal();
  document.getElementById('subtask-parent-id').value = parentId;
  document.getElementById('subtask-edit-id').value   = subId;
  document.getElementById('subtask-modal-title').textContent = '\u270F\uFE0F Modifier la sous-t\u00e2che';
  document.getElementById('subtask-modal-btn').textContent   = 'Enregistrer';
  document.getElementById('subtask-label').value = sub.label || '';
  document.getElementById('subtask-owner').value = sub.owner || '';
  document.getElementById('subtask-start').value = sub.start || '';
  document.getElementById('subtask-end').value   = sub.end   || '';
  document.getElementById('subtask-pct').value   = sub.pct != null ? sub.pct : 0;
  document.getElementById('subtask-modal').style.display = 'flex';
}

function saveSubtask() {
  if (!canEdit()) return;
  const parentId = document.getElementById('subtask-parent-id').value;
  const editId   = document.getElementById('subtask-edit-id').value;
  const label    = document.getElementById('subtask-label').value.trim();
  const owner    = document.getElementById('subtask-owner').value.trim();
  const start    = document.getElementById('subtask-start').value;
  const end      = document.getElementById('subtask-end').value || start;
  const pct      = Math.min(100, Math.max(0, parseInt(document.getElementById('subtask-pct').value)||0));
  if (!label) { alert('Veuillez renseigner le libell\u00e9.'); return; }
  if (!start) { alert('Veuillez renseigner la date de d\u00e9but.'); return; }
  if (!state.ganttSubtasks)           state.ganttSubtasks = {};
  if (!state.ganttSubtasks[parentId]) state.ganttSubtasks[parentId] = [];
  if (editId) {
    const sub = state.ganttSubtasks[parentId].find(s => s.id === editId);
    if (sub) { sub.label = label; sub.owner = owner; sub.start = start; sub.end = end; sub.pct = pct; }
  } else {
    state.ganttSubtasks[parentId].push({ id: 'sub_' + Date.now(), label, owner, start, end, pct });
  }
  saveState('subtask', label);
  closeSubtaskModal();
  renderGantt();
}

function removeSubtask(parentId, subId) {
  if (!canEdit()) return;
  if (!confirm('Supprimer cette sous-t\u00e2che ?')) return;
  if (state.ganttSubtasks && state.ganttSubtasks[parentId]) {
    state.ganttSubtasks[parentId] = state.ganttSubtasks[parentId].filter(s => s.id !== subId);
    if (state.ganttSubtasks[parentId].length === 0) delete state.ganttSubtasks[parentId];
  }
  saveState('subtask_del', subId);
  renderGantt();
}

function toggleSubtasksCollapse(parentId) {
  if (!state.ganttSubsCollapsed) state.ganttSubsCollapsed = {};
  state.ganttSubsCollapsed[parentId] = !state.ganttSubsCollapsed[parentId];
  renderGantt();
}

// Maps globaux : N° de ligne ↔ taskId (reconstruits à chaque renderGantt)
let _ganttRowMap = {}; // rowNum (1-based) → taskId
let _ganttIdMap  = {}; // taskId → rowNum

// ── Gantt filter helpers ──────────────────────────────────────────────────
function applyGanttFilter(key, val) {
  if (!state.ganttFilter) state.ganttFilter = {};
  state.ganttFilter[key] = val;
  saveState();
  renderGantt();
}

function resetGanttFilters() {
  state.ganttFilter = {};
  saveState();
  ['gf-search','gf-type','gf-side','gf-status','gf-phase'].forEach(function(id) {
    var el = document.getElementById(id);
    if (el) el.value = '';
  });
  renderGantt();
}

// ── Répare automatiquement ganttSubphases si vide alors que des tâches ont subphaseId ──
// Appelé au début de renderGantt(). Ne fait rien si ganttSubphases est déjà peuplé.
function _repairMissingSubphases() {
  const tasks = state.ganttCustom || [];
  if ((state.ganttSubphases || []).length > 0) return; // déjà OK
  // Vérifier si des tâches ont des subphaseId orphelins
  const orphanIds = new Set();
  tasks.forEach(function(t) { if (t.subphaseId) orphanIds.add(t.subphaseId); });
  if (orphanIds.size === 0) return; // aucun orphelin → rien à faire

  // Libellés connus pour les ID standard (importés via reorganize_v2 / app_import)
  const _KNOWN_LABELS = {
    'SP_INFRA':   'ENVIRONNEMENTS & INFRASTRUCTURE',
    'SP_PARAM':   'PARAMÉTRAGE STANDARD',
    'SP_REPORTS': 'LIVRAISON REPORTS V2',
    'SP_EVOL':    'ÉVOLUTIONS V2 → V4',
    'SP_TU_STD':  'TESTS UNITAIRES STANDARD',
    'SP_TU_EVOL': 'TU ÉVOLUTIONS V2 → V4',
    'SP_TNR':     'TESTS DE NON-RÉGRESSION (TNR)',
  };

  // Inférer phaseId de chaque sous-phase à partir de l'ordre phase→tâche dans ganttCustom
  const spPhaseMap = {};     // subphaseId → phaseId
  const spOrderMap = {};     // subphaseId → order of first encounter (pour trier)
  let currentPhaseId = null;
  let spCounter = 0;
  tasks.forEach(function(t) {
    if (t.type === 'phase' && !t.subphaseId) {
      currentPhaseId = t.id;
    } else if (t.subphaseId && currentPhaseId) {
      if (!(t.subphaseId in spPhaseMap)) {
        spPhaseMap[t.subphaseId] = currentPhaseId;
        spOrderMap[t.subphaseId] = spCounter++;
      }
    }
  });

  // Construire les entrées de sous-phases dans l'ordre de première apparition
  const rebuilt = [];
  Array.from(orphanIds)
    .sort(function(a, b) { return (spOrderMap[a] || 0) - (spOrderMap[b] || 0); })
    .forEach(function(spId) {
      const label = _KNOWN_LABELS[spId]
        || spId.replace(/^SP_/, '').replace(/_/g, ' ');  // fallback lisible
      rebuilt.push({
        id:      spId,
        label:   label,
        phaseId: spPhaseMap[spId] || '',
        type:    'subphase',
      });
    });

  if (rebuilt.length === 0) return;
  state.ganttSubphases = rebuilt;
  saveState('Auto-réparation sous-phases', rebuilt.length + ' sous-phases restaurées');
  console.info('[GANTT] _repairMissingSubphases → restauré', rebuilt.length, 'sous-phases :', rebuilt.map(function(s){return s.id;}).join(', '));
}

// ═══════════════════════════════════════════════════════════════════════
// REDIMENSIONNEMENT DES COLONNES GANTT
// ═══════════════════════════════════════════════════════════════════════

// Largeurs par défaut (px) pour les 11 colonnes de données (index 0-10)
// Index 11 = colonne barre Gantt → width:auto, pas de poignée
const _GANTT_COL_DEF_W = [30, 52, 56, 200, 112, 90, 80, 96, 96, 54, 90];
let _ganttColWidths = null; // null = pas encore chargé

function _loadGanttColWidths() {
  if (_ganttColWidths !== null) return;
  try {
    const s = localStorage.getItem('boa_gantt_col_widths');
    _ganttColWidths = s ? JSON.parse(s) : {};
  } catch(e) { _ganttColWidths = {}; }
}

function _saveGanttColWidths() {
  try { localStorage.setItem('boa_gantt_col_widths', JSON.stringify(_ganttColWidths || {})); } catch(e) {}
}

function _getGanttColW(idx) {
  _loadGanttColWidths();
  return (_ganttColWidths[idx] !== undefined) ? _ganttColWidths[idx] : (_GANTT_COL_DEF_W[idx] || 80);
}

/** Remet toutes les colonnes à leurs largeurs par défaut */
function resetGanttColWidths() {
  _ganttColWidths = {};
  _saveGanttColWidths();
  renderGantt();
  showToast('↺ Largeurs de colonnes réinitialisées', 1800);
}

/** Recalcule les offsets left des colonnes figées (sticky) après redimensionnement */
function _ganttRecomputeFrozenOffsets(table) {
  const headers = Array.from(table.querySelectorAll('thead th'));
  const frozen = [0, 1, 2, 3];
  const offsets = [];
  let cumLeft = 0;
  frozen.forEach(function(ci) {
    offsets.push(cumLeft);
    cumLeft += (headers[ci] ? headers[ci].offsetWidth : 0);
  });
  table.querySelectorAll('tr').forEach(function(tr) {
    const cells = tr.querySelectorAll('td, th');
    frozen.forEach(function(ci, fi) {
      const cell = cells[ci];
      if (!cell) return;
      cell.style.left = offsets[fi] + 'px';
    });
  });
}

/** Injecte le colgroup et les poignées de redimensionnement dans la table Gantt */
function _initGanttColResize() {
  const table = document.querySelector('#gantt-render .gantt-table');
  if (!table) return;
  _loadGanttColWidths();

  // ── colgroup : contrôle centralisé des largeurs (table-layout:fixed) ────────
  let cg = table.querySelector('colgroup');
  if (!cg) { cg = document.createElement('colgroup'); table.insertBefore(cg, table.firstChild); }
  cg.innerHTML = '';
  _GANTT_COL_DEF_W.forEach(function(_, idx) {
    const col = document.createElement('col');
    col.style.width = _getGanttColW(idx) + 'px';
    cg.appendChild(col);
  });
  // Colonne barre Gantt (dernière) — prend l'espace restant
  const barCol = document.createElement('col');
  barCol.style.minWidth = '300px';
  cg.appendChild(barCol);

  // ── Poignées de drag sur chaque th sauf la barre ─────────────────────────
  const headers = Array.from(table.querySelectorAll('thead th'));
  headers.forEach(function(th, idx) {
    if (idx >= _GANTT_COL_DEF_W.length) return; // pas de poignée sur la barre

    const handle = document.createElement('div');
    handle.className = 'gantt-resize-handle';
    handle.title = 'Redimensionner';

    handle.addEventListener('mousedown', function(e) {
      e.preventDefault(); e.stopPropagation();
      handle.classList.add('active');

      const cols  = cg.querySelectorAll('col');
      const col   = cols[idx];
      const startX = e.clientX;
      const startW = parseInt(col.style.width) || _getGanttColW(idx);

      function onMove(ev) {
        const newW = Math.max(30, startW + ev.clientX - startX);
        col.style.width = newW + 'px';
        _ganttColWidths[idx] = newW;
        if (idx <= 3) _ganttRecomputeFrozenOffsets(table);
      }

      function onUp() {
        handle.classList.remove('active');
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        _saveGanttColWidths();
      }

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });

    th.appendChild(handle);
  });
}

function renderGantt() {
  // Bifurcation Vue Master / Vue Détaillée
  if (_ganttViewMode === 'master') { renderGanttMaster(); return; }
  // ── Préserver la position de scroll avant le re-render ─────────────────
  const _prevScroll = (() => {
    const sc = document.querySelector('.gantt-table-scroll');
    return sc ? { top: sc.scrollTop, left: sc.scrollLeft } : null;
  })();
  // Réparer les sous-phases manquantes (si ganttSubphases vide mais tâches ont subphaseId)
  _repairMissingSubphases();
  // console.log('[GANTT-DBG v3] renderGantt called — CBS=' + _projUsesCBS() + ' ...');
  // Recalculer la plage pour inclure les tâches importées hors plage de base
  _refreshGanttRange();
  const todayPct = ganttPct(TODAY.toISOString().split('T')[0]);
  const toggle = document.getElementById('gantt-chain-toggle');
  if (toggle) toggle.checked = !!state.ganttChain;
  if (!state.ganttCollapsed) state.ganttCollapsed = {};

  // Bouton "Restaurer tâches" : visible seulement si des tâches sont cachées
  const _btnRestore = document.getElementById('btn-restore-gantt');
  if (_btnRestore) _btnRestore.style.display = ((state.ganttHidden || []).length > 0) ? '' : 'none';

  // ── Mettre à jour les boutons de zoom ─────────────────────────────────
  const curZoom = state.ganttZoom || 'month';
  ['month','week','day'].forEach(k => {
    const btn = document.getElementById('zoom-btn-' + k);
    if (btn) btn.classList.toggle('active', k === curZoom);
  });
  const scaleLabel = document.getElementById('gantt-scale-label');
  if (scaleLabel) scaleLabel.textContent = Math.round(_getGanttScale() * 100) + '%';

  // ── 1. Construire la liste ordonnée des tâches affichées ──────────────
  const customAfter  = {};
  const customOrphan = [];
  // IDs de toutes les tâches connues (statiques + custom existantes)
  const _staticIds  = _projUsesCBS() ? new Set() : new Set(ganttTasks.map(function(t){ return t.id; }));
  const _customIds  = new Set((state.ganttCustom || []).map(function(t){ return t.id; }));
  const _allKnownIds = new Set([...ganttTasks.map(function(t){ return t.id; }), ..._customIds]);
  (state.ganttCustom || []).forEach(ct => {
    const anchor = ct.insertAfterId || null;
    // Orphelin si : pas d'ancre, ancre statique (CBS=false), ou ancre introuvable (tâche supprimée)
    if (anchor && !_staticIds.has(anchor) && _allKnownIds.has(anchor)) {
      if (!customAfter[anchor]) customAfter[anchor] = [];
      customAfter[anchor].push(ct);
    } else { customOrphan.push(ct); }
  });

  const _hiddenSet   = new Set(state.ganttHidden || []);
  const allTasksRendered = [];
  const _renderedIds = new Set();
  let currentPhaseId = null;

  // Ajoute récursivement une tâche + toutes les tâches ancrées après elle.
  // parentCollapsed : true si la phase parente en cours est repliée.
  // Les phases sont TOUJOURS affichées (elles servent d'en-tête).
  // Les tâches/jalons sont masqués si leur phase parente est repliée.
  function _pushWithAnchoredChildren(task, parentCollapsed) {
    if (_renderedIds.has(task.id)) return;
    _renderedIds.add(task.id);

    const isPhaseNode = (task.type === 'phase');

    // Les phases s'affichent toujours ; les autres sont masquées si phase parente repliée
    if (!parentCollapsed || isPhaseNode) {
      if (!_hiddenSet.has(task.id)) allTasksRendered.push(task);
    }

    // Calcul de l'état collapse pour les enfants directs :
    // - si c'est une phase : collapse = état de cette phase
    // - si c'est une tâche/jalon sous une phase repliée : on propage le collapse
    //   SAUF si l'enfant est lui-même une phase (qui doit toujours apparaître)
    const thisCollapsed = isPhaseNode
      ? !!state.ganttCollapsed[task.id]
      : parentCollapsed; // propagation pour tâches/jalons intermédiaires

    (customAfter[task.id] || []).forEach(function(child) {
      _pushWithAnchoredChildren(child, thisCollapsed);
    });
  }

  // Si le projet n'utilise pas les données CBS, on ignore les tâches statiques
  if (_projUsesCBS()) {
    ganttTasks.forEach(task => {
      if (_hiddenSet.has(task.id)) return;  // tâche masquée → on saute
      if (task.type === 'phase') { currentPhaseId = task.id; }
      else if (currentPhaseId && state.ganttCollapsed[currentPhaseId]) return;
      _pushWithAnchoredChildren(task, false);
    });
  }
  // Orphelins custom (phases ou tâches sans ancre), avec leurs enfants ancrés
  customOrphan.forEach(function(ct) {
    if (!_renderedIds.has(ct.id)) _pushWithAnchoredChildren(ct, false);
  });

  // ── 1d. Injecter les sous-phases après leur phase parente ─────────────────
  if ((state.ganttSubphases || []).length > 0) {
    const _spList = state.ganttSubphases || [];
    const _newList = [];
    // Tâches déjà placées sous une sous-phase (ne pas les repousser en position libre)
    const _placedBySubphase = new Set();
    // Pré-calculer : subphaseId → [tasks]
    const _tasksBySubphase = {};
    allTasksRendered.forEach(function(t) {
      if (t.type === 'phase' || t.type === 'subphase') return;
      const spId = t.subphaseId || (state.gantt[t.id] && state.gantt[t.id]._subphaseId) || null;
      if (spId) {
        if (!_tasksBySubphase[spId]) _tasksBySubphase[spId] = [];
        _tasksBySubphase[spId].push(t);
        _placedBySubphase.add(t.id);
      }
    });
    allTasksRendered.forEach(function(t) {
      if (_placedBySubphase.has(t.id)) return; // déjà placé sous une sous-phase
      _newList.push(t);
      if (t.type === 'phase') {
        const _phCollapsed = !!state.ganttCollapsed[t.id];
        if (!_phCollapsed) {
          // Injecter chaque sous-phase + ses tâches immédiatement après
          _spList.filter(sp => sp.phaseId === t.id).forEach(function(sp) {
            _newList.push(sp);
            const _spCol = !!(state.ganttSubphasesCollapsed || {})[sp.id];
            if (!_spCol) {
              (_tasksBySubphase[sp.id] || []).forEach(function(task) {
                _newList.push(task);
              });
            }
          });
        }
      }
    });
    allTasksRendered.length = 0;
    _newList.forEach(function(t) { allTasksRendered.push(t); });
  }

  // ── 1e. Masquer les tâches sous une sous-phase repliée ────────────────────
  const _spCollapsed = state.ganttSubphasesCollapsed || {};
  if (Object.keys(_spCollapsed).length > 0) {
    const _filtered2 = allTasksRendered.filter(function(t) {
      if (t.type === 'phase' || t.type === 'subphase') return true;
      const spId = t.subphaseId || (state.gantt[t.id] && state.gantt[t.id]._subphaseId) || null;
      return !spId || !_spCollapsed[spId];
    });
    allTasksRendered.length = 0;
    _filtered2.forEach(function(t) { allTasksRendered.push(t); });
  }

  // ── 1b. Construire la map phase → tâches + alimenter le sélecteur ────────
  const _phaseMap = {}; // taskId -> phaseId (pour la phase parente)
  let   _lastPhaseId = null;
  allTasksRendered.forEach(function(t) {
    if (t.type === 'phase') { _lastPhaseId = t.id; }
    else if (_lastPhaseId)  { _phaseMap[t.id] = _lastPhaseId; }
  });

  // ── 1c. Map complète phaseId → enfants (TOUTES tâches, même repliées) ──
  // Construit une liste plate ordonnée SANS filtrer par collapse, puis en déduit les phases.
  const _allPhaseTasks = {}; // phaseId → [taskObjects]
  {
    const _flatAll    = [];
    const _flatSeen   = new Set();

    function _pushFlat(task) {
      if (_flatSeen.has(task.id)) return;
      _flatSeen.add(task.id);
      if (!_hiddenSet.has(task.id)) _flatAll.push(task);
      // Toujours descendre dans les enfants ancrés, quel que soit le collapse
      (customAfter[task.id] || []).forEach(function(child) { _pushFlat(child); });
    }

    if (_projUsesCBS()) {
      ganttTasks.forEach(function(task) { _pushFlat(task); });
    }
    customOrphan.forEach(function(ct) {
      if (!_flatSeen.has(ct.id)) _pushFlat(ct);
    });

    // Dériver _allPhaseTasks depuis la liste plate complète
    let _aptLastPhase = null;
    _flatAll.forEach(function(t) {
      if (t.type === 'phase') { _aptLastPhase = t.id; }
      else if (_aptLastPhase) {
        if (!_allPhaseTasks[_aptLastPhase]) _allPhaseTasks[_aptLastPhase] = [];
        _allPhaseTasks[_aptLastPhase].push(t);
      }
    });
    // console.log('[GANTT-DBG v4] flatAll=' + _flatAll.length + ' ...);
  }

  // ── 1c-bis. Map sous-phase → toutes tâches enfants ─
  const _allSubphaseTasks = {};
  (state.ganttCustom || []).forEach(function(t) {
    const spId = t.subphaseId || null;
    if (spId && t.type !== 'subphase' && t.type !== 'phase') {
      if (!_allSubphaseTasks[spId]) _allSubphaseTasks[spId] = [];
      _allSubphaseTasks[spId].push(t);
    }
  });
  ganttTasks.forEach(function(t) {
    const ov2 = state.gantt[t.id] || {};
    const spId = (ov2._subphaseId || t.subphaseId) || null;
    if (spId && t.type !== 'phase') {
      if (!_allSubphaseTasks[spId]) _allSubphaseTasks[spId] = [];
      _allSubphaseTasks[spId].push(t);
    }
  });

  // Alimenter le <select id="gf-phase"> avec les phases disponibles
  const _phaseSelect = document.getElementById('gf-phase');
  if (_phaseSelect) {
    const _prevPhaseVal = _phaseSelect.value;
    const _allPhases    = allTasksRendered.filter(function(t) { return t.type === 'phase'; });
    _phaseSelect.innerHTML = '<option value="">📌 Toutes phases</option>'
      + _allPhases.map(function(p) {
          const lbl = ((state.gantt[p.id] && state.gantt[p.id]._label) || p.label || p.id).substring(0, 45);
          return '<option value="' + p.id + '"' + (p.id === _prevPhaseVal ? ' selected' : '') + '>' + escHtml(lbl) + '</option>';
        }).join('');
  }

  // ── 1c. Appliquer les filtres actifs ──────────────────────────────────
  const _f     = state.ganttFilter || {};
  const _fText = (_f.text || '').trim().toLowerCase();
  const _fType = _f.type   || '';
  const _fSide = _f.side   || '';
  const _fRag  = _f.rag    || '';
  const _fStat = _f.status || '';
  const _fPhId = _f.phaseId|| '';
  const _hasF  = !!(_fText || _fType || _fSide || _fRag || _fStat || _fPhId);

  if (_hasF) {
    // Passe 1 : trouver les IDs de tâches qui correspondent
    const _matchSet     = new Set();
    const _matchedPhIds = new Set();

    allTasksRendered.forEach(function(t) {
      if (t.type === 'phase' || t.type === 'subphase') return;
      const isCustom = !!t._custom;
      const ov   = (!isCustom && state.gantt[t.id]) ? state.gantt[t.id] : {};
      const lbl  = (ov._label || t.label || '').toLowerCase();
      const side = _getGanttTaskSide(t, ov);
      const rag  = isCustom ? (t.rag || '') : (ov._rag || t.rag || '');
      const pct  = ov._pct != null ? ov._pct : Math.round((t.pct || 0) * 100);

      if (_fPhId && _phaseMap[t.id] !== _fPhId) return;
      if (_fText && !lbl.includes(_fText)) return;
      if (_fType) {
        if (_fType === 'custom' && !isCustom) return;
        if (_fType !== 'custom' && t.type !== _fType) return;
      }
      if (_fSide && side !== _fSide) return;
      if (_fRag) {
        const rv = String(rag).toUpperCase();
        if (_fRag === 'R' && rv !== 'R') return;
        if (_fRag === 'A' && rv !== 'A' && rv !== 'O') return;
        if (_fRag === 'G' && rv !== 'G') return;
      }
      if (_fStat) {
        if (_fStat === 'todo'       && pct !== 0)                    return;
        if (_fStat === 'inprogress' && (pct <= 0 || pct >= 100))     return;
        if (_fStat === 'done'       && pct < 100)                    return;
      }

      _matchSet.add(t.id);
      const pid = _phaseMap[t.id];
      if (pid) _matchedPhIds.add(pid);
    });

    // Passe 2 : filtrer allTasksRendered
    const _filtered = allTasksRendered.filter(function(t) {
      if (t.type === 'phase') {
        if (_fPhId && t.id !== _fPhId) return false;
        // Garder la phase si elle a des enfants qui matchent
        const otherFilters = _fText || _fType || _fSide || _fRag || _fStat;
        if (otherFilters) return _matchedPhIds.has(t.id);
        return true; // si seul le filtre phase est actif, garder la phase
      }
      if (t.type === 'subphase') {
        const _spChildren = _allSubphaseTasks[t.id] || [];
        return _spChildren.some(function(c) { return _matchSet.has(c.id); });
      }
      return _matchSet.has(t.id);
    });

    allTasksRendered.length = 0;
    _filtered.forEach(function(t) { allTasksRendered.push(t); });
  }

  // Mettre à jour l'UI du filtre (bouton reset + compteur + RAG buttons + active class)
  const _resetBtn  = document.getElementById('gf-reset');
  const _countEl   = document.getElementById('gf-count');
  if (_resetBtn) _resetBtn.style.display = _hasF ? 'inline-flex' : 'none';
  if (_countEl) {
    if (_hasF) {
      const _visibleCount = allTasksRendered.filter(function(t) { return t.type !== 'phase'; }).length;
      _countEl.textContent = _visibleCount + ' tâche' + (_visibleCount !== 1 ? 's' : '');
      _countEl.style.display = '';
    } else {
      _countEl.style.display = 'none';
    }
  }
  // Sync selects + wrapper highlight avec state
  const _syncSel = function(id, key, wrapId) {
    const el   = document.getElementById(id);
    const wrap = wrapId ? document.getElementById(wrapId) : null;
    const active = !!(_f[key]||'');
    if (el && el.value !== (_f[key]||'')) el.value = (_f[key]||'');
    if (el)   el.classList.toggle('gf-active', active);
    if (wrap) wrap.classList.toggle('gf-active', active);
  };
  _syncSel('gf-type',  'type',    'gf-wrap-type');
  _syncSel('gf-side',  'side',    'gf-wrap-side');
  _syncSel('gf-status','status',  'gf-wrap-status');
  _syncSel('gf-phase', 'phaseId', 'gf-wrap-phase');
  const _searchEl = document.getElementById('gf-search');
  if (_searchEl && document.activeElement !== _searchEl) _searchEl.value = _fText;
  // Boutons RAG
  ['', 'R', 'A', 'G'].forEach(function(v) {
    const btn = document.getElementById('gf-rag-' + (v || 'all'));
    if (btn) btn.classList.toggle('active', _fRag === v);
  });

  // ── 2. Construire les maps N° ↔ ID ───────────────────────────────────
  _ganttRowMap = {};
  _ganttIdMap  = {};
  allTasksRendered.forEach((task, i) => {
    _ganttRowMap[i + 1]  = task.id;
    _ganttIdMap[task.id] = i + 1;
  });

  // ── 3. Colonnes selon le zoom ─────────────────────────────────────────
  const cols = buildGanttCols(curZoom);

  // ── 4. Générer les lignes HTML ─────────────────────────────────────────
  let rows = '';

  allTasksRendered.forEach((task, idx) => {
    const rowNum   = idx + 1;
    const isCustom = !!task._custom;

    // Lire les overrides pour les tâches statiques
    const ov         = (!isCustom && state.gantt[task.id]) ? state.gantt[task.id] : {};
    const dispLabel  = ov._label  || task.label            || '';
    const dispOwner  = ov._owner  || task.owner || task.resp || '—';
    const dispSide   = _getGanttTaskSide(task, ov);
    const dispPct0   = ov._pct    != null ? ov._pct : Math.round((task.pct || 0) * 100);
    const dispPred         = ov._pred         || task.pred         || [];
    const dispParticipants = (isCustom ? task.participants : (ov._participants || task.participants)) || [];
    const dispRag          = isCustom ? (task.rag || null) : (ov._rag || task.rag || null);
    const dispCommentaire  = isCustom ? (task.commentaire || '') : (ov._commentaire || task.commentaire || '');

    let {start, end} = getTaskDates(task);
    const isPhase  = task.type === 'phase';
    const isJalon  = task.type === 'jalon';
    const isSubphase = task.type === 'subphase' || (!task.type && !!task.phaseId);

    // ── Phase : dates = enveloppe min/max des tâches enfants (toutes, même repliées) ──
    if (isPhase) {
      let _minS = null, _maxE = null;
      (_allPhaseTasks[task.id] || []).forEach(function(ct) {
        const td = getTaskDates(ct);
        if (td.start && (!_minS || td.start < _minS)) _minS = td.start;
        if (td.end   && (!_maxE || td.end   > _maxE)) _maxE = td.end;
      });
      if (_minS) {
        start = _minS;
        end   = _maxE || _minS;
      }
      // fallback : si aucune tâche enfant n'a de dates → garder les dates propres de la phase
    }

    if (isSubphase) {
      let _spMinS = null, _spMaxE = null;
      (_allSubphaseTasks[task.id] || []).forEach(function(ct) {
        const td = getTaskDates(ct);
        if (td.start && (!_spMinS || td.start < _spMinS)) _spMinS = td.start;
        if (td.end   && (!_spMaxE || td.end   > _spMaxE)) _spMaxE = td.end;
      });
      if (_spMinS) { start = _spMinS; end = _spMaxE || _spMinS; }
    }

    // Roll up pct from subtasks if any (must be after isPhase/isJalon)
    const _taskSubs  = (!isPhase && !isJalon && !isSubphase) ? ((state.ganttSubtasks||{})[task.id]||[]) : [];
    const dispPct    = _taskSubs.length > 0
      ? Math.round(_taskSubs.reduce((s,sb) => s + (sb.pct||0), 0) / _taskSubs.length)
      : dispPct0;
    const left     = isNaN(ganttPct(start)) ? 0 : ganttPct(start);
    const width    = isNaN(ganttWidthPct(start, end)) ? 0 : ganttWidthPct(start, end);
    const barLeft  = left.toFixed(3);
    const barWidth = Math.max(0.5, width).toFixed(3);
    const durMs    = (new Date(end) - new Date(start));
    const dur      = isJalon ? 0 : (isNaN(durMs) ? 0 : Math.max(0, Math.round(durMs / 86400000)));

    // Prédécesseurs : afficher N° de ligne
    const predNums  = dispPred.map(pid => { const rn = _ganttIdMap[pid]; return rn != null ? rn : pid; });
    const predStr   = predNums.length ? predNums.join(', ') : '—';
    const predTitle = dispPred.join(', ') || '';
    // ── Side badge helper ──────────────────────────────────────────────────
    function _sideBadge(side) {
      if (!side) return '<span class="g-side-empty">—</span>';
      if (side === 'BOA')       return '<span class="g-side-boa">BOA</span>';
      if (side === 'CBS')       return '<span class="g-side-cbs">CBS</span>';
      if (side.includes('BOA') && side.includes('CBS')) return '<span class="g-side-boaCbs">BOA+CBS</span>';
      return '<span class="g-side-ext">' + escHtml(side) + '</span>';
    }
    // ── RAG badge helper ───────────────────────────────────────────────────
    function _ragBadge(rag) {
      if (!rag) return '';
      const r = String(rag).toUpperCase();
      if (r === 'R') return '<span class="g-rag-R" title="Rouge — Bloquant">R</span>';
      if (r === 'O' || r === 'A') return '<span class="g-rag-A" title="Ambre — À surveiller">A</span>';
      if (r === 'G') return '<span class="g-rag-G" title="Vert — OK">G</span>';
      return '<span class="g-rag-X" title="Non défini">?</span>';
    }

    const _isInteractive = (!isPhase && !isJalon && !isSubphase);
    const ownerCell = _isInteractive
      ? '<input type="text" list="dl-owners" value="' + escAttr(dispOwner === '—' ? '' : dispOwner) + '" onchange="updateGanttOwner(\'' + task.id + '\',this.value)" style="width:100%;min-width:88px;padding:4px 7px;border:1.5px solid #e2e8f0;border-radius:6px;font-size:10.5px;box-sizing:border-box;background:#f8fafc;transition:border-color .15s;" onfocus="this.style.borderColor=\'#3b82f6\'" onblur="this.style.borderColor=\'#e2e8f0\'">'
      : '<span style="font-size:10.5px;color:#64748b;font-style:italic;">' + escHtml(dispOwner) + '</span>';
    const sideCell = _isInteractive
      ? '<select onchange="updateGanttSide(\'' + task.id + '\',this.value)" style="width:100%;min-width:72px;padding:4px 6px;border:1.5px solid #e2e8f0;border-radius:6px;font-size:10.5px;box-sizing:border-box;background:#f8fafc;cursor:pointer;">'
          + '<option value=""' + (dispSide ? '' : ' selected') + '>—</option>'
          + '<option value="BOA"'     + (dispSide === 'BOA'     ? ' selected' : '') + '>BOA</option>'
          + '<option value="CBS"'     + (dispSide === 'CBS'     ? ' selected' : '') + '>CBS</option>'
          + '<option value="CBS + BOA"' + (dispSide === 'CBS + BOA' ? ' selected' : '') + '>CBS + BOA</option>'
          + '<option value="Externe"' + (dispSide === 'Externe' ? ' selected' : '') + '>Externe</option>'
        + '</select>'
      : _sideBadge(dispSide);
    const predCell = _isInteractive
      ? '<button type="button" onclick="openGanttDependenciesEditor(\'' + task.id + '\')" style="width:100%;padding:3px 6px;border:1.5px solid #e2e8f0;border-radius:6px;background:#f8fafc;font-size:10px;color:#334155;cursor:pointer;transition:all .15s;" onmouseover="this.style.background=\'#eff6ff\';this.style.borderColor=\'#93c5fd\'" onmouseout="this.style.background=\'#f8fafc\';this.style.borderColor=\'#e2e8f0\'" title="' + escAttr(predTitle || 'Aucune dépendance') + '">' + (predNums.length ? '🔗 ' + escHtml(predStr) : '<span style="color:#94a3b8">—</span>') + '</button>'
      : '<span style="font-size:10px;color:#6366f1;font-weight:600;" title="' + predTitle + '">' + predStr + '</span>';
    const pctCell = _isInteractive
      ? '<div style="display:flex;align-items:center;gap:4px;">'
        + '<div style="flex:1;height:6px;background:#e2e8f0;border-radius:3px;overflow:hidden;min-width:32px;">'
        + '<div style="height:100%;width:' + dispPct + '%;background:' + (dispPct>=100?'#22c55e':dispPct>=60?'#3b82f6':'#f59e0b') + ';border-radius:3px;transition:width .3s;"></div>'
        + '</div>'
        + '<input type="number" min="0" max="100" value="' + dispPct + '" onchange="updateGanttPct(\'' + task.id + '\',this.value)" style="width:40px;padding:3px 4px;border:1.5px solid #e2e8f0;border-radius:5px;font-size:10px;text-align:center;box-sizing:border-box;background:#f8fafc;">'
        + '</div>'
      : '<span style="font-size:10.5px;font-weight:600;color:' + (dispPct>=100?'#16a34a':dispPct>0?'#2563eb':'#94a3b8') + ';">' + (dispPct>0 ? dispPct+'%' : '—') + '</span>';

    // Type badge (basé sur le vrai type)
    let typeBadge, rowClass, barHtml, datesCells;
    const dashed = isCustom ? 'border:2px dashed rgba(255,255,255,.5);' : '';

    if (isSubphase) {
      rowClass  = 'gantt-subphase-row';
      typeBadge = '<span class="type-badge type-subphase">Ss-Phase</span>';
      barHtml   = start
        ? '<div class="gantt-bar gantt-subphase-bar" style="left:' + left.toFixed(1) + '%;width:' + barWidth + '%;background:#7c3aed;opacity:.82;" title="' + escHtml(dispLabel) + ': ' + start + ' \u2192 ' + end + ' (' + dur + 'j)">'
          + '<span class="g-bar-label">' + (width > 1.5 ? dispLabel.substring(0, 26) : '') + '</span>'
          + '</div>'
        : '';
      datesCells = start
        ? '<td style="font-size:11px;color:#7c3aed;font-weight:600;">' + start + '</td><td style="font-size:11px;color:#7c3aed;font-weight:600;">' + end + '</td><td class="center" style="font-size:11px;color:#64748b;">' + dur + 'j</td>'
        : '<td colspan="3" style="font-size:10px;color:#94a3b8;text-align:center;font-style:italic;">aucune t\u00e2che li\u00e9e</td>';
    } else if (isPhase) {
      rowClass  = 'gantt-phase-row';
      typeBadge = '<span class="type-badge type-phase">Phase</span>';
      barHtml   = '<div class="gantt-bar ph-' + (task.phase||'p0') + '" style="left:' + left.toFixed(1) + '%;width:' + barWidth + '%;' + dashed + '" title="' + dispLabel + ': ' + start + ' \u2192 ' + end + ' (' + dur + 'j)">'
        + '<span class="g-bar-label">' + (width>1.5 ? dispLabel.substring(0,26) : '') + '</span>'
        + '</div>';
      datesCells = '<td style="font-size:11px;color:#334155;font-weight:600;">' + start + '</td><td style="font-size:11px;color:#334155;font-weight:600;">' + end + '</td><td class="center" style="font-size:11px;color:#64748b;">' + dur + 'j</td>';
    } else if (isJalon) {
      rowClass  = 'gantt-jalon-row';
      typeBadge = '<span class="type-badge type-jalon">Jalon</span>';
      barHtml   = '<div class="gantt-milestone" style="left:' + left.toFixed(1) + '%;" title="' + dispLabel + ': ' + start + '"></div>';
      datesCells = '<td style="font-weight:700;text-align:center;font-size:11px;color:#92400e;">' + start + '</td><td style="color:#94a3b8;text-align:center;">\u2014</td><td class="center" style="color:#94a3b8;">\u2014</td>';
    } else {
      rowClass  = isCustom ? 'gantt-sub-row custom-task-row' : 'gantt-sub-row';
      typeBadge = '<span class="type-badge type-task">T\u00e2che</span>';
      const fillW  = Math.min(100, dispPct);
      const _emptyW = Math.max(0, 100 - fillW);
      barHtml   = '<div class="gantt-bar ph-' + (task.phase||'p1') + '" style="left:' + left.toFixed(1) + '%;width:' + barWidth + '%;' + dashed + '" title="' + dispLabel + ': ' + start + ' \u2192 ' + end + ' (' + dur + 'j) \u2014 ' + dispPct + '%">'
        + (_emptyW > 0 ? '<div class="g-bar-empty" style="left:' + fillW + '%;width:' + _emptyW + '%"></div>' : '')
        + '<span class="g-bar-label">' + (width>3 ? dispLabel.substring(0,24) : '') + '</span>'
        + '</div>';

      // Reference plan delta
      const refDates   = (state.ganttReference && state.ganttReference.isSet && state.ganttReference.dates && state.ganttReference.dates[task.id]) || null;
      let refStartHtml = '', refEndHtml = '', refDurHtml = '';
      if (refDates) {
        const deltaS = Math.round((new Date(start) - new Date(refDates.start)) / 86400000);
        const deltaE = Math.round((new Date(end)   - new Date(refDates.end))   / 86400000);
        if (refDates.start !== start) {
          const cls = deltaS > 0 ? 'gantt-delta-pos' : 'gantt-delta-neg';
          refStartHtml = '<span class="gantt-ref-date">' + refDates.start + '</span>'
            + '<span class="' + cls + '">' + (deltaS > 0 ? '+' : '') + deltaS + 'j</span>';
        }
        if (refDates.end !== end) {
          const cls = deltaE > 0 ? 'gantt-delta-pos' : 'gantt-delta-neg';
          refEndHtml = '<span class="gantt-ref-date">' + refDates.end + '</span>'
            + '<span class="' + cls + '">' + (deltaE > 0 ? '+' : '') + deltaE + 'j</span>';
        }
        // Delta durée vs plan de référence
        const durRef  = Math.max(0, Math.round((new Date(refDates.end) - new Date(refDates.start)) / 86400000));
        const deltaDur = dur - durRef;
        if (deltaDur !== 0) {
          const cls = deltaDur > 0 ? 'gantt-delta-pos' : 'gantt-delta-neg';
          refDurHtml = '<span class="gantt-ref-date">' + durRef + 'j</span>'
            + '<span class="' + cls + '">' + (deltaDur > 0 ? '+' : '') + deltaDur + 'j</span>';
        }
      }

      // ── Retard : tâche non terminée dont la date de fin est dépassée ──────
      let retardHtml = '';
      const _todayStr = TODAY.toISOString().split('T')[0];
      if (dispPct < 100 && end && end < _todayStr) {
        const retardDays = Math.round((new Date(_todayStr) - new Date(end)) / 86400000);
        if (retardDays > 0) {
          retardHtml = '<span title="Retard : ' + retardDays + ' jour' + (retardDays > 1 ? 's' : '') + ' dépassé' + (retardDays > 1 ? 's' : '') + '"'
            + ' style="display:inline-block;margin-left:3px;background:#fee2e2;color:#dc2626;border:1px solid #fca5a5;border-radius:4px;font-size:8px;font-weight:800;padding:1px 4px;white-space:nowrap;line-height:1.5;">⚠️ +' + retardDays + 'j</span>';
        }
      }

      datesCells = '<td><input class="date-input" type="date" value="' + start + '" onchange="updateGanttDate(\'' + task.id + '\',\'start\',this.value)">' + refStartHtml + '</td>'
        + '<td><input class="date-input" type="date" value="' + end + '" onchange="updateGanttDate(\'' + task.id + '\',\'end\',this.value)">' + refEndHtml + '</td>'
        + '<td class="center" style="white-space:nowrap;"><input type="number" min="0" max="400" value="' + dur + '" onchange="updateGanttDuration(\'' + task.id + '\',this.value)" style="width:40px;font-size:11px;padding:2px;border:1px solid #ddd;border-radius:3px;text-align:center;"><span style="font-size:9px;color:var(--gray);"> j</span>' + retardHtml + refDurHtml + '</td>';
    }

    const isCollapsed   = isPhase && !!state.ganttCollapsed[task.id];
    const isSpCollapsed = isSubphase && !!(state.ganttSubphasesCollapsed||{})[task.id];
    const collapseBtn = isPhase
      ? '<button onclick="togglePhaseCollapse(\'' + task.id + '\')'  + '" class="phase-toggle-btn" title="' + (isCollapsed?'D\u00e9ployer':'R\u00e9duire') + '">' + (isCollapsed?'\u25B6':'\u25BC') + '</button>'
      : isSubphase
        ? '<button onclick="toggleSubphaseCollapse(\'' + task.id + '\')'  + '" class="phase-toggle-btn" style="color:#7c3aed;" title="' + (isSpCollapsed?'D\u00e9ployer':'R\u00e9duire') + '">' + (isSpCollapsed?'\u25B6':'\u25BC') + '</button>'
        : '';
    const labelStyle = isCustom ? ' style="color:#4f46e5;font-style:italic;"' : '';
    const _subsColl  = !!(state.ganttSubsCollapsed||{})[task.id];
    const _subsToggle = (_isInteractive && _taskSubs.length > 0)
      ? ' <button class="subs-toggle-btn" onclick="toggleSubtasksCollapse(\'' + task.id + '\')'  + '" title="' + (_subsColl?'Afficher':'Masquer') + ' les sous-t\u00e2ches">' + (_subsColl?'\u25B6':'\u25BC') + '\u202f<small>(' + _taskSubs.length + ')</small></button>'
      : '';
    const _ragDot = (_isInteractive && dispRag) ? _ragBadge(dispRag) : '';
    const _partsBadge = (_isInteractive && dispParticipants.length)
      ? ' <span title="Participants: ' + escAttr(dispParticipants.join(', ')) + '" style="font-size:9px;background:#ecfeff;color:#0f766e;border:1px solid #99f6e4;border-radius:20px;padding:1px 6px;margin-left:4px;cursor:default;font-weight:700;">+' + dispParticipants.length + '</span>'
      : '';
    const _commBadge = (_isInteractive && dispCommentaire)
      ? ' <span title="' + escAttr(dispCommentaire.substring(0, 80)) + '" style="font-size:11px;opacity:.5;margin-left:3px;cursor:default;">💬</span>'
      : '';
    const _taskSubphaseId = _isInteractive ? (task.subphaseId || (state.gantt[task.id] && state.gantt[task.id]._subphaseId) || null) : null;
    const _spInfo = _taskSubphaseId ? (state.ganttSubphases||[]).find(function(sp){return sp.id === _taskSubphaseId;}) : null;
    const _spBadge = _spInfo ? ' <span title="Sous-phase: ' + escAttr(_spInfo.label||'') + '" style="font-size:9px;background:#ede9fe;color:#6d28d9;border:1px solid #c4b5fd;border-radius:10px;padding:1px 5px;margin-left:3px;cursor:default;">⊞ ' + escHtml((_spInfo.label||'').substring(0,18)) + '</span>' : '';
    const _taskIndent = _taskSubphaseId ? '24px' : '12px';
    const labelCell  = isSubphase
      ? collapseBtn + '<span style="padding-left:10px;font-weight:700;color:#6d28d9;letter-spacing:.2px;">' + escHtml(dispLabel) + '</span>'
      : isPhase
        ? collapseBtn + '<span style="font-weight:700;color:#1a2e55;letter-spacing:.2px;">' + escHtml(dispLabel) + '</span>'
        : '<span style="padding-left:' + _taskIndent + ';display:inline-block;"><span' + labelStyle + '>' + escHtml(dispLabel) + '</span>' + _subsToggle + _ragDot + _partsBadge + _commBadge + _spBadge + '</span>';

    const _isActTask   = task.type === 'task';
    const _alreadyLinked = _isActTask && !!(state.customActions || []).find(function(a){return a._ganttTaskId === task.id;});
    const _btnStyle    = 'background:none;border:none;cursor:pointer;padding:2px 3px;border-radius:4px;transition:background .12s;';
    const editBtns = isSubphase
      ? '<button onclick="openEditSubphase(\'' + task.id + '\')'  + '" style="' + _btnStyle + 'font-size:13px;" title="Modifier" onmouseover="this.style.background=\'#ede9fe\'" onmouseout="this.style.background=\'none\'">✏️</button>'
        + (canAddDelete() ? '<button onclick="dissolveSubphase(\'' + task.id + '\')'  + '" style="' + _btnStyle + 'font-size:11px;color:#059669;opacity:.8;" title="Détacher — redevient une phase indépendante" onmouseover="this.style.background=\'#d1fae5\';this.style.opacity=1" onmouseout="this.style.background=\'none\';this.style.opacity=.8">&#x21a7;</button>' : '')
        + (canAddDelete() ? '<button onclick="deleteSubphase(\'' + task.id + '\')'  + '" style="' + _btnStyle + 'font-size:12px;color:#ef4444;" title="Supprimer" onmouseover="this.style.background=\'#fee2e2\'" onmouseout="this.style.background=\'none\'">✕</button>' : '')
      : '<button onclick="openEditGanttTask(\'' + task.id + '\')'  + '" style="' + _btnStyle + 'font-size:13px;" title="Modifier" onmouseover="this.style.background=\'#eff6ff\'" onmouseout="this.style.background=\'none\'">✏️</button>'
        + (canAddDelete() ? '<button onclick="deleteGanttTask(\'' + task.id + '\')'  + '" style="' + _btnStyle + 'font-size:12px;color:#ef4444;" title="Supprimer" onmouseover="this.style.background=\'#fee2e2\'" onmouseout="this.style.background=\'none\'">✕</button>' : '')
        + (_isInteractive && canEdit() ? '<button onclick="openAddSubtask(\'' + task.id + '\')'  + '" class="subtask-add-btn" title="Ajouter une sous-t\u00e2che">⊕</button>' : '')
        + (isPhase && canAddDelete() ? '<button onclick="openAddSubphase(\'' + task.id + '\')'  + '" style="' + _btnStyle + 'font-size:11px;color:#7c3aed;opacity:.75;" title="Ajouter une sous-phase" onmouseover="this.style.background=\'#ede9fe\';this.style.opacity=1" onmouseout="this.style.background=\'none\';this.style.opacity=.75">⊞</button>' : '')
        + (isPhase && canAddDelete() ? '<button onclick="openConvertToSubphase(\'' + task.id + '\')'  + '" style="' + _btnStyle + 'font-size:11px;color:#059669;opacity:.75;" title="Convertir en sous-phase" onmouseover="this.style.background=\'#d1fae5\';this.style.opacity=1" onmouseout="this.style.background=\'none\';this.style.opacity=.75">&#x21a5;</button>' : '')
        + (_isActTask && canEdit() && !_alreadyLinked
            ? '<button onclick="_addTaskToActionPlan(\'' + task.id + '\')'  + '" style="' + _btnStyle + 'font-size:11px;opacity:.65;" title="Lier au plan d\'action" onmouseover="this.style.background=\'#f0fdf4\';this.style.opacity=1" onmouseout="this.style.background=\'none\';this.style.opacity=.65">📋</button>'
            : (_isActTask && _alreadyLinked
                ? '<span style="font-size:10px;color:#16a34a;padding:2px 3px;" title="Li\u00e9 au plan d\'action">✓📋</span>'
                : ''))
    // Colonne N° : affiche le numéro par défaut, + au survol de la ligne
    const numCell = '<td class="gantt-num-cell">'
      + '<span class="g-num-label">' + rowNum + '</span>'
      + '<button class="g-add-btn" onclick="openAddTaskAfter(\'' + task.id + '\')" title="Ins\u00e9rer apr\u00e8s ligne ' + rowNum + '">+</button>'
      + '</td>';

    rows += '<tr class="' + rowClass + '" data-task-id="' + task.id + '" data-row="' + rowNum + '" data-bar-left="' + barLeft + '" data-bar-width="' + barWidth + '">'
      + numCell
      + '<td style="text-align:center;white-space:nowrap;padding:2px 4px;">' + editBtns + '</td>'
      + '<td class="center">' + typeBadge + '</td>'
      + '<td>' + labelCell + '</td>'
      + '<td style="text-align:center;">' + ownerCell + '</td>'
      + '<td style="text-align:center;">' + sideCell + '</td>'
      + '<td style="text-align:center;color:#3949AB;" title="' + predTitle + '">' + predCell + '</td>'
      + datesCells
      + '<td class="center" style="font-size:10px;">' + pctCell + '</td>'
      + '<td style="padding:0;position:relative;">'
        + '<div class="gantt-bar-cell" style="min-width:' + cols.minWidth + ';">'
          + '<div class="gantt-months-bg">' + cols.bgHtml + '</div>'
          + '<div class="today-line" style="left:' + todayPct.toFixed(1) + '%"></div>'
          + barHtml
        + '</div>'
      + '</td>'
      + '</tr>';

    // ── Render subtask rows ──────────────────────────────────────────────
    if (!isPhase && !isJalon && _taskSubs.length > 0 && !_subsColl) {
      _taskSubs.forEach(function(sub) {
        const subS = sub.start || start;
        const subE = sub.end   || end;
        const subL = ganttPct(subS);
        const subW = Math.max(0.5, ganttWidthPct(subS, subE));
        const subBarH = '<div class="gantt-bar" style="left:' + subL.toFixed(1) + '%;width:' + subW.toFixed(1) + '%;background:#7986CB;opacity:.88;" title="' + escHtml(sub.label||'') + ': ' + subS + ' \u2192 ' + subE + '">' + (subW > 3 ? escHtml((sub.label||'').substring(0,22)) : '') + '</div>';
        const subPctTxt = (sub.pct > 0) ? sub.pct + '%' : '\u2014';
        rows += '<tr class="gantt-subtask-row" data-task-id="' + sub.id + '" data-row="" data-bar-left="' + subL.toFixed(3) + '" data-bar-width="' + subW.toFixed(3) + '">'
          + '<td class="gantt-num-cell"></td>'
          + '<td style="text-align:center;white-space:nowrap;padding:2px 4px;">'
            + (canEdit()
              ? '<button onclick="openEditSubtask(\'' + task.id + '\',\'' + sub.id + '\')" style="background:none;border:none;cursor:pointer;font-size:12px;padding:1px;" title="Modifier">\u270F\uFE0F</button>'
                + '<button onclick="removeSubtask(\'' + task.id + '\',\'' + sub.id + '\')" style="background:none;border:none;color:var(--red);cursor:pointer;font-size:12px;padding:1px;" title="Supprimer">\u2715</button>'
              : '')
          + '</td>'
          + '<td class="center"><span style="font-size:9px;background:#c5cae9;color:#1a237e;padding:1px 4px;border-radius:3px;">Sous-T</span></td>'
          + '<td><span style="color:#3949AB;padding-left:22px;">\u21B3\u00A0' + escHtml(sub.label||'') + '</span></td>'
          + '<td style="font-size:10px;color:var(--gray);text-align:center;">' + escHtml(sub.owner||'\u2014') + '</td>'
          + '<td style="font-size:10px;color:var(--gray);text-align:center;">\u2014</td>'
          + '<td style="font-size:10px;text-align:center;color:#3949AB;">\u2014</td>'
          + '<td style="font-size:11px;">' + subS + '</td>'
          + '<td style="font-size:11px;">' + subE + '</td>'
          + '<td class="center" style="font-size:11px;">\u2014</td>'
          + '<td class="center" style="font-size:10px;">' + subPctTxt + '</td>'
          + '<td style="padding:0;position:relative;"><div class="gantt-bar-cell" style="min-width:' + cols.minWidth + ';"><div class="gantt-months-bg">' + cols.bgHtml + '</div><div class="today-line" style="left:' + todayPct.toFixed(1) + '%"></div>' + subBarH + '</div></td>'
          + '</tr>';
      });
    }
  });

  const header = '<table class="gantt-table"><thead><tr>'
    + '<th style="width:30px;text-align:center;padding:8px 3px;">N°</th>'
    + '<th style="width:52px;text-align:center;">Actions</th>'
    + '<th style="width:56px;text-align:center;">Type</th>'
    + '<th class="col-name">Tâche / Livrable</th>'
    + '<th style="width:112px;text-align:center;">👤 Responsable</th>'
    + '<th style="width:90px;text-align:center;">🏢 Entité</th>'
    + '<th style="width:80px;text-align:center;" title="Prédécesseurs (N° de ligne)">🔗 Préd.</th>'
    + '<th class="col-start">📅 Début</th>'
    + '<th class="col-end">📅 Fin</th>'
    + '<th style="width:54px;" class="center">Durée</th>'
    + '<th style="width:90px;" class="center">Avancement</th>'
    + '<th class="col-bar" style="padding:0;overflow:visible;position:relative;">'
    + '<div style="position:relative;display:flex;height:28px;min-width:' + cols.minWidth + ';">'
    + cols.headerHtml
    + (todayPct >= 0 && todayPct <= 100
        ? '<div style="position:absolute;top:0;bottom:0;left:' + todayPct.toFixed(1) + '%;width:2px;background:#ef4444;z-index:5;pointer-events:none;">'
          + '<span style="position:absolute;top:50%;left:4px;transform:translateY(-50%);background:#ef4444;color:#fff;font-size:8px;font-weight:800;padding:2px 6px;border-radius:4px;white-space:nowrap;box-shadow:0 1px 5px rgba(239,68,68,.45);letter-spacing:.2px;">▼ Aujourd\'hui</span>'
          + '</div>'
        : '')
    + '</div></th>'
    + '</tr></thead>';

  const ganttRender = document.getElementById('gantt-render');
  ganttRender.style.position = 'relative';
  ganttRender.innerHTML = '<div class="gantt-table-scroll" style="overflow:auto;border-radius:0;background:#fff;">'
    + header + '<tbody>' + rows + '</tbody></table></div>';
  // ── Restaurer la position de scroll après le re-render ────────────────────
  if (_prevScroll) {
    const _newSc = ganttRender.querySelector('.gantt-table-scroll');
    if (_newSc) { _newSc.scrollTop = _prevScroll.top; _newSc.scrollLeft = _prevScroll.left; }
  }
  // ── Sticky top : en-têtes ──────────────────────────────────────────────────
  ganttRender.querySelectorAll('thead th').forEach(th => {
    th.style.position = 'sticky';
    th.style.top = '0';
    th.style.zIndex = '4';
    th.style.background = '#f5f6f8';
    th.style.boxShadow = 'inset 0 -1px 0 #d1d5db';
  });

  // ── Colonne resize : injecter colgroup + poignées ──────────────────────────
  _initGanttColResize();

  // ── Sticky left : 4 premières colonnes figées (N°, Boutons, Type, Libellé) ──
  // Décalages calculés dynamiquement depuis les largeurs stockées
  const _FROZEN_IDX = [0, 1, 2, 3];
  const _cw0 = _getGanttColW(0), _cw1 = _getGanttColW(1), _cw2 = _getGanttColW(2);
  const _FROZEN_LEFT = [0, _cw0, _cw0 + _cw1, _cw0 + _cw1 + _cw2];
  ganttRender.querySelectorAll('tr').forEach(tr => {
    const cells  = tr.querySelectorAll('td, th');
    const isHead = !!tr.closest('thead');
    // Fond explicite nécessaire pour que le sticky ne soit pas transparent
    const rowBg  = isHead ? '#f5f6f8'
                 : tr.classList.contains('gantt-phase-row') ? '#eef2ff'
                 : tr.classList.contains('gantt-jalon-row') ? '#fdf4ff'
                 : '#fff';
    _FROZEN_IDX.forEach((ci, fi) => {
      const cell = cells[ci];
      if (!cell) return;
      cell.style.position   = 'sticky';
      cell.style.left       = _FROZEN_LEFT[fi] + 'px';
      cell.style.zIndex     = isHead ? '6' : '3';      // coins : z6, corps : z3
      cell.style.background = cell.style.background || rowBg;
      // Ombre séparatrice après la dernière colonne figée
      if (fi === 3) cell.style.boxShadow = 'inset -2px 0 0 #d1d5db';
    });
  });

  const scrollHost = ganttRender.querySelector('.gantt-table-scroll');
  if (scrollHost) {
    scrollHost.addEventListener('scroll', () => drawDependencyArrows(allTasksRendered), { passive: true });
    // ── Ctrl+Wheel : zoom Gantt sans zoomer la page ────────────────────────
    scrollHost.addEventListener('wheel', (e) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      e.stopPropagation();
      changeGanttScale(e.deltaY < 0 ? 0.05 : -0.05);
    }, { passive: false });
  }

  // Flèches de dépendance (après rendu DOM)
  requestAnimationFrame(() => drawDependencyArrows(allTasksRendered));

  // Mise à jour du statut planning de référence
  updateRefPlanStatus();
}



// ── Flèches de dépendance (SVG overlay sur la colonne barre) ─────────────
function drawDependencyArrows(allTasksRendered) {
  const existing = document.getElementById('gantt-dep-svg');
  if (existing) existing.remove();

  const ganttRender = document.getElementById('gantt-render');
  if (!ganttRender) return;

  // Collecter les dépendances à dessiner
  const arrows = [];
  allTasksRendered.forEach(task => {
    if (!task.pred || !task.pred.length) return;
    task.pred.forEach(predId => {
      if (predId && predId !== task.id) arrows.push({ predId, succId: task.id });
    });
  });
  if (!arrows.length) return;

  // Récupérer les positions DOM
  const barTh = ganttRender.querySelector('th.col-bar');
  if (!barTh) return;
  const containerRect = ganttRender.getBoundingClientRect();
  const barThRect     = barTh.getBoundingClientRect();
  const tbodyRect     = (ganttRender.querySelector('tbody') || ganttRender).getBoundingClientRect();

  const svgLeft   = barThRect.left  - containerRect.left;
  const svgTop    = tbodyRect.top   - containerRect.top;
  const svgWidth  = barThRect.width;
  const svgHeight = tbodyRect.height;
  if (svgWidth < 1 || svgHeight < 1) return;

  // Map taskId → {barLeft%, barWidth%, rowMidY (px relatif au tbodyRect.top)}
  const geom = {};
  ganttRender.querySelectorAll('tr[data-task-id]').forEach(tr => {
    const tid = tr.getAttribute('data-task-id');
    const bl  = parseFloat(tr.getAttribute('data-bar-left'));
    const bw  = parseFloat(tr.getAttribute('data-bar-width'));
    const trRect = tr.getBoundingClientRect();
    geom[tid] = {
      barLeft:  bl,
      barRight: bl + bw,
      midY:     trRect.top + trRect.height / 2 - (containerRect.top + svgTop)
    };
  });

  // Créer le SVG
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.id = 'gantt-dep-svg';
  svg.setAttribute('width',  svgWidth);
  svg.setAttribute('height', svgHeight);
  svg.style.cssText = 'position:absolute;left:' + svgLeft + 'px;top:' + svgTop + 'px;pointer-events:none;z-index:5;overflow:visible;';

  // Marqueur de flèche
  const defs = document.createElementNS(NS, 'defs');
  defs.innerHTML = '<marker id="dep-arr" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto"><path d="M0,0 L7,3.5 L0,7 Z" fill="#E63329" opacity="0.75"/></marker>';
  svg.appendChild(defs);

  arrows.forEach(({predId, succId}) => {
    const pg = geom[predId];
    const sg = geom[succId];
    if (!pg || !sg) return;

    const x1 = pg.barRight / 100 * svgWidth;
    const y1 = pg.midY;
    const x2 = sg.barLeft  / 100 * svgWidth;
    const y2 = sg.midY;

    // Chemin courbé : sortie droite → entrée gauche
    const gap  = x2 - x1;
    const cpx  = gap > 0
      ? x1 + Math.max(12, gap * 0.45)
      : x1 + 20;                            // flèche qui « revient en arrière »
    const d = 'M ' + x1.toFixed(1) + ' ' + y1.toFixed(1)
      + ' C ' + cpx.toFixed(1) + ' ' + y1.toFixed(1)
      + ', ' + cpx.toFixed(1) + ' ' + y2.toFixed(1)
      + ', ' + x2.toFixed(1)  + ' ' + y2.toFixed(1);

    const path = document.createElementNS(NS, 'path');
    path.setAttribute('d', d);
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', '#E63329');
    path.setAttribute('stroke-width', '1.4');
    path.setAttribute('stroke-dasharray', '5,3');
    path.setAttribute('opacity', '0.6');
    path.setAttribute('marker-end', 'url(#dep-arr)');
    svg.appendChild(path);

    // Petit point à l'origine
    const dot = document.createElementNS(NS, 'circle');
    dot.setAttribute('cx', x1.toFixed(1));
    dot.setAttribute('cy', y1.toFixed(1));
    dot.setAttribute('r', '3');
    dot.setAttribute('fill', '#E63329');
    dot.setAttribute('opacity', '0.65');
    svg.appendChild(dot);
  });

  ganttRender.appendChild(svg);
}

function togglePhaseCollapse(phaseId) {
  if (!state.ganttCollapsed) state.ganttCollapsed = {};
  state.ganttCollapsed[phaseId] = !state.ganttCollapsed[phaseId];
  saveState();
  renderGantt();
}

function updateGanttDate(id, field, value) {
  if (!state.gantt[id]) state.gantt[id] = {};
  const allTasks = [...ganttTasks, ...(state.ganttCustom || [])];
  const task = allTasks.find(t => t.id === id);
  const oldDates = getTaskDates(task || {id, start: value, end: value, pred: []});

  state.gantt[id][field] = value;

  // If start changes: preserve duration, shift end, then cascade successors
  if (field === 'start') {
    const dur = Math.max(0, Math.round((new Date(oldDates.end) - new Date(oldDates.start)) / 86400000));
    const newEnd = addDays(value, dur);
    state.gantt[id].end = newEnd;
    cascadeSuccessors(id, newEnd, new Set([id]));
  }

  // If end changes: cascade successors; optionally chain-shift subsequent tasks
  if (field === 'end') {
    cascadeSuccessors(id, value, new Set([id]));
    if (state.ganttChain) {
      const delta = Math.round((new Date(value) - new Date(oldDates.end)) / 86400000);
      if (delta !== 0) {
        const oldEnd = new Date(oldDates.end);
        allTasks.forEach(t => {
          if (t.id === id) return;
          const td = getTaskDates(t);
          if (new Date(td.start) >= oldEnd) {
            if (!state.gantt[t.id]) state.gantt[t.id] = {};
            state.gantt[t.id].start = addDays(td.start, delta);
            state.gantt[t.id].end   = addDays(td.end,   delta);
          }
        });
      }
    }
  }

  _syncCustomDates(id); // ← couvre custom_, gi_, et tout ID importé

  // ── Répercuter les nouvelles dates sur l'action liée ─────────────────────
  const _finalDates = getTaskDates((state.ganttCustom || []).find(t => t.id === id) || { id, start: state.gantt[id]?.start || value, end: state.gantt[id]?.end || value });
  _syncGanttTaskToAction(id, { start: _finalDates.start, end: _finalDates.end });

  saveState();
  renderGantt();
  renderDashboard();
}

/** Retourne vrai si la tâche est custom (créée manuellement ou importée) */
function _isCustomTask(id) {
  return !!(state.ganttCustom || []).find(t => t.id === id);
}

/** Resynchronise start/end dans state.ganttCustom depuis state.gantt[id] (pour toute tâche custom) */
function _syncCustomDates(id) {
  if (!_isCustomTask(id)) return;
  const ct = (state.ganttCustom || []).find(t => t.id === id);
  if (!ct || !state.gantt[id]) return;
  if (state.gantt[id].start) ct.start = state.gantt[id].start;
  if (state.gantt[id].end)   ct.end   = state.gantt[id].end;
}

function cascadeSuccessors(changedId, newEndDate, visited) {
  if (!visited) visited = new Set();
  const allTasks = [...ganttTasks, ...(state.ganttCustom || [])];
  allTasks.forEach(t => {
    if (visited.has(t.id)) return;
    // Prédécesseurs effectifs : override _pred ou pred statique
    const effectivePred = (state.gantt[t.id] && state.gantt[t.id]._pred) || t.pred || [];
    if (!effectivePred.includes(changedId)) return;
    const newStart = addDays(newEndDate, 1);
    const {start: os, end: oe} = getTaskDates(t);
    const dur = Math.max(0, Math.round((new Date(oe) - new Date(os)) / 86400000));
    if (!state.gantt[t.id]) state.gantt[t.id] = {};
    state.gantt[t.id].start = newStart;
    state.gantt[t.id].end   = addDays(newStart, dur);
    _syncCustomDates(t.id); // ← couvre custom_ ET gi_ ET tout autre préfixe importé
    visited.add(t.id);
    cascadeSuccessors(t.id, state.gantt[t.id].end, visited);
  });
}

function updateGanttDuration(id, days) {
  days = parseInt(days);
  if (!days || days < 1) return;
  const task = ganttTasks.find(t=>t.id===id) || (state.ganttCustom||[]).find(t=>t.id===id);
  const {start} = getTaskDates(task || {id, start: new Date().toISOString().split('T')[0]});
  if (!state.gantt[id]) state.gantt[id] = {};
  state.gantt[id].end = addDays(start, days);
  _syncCustomDates(id); // ← couvre tous les préfixes (custom_, gi_, etc.)
  cascadeSuccessors(id, state.gantt[id].end, new Set([id]));
  saveState();
  renderGantt();
}

function _syncGanttTaskToAction(taskId, patch) {
  const act = [...actions, ...(state.customActions || [])].find(a => a._ganttTaskId === taskId);
  if (!act || !patch) return;
  // Sync action object fields (resp, side, label → action, participants)
  if (patch.resp         != null) act.resp  = patch.resp;
  if (patch.side         != null) act.side  = patch.side;
  if (patch.label        != null) act.action = patch.label;
  if (patch.participants != null) {
    act.participants     = patch.participants;
    act.participantsText = (patch.participants || []).join(', ');
  }
  if (!state.actions[act.id]) state.actions[act.id] = {};
  // Sync pct / status
  if (patch.pct != null) {
    const pct100 = Math.round(Number(patch.pct) * 100);
    state.actions[act.id].pct    = pct100;
    state.actions[act.id].status = pct100 >= 100 ? 'done' : pct100 > 0 ? 'in_progress' : 'todo';
  }
  // Sync dates
  if (patch.start != null) {
    state.actions[act.id].dateDebut = patch.start;
  }
  if (patch.start != null && patch.end != null) {
    state.actions[act.id].duree = Math.max(0, Math.round((new Date(patch.end) - new Date(patch.start)) / 86400000));
  }
  // Sync RAG & commentaire
  if (patch.rag         != null) state.actions[act.id].rag         = patch.rag;
  if (patch.commentaire != null) state.actions[act.id].commentaire = patch.commentaire;
}

function updateGanttOwner(id, value) {
  const owner = String(value || '').trim() || '—';
  if (!state.gantt[id]) state.gantt[id] = {};
  state.gantt[id]._owner = owner;
  const ct = (state.ganttCustom || []).find(t => t.id === id);
  if (ct) { ct.owner = owner; ct.resp = owner; }
  _syncGanttTaskToAction(id, { resp: owner });
  saveState();
  renderGantt();
}

function updateGanttSide(id, value) {
  const side = String(value || '').trim();
  if (!state.gantt[id]) state.gantt[id] = {};
  state.gantt[id]._side = side;
  const ct = (state.ganttCustom || []).find(t => t.id === id);
  if (ct) ct.side = side;
  _syncGanttTaskToAction(id, { side: side || '' });
  saveState();
}

function updateGanttPct(id, value) {
  const pct = Math.min(1, Math.max(0, (parseFloat(value) || 0) / 100));
  if (!state.gantt[id]) state.gantt[id] = {};
  state.gantt[id]._pct = pct;
  const ct = (state.ganttCustom || []).find(t => t.id === id);
  if (ct) ct.pct = pct;
  _syncGanttTaskToAction(id, { pct });
  saveState();
  renderGantt();
  renderDashboard();
}

function openGanttDependenciesEditor(id) {
  openEditGanttTask(id);
  const modal = document.getElementById('add-task-modal');
  if (!modal) return;
  setTimeout(() => {
    const search = document.getElementById('new-task-pred-search');
    if (search) {
      search.scrollIntoView({ behavior: 'smooth', block: 'center' });
      search.focus();
      search.select();
    }
  }, 80);
}

function resetGanttDates() {
  if (confirm('Réinitialiser toutes les dates du Gantt aux valeurs par défaut ? (Les tâches personnalisées seront conservées)')) {
    state.gantt = {};
    saveState();
    renderGantt();
  }
}

// ── Vider entièrement le Gantt ────────────────────────────────────────────
function clearGantt() {
  const total = (state.ganttCustom || []).length;
  if (total === 0) {
    alert('Le Gantt est déjà vide.');
    return;
  }
  const phases  = (state.ganttCustom || []).filter(function(t){ return t.type === 'phase'; }).length;
  const tasks   = total - phases;
  const subph   = (state.ganttSubphases || []).length;
  const msg = 'Vider entièrement le Gantt ?\n\n'
    + '  • ' + phases + ' phase(s)\n'
    + (subph > 0 ? '  • ' + subph + ' sous-phase(s)\n' : '')
    + '  • ' + tasks  + ' tâche(s) / jalon(s)\n\n'
    + 'Cette action est irréversible.';
  if (!confirm(msg)) return;

  state.ganttCustom    = [];
  state.ganttSubphases = [];
  state.ganttHidden    = [];
  state.ganttCollapsed = {};
  state.gantt          = {};
  state.ganttRefPlan   = null;
  saveState('Gantt vidé', 'Toutes les lignes supprimées');
  renderGantt();
}

// ════════════════════════════════════════════════════════════════════════
// PÉRIMÈTRE MODULES — helpers + render
// ════════════════════════════════════════════════════════════════════════

function _perimEnsureState() {
  if (!state.perimetre)       state.perimetre = { data: {} };
  if (!state.perimetre.data)  state.perimetre.data = {};
}

/** Return merged row: DEFAULT + state overrides */
function getPerimetreRow(idx) {
  _perimEnsureState();
  const base = DEFAULT_PERIMETER[idx];
  if (!base) return null;
  const ov = state.perimetre.data[idx] || {};
  return {
    domaine:         base.domaine,
    sousModule:      base.sousModule,
    version:         base.version,
    fonctionnalites: base.fonctionnalites,
    impactDev:       ov.impactDev       !== undefined ? ov.impactDev       : base.impactDev,
    impactMigration: ov.impactMigration !== undefined ? ov.impactMigration : base.impactMigration,
    bm1:             ov.bm1             !== undefined ? ov.bm1             : base.bm1,
    commentaire:     ov.commentaire     !== undefined ? ov.commentaire     : base.commentaire,
  };
}

/** Compute all KPI stats from merged rows */
function getPerimetreStats() {
  const total = DEFAULT_PERIMETER.length;
  let v4=0, v2=0, upgrades=0, downgrades=0, same=0;
  let majeur=0, moyen=0, mineur=0, aucun=0, commented=0;
  const byDomain = {};
  DEFAULT_PERIMETER.forEach((base, idx) => {
    const row = getPerimetreRow(idx);
    const bm  = row.bm1, ver = row.version;
    if (bm === 'V4') v4++; else v2++;
    if (ver === 'V2' && bm === 'V4') upgrades++;
    else if (ver === 'V4' && bm === 'V2') downgrades++;
    else same++;
    const imp = row.impactDev || '';
    if (imp.includes('Majeur')) majeur++;
    else if (imp.includes('Moyen')) moyen++;
    else if (imp.includes('Mineur')) mineur++;
    else aucun++;
    if (row.commentaire && row.commentaire.trim()) commented++;
    const dom = row.domaine;
    if (!byDomain[dom]) byDomain[dom] = { total:0, v4:0, upgrades:0, downgrades:0, majeur:0 };
    byDomain[dom].total++;
    if (bm === 'V4') byDomain[dom].v4++;
    if (ver === 'V2' && bm === 'V4') byDomain[dom].upgrades++;
    if (ver === 'V4' && bm === 'V2') byDomain[dom].downgrades++;
    if (imp.includes('Majeur')) byDomain[dom].majeur++;
  });
  return { total, v4, v2, upgrades, downgrades, same, majeur, moyen, mineur, aucun, commented, byDomain };
}

function _impactKey(imp) {
  if (!imp) return 'aucun';
  const l = imp.toLowerCase();
  if (l.includes('majeur')) return 'majeur';
  if (l.includes('moyen'))  return 'moyen';
  if (l.includes('mineur')) return 'mineur';
  return 'aucun';
}

function renderPerimetre() {
  const tbody = document.getElementById('perim-tbody');
  const cntEl = document.getElementById('perim-count');
  if (!tbody) return;
  _perimEnsureState();

  // Projet vierge : afficher bandeau et sortir
  if (!_projUsesCBS()) {
    tbody.innerHTML = '<tr><td colspan="9" style="padding:0;">' + _blankProjectBanner('module périmètre') + '</td></tr>';
    if (cntEl) cntEl.textContent = '';
    // Masquer les barres de stats et KPIs qui n'ont pas de sens sans données CBS
    const kpiBand = document.getElementById('perim-kpi-band');
    if (kpiBand) kpiBand.innerHTML = '';
    const domBarsEl = document.getElementById('perim-domain-bars');
    if (domBarsEl) domBarsEl.style.display = 'none';
    return;
  }

  const domFilter    = (document.getElementById('perim-filter-domain')  || {}).value || '';
  const impactFilter = (document.getElementById('perim-filter-impact')  || {}).value || '';
  const deltaFilter  = (document.getElementById('perim-filter-delta')   || {}).value || '';
  const canEditEl    = canEdit();

  // ── KPIs ─────────────────────────────────────────────────────────────
  const st = getPerimetreStats();
  const pct = Math.round(st.v4 / st.total * 100);
  const kpiBand = document.getElementById('perim-kpi-band');
  if (kpiBand) {
    const kpiDefs = [
      { val: st.total,     lbl: 'Modules total',   sub: '7 domaines',           bg:'#f0f4ff', bc:'#c7d2fe', vc:'#3730a3' },
      { val: st.v4+'',     lbl: 'Cible V4 (BM#1)', sub: pct+'% couverture',      bg:'#f0fdf4', bc:'#86efac', vc:'#166534' },
      { val: st.v2+'',     lbl: 'Maintenus V2',    sub: (100-pct)+'% du périm.', bg:'#fefce8', bc:'#fde047', vc:'#854d0e' },
      { val: '↑ '+st.upgrades, lbl: 'Upgrades',   sub: 'V2 → V4',               bg:'#f0fdf4', bc:'#86efac', vc:'#15803d' },
      { val: '↓ '+st.downgrades,lbl:'Downgrades',  sub: 'V4 → V2',               bg:'#fff1f2', bc:'#fda4af', vc:'#be123c' },
      { val: st.majeur,    lbl: '⬛ Impact Majeur', sub: 'Modules à risque',      bg:'#1c1c1c', bc:'#444',    vc:'#fff'    },
      { val: st.moyen,     lbl: '🟧 Impact Moyen',  sub: 'Effort modéré',         bg:'#fff7ed', bc:'#fed7aa', vc:'#9a3412' },
      { val: st.commented, lbl: 'Commentés',        sub: 'avec remarques',         bg:'#f5f3ff', bc:'#ddd6fe', vc:'#5b21b6' },
    ];
    kpiBand.innerHTML = kpiDefs.map(k =>
      '<div class="perim-kpi-mini" style="background:'+k.bg+';border-color:'+k.bc+';color:'+k.vc+';">'
      + '<div class="pk-val">'+k.val+'</div>'
      + '<div class="pk-lbl">'+k.lbl+'</div>'
      + '<div class="pk-sub">'+k.sub+'</div>'
      + '</div>'
    ).join('');
  }

  // ── Domain progress bars ───────────────────────────────────────────────
  const domBarsEl = document.getElementById('perim-domain-bars');
  if (domBarsEl) {
    domBarsEl.style.display = 'block';
    domBarsEl.innerHTML = '<div style="font-size:10px;font-weight:700;color:#666;margin-bottom:6px;">Couverture V4 par domaine</div>'
      + Object.entries(st.byDomain).map(([dom, d]) => {
        const p = Math.round(d.v4 / d.total * 100);
        const shortDom = dom.replace(/^\d+\.\s*/, '').substring(0, 22);
        return '<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">'
          + '<div style="width:140px;font-size:10px;color:#555;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="'+escHtml(dom)+'">'+escHtml(shortDom)+'</div>'
          + '<div style="flex:1;height:8px;background:#e2e8f0;border-radius:4px;overflow:hidden;">'
          + '<div style="height:100%;background:'+( p===100?'#22c55e':p>=70?'#86efac':'#fca5a5' )+';width:'+p+'%;border-radius:4px;transition:width .4s;"></div>'
          + '</div>'
          + '<div style="width:55px;font-size:10px;text-align:right;color:#333;font-weight:700;">'+d.v4+'/'+d.total+' <span style="color:#6b7280;font-weight:400;">('+p+'%)</span></div>'
          + (d.majeur ? '<div style="font-size:9px;color:#fff;background:#1c1c1c;border-radius:3px;padding:0 4px;">⬛'+d.majeur+'</div>' : '')
          + '</div>';
      }).join('');
  }

  // ── Table rows ─────────────────────────────────────────────────────────
  const IMPACT_LABEL = { aucun:'🟩 Aucun', mineur:'🟨 Mineur', moyen:'🟧 Moyen', majeur:'⬛ Majeur' };
  let rows = '';
  let visCount = 0;
  let lastDomain = '';

  DEFAULT_PERIMETER.forEach((base, idx) => {
    const row = getPerimetreRow(idx);
    const bm  = row.bm1, ver = row.version;
    const impKey = _impactKey(row.impactDev);

    // Filters (use merged data)
    if (domFilter && row.domaine !== domFilter) return;
    if (impactFilter && !row.impactDev.toLowerCase().includes(impactFilter.toLowerCase())) return;
    const isUpgrade   = (ver === 'V2' && bm === 'V4');
    const isDowngrade = (ver === 'V4' && bm === 'V2');
    const isSame      = (ver === bm);
    if (deltaFilter === 'upgrade'   && !isUpgrade)   return;
    if (deltaFilter === 'downgrade' && !isDowngrade)  return;
    if (deltaFilter === 'same'      && !isSame)       return;

    visCount++;

    const showDomaine = (row.domaine !== lastDomain);
    lastDomain = row.domaine;
    const domaineCell = showDomaine
      ? '<span class="perim-domaine-cell">' + escHtml(row.domaine) + '</span>'
      : '<span style="font-size:10px;color:#aaa;">└</span>';

    const verClass    = ver === 'V4' ? 'perim-v4' : 'perim-v2';
    const versionBadge= '<span class="perim-version-badge ' + verClass + '">' + escHtml(ver) + '</span>';

    // BM#1 — editable select with arrow indicator
    const arrowHtml = isUpgrade ? ' <span class="perim-arrow-up">↑</span>' : isDowngrade ? ' <span class="perim-arrow-down">↓</span>' : '';
    const bm1Cell = canEditEl
      ? '<select class="perim-select" data-bm="'+bm+'" onchange="savePerimetreField('+idx+',\'bm1\',this.value);this.setAttribute(\'data-bm\',this.value);">'
        + '<option value="V4"'+(bm==='V4'?' selected':'')+'>V4</option>'
        + '<option value="V2"'+(bm==='V2'?' selected':'')+'>V2</option>'
        + '</select>' + arrowHtml
      : '<span class="perim-version-badge '+(bm==='V4'?'perim-v4':'perim-v2')+'">'+escHtml(bm)+'</span>' + arrowHtml;

    // Impact Dév. — editable select
    const impactDevCell = canEditEl
      ? '<select class="perim-select" data-imp="'+impKey+'" onchange="savePerimetreField('+idx+',\'impactDev\',this.value);this.setAttribute(\'data-imp\',this.options[this.selectedIndex].getAttribute(\'data-k\'));">'
        + ['aucun','mineur','moyen','majeur'].map(k =>
            '<option value="'+IMPACT_LABEL[k]+'" data-k="'+k+'"'+(impKey===k?' selected':'')+'>'+IMPACT_LABEL[k]+'</option>'
          ).join('')
        + '</select>'
      : '<span class="impact-'+impKey+'">'+escHtml(row.impactDev)+'</span>';

    // Impact Migration — contenteditable
    const impMigCell = canEditEl
      ? '<span class="perim-cmt-edit" contenteditable="true" data-placeholder="Description impact…"'
        + ' onblur="savePerimetreField('+idx+',\'impactMigration\',this.innerText.trim())"'
        + ' onkeydown="if(event.key===\'Enter\'){event.preventDefault();this.blur();}">'+escHtml(row.impactMigration)+'</span>'
      : '<span style="font-size:11px;">'+escHtml(row.impactMigration)+'</span>';

    // Commentaire — contenteditable
    const cmtCell = canEditEl
      ? '<span class="perim-cmt-edit" contenteditable="true" data-placeholder="Commentaire…"'
        + ' onblur="savePerimetreField('+idx+',\'commentaire\',this.innerText.trim())"'
        + ' onkeydown="if(event.key===\'Enter\'){event.preventDefault();this.blur();}">'+escHtml(row.commentaire)+'</span>'
      : '<span style="font-size:12px;">'+escHtml(row.commentaire)+'</span>';

    rows += '<tr>'
      + '<td>' + domaineCell + '</td>'
      + '<td style="font-weight:500;">' + escHtml(row.sousModule) + '</td>'
      + '<td style="text-align:center;">' + versionBadge + '</td>'
      + '<td style="font-size:11px;color:#444;">' + escHtml(row.fonctionnalites) + '</td>'
      + '<td style="text-align:center;">' + impactDevCell + '</td>'
      + '<td style="font-size:11px;">' + impMigCell + '</td>'
      + '<td style="text-align:center;">' + bm1Cell + '</td>'
      + '<td>' + cmtCell + '</td>'
      + '</tr>';
  });

  tbody.innerHTML = rows || '<tr><td colspan="8" style="text-align:center;color:var(--gray);padding:20px;">Aucun résultat pour les filtres sélectionnés</td></tr>';
  if (cntEl) cntEl.textContent = visCount + ' module' + (visCount > 1 ? 's' : '') + ' affiché' + (visCount > 1 ? 's' : '');

  // Also refresh dashboard KPIs if visible
  renderPerimetreKpiDash();
}

function savePerimetreField(idx, field, val) {
  _perimEnsureState();
  if (!state.perimetre.data[idx]) state.perimetre.data[idx] = {};
  state.perimetre.data[idx][field] = val;
  const sousModule = DEFAULT_PERIMETER[idx] ? DEFAULT_PERIMETER[idx].sousModule : 'idx'+idx;
  saveState('Périmètre modifié', sousModule + ' — ' + field);
  // Re-render if structural fields changed (affects arrows, colors, filters)
  if (field === 'bm1' || field === 'impactDev') {
    renderPerimetre();
  } else {
    renderPerimetreKpiDash();
  }
}

// Legacy alias (backward compat)
function savePerimetreComment(idx, val) { savePerimetreField(idx, 'commentaire', val); }

/** Render Périmètre KPI section on the dashboard */
function renderPerimetreKpiDash() {
  const kpisEl   = document.getElementById('dash-perim-kpis');
  const barEl    = document.getElementById('dash-perim-v4-bar');
  const pctLbl   = document.getElementById('dash-perim-pct-label');
  const domEl    = document.getElementById('dash-perim-domains');
  if (!kpisEl) return;

  // Projet vierge sans données CBS — afficher état vide
  if (!_projUsesCBS()) {
    kpisEl.innerHTML = '<div style="font-size:12px;color:#94a3b8;padding:8px 0;">Aucun périmètre CBS chargé — importez les données CBS pour afficher les statistiques modules.</div>';
    if (barEl) barEl.style.width = '0%';
    if (pctLbl) pctLbl.textContent = '—';
    if (domEl) domEl.innerHTML = '';
    return;
  }

  const st  = getPerimetreStats();
  const pct = Math.round(st.v4 / st.total * 100);

  // Mini KPI cards
  const defs = [
    { val: st.total,         lbl: 'Modules',        bg:'#f0f4ff', bc:'#c7d2fe', vc:'#3730a3' },
    { val: st.v4+' ('+pct+'%)', lbl: 'Cible V4',    bg:'#f0fdf4', bc:'#86efac', vc:'#166534' },
    { val: st.v2,            lbl: 'Maintenus V2',   bg:'#fefce8', bc:'#fde047', vc:'#854d0e' },
    { val: '↑ '+st.upgrades, lbl: 'Upgrades',       bg:'#f0fdf4', bc:'#86efac', vc:'#15803d' },
    { val: '↓ '+st.downgrades, lbl: 'Downgrades',   bg:'#fff1f2', bc:'#fda4af', vc:'#be123c' },
    { val: st.majeur,        lbl: '⬛ Majeur',       bg:'#1c1c1c', bc:'#444',    vc:'#fff'    },
  ];
  kpisEl.innerHTML = defs.map(k =>
    '<div style="flex:1;min-width:80px;text-align:center;padding:8px 10px;border-radius:7px;background:'+k.bg+';border:1px solid '+k.bc+';color:'+k.vc+';">'
    + '<div style="font-size:18px;font-weight:900;line-height:1.1;">'+k.val+'</div>'
    + '<div style="font-size:10px;font-weight:600;margin-top:2px;">'+k.lbl+'</div>'
    + '</div>'
  ).join('');

  // Progress bar
  if (barEl) barEl.style.width = pct + '%';
  if (pctLbl) pctLbl.textContent = pct + '% V4';

  // Domain mini chart
  if (domEl) {
    domEl.innerHTML = Object.entries(st.byDomain).map(([dom, d]) => {
      const p = Math.round(d.v4 / d.total * 100);
      const short = dom.replace(/^\d+\.\s*/, '').substring(0, 18);
      const color = p === 100 ? '#22c55e' : p >= 60 ? '#f59e0b' : '#ef4444';
      return '<div title="'+escHtml(dom)+' : '+d.v4+'/'+d.total+' V4 ('+p+'%)" style="display:flex;flex-direction:column;align-items:center;gap:3px;min-width:72px;padding:6px 8px;border-radius:7px;background:#f9fafb;border:1px solid #e5e7eb;cursor:default;">'
        + '<div style="font-size:14px;font-weight:900;color:'+color+';">'+p+'%</div>'
        + '<div style="width:48px;height:5px;background:#e2e8f0;border-radius:3px;overflow:hidden;">'
        + '<div style="height:100%;background:'+color+';width:'+p+'%;border-radius:3px;"></div>'
        + '</div>'
        + '<div style="font-size:9px;color:#555;text-align:center;line-height:1.2;">'+escHtml(short)+'</div>'
        + (d.majeur ? '<div style="font-size:8px;color:#fff;background:#1c1c1c;border-radius:2px;padding:0 3px;">⬛'+d.majeur+' maj.</div>' : '')
        + '</div>';
    }).join('');
  }
}

// ════════════════════════════════════════════════════════════════════════
// PLANNING DE RÉFÉRENCE
// ════════════════════════════════════════════════════════════════════════

function defineReferencePlan() {
  if (!state.ganttReference) state.ganttReference = { isSet: false, setAt: null, dates: {} };
  if (state.ganttReference.isSet) {
    if (!confirm('Un planning de référence existe déjà (défini le ' + (state.ganttReference.setAt || '?') + ').\nVoulez-vous redéfinir le planning de référence avec les dates actuelles ?')) return;
  }
  // Snapshot all current task dates
  const allTasks = [...ganttTasks, ...(state.ganttCustom || [])];
  const snapDates = {};
  allTasks.forEach(task => {
    const { start, end } = getTaskDates(task);
    snapDates[task.id] = { start, end };
  });
  state.ganttReference = {
    isSet: true,
    setAt: new Date().toLocaleDateString('fr-FR', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' }),
    dates: snapDates
  };
  saveState('Planning de référence défini', 'Snapshot ' + Object.keys(snapDates).length + ' tâches');
  renderGantt();
}

function clearReferencePlan() {
  if (!confirm('Supprimer le planning de référence ?')) return;
  state.ganttReference = { isSet: false, setAt: null, dates: {} };
  saveState('Planning de référence supprimé', '');
  renderGantt();
}

function updateRefPlanStatus() {
  const statusEl = document.getElementById('gantt-ref-status');
  const btn      = document.getElementById('btn-ref-plan');
  if (!statusEl) return;
  if (state.ganttReference && state.ganttReference.isSet) {
    statusEl.style.display = 'block';
    statusEl.innerHTML = '📌 <strong>Planning de référence actif</strong> — défini le ' + (state.ganttReference.setAt || '?')
      + ' &nbsp;|&nbsp; <a href="#" onclick="clearReferencePlan();return false;" style="color:#ef4444;font-size:10px;">✕ Supprimer</a>';
    if (btn) btn.title = 'Redéfinir le planning de référence avec les dates actuelles';
  } else {
    statusEl.style.display = 'none';
    if (btn) btn.title = 'Définir le planning de référence avec les dates actuelles';
  }
}

function renderArbitrages() {
  const domFilter = document.getElementById('arb-filter-domain').value;
  const decFilter = document.getElementById('arb-filter-dec').value;

  // Bouton restaurer
  const _btnRestoreArb = document.getElementById('btn-restore-arb');
  if (_btnRestoreArb) _btnRestoreArb.style.display = ((state.arbitragesHidden||[]).length > 0) ? '' : 'none';

  // Toutes les entrées : statiques CBS (non masquées) + custom
  const _hiddenSet = new Set(state.arbitragesHidden || []);
  const allArbs = _projUsesCBS()
    ? [...arbitrages.filter(a => !_hiddenSet.has(String(a.id))), ...(state.customArbitrages || [])]
    : [...(state.customArbitrages || [])];

  // ── Bandeau "projet vierge" si aucune donnée ─────────────────────────────
  if (!_projUsesCBS() && allArbs.length === 0) {
    const arbTbody = document.getElementById('arb-tbody');
    if (arbTbody) arbTbody.innerHTML = `<tr><td colspan="9">${_blankProjectBanner('arbitrage')}</td></tr>`;
    const statsEl = document.getElementById('arb-top-stats');
    if (statsEl) statsEl.innerHTML = '';
    return;
  }

  let filtered = allArbs.filter(a => {
    if (domFilter && !a.domain.includes(domFilter.split(' ')[0])) return false;
    if (decFilter) {
      const dec = (state.arbitrages[a.id] || {}).decision || _arbDefKey;
      if (dec !== decFilter) return false;
    }
    return true;
  });

  // ── Deadline dynamique (Design Freeze ou date custom) ────────────────────
  const _arbDeadlineEl = document.getElementById('arb-deadline-label');
  if (_arbDeadlineEl) {
    const _dfMs = _getMilestone('design_freeze');
    if (_dfMs) {
      _arbDeadlineEl.textContent = 'Deadline : ' + _dfMs.toLocaleDateString('fr-FR', {day:'numeric',month:'long',year:'numeric'}) + ' (Design Freeze)';
    } else {
      _arbDeadlineEl.textContent = '';
    }
  }

  // Stats (sur toutes les entrées visibles)
  const _arbDecs = _getArbDecisions();
  const _arbDefKey = _getArbDefaultKey();
  let decided = 0, byDec = {};
  _arbDecs.forEach(d => { byDec[d.key] = 0; });
  allArbs.forEach(a => {
    const s = (state.arbitrages[a.id] || {}).decision || _arbDefKey;
    byDec[s] = (byDec[s] || 0) + 1;
    if (s !== _arbDefKey) decided++;
  });

  // Popule le filtre décision dynamiquement
  const _fDecSel = document.getElementById('arb-filter-dec');
  if (_fDecSel) {
    const _curVal = _fDecSel.value;
    _fDecSel.innerHTML = '<option value="">Toutes décisions</option>'
      + _arbDecs.map(d => `<option value="${d.key}" ${_curVal===d.key?'selected':''}>${d.icon} ${escHtml(d.label)}</option>`).join('');
  }

  // Légende dynamique
  const _legendEl = document.getElementById('arb-legend-bar');
  if (_legendEl) {
    _legendEl.innerHTML = '<span style="font-weight:700;color:#54565A;font-size:10px;white-space:nowrap;">Légende :</span>'
      + _arbDecs.map(d => `<span style="display:inline-flex;align-items:center;gap:4px;background:${d.bg};border:1px solid ${d.color};border-radius:4px;padding:2px 8px;font-size:10px;font-weight:700;color:${d.color};white-space:nowrap;">
        <span style="width:8px;height:8px;border-radius:50%;background:${d.color};display:inline-block;flex-shrink:0;"></span>
        ${d.icon} ${escHtml(d.label)}${d.isDefault?'<span style="font-weight:400;opacity:.8;margin-left:2px;">— en attente</span>':''}</span>`).join('');
  }

  document.getElementById('arb-top-stats').innerHTML = [
    {v:decided, l:'Décidés', c:'var(--green)', bg:'var(--green-light)'},
    ..._arbDecs.map(d => ({v:byDec[d.key]||0, l:d.label, c:d.color, bg:d.bg})),
  ].map(s => `<div style="background:${s.bg};border:1px solid ${s.c};padding:8px 14px;border-radius:5px;text-align:center;">
    <div style="font-size:22px;font-weight:900;color:${s.c}">${s.v}</div>
    <div style="font-size:10px;color:${s.c}">${s.l}</div>
  </div>`).join('');

  const _canEdit    = canEdit();
  const _canAddDel  = canAddDelete();

  let html = filtered.map(a => {
    // Les surcharges dans state.arbitrages[id] ont priorité sur les valeurs statiques
    const saved    = state.arbitrages[a.id] || {};
    const dec      = saved.decision    || _arbDefKey;
    const comment  = saved.commentaire || '';
    const dispLabel    = saved.label    || a.label    || '';
    const dispDomain   = saved.domain   || a.domain   || '';
    const dispPrio     = saved.prio     || a.prio     || 'P2';
    const dispResp     = saved.resp     || a.resp     || '';
    const dispDeadline = saved.deadline || a.deadline || '';
    const dispSource   = saved.source   || a.source   || '';
    const isCustom = !!a._custom;
    const rowStyle = isCustom ? ' style="background:#f0f4ff;"' : '';
    const idCell   = isCustom
      ? `<span style="font-size:10px;color:#3949AB;font-weight:700;">✦</span>`
      : `<span style="font-weight:700;color:var(--red)">${a.id}</span>`;
    const histBtn = '<button title="Historique" onclick="showArbitrageHistory(\'' + a.id + '\',event)" style="background:none;border:1px solid #cbd5e1;border-radius:4px;padding:2px 5px;cursor:pointer;color:#64748b;font-size:11px;" title="Historique">🕐</button>';
    // Bouton edit : éditeurs + admins / Supprimer : admins seulement
    const editBtn  = _canEdit
      ? `<button onclick="openEditArbitrage('${a.id}')" title="Modifier tous les champs" style="background:none;border:none;cursor:pointer;font-size:13px;padding:1px 3px;">✏️</button>`
      : '';
    const delBtn   = _canAddDel
      ? `<button onclick="deleteArbitrage('${a.id}')" title="Supprimer" style="background:none;border:none;cursor:pointer;font-size:13px;padding:1px 3px;color:var(--red);">✕</button>`
      : '';
    return `<tr${rowStyle}>
      <td>${idCell}</td>
      <td style="font-size:11px;">${escHtml(dispDomain)}</td>
      <td><input class="comment-input" type="text" placeholder="Source de la demande…" value="${escHtml(dispSource)}"
        onchange="setArbDecision('${a.id}','source',this.value)" ${_canEdit?'':'disabled'}
        style="width:100%;font-size:11px;"></td>
      <td>${escHtml(dispLabel)}</td>
      <td class="center"><span class="badge badge-${dispPrio.toLowerCase()}">${dispPrio}</span></td>
      <td>
        <select class="status-select" data-arb-dec="${a.id}" onchange="setArbDecision('${a.id}','decision',this.value);_applyArbDecSelectStyle(this);" ${_canEdit?'':'disabled'}>
          ${_arbDecs.map(d => `<option value="${d.key}" ${dec===d.key?'selected':''}>${d.icon} ${escHtml(d.label)}</option>`).join('')}
        </select>
      </td>
      <td style="font-size:11px;">${escHtml(dispResp)}</td>
      <td style="font-size:11px;">${escHtml(dispDeadline)}</td>
      <td><input class="comment-input" type="text" placeholder="Commentaire…" value="${escHtml(comment)}"
        onchange="setArbDecision('${a.id}','commentaire',this.value)" ${_canEdit?'':'disabled'}></td>
      <td class="center" style="white-space:nowrap;">${editBtn}${delBtn}${histBtn}</td>
    </tr>`;
  }).join('');

  document.getElementById('arb-tbody').innerHTML = html || '<tr><td colspan="9" style="text-align:center;padding:20px;color:var(--gray);">Aucun résultat</td></tr>';

  // Style selects (inline couleur dynamique)
  document.querySelectorAll('.status-select[data-arb-dec]').forEach(sel => {
    _applyArbDecSelectStyle(sel);
  });

  renderDashboard();
}

function setArbDecision(id, field, value) {
  if (!canEdit()) return;
  if (!state.arbitrages[id]) state.arbitrages[id] = {};
  state.arbitrages[id][field] = value;
  saveState('Décision arbitrage', id + ' · ' + field + ' → ' + String(value).substring(0, 50));
  renderArbitrages();
}

// ── Arbitrage CRUD ────────────────────────────────────────────────────────
let _arbEditId = null;

function _populateArbDecSelect(selectId, selectedKey) {
  const sel = document.getElementById(selectId);
  if (!sel) return;
  const decs = _getArbDecisions();
  sel.innerHTML = decs.map(d => `<option value="${d.key}" ${d.key===selectedKey?'selected':''}>${d.icon} ${escHtml(d.label)}</option>`).join('');
}
function openAddArbitrage() {
  if (!canAddDelete()) return;
  _arbEditId = null;
  document.getElementById('arb-modal-title').textContent = '➕ Nouvel arbitrage';
  document.getElementById('arb-modal-btn').textContent   = 'Créer';
  document.getElementById('arb-modal-label').value    = '';
  document.getElementById('arb-modal-source').value   = '';
  document.getElementById('arb-modal-domain').value   = '';
  document.getElementById('arb-modal-prio').value     = 'P2';
  document.getElementById('arb-modal-resp').value     = '';
  document.getElementById('arb-modal-deadline').value = '';
  _populateArbDecSelect('arb-modal-dec', _getArbDefaultKey());
  document.getElementById('arb-modal-comment').value  = '';
  document.getElementById('arb-modal').style.display  = 'flex';
}

function openEditArbitrage(id) {
  if (!canEdit()) return;  // éditeurs + admins peuvent modifier
  _arbEditId = id;
  const allArbs = [...arbitrages, ...(state.customArbitrages||[])];
  const a = allArbs.find(x => String(x.id) === String(id));
  // Les surcharges éventuelles stockées dans state.arbitrages prennent le dessus
  const saved = state.arbitrages[id] || {};
  document.getElementById('arb-modal-title').textContent = '✏️ Modifier l\'arbitrage';
  document.getElementById('arb-modal-btn').textContent   = 'Enregistrer';
  document.getElementById('arb-modal-label').value    = saved.label    || (a && a.label)    || '';
  document.getElementById('arb-modal-source').value   = saved.source   || (a && a.source)   || '';
  document.getElementById('arb-modal-domain').value   = saved.domain   || (a && a.domain)   || '';
  document.getElementById('arb-modal-prio').value     = saved.prio     || (a && a.prio)     || 'P2';
  document.getElementById('arb-modal-resp').value     = saved.resp     || (a && a.resp)     || '';
  document.getElementById('arb-modal-deadline').value = saved.deadline || (a && a.deadline) || '';
  _populateArbDecSelect('arb-modal-dec', saved.decision || _getArbDefaultKey());
  document.getElementById('arb-modal-comment').value  = saved.commentaire || '';
  document.getElementById('arb-modal').style.display  = 'flex';
}

// ── Paramétrage des décisions d'arbitrage ─────────────────────────────────────
let _arbDecWIP = []; // copie de travail pendant l'édition

function openArbDecisionsSettings() {
  if (!canEdit()) return;
  _arbDecWIP = JSON.parse(JSON.stringify(_getArbDecisions()));
  _renderArbDecSettingsList();
  document.getElementById('arb-dec-settings-modal').style.display = 'flex';
}
function closeArbDecisionsSettings() {
  document.getElementById('arb-dec-settings-modal').style.display = 'none';
  _arbDecWIP = [];
}
function _renderArbDecSettingsList() {
  const wrap = document.getElementById('arb-dec-settings-list');
  if (!wrap) return;
  wrap.innerHTML = _arbDecWIP.map((d, i) => `
    <tr data-idx="${i}">
      <td style="text-align:center;padding:4px;">
        <label title="Statut par défaut (arbitrages non encore traités)">
          <input type="radio" name="arb-dec-default" value="${i}" ${d.isDefault?'checked':''}
            onchange="_arbDecSetDefault(${i})" style="cursor:pointer;">
        </label>
      </td>
      <td style="padding:4px;"><input type="text" value="${escHtml(d.icon)}" maxlength="4" placeholder="🔵"
        oninput="_arbDecWIP[${i}].icon=this.value;_arbDecUpdatePreview(${i})"
        style="width:44px;text-align:center;padding:4px;border:1px solid #ddd;border-radius:4px;font-size:15px;"></td>
      <td style="padding:4px;"><input type="text" value="${escHtml(d.label)}" placeholder="Libellé…"
        oninput="_arbDecWIP[${i}].label=this.value;_arbDecUpdatePreview(${i})"
        style="width:180px;padding:5px 8px;border:1px solid #ddd;border-radius:4px;font-size:12px;box-sizing:border-box;"></td>
      <td style="padding:4px;">
        <input type="color" value="${d.color}" title="Couleur texte / bordure"
          oninput="_arbDecWIP[${i}].color=this.value;_arbDecUpdatePreview(${i})"
          style="width:36px;height:30px;padding:2px;border:1px solid #ddd;border-radius:4px;cursor:pointer;">
      </td>
      <td style="padding:4px;">
        <input type="color" value="${d.bg}" title="Couleur de fond"
          oninput="_arbDecWIP[${i}].bg=this.value;_arbDecUpdatePreview(${i})"
          style="width:36px;height:30px;padding:2px;border:1px solid #ddd;border-radius:4px;cursor:pointer;">
      </td>
      <td style="padding:4px;text-align:center;">
        <span id="arb-dec-preview-${i}" style="display:inline-block;padding:2px 9px;border-radius:4px;font-size:11px;font-weight:700;border:1px solid ${d.color};background:${d.bg};color:${d.color};">${d.icon} ${escHtml(d.label)}</span>
      </td>
      <td style="padding:4px;text-align:center;">
        ${_arbDecWIP.length > 1 ? `<button onclick="_arbDecDeleteRow(${i})" title="Supprimer" style="background:none;border:1px solid #fca5a5;border-radius:4px;color:#e63329;cursor:pointer;padding:3px 7px;font-size:12px;">✕</button>` : '<span style="color:#ccc;font-size:11px;">—</span>'}
      </td>
    </tr>`).join('');
}
function _arbDecUpdatePreview(i) {
  const d = _arbDecWIP[i];
  const prev = document.getElementById('arb-dec-preview-' + i);
  if (prev) {
    prev.style.borderColor = d.color;
    prev.style.background  = d.bg;
    prev.style.color       = d.color;
    prev.textContent       = d.icon + ' ' + d.label;
  }
}
function _arbDecSetDefault(i) {
  _arbDecWIP.forEach((d, idx) => { d.isDefault = (idx === i); });
}
function _arbDecDeleteRow(i) {
  if (_arbDecWIP.length <= 1) return;
  if (!confirm('Supprimer ce statut ? Les arbitrages ayant ce statut seront affichés avec le statut par défaut.')) return;
  _arbDecWIP.splice(i, 1);
  // S'assurer qu'il y a toujours un défaut
  if (!_arbDecWIP.find(d => d.isDefault)) _arbDecWIP[0].isDefault = true;
  _renderArbDecSettingsList();
}
function addArbDecisionRow() {
  const key = 'dec_' + Date.now();
  _arbDecWIP.push({ key, label: 'Nouveau statut', icon: '🔘', color: '#64748b', bg: '#f1f5f9', isDefault: false });
  _renderArbDecSettingsList();
}
function saveArbDecisionsSettings() {
  // Lire les valeurs actuelles des inputs
  const rows = document.querySelectorAll('#arb-dec-settings-list tr[data-idx]');
  rows.forEach(tr => {
    const i = parseInt(tr.dataset.idx);
    const inputs = tr.querySelectorAll('input[type=text]');
    if (inputs[0]) _arbDecWIP[i].icon  = inputs[0].value.trim();
    if (inputs[1]) _arbDecWIP[i].label = inputs[1].value.trim() || 'Statut ' + (i+1);
    const colors = tr.querySelectorAll('input[type=color]');
    if (colors[0]) _arbDecWIP[i].color = colors[0].value;
    if (colors[1]) _arbDecWIP[i].bg    = colors[1].value;
  });
  // S'assurer qu'un défaut est défini
  if (!_arbDecWIP.find(d => d.isDefault)) _arbDecWIP[0].isDefault = true;
  state.arbDecisions = JSON.parse(JSON.stringify(_arbDecWIP));
  saveState('Décisions arbitrage mises à jour', _arbDecWIP.length + ' statuts');
  closeArbDecisionsSettings();
  renderArbitrages();
}

// ─── GAP Decisions Settings ───────────────────────────────────────────────────
let _gapDecWIP = []; // copie de travail pendant l'édition

function openGapDecisionsSettings() {
  if (!canEdit()) return;
  _gapDecWIP = JSON.parse(JSON.stringify(_getGapDecisions()));
  _renderGapDecSettingsList();
  document.getElementById('gap-dec-settings-modal').style.display = 'flex';
}
function closeGapDecisionsSettings() {
  document.getElementById('gap-dec-settings-modal').style.display = 'none';
  _gapDecWIP = [];
}
function _renderGapDecSettingsList() {
  const wrap = document.getElementById('gap-dec-settings-list');
  if (!wrap) return;
  wrap.innerHTML = _gapDecWIP.map((d, i) => `
    <tr data-idx="${i}">
      <td style="text-align:center;padding:4px;">
        <label title="Statut par défaut (GAPs non encore traités)">
          <input type="radio" name="gap-dec-default" value="${i}" ${d.isDefault?'checked':''}
            onchange="_gapDecSetDefault(${i})" style="cursor:pointer;">
        </label>
      </td>
      <td style="padding:4px;"><input type="text" value="${escHtml(d.icon)}" maxlength="4" placeholder="🔵"
        oninput="_gapDecWIP[${i}].icon=this.value;_gapDecUpdatePreview(${i})"
        style="width:44px;text-align:center;padding:4px;border:1px solid #ddd;border-radius:4px;font-size:15px;"></td>
      <td style="padding:4px;"><input type="text" value="${escHtml(d.label)}" placeholder="Libellé…"
        oninput="_gapDecWIP[${i}].label=this.value;_gapDecUpdatePreview(${i})"
        style="width:180px;padding:5px 8px;border:1px solid #ddd;border-radius:4px;font-size:12px;box-sizing:border-box;"></td>
      <td style="padding:4px;">
        <input type="color" value="${d.color}" title="Couleur texte / bordure"
          oninput="_gapDecWIP[${i}].color=this.value;_gapDecUpdatePreview(${i})"
          style="width:36px;height:30px;padding:2px;border:1px solid #ddd;border-radius:4px;cursor:pointer;">
      </td>
      <td style="padding:4px;">
        <input type="color" value="${d.bg}" title="Couleur de fond"
          oninput="_gapDecWIP[${i}].bg=this.value;_gapDecUpdatePreview(${i})"
          style="width:36px;height:30px;padding:2px;border:1px solid #ddd;border-radius:4px;cursor:pointer;">
      </td>
      <td style="padding:4px;text-align:center;">
        <span id="gap-dec-preview-${i}" style="display:inline-block;padding:2px 9px;border-radius:4px;font-size:11px;font-weight:700;border:1px solid ${d.color};background:${d.bg};color:${d.color};">${d.icon} ${escHtml(d.label)}</span>
      </td>
      <td style="padding:4px;text-align:center;">
        ${_gapDecWIP.length > 1 ? `<button onclick="_gapDecDeleteRow(${i})" title="Supprimer" style="background:none;border:1px solid #fca5a5;border-radius:4px;color:#e63329;cursor:pointer;padding:3px 7px;font-size:12px;">✕</button>` : '<span style="color:#ccc;font-size:11px;">—</span>'}
      </td>
    </tr>`).join('');
}
function _gapDecUpdatePreview(i) {
  const d = _gapDecWIP[i];
  const prev = document.getElementById('gap-dec-preview-' + i);
  if (prev) {
    prev.style.borderColor = d.color;
    prev.style.background  = d.bg;
    prev.style.color       = d.color;
    prev.textContent       = d.icon + ' ' + d.label;
  }
}
function _gapDecSetDefault(i) {
  _gapDecWIP.forEach((d, idx) => { d.isDefault = (idx === i); });
}
function _gapDecDeleteRow(i) {
  if (_gapDecWIP.length <= 1) return;
  if (!confirm('Supprimer ce statut ? Les GAPs ayant ce statut seront affichés avec le statut par défaut.')) return;
  _gapDecWIP.splice(i, 1);
  if (!_gapDecWIP.find(d => d.isDefault)) _gapDecWIP[0].isDefault = true;
  _renderGapDecSettingsList();
}
function addGapDecisionRow() {
  const key = 'gapdec_' + Date.now();
  _gapDecWIP.push({ key, label: 'Nouveau statut', icon: '🔘', color: '#64748b', bg: '#f1f5f9', isDefault: false });
  _renderGapDecSettingsList();
}
function saveGapDecisionsSettings() {
  const rows = document.querySelectorAll('#gap-dec-settings-list tr[data-idx]');
  rows.forEach(tr => {
    const i = parseInt(tr.dataset.idx);
    const inputs = tr.querySelectorAll('input[type=text]');
    if (inputs[0]) _gapDecWIP[i].icon  = inputs[0].value.trim();
    if (inputs[1]) _gapDecWIP[i].label = inputs[1].value.trim() || 'Statut ' + (i+1);
    // Sync key to label for new entries so stored decision values match the label
    if (_gapDecWIP[i].key && _gapDecWIP[i].key.startsWith('gapdec_')) {
      _gapDecWIP[i].key = _gapDecWIP[i].label;
    }
    const colors = tr.querySelectorAll('input[type=color]');
    if (colors[0]) _gapDecWIP[i].color = colors[0].value;
    if (colors[1]) _gapDecWIP[i].bg    = colors[1].value;
  });
  if (!_gapDecWIP.find(d => d.isDefault)) _gapDecWIP[0].isDefault = true;
  state.gapDecisions = JSON.parse(JSON.stringify(_gapDecWIP));
  saveState('Décisions GAP mises à jour', _gapDecWIP.length + ' statuts');
  closeGapDecisionsSettings();
  renderGaps();
}

function closeArbModal() {
  document.getElementById('arb-modal').style.display = 'none';
  _arbEditId = null;
}

function saveArbitrage() {
  const label    = document.getElementById('arb-modal-label').value.trim();
  const source   = document.getElementById('arb-modal-source').value.trim();
  const domain   = document.getElementById('arb-modal-domain').value.trim();
  const prio     = document.getElementById('arb-modal-prio').value;
  const resp     = document.getElementById('arb-modal-resp').value.trim();
  const deadline = document.getElementById('arb-modal-deadline').value.trim();
  const dec      = document.getElementById('arb-modal-dec').value;
  const comment  = document.getElementById('arb-modal-comment').value.trim();
  if (!label) { alert('Le libellé est obligatoire.'); return; }

  const _ARB_FIELDS = { label:'Libellé', source:'Source', domain:'Domaine', prio:'Priorité', resp:'Responsable', deadline:'Échéance', decision:'Décision', commentaire:'Commentaire' };
  if (_arbEditId !== null) {
    const custom = (state.customArbitrages||[]).find(x => String(x.id) === String(_arbEditId));
    if (custom) {
      const oldItem = { ...custom, decision: (state.arbitrages[_arbEditId]||{}).decision, commentaire: (state.arbitrages[_arbEditId]||{}).commentaire };
      const newItem = { label, source, domain, prio, resp, deadline, decision: dec, commentaire: comment };
      const changes = _diffFields(oldItem, newItem, _ARB_FIELDS);
      if (changes.length > 0) { _pushHistory(custom, 'updated', changes); }
      custom.label = label; custom.source = source; custom.domain = domain; custom.prio = prio;
      custom.resp  = resp;  custom.deadline = deadline;
    }
    if (!state.arbitrages[_arbEditId]) state.arbitrages[_arbEditId] = {};
    state.arbitrages[_arbEditId].label       = label;
    state.arbitrages[_arbEditId].source      = source;
    state.arbitrages[_arbEditId].domain      = domain;
    state.arbitrages[_arbEditId].prio        = prio;
    state.arbitrages[_arbEditId].resp        = resp;
    state.arbitrages[_arbEditId].deadline    = deadline;
    state.arbitrages[_arbEditId].decision    = dec;
    state.arbitrages[_arbEditId].commentaire = comment;
    _saveAppDefault('arbitrages', [...arbitrages, ...(state.customArbitrages||[])]);
    saveState('Arbitrage modifié', label.substring(0, 60));
  } else {
    const newId = 'arb_' + Date.now();
    if (!state.customArbitrages) state.customArbitrages = [];
    const newArb = { id: newId, label, source, domain, prio, resp, deadline, _custom: true, _history: [] };
    _pushHistory(newArb, 'created');
    state.customArbitrages.push(newArb);
    if (!state.arbitrages[newId]) state.arbitrages[newId] = {};
    state.arbitrages[newId].source      = source;
    state.arbitrages[newId].decision    = dec;
    state.arbitrages[newId].commentaire = comment;
    _saveAppDefault('arbitrages', [...arbitrages, ...(state.customArbitrages||[])]);
    saveState('Arbitrage créé', label.substring(0, 60));
  }
  // Persistance dans la table arbitrages (DB v2)
  if (typeof DB !== 'undefined') {
    const _lastArb = _arbEditId !== null
      ? (state.customArbitrages||[]).find(function(a){ return String(a.id) === String(_arbEditId); })
      : (state.customArbitrages||[])[(state.customArbitrages||[]).length - 1];
    if (_lastArb) DB.saveArbitrage(_lastArb).then(function(dbId) {
      if (dbId) DB.loadArbitrages().then(function(d){ window._arbsCache = d; });
    });
  }
  closeArbModal();
  renderArbitrages();
}

function deleteArbitrage(id) {
  if (!canAddDelete()) return;
  const allArbs = [...arbitrages, ...(state.customArbitrages||[])];
  const a = allArbs.find(x => String(x.id) === String(id));
  const label = a ? (a.label||id) : id;
  if (!confirm('Supprimer l\'arbitrage "' + label.substring(0,60) + '" ?\n\nCette action est réversible via le bouton ↩ Restaurer.')) return;
  if (a && a._custom) {
    state.customArbitrages = (state.customArbitrages||[]).filter(x => String(x.id) !== String(id));
  } else {
    if (!state.arbitragesHidden) state.arbitragesHidden = [];
    if (!state.arbitragesHidden.includes(String(id))) state.arbitragesHidden.push(String(id));
  }
  saveState('Arbitrage supprimé', label.substring(0, 60));
  renderArbitrages();
}

function restoreAllHiddenArb() {
  if (!(state.arbitragesHidden && state.arbitragesHidden.length)) { alert('Aucun arbitrage masqué.'); return; }
  if (!confirm('Restaurer ' + state.arbitragesHidden.length + ' arbitrage(s) masqué(s) ?')) return;
  state.arbitragesHidden = [];
  saveState('Arbitrages restaurés');
  renderArbitrages();
}

// ════════════════════════════════════════════════════════════════════════
// ACTIONS
// ════════════════════════════════════════════════════════════════════════

const _ACT_STATUS = {
  todo:        { label: 'À faire',  color: '#64748b', bg: '#f1f5f9', border: '#cbd5e1' },
  in_progress: { label: 'En cours', color: '#1565C0', bg: '#dbeafe', border: '#93c5fd' },
  blocked:     { label: 'Bloqué',   color: '#b91c1c', bg: '#fee2e2', border: '#fca5a5' },
  done:        { label: 'Terminé',  color: '#15803d', bg: '#dcfce7', border: '#86efac' },
  cancelled:   { label: 'Annulé',   color: '#9ca3af', bg: '#f3f4f6', border: '#d1d5db' },
};
const _ACT_TECH_AREAS = ['Installation','Upgrade / Migration','Paramétrage','Satellite / Interfaçage','Recette / Tests','Formation','Reprise de données','Autre'];
const _ACT_SIDES = ['BOA', 'CBS', 'CBS + BOA', 'Externe'];
let _selectedActionIds = new Set();
let _lastRenderedActionIds = [];
let _actCalendarCursor = null;
// ── Tri des colonnes du plan d'action ──────────────────────────────────────
let _actSortState = { col: null, dir: 'asc' }; // null = tri par défaut (retard + date)

/** Calculate action end date considering dependencies (recursive, cycle-safe) */
function _calcActionEndDate(actId, allActions, visited) {
  if (!visited) visited = new Set();
  if (visited.has(actId)) return null;
  visited.add(actId);
  const act = allActions.find(a => a.id === actId);
  if (!act) return null;
  const saved = state.actions[actId] || {};
  const dateDebutStr = saved.dateDebut || act.dateDebut || '';
  const duree = parseInt(saved.duree || act.duree || 0);
  if (!dateDebutStr) return null;
  let start = new Date(dateDebutStr);
  if (isNaN(start.getTime())) return null;
  // Push start by dependencies
  (act.dependsOn || []).forEach(depId => {
    const depEnd = _calcActionEndDate(depId, allActions, new Set(visited));
    if (depEnd) { const d = new Date(depEnd); if (d > start) start = d; }
  });
  if (duree > 0) {
    const end = new Date(start); end.setDate(end.getDate() + duree);
    if (isNaN(end.getTime())) return null;
    return end.toISOString().split('T')[0];
  }
  return start.toISOString().split('T')[0];
}

function _actionDateRange(a, allActions) {
  const saved = state.actions[a.id] || {};
  const start = saved.dateDebut || a.dateDebut || '';
  // Priorité : dateFin stockée explicitement; sinon calculée depuis dateDebut+duree+dépendances
  const storedFin = saved.dateFin || a.dateFin || '';
  const end = storedFin || _calcActionEndDate(a.id, allActions) || '';
  return { start, end };
}

function _isActionOverdue(a, allActions) {
  const saved = state.actions[a.id] || {};
  const status = saved.status || 'todo';
  // Exclure les actions terminées ou annulées
  if (status === 'done' || status === 'cancelled') return false;
  // Exclure les actions à 100% d'avancement (effectivement terminées même si statut non mis à jour)
  const pct = saved.pct !== undefined ? Number(saved.pct) : 0;
  if (pct >= 100) return false;
  const range = _actionDateRange(a, allActions);
  if (!range.end) return false;
  const end = new Date(range.end + 'T00:00:00');
  if (isNaN(end.getTime())) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return end < today;
}

function _actionSortKey(a, allActions) {
  const range = _actionDateRange(a, allActions);
  const overdue = _isActionOverdue(a, allActions) ? 0 : 1;
  const end = range.end || '9999-12-31';
  return [overdue, end, a.id];
}

function _ensureActionCalendarCursor(filtered, allActions) {
  if (_actCalendarCursor) return;
  const firstDated = filtered.find(a => _actionDateRange(a, allActions).end);
  const base = firstDated ? new Date(_actionDateRange(firstDated, allActions).end + 'T00:00:00') : new Date();
  _actCalendarCursor = new Date(base.getFullYear(), base.getMonth(), 1);
}

function shiftActionCalendarMonth(offset) {
  if (!_actCalendarCursor) {
    const now = new Date();
    _actCalendarCursor = new Date(now.getFullYear(), now.getMonth(), 1);
  }
  _actCalendarCursor = new Date(_actCalendarCursor.getFullYear(), _actCalendarCursor.getMonth() + offset, 1);
  renderActions();
}

function resetActionCalendarMonth() {
  const now = new Date();
  _actCalendarCursor = new Date(now.getFullYear(), now.getMonth(), 1);
  renderActions();
}

function renderActionCalendar(filtered, allActions) {
  const view = document.getElementById('act-calendar-view');
  if (!view) return;
  _ensureActionCalendarCursor(filtered, allActions);
  const cursor = _actCalendarCursor || new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const monthStart = new Date(year, month, 1);
  const monthEnd = new Date(year, month + 1, 0);
  const startOffset = (monthStart.getDay() + 6) % 7;
  const gridStart = new Date(year, month, 1 - startOffset);
  const days = [];
  const byDay = {};
  filtered.forEach(a => {
    const range = _actionDateRange(a, allActions);
    if (!range.end) return;
    const key = range.end;
    if (!byDay[key]) byDay[key] = [];
    byDay[key].push(a);
  });
  for (let i = 0; i < 42; i++) {
    const d = new Date(gridStart);
    d.setDate(gridStart.getDate() + i);
    const iso = d.toISOString().split('T')[0];
    days.push({ date: d, iso, items: (byDay[iso] || []).sort((a, b) => _actionSortKey(a, allActions)[1].localeCompare(_actionSortKey(b, allActions)[1]) || a.id.localeCompare(b.id)) });
  }
  const monthLabel = cursor.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
  const weekDays = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
  view.innerHTML = `
    <div style="padding:10px 16px 14px;">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-bottom:10px;">
        <div style="display:flex;align-items:center;gap:8px;">
          <button type="button" onclick="shiftActionCalendarMonth(-1)" class="perm-add-delete" style="background:#fff;color:#334155;border:1px solid #cbd5e1;border-radius:6px;padding:6px 10px;font-size:12px;font-weight:700;cursor:pointer;">←</button>
          <div style="font-size:16px;font-weight:800;color:#1e293b;text-transform:capitalize;">${monthLabel}</div>
          <button type="button" onclick="shiftActionCalendarMonth(1)" class="perm-add-delete" style="background:#fff;color:#334155;border:1px solid #cbd5e1;border-radius:6px;padding:6px 10px;font-size:12px;font-weight:700;cursor:pointer;">→</button>
          <button type="button" onclick="resetActionCalendarMonth()" class="perm-add-delete" style="background:#f8fafc;color:#475569;border:1px solid #dbe3ec;border-radius:6px;padding:6px 10px;font-size:12px;font-weight:700;cursor:pointer;">Aujourd'hui</button>
        </div>
        <div style="font-size:11px;color:#64748b;">Échéances des actions visibles</div>
      </div>
      <div style="display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:1px;background:#e2e8f0;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;">
        ${weekDays.map(label => `<div style="background:#f8fafc;padding:8px 10px;font-size:11px;font-weight:800;color:#475569;text-align:center;">${label}</div>`).join('')}
        ${days.map(day => {
          const inMonth = day.date.getMonth() === month;
          const isToday = day.iso === new Date().toISOString().split('T')[0];
          const itemsHtml = day.items.slice(0, 4).map(a => {
            const saved = state.actions[a.id] || {};
            const status = saved.status || 'todo';
            const overdue = _isActionOverdue(a, allActions);
            const st = _ACT_STATUS[status] || _ACT_STATUS.todo;
            return `<button type="button" onclick="openEditActionModal('${a.id}')" title="${escHtml(a.action)}" style="display:block;width:100%;text-align:left;border:1px solid ${overdue ? '#fca5a5' : st.border};background:${overdue ? '#fff1f2' : st.bg};color:${overdue ? '#b91c1c' : st.color};border-radius:6px;padding:5px 6px;font-size:10px;font-weight:700;cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:4px;">
              ${escHtml(a.id)} · ${escHtml(a.action)}
            </button>`;
          }).join('');
          const moreCount = day.items.length - 4;
          return `<div style="background:${inMonth ? '#fff' : '#f8fafc'};min-height:138px;padding:8px;opacity:${inMonth ? '1' : '.55'};position:relative;">
            <div style="display:flex;align-items:center;justify-content:space-between;gap:6px;margin-bottom:4px;">
              <span style="display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;border-radius:999px;background:${isToday ? '#dbeafe' : 'transparent'};color:${isToday ? '#1565C0' : '#334155'};font-size:12px;font-weight:800;">${day.date.getDate()}</span>
              ${day.items.length ? `<span style="font-size:10px;color:${day.items.some(a => _isActionOverdue(a, allActions)) ? '#b91c1c' : '#64748b'};font-weight:700;">${day.items.length} tâche(s)</span>` : ''}
            </div>
            ${itemsHtml || '<div style="font-size:10px;color:#cbd5e1;padding-top:10px;">—</div>'}
            ${moreCount > 0 ? `<div style="margin-top:4px;font-size:10px;color:#64748b;font-weight:700;">+${moreCount} autre(s)</div>` : ''}
          </div>`;
        }).join('')}
      </div>
      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:10px;font-size:11px;color:#64748b;">
        <span style="display:inline-flex;align-items:center;gap:5px;"><span style="width:10px;height:10px;border-radius:999px;background:#dbeafe;display:inline-block;"></span>Aujourd'hui</span>
        <span style="display:inline-flex;align-items:center;gap:5px;"><span style="width:10px;height:10px;border-radius:999px;background:#fff1f2;border:1px solid #fca5a5;display:inline-block;"></span>Échéance en retard</span>
      </div>
    </div>`;
}

function _populateActionFilterOptions(allActions) {
  const domainEl = document.getElementById('act-filter-domain');
  const respEl = document.getElementById('act-filter-resp');
  if (domainEl) {
    const cur = domainEl.value;
    const domains = Array.from(new Set(allActions.flatMap(a => {
      const vals = [];
      if (a.domain) vals.push(String(a.domain).trim());
      if (Array.isArray(a.domains)) a.domains.forEach(d => d && vals.push(String(d).trim()));
      return vals.filter(Boolean);
    }))).sort((a,b) => a.localeCompare(b, 'fr'));
    domainEl.innerHTML = '<option value="">Tous les domaines</option>' + domains.map(d => `<option value="${escAttr(d)}">${escHtml(d)}</option>`).join('');
    if (domains.includes(cur)) domainEl.value = cur;
  }
  if (respEl) {
    const cur = respEl.value;
    const resps = Array.from(new Set(allActions.map(a => String(a.resp || '').trim()).filter(Boolean))).sort((a,b) => a.localeCompare(b, 'fr'));
    respEl.innerHTML = '<option value="">Tous</option>' + resps.map(r => `<option value="${escAttr(r)}">${escHtml(r)}</option>`).join('');
    if (resps.includes(cur)) respEl.value = cur;
  }
}

function _refreshActionSelectionInfo() {
  const count = _selectedActionIds.size;
  const total = (_lastRenderedActionIds || []).length;

  // Compteur textuel
  const countEl = document.getElementById('act-selection-count');
  if (countEl) countEl.textContent = count > 0
    ? count + ' action' + (count > 1 ? 's' : '') + ' sélectionnée' + (count > 1 ? 's' : '')
    : '0 sélectionnée';

  // Bouton supprimer : texte + visibilité
  const delBtn = document.getElementById('act-delete-selected-btn');
  if (delBtn) delBtn.textContent = '🗑 Supprimer (' + count + ')';

  // Barre contextuelle : afficher dès qu'il y a une sélection
  const bar = document.getElementById('act-bulk-bar');
  if (bar) bar.style.display = count > 0 ? 'flex' : 'none';

  // Checkbox "tout" : état cochée / indéterminée / vide
  const allChk = document.getElementById('act-select-all-chk');
  if (allChk) {
    allChk.checked       = total > 0 && count >= total;
    allChk.indeterminate = count > 0 && count < total;
  }
}

function toggleActionSelection(id, checked) {
  if (checked) _selectedActionIds.add(id);
  else _selectedActionIds.delete(id);
  _refreshActionSelectionInfo();
}

function selectAllVisibleActions() {
  _lastRenderedActionIds.forEach(id => _selectedActionIds.add(id));
  renderActions();
}

function clearActionSelection() {
  _selectedActionIds.clear();
  renderActions();
}

/** Cocher/décocher la checkbox "Tout" dans la barre */
function toggleAllActions(checked) {
  if (checked) selectAllVisibleActions();
  else clearActionSelection();
}

/**
 * Cocher/décocher toutes les actions d'une section (groupe Domaine / Domaine technique).
 * Appelé par la checkbox dans l'en-tête de section.
 * Ne re-rend pas le tableau — met à jour les cases individuelles en DOM direct.
 */
function toggleSectionSelection(sectionId, checked) {
  const tbody = document.querySelector('#actsec-' + sectionId + ' tbody');
  if (!tbody) return;
  tbody.querySelectorAll('input[data-action-id]').forEach(cb => {
    const id = cb.dataset.actionId;
    if (id) {
      if (checked) _selectedActionIds.add(id);
      else _selectedActionIds.delete(id);
      cb.checked = checked;
    }
  });
  _refreshActionSelectionInfo();
}

/** Change le statut de toutes les actions sélectionnées en une seule opération */
function bulkSetActionStatus() {
  if (!canEdit()) return;
  const ids = Array.from(_selectedActionIds);
  if (ids.length === 0) { showToast('ℹ️ Aucune action sélectionnée.', 2000); return; }
  const status = (document.getElementById('act-bulk-status-select') || {}).value || 'todo';
  const label  = { todo:'À faire', in_progress:'En cours', done:'Terminé', blocked:'Bloqué', cancelled:'Annulé' }[status] || status;
  if (!confirm('Passer ' + ids.length + ' action(s) au statut "' + label + '" ?')) return;
  ids.forEach(id => {
    if (!state.actions[id]) state.actions[id] = {};
    state.actions[id].status = status;
    if (status === 'done' && !state.actions[id].pct) state.actions[id].pct = 100;
    _syncActionToGanttTask(id);
  });
  _saveCurrentProjectData();
  saveState('Statut en masse', ids.length + ' actions → ' + label);
  renderActions();
  renderDashboard();
  showToast('✅ ' + ids.length + ' action(s) passées au statut "' + label + '"', 2500);
}

/** Bascule le tri sur une colonne (asc → desc → annuler) */
function _setActSort(col) {
  if (_actSortState.col === col) {
    if (_actSortState.dir === 'asc') {
      _actSortState.dir = 'desc';
    } else {
      _actSortState.col = null; // 3e clic : retour tri par défaut
      _actSortState.dir = 'asc';
    }
  } else {
    _actSortState.col = col;
    _actSortState.dir = 'asc';
  }
  renderActions();
}

/** Applique le tri courant sur un tableau d'actions */
function _applyActSort(items, allActions) {
  if (!_actSortState.col) return items;
  const dir = _actSortState.dir === 'asc' ? 1 : -1;
  return [...items].sort(function(a, b) {
    const sa = state.actions[a.id] || {};
    const sb = state.actions[b.id] || {};
    const ra = _actionDateRange(a, allActions);
    const rb = _actionDateRange(b, allActions);
    let va, vb;
    switch (_actSortState.col) {
      case 'ref':    va = a.id || '';              vb = b.id || '';             break;
      case 'action': va = (a.action || '').toLowerCase(); vb = (b.action || '').toLowerCase(); break;
      case 'resp':   va = (a.resp || '').toLowerCase();   vb = (b.resp || '').toLowerCase();   break;
      case 'side':   va = (a.side || sa.side || '').toLowerCase(); vb = (b.side || sb.side || '').toLowerCase(); break;
      case 'start':  va = ra.start || '';          vb = rb.start || '';         break;
      case 'end':    va = ra.end   || '';          vb = rb.end   || '';         break;
      case 'status': va = sa.status || 'todo';     vb = sb.status || 'todo';    break;
      case 'pct':    va = Number(sa.pct || 0);     vb = Number(sb.pct || 0);    break;
      default: return 0;
    }
    if (typeof va === 'number') return dir * (va - vb);
    return dir * va.localeCompare(vb, 'fr');
  });
}

/** Génère un <th> cliquable avec icône de tri */
function _actSortTh(col, label, style) {
  const isActive = _actSortState.col === col;
  const icon = isActive
    ? (_actSortState.dir === 'asc' ? ' ↑' : ' ↓')
    : ' <span style="opacity:.28;font-size:9px;">⇅</span>';
  return `<th onclick="_setActSort('${col}')"
    title="Trier par ${label}"
    style="cursor:pointer;user-select:none;white-space:nowrap;
           ${isActive ? 'color:#1565C0;background:#e8f0fe;' : ''}
           ${style || ''}">
    ${label}${icon}</th>`;
}

function renderActions() {
  const catF    = (document.getElementById('act-filter-cat')    || {}).value || '';
  const domF    = (document.getElementById('act-filter-domain') || {}).value || '';
  const respF   = (document.getElementById('act-filter-resp')   || {}).value || '';
  const statusF = (document.getElementById('act-filter-status') || {}).value || '';
  const sideF   = (document.getElementById('act-filter-side')   || {}).value || '';
  const periodF = (document.getElementById('act-filter-period') || {}).value || '';
  const dateFromF = (document.getElementById('act-filter-date-from') || {}).value || '';
  const dateToF   = (document.getElementById('act-filter-date-to')   || {}).value || '';
  _syncActionPeriodSegment();

  const allActions = Array.isArray(state.customActions) ? state.customActions : [];
  _populateActionFilterOptions(allActions);

  const listView = document.getElementById('act-list-view');
  if (!listView) return;

  // Bandeau projet vierge
  if (!_projUsesCBS() && allActions.length === 0) {
    listView.innerHTML = `<div style="padding:12px 16px;">${_blankProjectBanner('plan d\'actions')}</div>`;
    const calendarView = document.getElementById('act-calendar-view');
    if (calendarView) calendarView.innerHTML = `<div style="padding:12px 16px;">${_blankProjectBanner('plan d\'actions')}</div>`;
    const badgeEl = document.getElementById('tab-act-count'); if (badgeEl) badgeEl.textContent = '';
    const totEl   = document.getElementById('act-total-count'); if (totEl) totEl.textContent = '';
    if (typeof _viewModes !== 'undefined' && _viewModes.actions === 'kanban' && typeof renderKanbanActions === 'function') {
      renderKanbanActions();
    }
    return;
  }

  // Filter
  const filtered = allActions.filter(a => {
    const saved  = state.actions[a.id] || {};
    const cat    = a.category || 'metier';
    const status = saved.status || 'todo';
    const side   = a.side || saved.side || '';
    if (catF    && cat    !== catF)    return false;
    if (domF) {
      const domainMatch = (a.domain || '') === domF;
      const inDomains = Array.isArray(a.domains) && a.domains.includes(domF);
      if (!domainMatch && !inDomains) return false;
    }
    if (respF && (a.resp || '') !== respF) return false;
    if (!_itemPassesDomainFilter(a)) return false;
    if (statusF && status !== statusF) return false;
    if (sideF   && side   !== sideF)   return false;
    const range = _actionDateRange(a, allActions);
    if (!_actionMatchesPeriodFilter(a, allActions, periodF)) return false;
    if (dateFromF && (!range.start || range.start < dateFromF)) return false;
    if (dateToF && (!range.end || range.end > dateToF)) return false;
    return true;
  }).sort((a, b) => {
    const ka = _actionSortKey(a, allActions);
    const kb = _actionSortKey(b, allActions);
    return ka[0] - kb[0] || ka[1].localeCompare(kb[1]) || ka[2].localeCompare(kb[2]);
  });
  _lastRenderedActionIds = filtered.map(a => a.id);

  // Update count badge
  const totEl = document.getElementById('act-total-count');
  if (totEl) totEl.textContent = `— ${filtered.length} action(s)`;
  const badgeEl = document.getElementById('tab-act-count'); if (badgeEl) badgeEl.textContent = filtered.length || '';

  if (filtered.length === 0) {
    listView.innerHTML = '<div style="padding:32px;text-align:center;color:#94a3b8;font-size:13px;">Aucun résultat pour les filtres sélectionnés.</div>';
    const calendarView = document.getElementById('act-calendar-view');
    if (calendarView) calendarView.innerHTML = '<div style="padding:32px;text-align:center;color:#94a3b8;font-size:13px;">Aucune échéance pour les filtres sélectionnés.</div>';
    if (typeof _viewModes !== 'undefined' && _viewModes.actions === 'kanban' && typeof renderKanbanActions === 'function') {
      renderKanbanActions();
    }
    return;
  }

  // ── Helper: render one action row ─────────────────────────────────────────
  function _renderActRow(a) {
    const saved   = state.actions[a.id] || {};
    const status  = saved.status || 'todo';
    const pct     = saved.pct || 0;
    const comment = saved.commentaire || '';
    const participants = _actionParticipants(a);
    const docs = _actionDocuments(a);
    // Indicateur de lien vers une tâche Gantt
    const ganttLink = a._ganttTaskId
      ? `<span title="Liée à la tâche Gantt ${a._ganttTaskId}" style="font-size:11px;margin-left:4px;cursor:default;">📅</span>`
      : '';
    const st      = _ACT_STATUS[status] || _ACT_STATUS.todo;
    const isCustom = !!a._custom;
    const side    = a.side || saved.side || '—';
    const deps    = a.dependsOn || [];
    const computedRange = _actionDateRange(a, allActions);
    const computedEnd = computedRange.end;
    const dateDebutStr = computedRange.start;
    const isOverdue = _isActionOverdue(a, allActions);
    const dateStr = dateDebutStr ? new Date(dateDebutStr).toLocaleDateString('fr-FR',{day:'numeric',month:'short',year:'2-digit'}) : '—';
    const endStr  = computedEnd  ? new Date(computedEnd).toLocaleDateString('fr-FR',{day:'numeric',month:'short',year:'2-digit'}) : '—';
    const depConstrained = deps.length > 0;
    const progColor = status === 'done' ? '#15803d' : status === 'blocked' ? '#b91c1c' : '#1565C0';
    const selected = _selectedActionIds.has(a.id);
    const rowAccent = selected
      ? 'background:#eff6ff;box-shadow:inset 4px 0 0 #3b82f6;'
      : isOverdue
        ? 'background:#fff5f5;box-shadow:inset 4px 0 0 #dc2626;'
        : '';
    const overdueBadge = isOverdue
      ? '<span style="display:inline-flex;align-items:center;gap:4px;background:#fee2e2;color:#b91c1c;border:1px solid #fca5a5;border-radius:999px;padding:2px 7px;font-size:9px;font-weight:800;margin-left:6px;white-space:nowrap;">Retard</span>'
      : '';

    return `<tr style="${rowAccent}${status==='done'?'opacity:.7;':''}${status==='cancelled'?'opacity:.45;text-decoration:line-through;':''}">
      <td style="text-align:center;"><input type="checkbox" data-action-id="${a.id}" ${selected?'checked':''} onchange="toggleActionSelection('${a.id}', this.checked)"></td>
      <td style="font-weight:700;color:var(--red);font-size:11px;white-space:nowrap;">${a.id}</td>
      <td style="font-size:11px;">
        <div>${a.action}${ganttLink}${overdueBadge}</div>
        ${(participants.length || docs.length) ? `<div style="margin-top:4px;display:flex;gap:4px;flex-wrap:wrap;">
          ${participants.length ? `<span style="background:#ecfeff;color:#0f766e;border:1px solid #99f6e4;border-radius:999px;padding:1px 6px;font-size:9px;font-weight:700;">+ ${participants.length} intervenant(s)</span>` : ''}
          ${docs.length ? `<span style="background:#eef2ff;color:#4338ca;border:1px solid #c7d2fe;border-radius:999px;padding:1px 6px;font-size:9px;font-weight:700;">${docs.length} doc(s)</span>` : ''}
        </div>` : ''}
      </td>
      <td style="font-size:11px;text-align:center;">${a.resp||'—'}</td>
      <td style="text-align:center;">
        <span style="background:${side==='BOA'?'#dbeafe':side.startsWith('CBS')?'#ede9fe':'#f3f4f6'};color:${side==='BOA'?'#1565C0':side.startsWith('CBS')?'#7c3aed':'#64748b'};border-radius:4px;padding:2px 7px;font-size:10px;font-weight:700;white-space:nowrap;">${side}</span>
      </td>
      <td style="text-align:center;font-size:10px;color:#475569;">${dateStr}</td>
      <td style="text-align:center;">
        <span style="font-size:10px;color:${isOverdue?'#b91c1c':depConstrained?'#7c3aed':'#475569'};font-weight:${isOverdue||depConstrained?'700':'400'};"
          title="${depConstrained?'Contrainte par : '+deps.join(', '):''}">
          ${endStr}${depConstrained?'<span style="font-size:9px;margin-left:3px;color:#7c3aed;" title="Dépend de : '+deps.join(', ')+'">📎</span>':''}
        </span>
      </td>
      <td style="text-align:center;">
        ${deps.length > 0 ? deps.map(d=>`<span style="background:#ede9fe;color:#7c3aed;border-radius:3px;padding:1px 5px;font-size:9px;font-weight:700;margin:1px;">${d}</span>`).join('') : '<span style="color:#cbd5e1;font-size:10px;">—</span>'}
      </td>
      <td style="text-align:center;">
        <select onchange="setActionStatus('${a.id}',this.value)" style="font-size:10px;padding:3px 5px;border:1px solid ${st.border};border-radius:4px;background:${st.bg};color:${st.color};font-weight:700;cursor:pointer;" ${!canEdit()?'disabled':''}>
          ${Object.entries(_ACT_STATUS).map(([k,v])=>`<option value="${k}" ${status===k?'selected':''}>${v.label}</option>`).join('')}
        </select>
      </td>
      <td>
        <div style="display:flex;align-items:center;gap:4px;min-width:80px;">
          <div style="flex:1;height:7px;background:#e2e8f0;border-radius:4px;overflow:hidden;">
            <div style="height:100%;background:${progColor};width:${pct}%;border-radius:4px;transition:width .3s;"></div>
          </div>
          <input type="number" min="0" max="100" value="${pct}" onchange="setActionPct('${a.id}',this.value)"
            style="width:36px;font-size:10px;padding:2px 3px;border:1px solid #ddd;border-radius:3px;text-align:right;" ${!canEdit()?'disabled':''}>
          <span style="font-size:10px;color:#64748b;">%</span>
        </div>
      </td>
      <td>
        <textarea onchange="setActionField('${a.id}','commentaire',this.value)"
          style="font-size:10px;padding:3px 5px;border:1px solid #ddd;border-radius:3px;width:100%;min-height:30px;resize:vertical;font-family:inherit;box-sizing:border-box;"
          placeholder="Commentaire…" ${!canEdit()?'readonly':''}>${comment}</textarea>
      </td>
      <td style="text-align:center;white-space:nowrap;">
        <button onclick="openEditActionModal('${a.id}')" title="Modifier" style="background:none;border:none;cursor:pointer;font-size:14px;padding:2px;">✏️</button>
        ${isCustom ? `<button onclick="deleteAction('${a.id}')" title="Supprimer" style="background:none;border:none;cursor:pointer;font-size:14px;padding:2px;">🗑️</button>` : ''}
        <button title="Historique" onclick="showActionHistory('${a.id}',event)" style="background:none;border:1px solid #334155;border-radius:4px;padding:2px 5px;cursor:pointer;color:#64748b;font-size:10px;">🕐</button>
      </td>
    </tr>`;
  }

  // ── Helper: render a section (domain or techArea group) ───────────────────
  function _renderActSection(title, items, sectionId) {
    if (items.length === 0) return '';
    const allSelected = items.length > 0 && items.every(a => _selectedActionIds.has(a.id));
    const someSelected = !allSelected && items.some(a => _selectedActionIds.has(a.id));
    return `<div style="margin-bottom:6px;">
      <div style="display:flex;align-items:center;gap:6px;padding:7px 14px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;margin-bottom:2px;">
        <label onclick="event.stopPropagation();" title="Sélectionner tout le groupe"
          style="display:flex;align-items:center;cursor:pointer;margin:0;padding:0;">
          <input type="checkbox" data-section-chk="${sectionId}"
            ${allSelected ? 'checked' : ''}
            onchange="event.stopPropagation();toggleSectionSelection('${sectionId}',this.checked)"
            style="cursor:pointer;width:13px;height:13px;">
        </label>
        <span onclick="document.getElementById('actsec-${sectionId}').style.display=document.getElementById('actsec-${sectionId}').style.display==='none'?'':'none';this.parentElement.querySelector('.act-chevron').textContent=document.getElementById('actsec-${sectionId}').style.display==='none'?'▶':'▼';"
          style="display:flex;align-items:center;gap:8px;flex:1;font-size:12px;font-weight:700;color:#334155;cursor:pointer;user-select:none;">
          <span class="act-chevron" style="font-size:10px;color:#94a3b8;">▼</span>
          ${escHtml(title)}
          <span style="margin-left:auto;background:${someSelected||allSelected?'#bfdbfe':'#e2e8f0'};color:${someSelected||allSelected?'#1d4ed8':'#475569'};border-radius:10px;padding:1px 8px;font-size:10px;font-weight:600;">${items.length}</span>
        </span>
      </div>
      <div id="actsec-${sectionId}">
        <table class="data-table" style="margin-bottom:4px;">
          <thead><tr>
            <th style="width:34px;text-align:center;">✓</th>
            ${_actSortTh('ref',    'Réf.',        'width:45px;')}
            ${_actSortTh('action','Action / Décision', '')}
            ${_actSortTh('resp',  'Responsable', 'width:90px;text-align:center;')}
            ${_actSortTh('side',  'Côté',        'width:75px;text-align:center;')}
            ${_actSortTh('start', 'Début',       'width:75px;text-align:center;')}
            ${_actSortTh('end',   'Échéance',    'width:90px;text-align:center;')}
            <th style="width:80px;text-align:center;">Dépendances</th>
            ${_actSortTh('status','Statut',      'width:110px;text-align:center;')}
            ${_actSortTh('pct',  'Avancement',  'width:110px;')}
            <th style="width:160px;">Commentaire</th>
            <th style="width:70px;text-align:center;">Actions</th>
          </tr></thead>
          <tbody>${_applyActSort(items, allActions).map(_renderActRow).join('')}</tbody>
        </table>
      </div>
    </div>`;
  }

  // ── Split into Métier / Technique ─────────────────────────────────────────
  const metierActs    = filtered.filter(a => !a.category || a.category === 'metier');
  const techniqueActs = filtered.filter(a => a.category === 'technique');
  let html = '';

  // ── Section MÉTIER ────────────────────────────────────────────────────────
  if (!catF || catF === 'metier') {
    const byDomain = {};
    metierActs.forEach(a => {
      const dom = a.domain || 'Autre';
      if (!byDomain[dom]) byDomain[dom] = [];
      byDomain[dom].push(a);
    });
    const domGroups = Object.entries(byDomain);
    if (domGroups.length > 0 || (!catF && techniqueActs.length > 0)) {
      html += `<div style="padding:10px 16px 4px;font-size:13px;font-weight:800;color:#1565C0;letter-spacing:.3px;display:flex;align-items:center;gap:8px;">
        📊 Métier
        <span style="font-size:10px;font-weight:500;color:#94a3b8;">${metierActs.length} action(s)</span>
      </div>`;
      if (domGroups.length === 0) {
        html += '<div style="padding:8px 16px 12px;font-size:12px;color:#94a3b8;font-style:italic;">Aucune action métier.</div>';
      } else {
        html += '<div style="padding:0 16px 12px;">';
        domGroups.forEach(([dom, items]) => {
          html += _renderActSection(dom, items, 'met_' + dom.replace(/[^a-z0-9]/gi,'_'));
        });
        html += '</div>';
      }
    }
  }

  // ── Section TECHNIQUE ─────────────────────────────────────────────────────
  if (!catF || catF === 'technique') {
    const byArea = {};
    techniqueActs.forEach(a => {
      const area = a.techArea || 'Autre';
      if (!byArea[area]) byArea[area] = [];
      byArea[area].push(a);
    });
    const areaGroups = Object.entries(byArea);
    html += `<div style="padding:10px 16px 4px;font-size:13px;font-weight:800;color:#7c3aed;letter-spacing:.3px;display:flex;align-items:center;gap:8px;">
      ⚙️ Technique
      <span style="font-size:10px;font-weight:500;color:#94a3b8;">${techniqueActs.length} action(s)</span>
    </div>`;
    if (areaGroups.length === 0) {
      html += '<div style="padding:8px 16px 12px;font-size:12px;color:#94a3b8;font-style:italic;">Aucune action technique.</div>';
    } else {
      html += '<div style="padding:0 16px 12px;">';
      areaGroups.forEach(([area, items]) => {
        html += _renderActSection(area, items, 'tec_' + area.replace(/[^a-z0-9]/gi,'_'));
      });
      html += '</div>';
    }
  }

  listView.innerHTML = html;

  // ── État indéterminé sur les cases section ─────────────────────────────
  listView.querySelectorAll('[data-section-chk]').forEach(chk => {
    const sid = chk.dataset.sectionChk;
    const tbody = document.querySelector('#actsec-' + sid + ' tbody');
    if (!tbody) return;
    const ids = [...tbody.querySelectorAll('input[data-action-id]')].map(c => c.dataset.actionId);
    const selCount = ids.filter(id => _selectedActionIds.has(id)).length;
    chk.checked       = selCount > 0 && selCount === ids.length;
    chk.indeterminate = selCount > 0 && selCount < ids.length;
  });

  _refreshActionSelectionInfo();

  if (typeof _viewModes !== 'undefined' && _viewModes.actions === 'kanban' && typeof renderKanbanActions === 'function') {
    renderKanbanActions();
  }
  if (typeof _viewModes !== 'undefined' && _viewModes.actions === 'calendar') {
    renderActionCalendar(filtered, allActions);
  }
  renderDashboard();
}


// ── ACTIONS CRUD ─────────────────────────────────────────────────────────
function setActionField(id, field, value) {
  if (!canEdit()) return;
  if (!state.actions[id]) state.actions[id] = {};
  if (field === 'commentaire') {
    const next = String(value || '').trim();
    const prev = String(state.actions[id][field] || '').trim();
    if (next && next !== prev) {
      if (!Array.isArray(state.actions[id].comments)) state.actions[id].comments = [];
      state.actions[id].comments.push({
        id: 'c_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
        text: next,
        author: _getActionCommentAuthor(),
        createdAt: new Date().toISOString()
      });
    }
  }
  state.actions[id][field] = value;
  saveState();
}

function setActionStatus(id, status) {
  if (!canEdit()) return;
  if (!state.actions[id]) state.actions[id] = {};
  state.actions[id].status = status;
  if (status === 'done') {
    if (!state.actions[id].pct) state.actions[id].pct = 100;
  }
  _syncActionToGanttTask(id);   // ← répercute sur la tâche Gantt liée
  saveState();
  renderActions();
  renderDashboard();
}
// Keep setActionRag as alias for backwards compatibility with CBS data
function setActionRag(id, rag) {
  const map = { R: 'blocked', O: 'in_progress', G: 'done', X: 'todo' };
  setActionStatus(id, map[rag] || 'todo');
}

function setActionPct(id, val) {
  if (!canEdit()) return;
  if (!state.actions[id]) state.actions[id] = {};
  state.actions[id].pct = parseInt(val) || 0;
  _syncActionToGanttTask(id);   // ← répercute sur la tâche Gantt liée
  saveState();
  renderActions();
  renderDashboard();
}

/**
 * Synchronise l'avancement d'une action vers la tâche Gantt liée (_ganttTaskId).
 * Doit être appelée après chaque modification de status ou pct d'une action.
 */
function _syncActionToGanttTask(actId) {
  const act = [...actions, ...(state.customActions || [])].find(a => a.id === actId);
  if (!act || !act._ganttTaskId) return;
  const ganttId = act._ganttTaskId;
  const saved   = state.actions[actId] || {};
  const status  = saved.status || 'todo';

  // ── pct / status ────────────────────────────────────────────────────────
  let pct;
  if (status === 'done')                               pct = 1;
  else if (status === 'todo' || status === 'cancelled') pct = 0;
  else                                                  pct = Math.min(1, (saved.pct || 0) / 100);

  if (!state.gantt[ganttId]) state.gantt[ganttId] = {};
  state.gantt[ganttId]._pct = pct;

  const ct = (state.ganttCustom || []).find(t => t.id === ganttId);
  if (ct) ct.pct = pct;

  // ── dates (action → Gantt) ───────────────────────────────────────────────
  if (saved.dateDebut) {
    const newStart = saved.dateDebut;
    const newEnd   = (saved.duree != null)
      ? addDays(newStart, saved.duree)
      : (saved.dateFin || newStart);
    state.gantt[ganttId].start = newStart;
    state.gantt[ganttId].end   = newEnd;
    if (ct) { ct.start = newStart; ct.end = newEnd; }
  }

  // ── responsable (action → Gantt) ─────────────────────────────────────────
  if (act.resp && act.resp !== '—') {
    state.gantt[ganttId]._owner = act.resp;
    if (ct) { ct.owner = act.resp; ct.resp = act.resp; }
  }

  if (typeof renderGantt === 'function') renderGantt();
}

/**
 * Crée une action liée dans le plan d'action pour une tâche Gantt existante.
 * Ne fait rien si une action liée existe déjà.
 * Retourne true si l'action a été créée, false si elle existait déjà.
 */
function _buildGanttActionPayload(task) {
  if (!_isGanttActionableTask(task)) return null;

  const taskId = task.id;
  const {start, end} = getTaskDates(task);
  const ov       = (!task._custom && state.gantt[taskId]) ? state.gantt[taskId] : {};
  const label    = ov._label  || task.label || '';
  const resp     = ov._owner  || task.owner || task.resp || '—';
  const pct0     = ov._pct    != null ? ov._pct : (task.pct || 0);
  const pctInt   = Math.round(pct0 * 100);
  const domains  = task._custom ? (task.domains || []) : (ov._domains || []);
  const dur      = Math.max(0, Math.round((new Date(end) - new Date(start)) / 86400000));
  const initStatus = pct0 >= 1 ? 'done' : pct0 > 0 ? 'in_progress' : 'todo';
  const actId  = 'ACT_' + taskId.replace('custom_', '').replace(/[^a-zA-Z0-9_]/g, '_');

  const action = {
    id: actId, category: 'metier',
    _dbProjectId: state.currentProjectId || '',
    domain:   (domains && domains.length > 0) ? domains[0] : '',
    action:   label, resp, side: _getGanttTaskSide(task, ov) || '',
    dependsOn: [], _custom: true, _history: [],
    _ganttTaskId: taskId
  };
  const statePatch = { status: initStatus, pct: pctInt, dateDebut: start, duree: dur };

  return { action, statePatch, label };
}

function _isGanttActionableTask(task) {
  if (!task) return false;
  const type = String(task.type || '').toLowerCase();
  return !['phase', 'jalon', 'milestone', 'subtask', 'sous-tache', 'sous-tâche'].includes(type);
}

async function _addTaskToActionPlan(taskId) {
  if (!canEdit()) return false;
  if (!state.currentProjectId) {
    showToast('⚠️ Ouvrez un projet avant de créer une action Gantt.', 2500);
    return false;
  }
  // Vérifier qu'une action liée n'existe pas déjà
  const existing = (state.customActions || []).find(a => a._ganttTaskId === taskId);
  if (existing) {
    showToast('ℹ️ Une action est déjà liée à cette tâche (' + existing.id + ')', 2000);
    return false;
  }
  // Trouver la tâche Gantt
  const allT = [...ganttTasks, ...(state.ganttCustom || [])];
  const task  = allT.find(t => t.id === taskId);
  if (!_isGanttActionableTask(task)) return false;

  const {start, end} = getTaskDates(task);
  const ov       = (!task._custom && state.gantt[taskId]) ? state.gantt[taskId] : {};
  const label    = ov._label  || task.label || '';
  const resp     = ov._owner  || task.owner || task.resp || '—';
  const pct0     = ov._pct    != null ? ov._pct : (task.pct || 0);
  const pctInt   = Math.round(pct0 * 100);
  const domains  = task._custom ? (task.domains || []) : (ov._domains || []);
  const dur      = Math.max(0, Math.round((new Date(end) - new Date(start)) / 86400000));
  const initStatus = pct0 >= 1 ? 'done' : pct0 > 0 ? 'in_progress' : 'todo';

  const actId  = 'ACT_' + taskId.replace('custom_', '').replace(/[^a-zA-Z0-9_]/g, '_');
  if (!state.customActions) state.customActions = [];
  const newAct = {
    id: actId, category: 'metier',
    _dbProjectId: state.currentProjectId || '',
    domain:   (domains && domains.length > 0) ? domains[0] : '',
    action:   label, resp, side: _getGanttTaskSide(task, ov) || '',
    dependsOn: [], _custom: true, _history: [],
    _ganttTaskId: taskId
  };
  _pushHistory(newAct, 'created');
  state.customActions.push(newAct);
  if (!state.actions[actId]) state.actions[actId] = {};
  Object.assign(state.actions[actId], { status: initStatus, pct: pctInt, dateDebut: start, duree: dur });

  if (typeof DB !== 'undefined' && typeof DB.saveAction === 'function') {
    const dbId = await DB.saveAction(newAct);
    if (dbId) newAct._dbId = dbId;
    else {
      state.customActions = state.customActions.filter(a => a.id !== actId);
      delete state.actions[actId];
      showToast('⚠️ Action non créée en base. Vérifiez la console.', 3500);
      return false;
    }
  }

  _saveCurrentProjectData();
  saveState('Action créée depuis Gantt', label.substring(0, 80));
  if (typeof renderActions   === 'function') renderActions();
  if (typeof renderDashboard === 'function') renderDashboard();
  if (typeof renderGantt     === 'function') renderGantt();
  showToast('✅ Action ' + actId + ' ajoutée au plan d\'action', 2500);
  return true;
}

/**
 * Crée des actions pour les tâches Gantt VISIBLES qui n'en ont pas encore.
 * N'inclut que les tâches réellement affichées dans le Gantt (mode CBS ou custom).
 * Appelé par le bouton "📋 → Actions" dans la barre du Gantt.
 */
async function _syncAllTasksToActions() {
  if (!canEdit()) return;
  if (!state.currentProjectId) {
    showToast('⚠️ Ouvrez un projet avant de générer les actions Gantt.', 2500);
    return;
  }

  // Reconstruire exactement la liste des tâches affichées dans le Gantt (même logique que renderGantt)
  const _hiddenSet = new Set(state.ganttHidden || []);
  const customAfter  = {};
  const customOrphan = [];
  (state.ganttCustom || []).forEach(ct => {
    const anchor = ct.insertAfterId || null;
    if (anchor) { if (!customAfter[anchor]) customAfter[anchor] = []; customAfter[anchor].push(ct); }
    else { customOrphan.push(ct); }
  });

  const visibleTasks = [];
  const _seen = new Set();
  function _collect(task) {
    if (_seen.has(task.id) || _hiddenSet.has(task.id)) return;
    _seen.add(task.id);
    visibleTasks.push(task);
    (customAfter[task.id] || []).forEach(_collect);
  }

  if (_projUsesCBS()) {
    ganttTasks.forEach(t => { if (!_hiddenSet.has(t.id)) _collect(t); });
  } else {
    (state.ganttCustom || []).forEach(t => { if (!_hiddenSet.has(t.id)) _collect(t); });
  }
  customOrphan.forEach(t => { if (!_seen.has(t.id)) _collect(t); });

  // Filtrer : uniquement les lignes actionnables (pas phases, jalons, sous-tâches).
  // Certaines données importées n'ont pas exactement type="task".
  const tasks = visibleTasks.filter(_isGanttActionableTask);

  const linkedIds = new Set((state.customActions || [])
    .filter(a => a && a._ganttTaskId && a.id && a.action)
    .map(a => a._ganttTaskId));
  const unlinked  = tasks.filter(t => !linkedIds.has(t.id));

  if (unlinked.length === 0) {
    _openActionPlanAfterGanttSync();
    showToast('✅ Toutes les tâches visibles sont déjà dans le plan d\'action.', 2500);
    return;
  }

  // Confirmation si beaucoup de tâches
  if (unlinked.length > 5) {
    if (!confirm(unlinked.length + ' tâches vont être ajoutées au plan d\'action.\nContinuer ?')) return;
  }

  if (!state.customActions) state.customActions = [];
  if (!state.actions) state.actions = {};

  const repairIds = new Set(unlinked.map(t => t.id));
  state.customActions = state.customActions.filter(a => !a._ganttTaskId || !repairIds.has(a._ganttTaskId));

  const staticActionIds = new Set();
  const existingActionIds = new Set((state.customActions || []).map(a => a.id));

  let created = 0, repaired = 0, skipped = 0;
  const projectId = state.currentProjectId || '';
  const dbSaveQueue = [];
  unlinked.forEach(t => {
    const payload = _buildGanttActionPayload(t);
    if (!payload) return;

    if (staticActionIds.has(payload.action.id)) {
      payload.action.id = payload.action.id + '_GANTT';
      payload.statePatch = Object.assign({}, payload.statePatch);
    }

    const idxById = state.customActions.findIndex(a => a.id === payload.action.id);
    if (idxById >= 0) {
      const oldHistory = state.customActions[idxById]._history || [];
      state.customActions[idxById] = Object.assign({}, state.customActions[idxById], payload.action, {
        _history: oldHistory,
        _custom: true,
        _dbProjectId: projectId,
        _ganttTaskId: t.id
      });
      _pushHistory(state.customActions[idxById], 'updated', [
        { field:'_ganttTaskId', label:'Lien Gantt', old:'', new:t.id }
      ]);
      state.actions[payload.action.id] = Object.assign(
        state.actions[payload.action.id] || {},
        payload.statePatch
      );
      dbSaveQueue.push(state.customActions[idxById]);
      repaired++;
      return;
    }

    if (existingActionIds.has(payload.action.id)) { skipped++; return; }

    _pushHistory(payload.action, 'created');
    payload.action._dbProjectId = projectId;
    state.customActions.push(payload.action);
    state.actions[payload.action.id] = Object.assign(
      state.actions[payload.action.id] || {},
      payload.statePatch
    );
    dbSaveQueue.push(payload.action);
    existingActionIds.add(payload.action.id);
    created++;
  });

  const changed = created + repaired;
  if (changed === 0) {
    _openActionPlanAfterGanttSync();
    showToast(skipped > 0 ? 'Actions déjà présentes, aucune nouvelle action créée.' : 'Aucune nouvelle action à créer.', 3000);
    return;
  }

  let dbSaved = 0;
  if (typeof DB !== 'undefined' && typeof DB.saveAction === 'function') {
    for (const act of dbSaveQueue) {
      act._dbProjectId = projectId;
      delete act._dbId;
      const dbId = await DB.saveAction(act);
      if (dbId) {
        act._dbId = dbId;
        dbSaved++;
      }
    }
  }

  if (dbSaveQueue.length > 0 && dbSaved === 0) {
    showToast('⚠️ Aucune action Gantt n\'a pu être sauvegardée en base. Vérifiez la console.', 4000);
    return;
  }

  _saveCurrentProjectData();
  saveState('Actions créées depuis Gantt', created + ' créée(s), ' + repaired + ' réparée(s)');
  if (typeof renderDashboard === 'function') renderDashboard();
  if (typeof renderGantt     === 'function') renderGantt();
  _openActionPlanAfterGanttSync();
  showToast('✅ ' + created + ' action(s) créée(s), ' + repaired + ' réparée(s)' + (dbSaved ? ' · ' + dbSaved + ' sauvegardée(s)' : '') + '.', 3000);
}

function _openActionPlanAfterGanttSync() {
  ['act-filter-cat','act-filter-domain','act-filter-status','act-filter-side'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  const btn = document.querySelector('.tab-btn[data-tab="actions"]')
           || document.querySelector('.mob-btn[data-tab="actions"]')
           || document.querySelector('.mob-drawer-btn[data-tab="actions"]');
  if (typeof switchTab === 'function' && btn) switchTab('actions', btn);
  else if (typeof renderActions === 'function') renderActions();
  if (typeof setViewMode === 'function') setViewMode('actions', 'list');
}

function deleteAction(id) {
  if (!confirm('Supprimer cette action ?')) return;
  const _delA = (state.customActions || []).find(x => x.id === id);
  state.customActions = state.customActions.filter(a => a.id !== id);
  delete state.actions[id];
  _selectedActionIds.delete(id);
  saveState('Action plan supprimée', _delA ? _delA.action.substring(0, 80) : id);
  renderActions();
  renderDashboard();
}

async function deleteSelectedActions() {
  if (!canAddDelete()) return;
  const ids = Array.from(_selectedActionIds);
  if (ids.length === 0) {
    showToast('ℹ️ Aucune action sélectionnée.', 2000);
    return;
  }

  // Distinguer : actions custom (supprimables) vs CBS statiques (non supprimables)
  const customSet = new Set((state.customActions || []).map(a => a.id));
  const toDelete  = ids.filter(id => customSet.has(id));
  const skipped   = ids.length - toDelete.length;

  if (toDelete.length === 0) {
    alert('Les ' + ids.length + ' action(s) sélectionnée(s) sont des actions CBS standard — elles ne peuvent pas être supprimées.\n\nSeules les actions créées manuellement (➕) sont supprimables.');
    return;
  }

  const skipNote = skipped > 0
    ? '\n\n⚠️ ' + skipped + ' action(s) CBS standard ignorée(s) (non supprimables).'
    : '';
  if (!confirm('Supprimer définitivement ' + toDelete.length + ' action(s) ?' + skipNote)) return;

  let dbDeleted = 0;
  if (typeof DB !== 'undefined' && typeof DB.deleteAction === 'function') {
    for (const id of toDelete) {
      const act = (state.customActions || []).find(a => a.id === id);
      if (act) { const ok = await DB.deleteAction(act); if (ok) dbDeleted++; }
    }
  }

  state.customActions = (state.customActions || []).filter(a => !toDelete.includes(a.id));
  toDelete.forEach(id => delete state.actions[id]);
  _selectedActionIds.clear();
  _saveCurrentProjectData();
  saveState('Actions supprimées', toDelete.length + ' action(s)');
  renderActions();
  renderDashboard();

  const dbInfo = dbDeleted ? ' · ' + dbDeleted + ' supprimée(s) en base' : '';
  const skipInfo = skipped > 0 ? ' · ' + skipped + ' CBS ignorée(s)' : '';
  showToast('🗑 ' + toDelete.length + ' action(s) supprimée(s)' + dbInfo + skipInfo, 3500);
}

function _applyOwnerMetadataToActionModal() {
  const owner = getOwnerRecord(document.getElementById('action-modal-resp')?.value || '');
  if (!owner) return;
  const sideEl = document.getElementById('action-modal-side');
  const domainEl = document.getElementById('action-modal-domain');
  const catEl = document.getElementById('action-modal-category');
  if (sideEl && !sideEl.value && owner.side) sideEl.value = owner.side;
  if (domainEl && !domainEl.value && owner.domain && catEl && catEl.value !== 'technique') {
    domainEl.value = owner.domain;
  }
}

function openAddActionModal() {
  document.getElementById('action-modal-title').textContent = '➕ Nouvelle action';
  document.getElementById('action-modal-id').value        = 'A' + String(Date.now()).slice(-4);
  document.getElementById('action-modal-category').value  = 'metier';
  _toggleActTechArea();
  document.getElementById('action-modal-domain').value    = '';
  document.getElementById('action-modal-techarea').value  = 'Installation';
  document.getElementById('action-modal-action').value    = '';
  document.getElementById('action-modal-resp').value      = '';
  document.getElementById('action-modal-side').value      = '';
  document.getElementById('action-modal-dateDebut').value = '';
  document.getElementById('action-modal-duree').value     = '';
  document.getElementById('action-modal-dateFin').value   = '';
  document.getElementById('action-modal-status').value    = 'todo';
  document.getElementById('action-modal-participant-input').value = '';
  _setActionParticipants([]);
  document.getElementById('action-modal-comment').value      = '';
  document.getElementById('action-modal-comment-input').value = '';
  _actionModalComments = [];
  _renderActionCommentsThread();
  document.getElementById('action-modal-documents').value    = '';
  document.getElementById('action-modal-deps').value      = '';
  document.getElementById('action-modal-deps-search').value = '';
  document.getElementById('action-modal-isEdit').value    = '';
  _renderActDepsSearchable('');
  _renderOwnerQuickPick('action-quickpick', '_actionQuickPick', 'action-modal-participants');
  document.getElementById('action-modal').style.display = 'flex';
  _loadSystemUsersDatalist();
}

function openEditActionModal(id) {
  const allA = state.customActions || [];
  const a = allA.find(x => x.id === id);
  if (!a) return;
  const saved = state.actions[id] || {};
  document.getElementById('action-modal-title').textContent = "✏️ Modifier l'action";
  document.getElementById('action-modal-id').value         = a.id;
  document.getElementById('action-modal-category').value   = a.category || 'metier';
  _toggleActTechArea();
  document.getElementById('action-modal-domain').value     = a.domain   || '';
  document.getElementById('action-modal-techarea').value   = a.techArea || 'Installation';
  document.getElementById('action-modal-action').value     = a.action   || '';
  document.getElementById('action-modal-resp').value       = a.resp     || '';
  document.getElementById('action-modal-side').value       = a.side     || saved.side || '';
  // Normaliser en YYYY-MM-DD (Supabase peut retourner '2026-03-31T00:00:00')
  const _rawDD = saved.dateDebut || a.dateDebut || '';
  document.getElementById('action-modal-dateDebut').value  = _rawDD ? String(_rawDD).slice(0, 10) : '';
  document.getElementById('action-modal-duree').value      = saved.duree != null ? saved.duree : (a.duree || '');
  // dateFin : utiliser la valeur stockée explicitement; si absente, calculer depuis dateDebut+duree
  const _rawFin = saved.dateFin || a.dateFin || '';
  if (_rawFin) {
    document.getElementById('action-modal-dateFin').value = String(_rawFin).slice(0, 10);
  } else {
    const _allActsEdit = state.customActions || [];
    const _calcFin = _calcActionEndDate(id, _allActsEdit);
    document.getElementById('action-modal-dateFin').value = _calcFin ? String(_calcFin).slice(0, 10) : '';
  }
  document.getElementById('action-modal-status').value     = saved.status    || 'todo';
  document.getElementById('action-modal-participant-input').value = '';
  _setActionParticipants(_actionParticipants(a));
  document.getElementById('action-modal-comment').value      = saved.commentaire || '';
  document.getElementById('action-modal-comment-input').value = '';
  _actionModalComments = _normalizeActionComments(saved.comments, saved.commentaire || '');
  _renderActionCommentsThread();
  document.getElementById('action-modal-documents').value    = _actionDocumentsText(a);
  document.getElementById('action-modal-isEdit').value     = id;
  document.getElementById('action-modal-deps-search').value = '';
  _renderActDepsSearchable((a.dependsOn || []).join(', '));
  _renderOwnerQuickPick('action-quickpick', '_actionQuickPick', 'action-modal-participants');
  document.getElementById('action-modal').style.display = 'flex';
  _loadSystemUsersDatalist();
}

function _actDateSync(changed) {
  const debutEl = document.getElementById('action-modal-dateDebut');
  const finEl   = document.getElementById('action-modal-dateFin');
  const dureeEl = document.getElementById('action-modal-duree');
  if (!debutEl || !finEl || !dureeEl) return;
  const debut = debutEl.value;
  const fin   = finEl.value;
  const duree = parseInt(dureeEl.value);
  // Helper : formatage local YYYY-MM-DD sans décalage UTC
  function _toLocalDateStr(d) {
    return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
  }
  if (changed === 'debut') {
    if (debut) {
      const d0 = new Date(debut + 'T00:00:00');
      if (fin) {
        // fin existe : recalculer duree
        const d1 = new Date(fin + 'T00:00:00');
        if (!isNaN(d0) && !isNaN(d1)) dureeEl.value = Math.max(0, Math.round((d1 - d0) / 86400000));
      } else if (!isNaN(duree) && duree > 0) {
        // fin absente, duree existe : recalculer fin
        const d1 = new Date(d0); d1.setDate(d1.getDate() + duree);
        finEl.value = _toLocalDateStr(d1);
      }
    }
  } else if (changed === 'duree') {
    // Durée changée : recalculer date fin = date début + durée
    if (debut && !isNaN(duree) && duree >= 0) {
      const d0 = new Date(debut + 'T00:00:00');
      const d1 = new Date(d0); d1.setDate(d1.getDate() + duree);
      finEl.value = _toLocalDateStr(d1);
    }
  }
  // 'fin' changée : on ne touche PAS à duree ici — saveActionModal le recalcule au save
}

function _toggleActTechArea() {
  const cat = document.getElementById('action-modal-category').value;
  const domRow  = document.getElementById('act-modal-domain-row');
  const techRow = document.getElementById('act-modal-techarea-row');
  if (domRow)  domRow.style.display  = cat === 'metier'    ? '' : 'none';
  if (techRow) techRow.style.display = cat === 'technique' ? '' : 'none';
}

function _renderActDepsChips(depsStr) {
  const allA = state.customActions || [];
  const container = document.getElementById('action-modal-deps-chips');
  if (!container) return;
  const selectedDeps = depsStr ? depsStr.split(',').map(s=>s.trim()).filter(Boolean) : [];
  const editId = document.getElementById('action-modal-isEdit').value;
  const filter = String(document.getElementById('action-modal-deps-search')?.value || '').trim().toLowerCase();
  container.innerHTML = allA.filter(a => a.id !== editId).filter(a => {
    if (!filter) return true;
    return [a.id, a.action, a.domain, a.resp].some(v => String(v || '').toLowerCase().includes(filter));
  }).map(a => {
    const checked = selectedDeps.includes(a.id);
    const saved = state.actions[a.id] || {};
    const status = saved.status || 'todo';
    const st = _ACT_STATUS[status] || _ACT_STATUS.todo;
    return `<label style="display:flex;align-items:flex-start;gap:8px;padding:6px 8px;border-radius:6px;border:1px solid ${checked?st.border:'#e2e8f0'};background:${checked?st.bg:'white'};cursor:pointer;font-size:11px;margin:2px;">
      <input type="checkbox" value="${a.id}" ${checked?'checked':''} style="margin:0;" onchange="_syncActDepsInput()">
      <span style="font-weight:700;color:${st.color};">${a.id}</span>
      <span style="color:#64748b;max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${escHtml(a.action)}">${escHtml(a.action.substring(0,30))}${a.action.length>30?'…':''}</span>
    </label>`;
  }).join('') || '<div style="font-size:11px;color:#94a3b8;padding:4px;">Aucune autre action disponible.</div>';
}

function _syncActDepsInput() {
  const container = document.getElementById('action-modal-deps-chips');
  if (!container) return;
  const checked = [...container.querySelectorAll('input:checked')].map(i => i.value);
  document.getElementById('action-modal-deps').value = checked.join(', ');
}

function _renderActDepsSearchable(depsStr) {
  const allA = state.customActions || [];
  const container = document.getElementById('action-modal-deps-chips');
  if (!container) return;
  const selectedDeps = depsStr ? depsStr.split(',').map(s => s.trim()).filter(Boolean) : [];
  const editId = document.getElementById('action-modal-isEdit').value;
  const filter = String(document.getElementById('action-modal-deps-search')?.value || '').trim().toLowerCase();
  const candidates = allA.filter(a => a.id !== editId).filter(a => {
    if (!filter) return true;
    return [a.id, a.action, a.domain, a.resp].some(v => String(v || '').toLowerCase().includes(filter));
  });
  container.innerHTML = candidates.map(a => {
    const checked = selectedDeps.includes(a.id);
    const saved = state.actions[a.id] || {};
    const status = saved.status || 'todo';
    const st = _ACT_STATUS[status] || _ACT_STATUS.todo;
    return `<label style="display:flex;align-items:flex-start;gap:8px;padding:6px 8px;border-radius:6px;border:1px solid ${checked ? st.border : '#e2e8f0'};background:${checked ? st.bg : 'white'};cursor:pointer;font-size:11px;margin:2px;">
      <input type="checkbox" value="${a.id}" ${checked ? 'checked' : ''} style="margin:0;" onchange="_syncActDepsInput()">
      <div style="min-width:0;display:flex;flex-direction:column;gap:2px;">
        <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;">
          <span style="font-weight:700;color:${st.color};">${a.id}</span>
          <span style="color:#0f172a;font-weight:700;">${escHtml(a.action.substring(0,60))}${a.action.length > 60 ? '…' : ''}</span>
        </div>
        <div style="font-size:10px;color:#64748b;">${escHtml(a.resp || '—')} · ${escHtml(a.domain || 'Sans domaine')}</div>
      </div>
    </label>`;
  }).join('') || '<div style="font-size:11px;color:#94a3b8;padding:4px;">Aucune autre action disponible pour ce filtre.</div>';
}

async function saveActionModal() {
  if (!Array.isArray(state.customActions)) state.customActions = [];
  if (!state.actions) state.actions = {};
  if (!state.currentProjectId) {
    showToast('⚠️ Ouvrez un projet avant de créer une action.', 2500);
    return;
  }

  const isEdit   = document.getElementById('action-modal-isEdit').value;
  const currentActionViewMode = (_viewModes && _viewModes.actions) ? _viewModes.actions : 'list';
  const id       = document.getElementById('action-modal-id').value.trim();
  const category = document.getElementById('action-modal-category').value;
  const domain   = document.getElementById('action-modal-domain').value.trim();
  const techArea = document.getElementById('action-modal-techarea').value;
  const action   = document.getElementById('action-modal-action').value.trim();
  const resp     = document.getElementById('action-modal-resp').value.trim();
  const side     = document.getElementById('action-modal-side').value;
  const dateDebut= document.getElementById('action-modal-dateDebut').value;
  const dateFin  = document.getElementById('action-modal-dateFin').value;
  // Recalculer duree depuis dateDebut+dateFin pour garantir la cohérence (priorité à dateFin)
  let duree = parseInt(document.getElementById('action-modal-duree').value) || 0;
  if (dateDebut && dateFin) {
    const _d0 = new Date(dateDebut + 'T00:00:00'), _d1 = new Date(dateFin + 'T00:00:00');
    if (!isNaN(_d0) && !isNaN(_d1)) duree = Math.max(0, Math.round((_d1 - _d0) / 86400000));
  }
  const source   = '';
  const status   = document.getElementById('action-modal-status').value;
  const participants = _normalizeActionMultiValueInput(document.getElementById('action-modal-participants').value, /[,;\n]/);
  const commentaire = (_actionModalComments.length ? _actionModalComments[_actionModalComments.length - 1].text : document.getElementById('action-modal-comment').value.trim());
  const documents = _normalizeActionMultiValueInput(document.getElementById('action-modal-documents').value, /\r?\n/);
  const depsRaw  = document.getElementById('action-modal-deps').value;
  const dependsOn= depsRaw ? depsRaw.split(',').map(s=>s.trim()).filter(Boolean) : [];

  if (!action) { alert("Le libellé de l'action est requis."); return; }

  const _ACT_FIELDS = { id:'Identifiant', action:'Action', domain:'Domaine', resp:'Responsable', echeance:'Échéance' };

  if (isEdit) {
    const idx = state.customActions.findIndex(a => a.id === isEdit);
    if (idx >= 0) {
      const old = { ...state.customActions[idx] };
      const changes = _diffFields(old, { id, action, domain, resp }, _ACT_FIELDS);
      if (changes.length > 0) _pushHistory(state.customActions[idx], 'updated', changes);
      state.customActions[idx] = { ...state.customActions[idx], id, category, domain, techArea, action, resp, side, dependsOn, participants, participantsText: participants.join(', '), documents, documentsText: documents.join('\n'), _custom: true, _dbProjectId: state.currentProjectId || '' };
    }
    if (!state.actions[id]) state.actions[id] = {};
    Object.assign(state.actions[id], { source, status, dateDebut, duree, dateFin, commentaire, comments: _actionModalComments.slice() });
  } else {
    const newAct = { id, category, domain, techArea, action, resp, side, dependsOn, participants, participantsText: participants.join(', '), documents, documentsText: documents.join('\n'), _custom: true, _history: [], _dbProjectId: state.currentProjectId || '' };
    _pushHistory(newAct, 'created');
    state.customActions.push(newAct);
    if (!state.actions[id]) state.actions[id] = {};
    Object.assign(state.actions[id], { source, status, dateDebut, duree, dateFin, commentaire, comments: _actionModalComments.slice() });
  }

  if (typeof DB !== 'undefined') {
    const _actToSave = isEdit ? state.customActions.find(a => a.id === isEdit) : state.customActions[state.customActions.length-1];
    if (_actToSave) {
      if (!_actToSave._dbProjectId) _actToSave._dbProjectId = state.currentProjectId || '';
      if (_actToSave._dbProjectId !== (state.currentProjectId || '')) {
        delete _actToSave._dbId;
        _actToSave._dbProjectId = state.currentProjectId || '';
      }
      const dbId = await DB.saveAction(_actToSave);
      if (dbId) _actToSave._dbId = dbId;
      else console.warn('[actions] Sauvegarde table relationnelle échouée — action préservée dans le blob JSON (saveState).');
    }
  }
  _syncActionToGanttTask(id);   // ← répercute pct/dates/resp sur la tâche Gantt liée
  _saveCurrentProjectData();
  saveState(isEdit ? 'Action modifiée' : 'Action créée', action.substring(0,80));
  document.getElementById('action-modal').style.display = 'none';
  if (typeof setViewMode === 'function') setViewMode('actions', currentActionViewMode);
  renderActions();
  renderDashboard();
}

function resetActFilters() {
  ['act-filter-cat','act-filter-domain','act-filter-resp','act-filter-status','act-filter-side','act-filter-period','act-filter-date-from','act-filter-date-to'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = '';
  });
  renderActions();
}

// ════════════════════════════════════════════════════════════════════════
// GAPS
// ════════════════════════════════════════════════════════════════════════

function _rebuildGapDecFilter() {
  const sel = document.getElementById('gaps-filter-dec');
  if (!sel) return;
  const cur = sel.value;
  const decs = _getGapDecisions();
  sel.innerHTML = '<option value="">Toutes</option>' +
    decs.map(d => `<option value="${d.key}" ${d.key===cur?'selected':''}>${d.icon ? d.icon+' ' : ''}${escHtml(d.label)}</option>`).join('');
}

function renderGaps() {
  _rebuildGapDecFilter();
  const domF   = document.getElementById('gaps-filter-domain').value;
  const prioF  = document.getElementById('gaps-filter-prio').value;
  const changedF = document.getElementById('gaps-filter-changed').value;
  const bmF    = document.getElementById('gaps-filter-bm').value;
  const decF   = document.getElementById('gaps-filter-dec') ? document.getElementById('gaps-filter-dec').value : '';
  const search = document.getElementById('gaps-search').value.toLowerCase();

  // Combiner gaps CBS + custom (si projet vierge : custom seulement)
  const allGaps = _projUsesCBS()
    ? [...gaps, ...state.customGaps]
    : [...state.customGaps];

  // ── Bandeau "projet vierge" si aucune donnée ─────────────────────────────
  if (!_projUsesCBS() && allGaps.length === 0) {
    const gapsTbody = document.getElementById('gaps-tbody');
    if (gapsTbody) gapsTbody.innerHTML = `<tr><td colspan="14">${_blankProjectBanner('GAP CBS')}</td></tr>`;
    const gapsStats = document.getElementById('gaps-top-stats');
    if (gapsStats) gapsStats.innerHTML = '';
    return;
  }

  const filtered = allGaps.filter(g => {
    // Filtre domaine : comparer stream ID avec g.domains[] ou legacy mapping
    if (domF) {
      const inDomains = Array.isArray(g.domains) && g.domains.includes(domF);
      const legacyMatch = _legacyDomainToStream(g.domain) === domF;
      if (!inDomains && !legacyMatch) return false;
    }
    // Filtre permission utilisateur (stream_scope)
    if (!_itemPassesDomainFilter(g)) return false;
    if (prioF && g.prio !== prioF) return false;
    if (changedF === 'true' && !g.changed) return false;
    if (bmF && !g.bm.startsWith(bmF)) return false;
    if (decF) {
      const d = (state.gaps[g.ref] || {}).decision || '';
      if (d !== decF) return false;
    }
    if (search && !g.desc.toLowerCase().includes(search)
               && !g.domain.toLowerCase().includes(search)
               && !g.ref.toLowerCase().includes(search)
               && !g.processus.toLowerCase().includes(search)) return false;
    return true;
  });

  document.getElementById('gaps-count').textContent = filtered.length;

  document.getElementById('gaps-tbody').innerHTML = filtered.map((g, idx_g) => {
    const bmCur0 = (state.gaps[g.ref] && state.gaps[g.ref].bm) ? state.gaps[g.ref].bm : g.bm;
    const isAnomalie  = bmCur0 === 'Anomalie' || bmCur0 === 'Anomalie V4 CG';
    const isExclusion = bmCur0 === 'Exclusion';

    // Priorité : valeur courante depuis state (modifiable), référence = g.prio
    const prioCurrent  = (state.gaps[g.ref] && state.gaps[g.ref].prio) ? state.gaps[g.ref].prio : g.prio;
    const prioRef      = g.prio; // valeur de référence (originale)
    const prioModified = prioCurrent !== prioRef;
    const prioBgMap    = {'P1':'#FDEEEC','P2':'#FEF3E2','P2.1':'#FEF3E2','P3':'#F5F5F5'};
    const prioClrMap   = {'P1':'#E63329','P2':'#E8702A','P2.1':'#E8702A','P3':'#54565A'};
    const prioBoaCell  = `<div style="display:flex;flex-direction:column;align-items:center;gap:2px;">
      <select onchange="setGapField('${g.ref}','prio',this.value)"
        style="font-size:10px;padding:2px 3px;border-radius:3px;width:52px;text-align:center;
        background:${prioBgMap[prioCurrent]||'#F5F5F5'};color:${prioClrMap[prioCurrent]||'#54565A'};
        border:1px solid ${prioClrMap[prioCurrent]||'#ccc'};font-weight:700;cursor:pointer;">
        ${['P1','P2','P2.1','P3'].map(p=>`<option value="${p}" ${p===prioCurrent?'selected':''}>${p}</option>`).join('')}
      </select>
      ${prioModified ? `<span style="font-size:8px;color:var(--orange);font-weight:700;" title="Ref: ${prioRef}">▲ ref:${prioRef}</span>` : ''}
    </div>`;

    // Bank Model : valeur courante depuis state, référence = g.bm
    const bmRef      = g.bm;
    const bmCurrent  = (state.gaps[g.ref] && state.gaps[g.ref].bm) ? state.gaps[g.ref].bm : bmRef;
    const bmModified = bmCurrent !== bmRef;
    const bmStyles   = {
      'BM UEMOA':        { c:'#2E7D52', bg:'#E8F5ED' },
      'Prérequis BM UEMOA': { c:'#2E7D52', bg:'#E8F5ED' },
      'Anomalie':        { c:'#3949AB', bg:'#E8F0FE' },
      'Anomalie V4 CG':  { c:'#3949AB', bg:'#E8F0FE' },
      'Exclusion':       { c:'#E63329', bg:'#FDEEEC' },
      'Evolution':       { c:'#E8702A', bg:'#FEF3E2' },
    };
    const bms = ['BM UEMOA','Prérequis BM UEMOA','Anomalie','Anomalie V4 CG','Exclusion','Evolution'];
    const bmS = bmStyles[bmCurrent] || { c:'#54565A', bg:'#F5F5F5' };
    const bmBadge = `<div style="display:flex;flex-direction:column;align-items:center;gap:2px;">
      <select onchange="setGapField('${g.ref}','bm',this.value)"
        style="font-size:9px;padding:2px 3px;border-radius:3px;width:90px;text-align:center;
        background:${bmS.bg};color:${bmS.c};border:1px solid ${bmS.c};font-weight:700;cursor:pointer;">
        ${bms.map(b=>`<option value="${b}" ${b===bmCurrent?'selected':''}>${b==='Prérequis BM UEMOA'?'Prérequis':b}</option>`).join('')}
      </select>
      ${bmModified ? `<span style="font-size:8px;color:var(--orange);font-weight:700;" title="Ref: ${bmRef}">▲ ref:${bmRef==='Prérequis BM UEMOA'?'Prérequis':bmRef}</span>` : ''}
    </div>`;

    // Phase : valeur courante depuis state, référence = g.phase
    const phaseRef      = g.phase;
    const phaseCurrent  = (state.gaps[g.ref] && state.gaps[g.ref].phase) ? state.gaps[g.ref].phase : phaseRef;
    const phaseModified = phaseCurrent !== phaseRef;
    const phaseCell = `<div style="display:flex;flex-direction:column;align-items:center;gap:2px;">
      <select onchange="setGapField('${g.ref}','phase',this.value)"
        style="font-size:10px;padding:2px 3px;border-radius:3px;width:48px;text-align:center;
        background:#EEF0F8;color:#3949AB;border:1px solid #3949AB;font-weight:700;cursor:pointer;">
        ${['I','II','III'].map(p=>`<option value="${p}" ${p===phaseCurrent?'selected':''}>${p}</option>`).join('')}
      </select>
      ${phaseModified ? `<span style="font-size:8px;color:var(--orange);font-weight:700;" title="Ref: ${phaseRef}">▲ ref:${phaseRef}</span>` : ''}
    </div>`;

    // GAP decision (stored in state)
    const saved = state.gaps[g.ref] || {};
    const dec = saved.decision || '';
    const note = saved.note || '';
    const _gapDecs = _getGapDecisions();
    const _decObj = dec ? _gapDecByKey(dec) : { color: '#54565A', bg: '#F5F5F5' };
    const decCell = `<select onchange="setGapDecision('${g.ref}','decision',this.value)"
      style="font-size:10px;padding:2px 4px;border-radius:3px;width:130px;
      background:${_decObj.bg};color:${_decObj.color};
      border:1px solid ${_decObj.color};font-weight:${dec?'700':'400'};">
      <option value="">— choisir —</option>
      ${_gapDecs.map(o => `<option value="${o.key}" ${o.key===dec?'selected':''}>${o.icon ? o.icon+' ' : ''}${escHtml(o.label)}</option>`).join('')}
    </select>`;
    const noteCell = `<textarea oninput="setGapDecision('${g.ref}','note',this.value)"
      placeholder="Saisir une note…"
      rows="3"
      style="font-size:11px;line-height:1.45;padding:5px 7px;border:1px solid #d1d5db;border-radius:4px;
             width:100%;min-width:160px;box-sizing:border-box;
             min-height:64px;max-height:160px;resize:vertical;
             font-family:inherit;color:#1e293b;background:#fafafa;
             transition:border-color .15s,background .15s;"
      onfocus="this.style.borderColor='#1565C0';this.style.background='#fff'"
      onblur="this.style.borderColor='#d1d5db';this.style.background='#fafafa'"
      >${escHtml(note)}</textarea>`;

    const _defaultDecKey = _getGapDefaultKey();
    const _decConfig = dec ? _gapDecByKey(dec) : null;
    const _isExclusionDec = _decConfig && !!_decConfig.isExclusion;
    const traite = dec !== '' && dec !== _defaultDecKey && !_isExclusionDec;
    const rowBg = _isExclusionDec ? 'opacity:0.45;' :
                  traite ? 'background:#f7fff9;' : '';

    return `<tr style="${rowBg}">
      <td style="color:var(--gray);font-size:10px;">${g.n || idx_g+1}</td>
      <td><span class="badge badge-spec" style="font-size:9px;font-family:monospace;">${g.ref}</span>
          ${isAnomalie ? '<span title="Anomalie V4" style="color:#3949AB;font-size:10px;margin-left:3px;">⚠</span>' : ''}
          ${isExclusion ? '<span title="Hors périmètre" style="color:var(--red);font-size:10px;margin-left:3px;">✕</span>' : ''}</td>
      <td style="font-size:10px;">${g.domain.replace(' & ',' &amp; ')}</td>
      <td style="font-size:10px;color:var(--gray);">${g.processus}</td>
      <td style="font-size:10px;">${g.desc}</td>
      <td class="center">${prioBoaCell}</td>
      <td class="center">${phaseCell}</td>
      <td>${bmBadge}</td>
      <td class="center">${decCell}</td>
      <td>${noteCell}</td>
      <td style="text-align:center;white-space:nowrap;">
        <button onclick="openEditGapModal('${g.ref}')" title="Modifier"
          style="background:none;border:none;cursor:pointer;font-size:13px;padding:2px;">✏️</button>
        ${g._custom ? `<button onclick="deleteGap('${g.ref}')" title="Supprimer"
          style="background:none;border:none;cursor:pointer;font-size:13px;padding:2px;">🗑️</button>` : ''}
        <button title="Historique" onclick="showGapHistory('${g.ref}',event)" style="background:none;border:1px solid #334155;border-radius:4px;padding:2px 6px;cursor:pointer;color:#64748b;font-size:11px;margin-left:4px;">🕐</button>
      </td>
    </tr>`;
  }).join('') || '<tr><td colspan="11" style="text-align:center;padding:20px;color:var(--gray);">Aucun résultat</td></tr>';

  // Update decision summary bar
  updateGapsSummary();
}

function updateGapsSummary() {
  const el = document.getElementById('gaps-summary-bar');
  if (!el) return;
  const allGaps = _projUsesCBS() ? [...gaps, ...state.customGaps] : [...state.customGaps];
  const total = allGaps.length;
  if (total === 0) { el.innerHTML = ''; return; }

  const decs = _getGapDecisions();
  const defaultKey = _getGapDefaultKey();
  // Count per decision key
  const counts = {};
  decs.forEach(d => { counts[d.key] = 0; });
  counts['_other'] = 0;
  allGaps.forEach(g => {
    const d = (state.gaps[g.ref]||{}).decision || defaultKey;
    if (counts[d] !== undefined) counts[d]++;
    else counts['_other']++;
  });
  // Traités = any decision that is not the default and not empty
  const defaultCount = (counts[defaultKey] || 0) + (counts[''] || 0);
  const traites = total - defaultCount;
  const pct = total > 0 ? Math.round(traites / total * 100) : 0;

  // Build badges: show each non-default decision that has count>0 (show max 4 badges + progress bar)
  const badges = decs
    .filter(d => !d.isDefault && counts[d.key] > 0)
    .map(d => `<div style="background:${d.bg};color:${d.color};border:1px solid ${d.color};border-radius:4px;padding:4px 10px;font-size:11px;font-weight:700;white-space:nowrap;">${counts[d.key]} ${escHtml(d.label)}</div>`)
    .join('');
  const defaultBadge = `<div style="background:${decs.find(d=>d.isDefault)?.bg||'#F5F5F5'};color:${decs.find(d=>d.isDefault)?.color||'#54565A'};border:1px solid ${decs.find(d=>d.isDefault)?.color||'#ccc'};border-radius:4px;padding:4px 10px;font-size:11px;font-weight:700;white-space:nowrap;">${defaultCount} ${escHtml(decs.find(d=>d.isDefault)?.label||'En attente')}</div>`;
  const traitesBadge = `<div style="background:#E8F5ED;color:#2E7D52;border:1px solid #2E7D52;border-radius:4px;padding:4px 10px;font-size:11px;font-weight:700;white-space:nowrap;">✅ ${traites} Traités</div>`;

  el.innerHTML = `
    <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
      ${traitesBadge}${badges}${defaultBadge}
      <div style="flex:1;min-width:200px;">
        <div style="background:#eee;border-radius:4px;height:8px;overflow:hidden;">
          <div style="background:#2E7D52;width:${pct}%;height:100%;border-radius:4px;transition:width .3s;"></div>
        </div>
        <div style="font-size:10px;color:var(--gray);margin-top:2px;">${pct}% traités (${traites}/${total})</div>
      </div>
    </div>`;
}


// ── GAP CRUD ──────────────────────────────────────────────────────────────
function deleteGap(ref) {
  if (!canEdit()) return;
  if (!confirm('Supprimer ce GAP ?')) return;
  state.customGaps = state.customGaps.filter(g => g.ref !== ref);
  delete state.gaps[ref];
  saveState('GAP supprimé', ref);
  renderGaps();
}

function openAddGapModal() {
  const n = (gaps.length + state.customGaps.length + 1);
  document.getElementById('gap-modal-title').textContent = '➕ Nouveau GAP';
  document.getElementById('gap-modal-ref').value      = 'GAP-CUSTOM-' + String(n).padStart(3,'0');
  document.getElementById('gap-modal-domain').value   = '';
  document.getElementById('gap-modal-processus').value= '';
  document.getElementById('gap-modal-desc').value     = '';
  document.getElementById('gap-modal-prio').value     = 'P2';
  document.getElementById('gap-modal-phase').value    = 'II';
  document.getElementById('gap-modal-bm').value       = 'BM UEMOA';
  document.getElementById('gap-modal-resp').value     = '';
  document.getElementById('gap-modal-note').value     = '';
  document.getElementById('gap-modal-isEdit').value   = '';
  _renderItemDomainChips('gap-modal-domains-chips', null);
  document.getElementById('gap-modal').style.display  = 'flex';
}

function openEditGapModal(ref) {
  const allG = [...gaps, ...state.customGaps];
  const g = allG.find(x => x.ref === ref);
  if (!g) return;
  const sv = state.gaps[ref] || {};
  document.getElementById('gap-modal-title').textContent = '✏️ Modifier le GAP';
  document.getElementById('gap-modal-ref').value      = g.ref;
  document.getElementById('gap-modal-domain').value   = g.domain;
  document.getElementById('gap-modal-processus').value= g.processus;
  document.getElementById('gap-modal-desc').value     = g.desc;
  document.getElementById('gap-modal-prio').value     = sv.prio || g.prio;
  document.getElementById('gap-modal-phase').value    = sv.phase || g.phase;
  document.getElementById('gap-modal-bm').value       = sv.bm   || g.bm;
  document.getElementById('gap-modal-resp').value     = g.resp || '';
  document.getElementById('gap-modal-note').value     = sv.note || '';
  document.getElementById('gap-modal-isEdit').value   = ref;
  _renderItemDomainChips('gap-modal-domains-chips', Array.isArray(g.domains) ? g.domains : null);
  document.getElementById('gap-modal').style.display  = 'flex';
}

function saveGapModal() {
  const isEdit    = document.getElementById('gap-modal-isEdit').value;
  const ref       = document.getElementById('gap-modal-ref').value.trim();
  const domain    = document.getElementById('gap-modal-domain').value.trim();
  const domains   = _readItemDomainChips('gap-modal-domains-chips');
  const processus = document.getElementById('gap-modal-processus').value.trim();
  const desc      = document.getElementById('gap-modal-desc').value.trim();
  const prio      = document.getElementById('gap-modal-prio').value;
  const phase     = document.getElementById('gap-modal-phase').value;
  const bm        = document.getElementById('gap-modal-bm').value;
  const resp      = document.getElementById('gap-modal-resp').value.trim();
  const note      = (document.getElementById('gap-modal-note').value || '').trim();
  if (!desc || !ref) { alert('Référence et description sont requis.'); return; }

  const _GAP_FIELDS = { ref:'Référence', domain:'Domaine', desc:'Description', prio:'Priorité', phase:'Phase', resp:'Responsable', processus:'Processus', bm:'BM', note:'Note' };
  if (isEdit) {
    const idx = state.customGaps.findIndex(g => g.ref === isEdit);
    if (idx >= 0) {
      const oldItem = {...state.customGaps[idx]};
      const newFields = { ref, domain, domains, processus, desc, prio, prio_cbs: prio, phase, phase_cbs: phase, bm, resp };
      const changes = _diffFields(oldItem, newFields, _GAP_FIELDS);
      if (changes.length > 0) { _pushHistory(state.customGaps[idx], 'updated', changes); }
      state.customGaps[idx] = { ...state.customGaps[idx], ...newFields };
    }
    if (!state.gaps[ref]) state.gaps[ref] = {};
    Object.assign(state.gaps[ref], { prio, phase, bm, note });
  } else {
    const n = gaps.length + state.customGaps.length + 1;
    const newGap = { n, ref, domain, domains, processus, desc, prio, prio_cbs: prio, phase, phase_cbs: phase, bm, resp, _custom: true, changed: false, _history: [] };
    _pushHistory(newGap, 'created');
    state.customGaps.push(newGap);
  }

  _saveAppDefault('gaps', [...gaps, ...state.customGaps]);
  // Persistance dans la table gaps (DB v2)
  const _gapToSave = isEdit
    ? state.customGaps.find(function(g){ return g.ref === ref; })
    : state.customGaps[state.customGaps.length - 1];
  if (_gapToSave && typeof DB !== 'undefined') {
    DB.saveGap(_gapToSave).then(function(dbId) {
      if (dbId) DB.loadGaps().then(function(d){ window._gapsCache = d; });
    });
  }
  saveState(isEdit ? 'GAP modifié' : 'GAP créé', ref + ' — ' + desc.substring(0, 60));
  document.getElementById('gap-modal').style.display = 'none';
  renderGaps();
}

function setGapDecision(ref, field, value) {
  if (!state.gaps[ref]) state.gaps[ref] = {};
  state.gaps[ref][field] = value;
  saveState();
  renderGaps();
  renderDashboard();
}

function setGapField(ref, field, value) {
  if (!state.gaps[ref]) state.gaps[ref] = {};
  state.gaps[ref][field] = value;
  saveState();
  renderGaps();
  renderDashboard();
}

function resetGapsFilters() {
  ['gaps-filter-domain','gaps-filter-prio','gaps-filter-changed','gaps-filter-bm'].forEach(id => {
    document.getElementById(id).value = '';
  });
  document.getElementById('gaps-search').value = '';
  renderGaps();
}

// ════════════════════════════════════════════════════════════════════════
// CBS UNIVERSAL EXPORT — CSV / XLSX / PDF
// ════════════════════════════════════════════════════════════════════════

/* ── Toggle dropdown visibility ─────────────────────────────────────── */
function _cbsToggleExportMenu(tabId) {
  const menuId = 'cbs-export-menu-' + tabId;
  document.querySelectorAll('.cbs-export-menu').forEach(m => {
    if (m.id !== menuId) m.style.display = 'none';
  });
  const menu = document.getElementById(menuId);
  if (!menu) return;
  menu.style.display = menu.style.display === 'block' ? 'none' : 'block';
}
document.addEventListener('click', function(e) {
  if (!e.target.closest('.cbs-export-wrap')) {
    document.querySelectorAll('.cbs-export-menu').forEach(m => m.style.display = 'none');
  }
});

/* ── Dispatch by format & tab ───────────────────────────────────────── */
async function _cbsDoExport(format, tabId) {
  document.querySelectorAll('.cbs-export-menu').forEach(m => m.style.display = 'none');
  const data = _cbsGetExportData(tabId);
  if (!data || !data.rows.length) { alert('Aucune donnée à exporter.'); return; }
  const ts = new Date().toISOString().slice(0,10);
  const fname = 'BOA_CI_' + tabId + '_' + ts;
  if (format === 'csv')  _cbsExportCSV(data.headers, data.rows, fname + '.csv');
  if (format === 'xlsx') await _cbsExportXLSX(data.headers, data.rows, fname + '.xlsx', data.title, tabId);
  if (format === 'pdf')  _cbsExportPDF(data.headers, data.rows, fname + '.pdf', data.title);
}

/* ── CSV export ─────────────────────────────────────────────────────── */
function _cbsExportCSV(headers, rows, filename) {
  const esc = v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
  const lines = [headers.map(esc).join(';'), ...rows.map(r => r.map(esc).join(';'))];
  const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
}

/* ── Tableau de Bord KPI — premier onglet de chaque export Excel ─────── */
/* ── Spécifique au tableau exporté (tabId) ──────────────────────────────── */
function _cbsBuildDashboardSheet(wb, tabId) {
  const todayDate = new Date();
  const today_fr  = todayDate.toLocaleDateString('fr-FR', { day:'2-digit', month:'long', year:'numeric' });

  // ── Création de la feuille ────────────────────────────────────────────
  const ws = wb.addWorksheet('Tableau de Bord', {
    pageSetup: { paperSize:9, orientation:'landscape', fitToPage:true, fitToWidth:1, fitToHeight:0,
                 margins: { left:0.4, right:0.4, top:0.6, bottom:0.6 } },
    views: [{ showGridLines: false }]
  });

  const NC      = 20;   // colonnes totales
  const LABEL_C = 5;    // cols 1-5 pour les libellés (sections graphiques)
  const BAR_C   = 12;   // cols 6-17 pour les barres ; cols 18-20 pour les valeurs

  ws.columns = Array.from({ length: NC }, () => ({ width: 4 }));

  // ── Helpers ───────────────────────────────────────────────────────────
  let currentRow = 0;
  function nextRow(h) { currentRow++; const r = ws.getRow(currentRow); r.height = h; return r; }
  function fillRow(row, c1, c2, argb) {
    for (let c = c1; c <= c2; c++) row.getCell(c).fill = { type:'pattern', pattern:'solid', fgColor:{ argb } };
  }
  function sc(cell, opts) {
    if (opts.v !== undefined) cell.value = opts.v;
    if (opts.font)   cell.font      = opts.font;
    if (opts.fill)   cell.fill      = { type:'pattern', pattern:'solid', fgColor:{ argb: opts.fill } };
    if (opts.align)  cell.alignment = opts.align;
    if (opts.border) cell.border    = opts.border;
  }

  // ── BANDEAU HEADER CBS (lignes 1-3) ──────────────────────────────────
  { const r = nextRow(30);
    sc(r.getCell(1), { v:'CBS  \u2014  Capital Banking Solutions',
      font:{ name:'Arial', bold:true, size:14, color:{argb:'FFFFFFFF'} },
      fill:'FFE63329', align:{ vertical:'middle', horizontal:'left', indent:2 } });
    fillRow(r, 2, NC, 'FFE63329'); ws.mergeCells(currentRow, 1, currentRow, NC); }
  { const r = nextRow(22);
    sc(r.getCell(1), { v:'BOA CI  \u2014  Pilotage Programme Upgrade IGOR V2 \u2192 V4',
      font:{ name:'Arial', bold:true, size:10, color:{argb:'FFFFFFFF'} },
      fill:'FF1F3864', align:{ vertical:'middle', horizontal:'left', indent:2 } });
    fillRow(r, 2, NC, 'FF1F3864'); ws.mergeCells(currentRow, 1, currentRow, NC); }
  { const r = nextRow(18);
    sc(r.getCell(1), { v:'TABLEAU DE BORD  |  Export\u00E9 le : ' + today_fr + '  |  Document Confidentiel',
      font:{ name:'Arial', italic:true, size:9, color:{argb:'FF1F3864'} },
      fill:'FFEEF2F7', align:{ vertical:'middle', horizontal:'left', indent:2 } });
    fillRow(r, 2, NC, 'FFEEF2F7'); ws.mergeCells(currentRow, 1, currentRow, NC); }
  nextRow(10); // spacer

  // ── Helper : section title ────────────────────────────────────────────
  function addSectionTitle(title) {
    const r = nextRow(22);
    sc(r.getCell(1), { v:title, font:{name:'Arial', bold:true, size:10, color:{argb:'FFFFFFFF'}},
      fill:'FF2C3E50', align:{ vertical:'middle', horizontal:'left', indent:2 } });
    fillRow(r, 2, NC, 'FF2C3E50'); ws.mergeCells(currentRow, 1, currentRow, NC);
    const rl = nextRow(3); fillRow(rl, 1, NC, 'FFE63329');
  }

  // ── Helper : bar row ──────────────────────────────────────────────────
  function addBarRow(label, value, maxVal, barColor, rowBg) {
    const r = nextRow(18); const bg = rowBg || 'FFF8F9FA';
    sc(r.getCell(1), { v:label, font:{name:'Arial', size:8.5, color:{argb:'FF1A1A1A'}},
      fill:bg, align:{ vertical:'middle', horizontal:'left', indent:1, wrapText:true } });
    fillRow(r, 2, LABEL_C, bg);
    ws.mergeCells(currentRow, 1, currentRow, LABEL_C);
    const filled = Math.round(Math.max(0, Math.min(1, value / (maxVal || 1))) * BAR_C);
    for (let c = LABEL_C + 1; c <= LABEL_C + BAR_C; c++) {
      const isFill = (c - LABEL_C) <= filled;
      r.getCell(c).fill = { type:'pattern', pattern:'solid', fgColor:{ argb: isFill ? barColor : 'FFE8E8E8' } };
      if (isFill) r.getCell(c).border = { right:{ style:'thin', color:{argb:'FFFFFFFF'} } };
    }
    const vc = LABEL_C + BAR_C + 1;
    sc(r.getCell(vc), { v:String(value), font:{name:'Arial', bold:true, size:10, color:{argb:barColor}},
      fill:'FFFFFFFF', align:{ vertical:'middle', horizontal:'center' } });
    fillRow(r, vc + 1, NC, 'FFFFFFFF');
    if (NC > vc) ws.mergeCells(currentRow, vc, currentRow, NC);
  }

  function addSpacer(h) { nextRow(h); }

  // ── Helper : KPI cards (4 cartes × 5 colonnes) ────────────────────────
  function addKpiCards(cards) {
    // Barre top
    { const r = nextRow(4); cards.forEach(c => fillRow(r, c.c1, c.c2, c.color)); }
    // Titre carte
    { const r = nextRow(20);
      cards.forEach(c => {
        sc(r.getCell(c.c1), { v:c.label, font:{name:'Arial', bold:true, size:9, color:{argb:'FFFFFFFF'}},
          fill:c.color, align:{ vertical:'middle', horizontal:'center' } });
        fillRow(r, c.c1+1, c.c2, c.color); ws.mergeCells(currentRow, c.c1, currentRow, c.c2);
      }); }
    // Spacer léger
    { const r = nextRow(5); cards.forEach(c => fillRow(r, c.c1, c.c2, c.light)); }
    // Grand chiffre
    { const r = nextRow(38);
      cards.forEach(c => {
        sc(r.getCell(c.c1), { v:c.bigVal, font:{name:'Arial', bold:true, size:24, color:{argb:c.color}},
          fill:c.light, align:{ vertical:'middle', horizontal:'center' } });
        fillRow(r, c.c1+1, c.c2, c.light); ws.mergeCells(currentRow, c.c1, currentRow, c.c2);
      }); }
    // Sous-label
    { const r = nextRow(20);
      cards.forEach(c => {
        sc(r.getCell(c.c1), { v:c.sub, font:{name:'Arial', size:8, color:{argb:'FF54565A'}},
          fill:c.accent, align:{ vertical:'middle', horizontal:'center', wrapText:true } });
        fillRow(r, c.c1+1, c.c2, c.accent); ws.mergeCells(currentRow, c.c1, currentRow, c.c2);
      }); }
    // Barre bas
    { const r = nextRow(4); cards.forEach(c => fillRow(r, c.c1, c.c2, c.color)); }
    addSpacer(14);
  }

  // ══════════════════════════════════════════════════════════════════════
  // DISPATCH par onglet
  // ══════════════════════════════════════════════════════════════════════

  if (tabId === 'arbitrages') {
    // ── KPIs arbitrages ────────────────────────────────────────────────
    const _xDecs = _getArbDecisions(); const _xDefKey = _getArbDefaultKey();
    let decided = 0; const byDec = {};
    _xDecs.forEach(d => { byDec[d.key] = 0; });
    arbitrages.forEach(a => {
      const s = (state.arbitrages[a.id] || {}).decision || _xDefKey;
      byDec[s] = (byDec[s] || 0) + 1; if (s !== _xDefKey) decided++;
    });
    const pct = Math.round(decided / arbitrages.length * 100);
    // Par domaine
    const arbByDom = {}; arbitrages.forEach(a => { arbByDom[a.domain] = (arbByDom[a.domain]||0)+1; });
    // Par priorité
    const arbByPrio = { P1:0, P2:0, P3:0 };
    arbitrages.forEach(a => { const p = a.prio||'P2'; arbByPrio[p] = (arbByPrio[p]||0)+1; });
    const _xDef = _xDecs.find(d => d.isDefault) || _xDecs[0];
    const _xFin = _xDecs.filter(d => !d.isDefault);

    addKpiCards([
      { c1:1, c2:5,   label:'ARBITRAGES TOTAUX', bigVal:String(arbitrages.length), sub:'Développements spécifiques BOA CI',
        color:'FF1F3864', light:'FFF0F4FF', accent:'FFE3EAF5' },
      { c1:6, c2:10,  label:'DÉCIDÉS', bigVal:decided+' / '+arbitrages.length, sub:pct+'% finalisés',
        color:'FF2E7D52', light:'FFF0FFF4', accent:'FFE0F5EA' },
      { c1:11, c2:15, label:(_xDef?_xDef.label.toUpperCase():'EN COURS'), bigVal:String(byDec[_xDefKey]||0), sub:'Arbitrages à finaliser',
        color:'FFE8702A', light:'FFFFF8F2', accent:'FFFFE9D0' },
      { c1:16, c2:20, label:(_xFin[0]?_xFin[0].label.toUpperCase():'---'), bigVal:String(byDec[_xFin[0]?_xFin[0].key:'']||0), sub:(_xFin[0]?_xFin[0].label:''),
        color:'FFE63329', light:'FFFFF5F5', accent:'FFFCE8E7' },
    ]);
    addSectionTitle('RÉPARTITION PAR DÉCISION  (' + decided + ' / ' + arbitrages.length + ' finalisés)');
    addSpacer(4);
    _xDecs.forEach(d => { addBarRow(d.label, byDec[d.key]||0, arbitrages.length, 'FF'+d.color.replace('#',''), 'FFF8F9FA'); });
    addSpacer(10);
    addSectionTitle('R\u00C9PARTITION PAR PRIORIT\u00C9  (P1 = critique)');
    addSpacer(4);
    const maxPrio = Math.max(arbByPrio.P1, arbByPrio.P2, arbByPrio.P3, 1);
    addBarRow('P1 \u2014 Critique',  arbByPrio.P1, maxPrio, 'FFE63329', 'FFFFF0F0');
    addBarRow('P2 \u2014 Important', arbByPrio.P2, maxPrio, 'FFE8702A', 'FFFFF8F2');
    addBarRow('P3 \u2014 Mineur',    arbByPrio.P3, maxPrio, 'FF54565A', 'FFF5F5F5');
    addSpacer(10);
    const domEntries = Object.entries(arbByDom).sort((a,b) => b[1]-a[1]);
    if (domEntries.length) {
      const maxD = Math.max(...domEntries.map(e => e[1]), 1);
      addSectionTitle('R\u00C9PARTITION PAR DOMAINE FONCTIONNEL');
      addSpacer(4);
      domEntries.forEach(([dom, cnt]) => addBarRow(dom, cnt, maxD, 'FF1F3864', 'FFF0F4FF'));
    }

  } else if (tabId === 'actions') {
    // ── KPIs actions ───────────────────────────────────────────────────
    let actR=0, actO=0, actG=0, actX=0;
    actions.forEach(a => {
      const rag = (state.actions[a.id]||{}).rag||'X';
      if(rag==='R') actR++; else if(rag==='O'||rag==='A') actO++; else if(rag==='G') actG++; else actX++;
    });
    const actByUrg = {};
    actions.forEach(a => { const u = a.urgence||'Normal'; actByUrg[u] = (actByUrg[u]||0)+1; });
    const actByDom = {};
    actions.forEach(a => { actByDom[a.domain] = (actByDom[a.domain]||0)+1; });
    const pctDone = Math.round(actG / actions.length * 100);

    addKpiCards([
      { c1:1, c2:5,   label:'ACTIONS TOTALES', bigVal:String(actions.length), sub:'Plan d\u2019actions programme',
        color:'FF1F3864', light:'FFF0F4FF', accent:'FFE3EAF5' },
      { c1:6, c2:10,  label:'VERT \u2014 ON TRACK', bigVal:String(actG), sub:pctDone+'% des actions',
        color:'FF2E7D52', light:'FFF0FFF4', accent:'FFE0F5EA' },
      { c1:11, c2:15, label:'AMBRE \u2014 \u00C0 SURVEILLER', bigVal:String(actO), sub:'Actions \u00E0 risque',
        color:'FFE8702A', light:'FFFFF8F2', accent:'FFFFE9D0' },
      { c1:16, c2:20, label:'ROUGE \u2014 CRITIQUE', bigVal:String(actR), sub:'Actions imm\u00E9diates',
        color:'FFE63329', light:'FFFFF5F5', accent:'FFFCE8E7' },
    ]);
    addSectionTitle('TABLEAU DE BORD RAG  (' + actions.length + ' actions au total)');
    addSpacer(4);
    addBarRow('Vert \u2014 On track',            actG,          actions.length, 'FF2E7D52', 'FFF0FBF5');
    addBarRow('Ambre \u2014 Surveillance',        actO,          actions.length, 'FFE8702A', 'FFFFF8F2');
    addBarRow('Rouge \u2014 Action imm\u00E9diate', actR,        actions.length, 'FFE63329', 'FFFFF0F0');
    addBarRow('Non d\u00E9fini',                  actX,          actions.length, 'FF9E9E9E', 'FFF5F5F5');
    addSpacer(10);
    const urgEntries = Object.entries(actByUrg).sort((a,b) => b[1]-a[1]);
    if (urgEntries.length) {
      const maxU = Math.max(...urgEntries.map(e => e[1]), 1);
      addSectionTitle('R\u00C9PARTITION PAR URGENCE');
      addSpacer(4);
      const urgColors = { 'Critique':'FFE63329', 'Urgent':'FFE8702A', 'Normal':'FF2E7D52' };
      urgEntries.forEach(([u, cnt]) => addBarRow(u, cnt, maxU, urgColors[u]||'FF54565A', 'FFF8F9FA'));
      addSpacer(10);
    }
    const domAct = Object.entries(actByDom).sort((a,b) => b[1]-a[1]);
    if (domAct.length) {
      const maxDA = Math.max(...domAct.map(e => e[1]), 1);
      addSectionTitle('R\u00C9PARTITION PAR DOMAINE');
      addSpacer(4);
      domAct.forEach(([dom, cnt]) => addBarRow(dom, cnt, maxDA, 'FF1F3864', 'FFF0F4FF'));
    }

  } else if (tabId === 'gaps') {
    // ── KPIs GAPs ─────────────────────────────────────────────────────
    const gapsP1 = gaps.filter(g => g.prio === 'P1').length;
    const gapsP2 = gaps.filter(g => g.prio === 'P2').length;
    const gapsP3 = gaps.filter(g => g.prio === 'P3').length;
    // Par domaine (P1 seulement)
    const domainData = [
      { name:'Engagements & Risques', p1:8 }, { name:'R\u00E9f. Clients & Comptes', p1:7 },
      { name:'Poste Agence & Guichet', p1:6 }, { name:'N\u00E9goce International', p1:6 },
      { name:'Conformit\u00E9 LAB/FT', p1:5 }, { name:'Moyens de Paiement', p1:4 },
      { name:'TFJ courus', p1:3 }, { name:'Tr\u00E9sorerie & Change', p1:2 },
      { name:'Comptabilit\u00E9 & Finance', p1:1 }, { name:'Habilitations', p1:1 },
    ];
    // Par phase
    const gapsByPhase = {};
    gaps.forEach(g => { const ph = g.phase||'Non d\u00E9fini'; gapsByPhase[ph] = (gapsByPhase[ph]||0)+1; });
    // Par statut CBS
    const gapsByStatut = {};
    gaps.forEach(g => { const s = g.statut||'Non d\u00E9fini'; gapsByStatut[s] = (gapsByStatut[s]||0)+1; });

    addKpiCards([
      { c1:1, c2:5,   label:'GAPS TOTAUX', bigVal:String(gaps.length), sub:'Ecarts fonctionnels V2\u2192V4',
        color:'FF1F3864', light:'FFF0F4FF', accent:'FFE3EAF5' },
      { c1:6, c2:10,  label:'PRIORIT\u00C9 P1', bigVal:String(gapsP1), sub:'GAPs critiques',
        color:'FFE63329', light:'FFFFF5F5', accent:'FFFCE8E7' },
      { c1:11, c2:15, label:'PRIORIT\u00C9 P2', bigVal:String(gapsP2), sub:'GAPs importants',
        color:'FFE8702A', light:'FFFFF8F2', accent:'FFFFE9D0' },
      { c1:16, c2:20, label:'PRIORIT\u00C9 P3', bigVal:String(gapsP3), sub:'GAPs mineurs',
        color:'FF54565A', light:'FFF5F5F5', accent:'FFEBEBEB' },
    ]);
    const maxP1 = Math.max(...domainData.map(d => d.p1), 1);
    addSectionTitle('GAPs PRIORIT\u00C9 P1 \u2014 Distribution par Domaine  (' + gapsP1 + ' P1 sur ' + gaps.length + ')');
    addSpacer(4);
    [...domainData].sort((a,b) => b.p1-a.p1).forEach(d => addBarRow(d.name, d.p1, maxP1, 'FFE63329', 'FFFFF0F0'));
    addSpacer(10);
    const phEntries = Object.entries(gapsByPhase).sort((a,b) => b[1]-a[1]);
    if (phEntries.length) {
      const maxPh = Math.max(...phEntries.map(e => e[1]), 1);
      addSectionTitle('R\u00C9PARTITION PAR PHASE DE TRAITEMENT');
      addSpacer(4);
      phEntries.forEach(([ph, cnt]) => addBarRow(ph, cnt, maxPh, 'FF1F3864', 'FFF0F4FF'));
      addSpacer(10);
    }
    const stEntries = Object.entries(gapsByStatut).sort((a,b) => b[1]-a[1]);
    if (stEntries.length) {
      const maxSt = Math.max(...stEntries.map(e => e[1]), 1);
      addSectionTitle('R\u00C9PARTITION PAR STATUT CBS');
      addSpacer(4);
      stEntries.forEach(([st, cnt]) => addBarRow(st, cnt, maxSt, 'FF54565A', 'FFF5F5F5'));
    }

  } else if (tabId === 'risques') {
    // ── KPIs risques ───────────────────────────────────────────────────
    const risks = state.risks || [];
    const byStatut = {}, byCrit = {};
    risks.forEach(r => {
      const s = r.statut || 'Identifi\u00E9'; byStatut[s] = (byStatut[s]||0)+1;
      const c = r.crit   || 'Non \u00E9valu\u00E9'; byCrit[c]   = (byCrit[c]||0)+1;
    });
    const rOpen = risks.filter(r => !r.statut || r.statut.toLowerCase().includes('identifi')).length;
    const rInProg= risks.filter(r => r.statut && r.statut.toLowerCase().includes('cours')).length;
    const rClosed= risks.filter(r => r.statut && (r.statut.toLowerCase().includes('cl\u00f4tur')||r.statut.toLowerCase().includes('clotur'))).length;

    addKpiCards([
      { c1:1, c2:5,   label:'RISQUES TOTAUX', bigVal:String(risks.length), sub:'Registre des risques',
        color:'FF1F3864', light:'FFF0F4FF', accent:'FFE3EAF5' },
      { c1:6, c2:10,  label:'IDENTIFI\u00C9S', bigVal:String(rOpen), sub:'Risques ouverts',
        color:'FFE63329', light:'FFFFF5F5', accent:'FFFCE8E7' },
      { c1:11, c2:15, label:'EN COURS', bigVal:String(rInProg), sub:'En att\u00E9nuation',
        color:'FFE8702A', light:'FFFFF8F2', accent:'FFFFE9D0' },
      { c1:16, c2:20, label:'CL\u00D4TUR\u00C9S', bigVal:String(rClosed), sub:'Risques r\u00E9solus',
        color:'FF2E7D52', light:'FFF0FFF4', accent:'FFE0F5EA' },
    ]);
    const critEntries = Object.entries(byCrit).sort((a,b) => b[1]-a[1]);
    if (critEntries.length) {
      const maxC = Math.max(...critEntries.map(e => e[1]), 1);
      addSectionTitle('R\u00C9PARTITION PAR CRITICIT\u00C9');
      addSpacer(4);
      const critColors = ['FFE63329','FFE8702A','FF3949AB','FF54565A'];
      critEntries.forEach(([c, cnt], i) => addBarRow(c, cnt, maxC, critColors[i%critColors.length], 'FFF8F9FA'));
      addSpacer(10);
    }
    const statEntries = Object.entries(byStatut).sort((a,b) => b[1]-a[1]);
    if (statEntries.length) {
      const maxS = Math.max(...statEntries.map(e => e[1]), 1);
      addSectionTitle('R\u00C9PARTITION PAR STATUT');
      addSpacer(4);
      statEntries.forEach(([s, cnt]) => addBarRow(s, cnt, maxS, 'FF1F3864', 'FFF0F4FF'));
    }

  } else if (tabId === 'gantt') {
    // ── KPIs Gantt ─────────────────────────────────────────────────────
    const allTasks = [...ganttTasks, ...(state.ganttCustom||[])];
    const nPhases  = allTasks.filter(t => t.type==='phase').length;
    const nJalons  = allTasks.filter(t => t.type==='jalon').length;
    const nTasks   = allTasks.filter(t => t.type==='task').length;
    const daysLeft = Math.max(0, Math.ceil((new Date('2026-07-15') - todayDate) / 86400000));
    const phases   = ganttTasks.filter(t => t.type === 'phase');

    addKpiCards([
      { c1:1, c2:5,   label:'T\u00C2CHES TOTALES', bigVal:String(allTasks.length), sub:nTasks+' t\u00E2ches + '+nPhases+' phases',
        color:'FF1F3864', light:'FFF0F4FF', accent:'FFE3EAF5' },
      { c1:6, c2:10,  label:'PHASES', bigVal:String(nPhases), sub:'Phases principales',
        color:'FFE63329', light:'FFFFF5F5', accent:'FFFCE8E7' },
      { c1:11, c2:15, label:'JALONS', bigVal:String(nJalons), sub:'Points de contr\u00F4le',
        color:'FFE8702A', light:'FFFFF8F2', accent:'FFFFE9D0' },
      { c1:16, c2:20, label:'GO LIVE', bigVal:'J\u2212'+daysLeft, sub:'15 Juillet 2026',
        color:'FF2E7D52', light:'FFF0FFF4', accent:'FFE0F5EA' },
    ]);

    // Timeline phases (bandes colorées)
    addSectionTitle('TIMELINE \u2014 Phases Cl\u00E9s du Programme');
    addSpacer(4);
    // En-tête mois
    { const r = nextRow(15);
      sc(r.getCell(1), { v:'Phase', font:{name:'Arial',bold:true,size:8,color:{argb:'FF54565A'}}, fill:'FFEEF2F7', align:{vertical:'middle',horizontal:'center'} });
      fillRow(r, 2, LABEL_C, 'FFEEF2F7'); ws.mergeCells(currentRow, 1, currentRow, LABEL_C);
      const mg = [
        { l:'Jan-F\u00E9v', f:LABEL_C+1, t:LABEL_C+3 }, { l:'Mar-Avr', f:LABEL_C+4, t:LABEL_C+6 },
        { l:'Mai-Jun', f:LABEL_C+7, t:LABEL_C+9 },       { l:'Jul-Ao\u00FB', f:LABEL_C+10, t:LABEL_C+12 },
      ];
      mg.forEach(m => {
        sc(r.getCell(m.f), { v:m.l, font:{name:'Arial',bold:true,size:8,color:{argb:'FF54565A'}}, fill:'FFEEF2F7', align:{vertical:'middle',horizontal:'center'} });
        fillRow(r, m.f+1, m.t, 'FFEEF2F7'); if (m.t > m.f) ws.mergeCells(currentRow, m.f, currentRow, m.t);
      });
      const vc = LABEL_C+BAR_C+1;
      sc(r.getCell(vc), { v:'Dur\u00E9e', font:{name:'Arial',bold:true,size:8,color:{argb:'FF54565A'}}, fill:'FFEEF2F7', align:{vertical:'middle',horizontal:'center'} });
      fillRow(r, vc+1, NC, 'FFEEF2F7'); if (NC > vc) ws.mergeCells(currentRow, vc, currentRow, NC); }
    const rngStart = new Date('2026-01-01'), rngEnd = new Date('2026-08-16'), rngMs = rngEnd - rngStart;
    const phClrs = ['FFE63329','FFE8702A','FF54565A','FF2E7D52','FF1565C0','FF7B1FA2'];
    phases.forEach((p, pi) => {
      const pS = new Date(p.start), pE = new Date(p.end);
      const pClr = phClrs[pi % phClrs.length];
      const cS = LABEL_C+1+Math.round(Math.max(0,(pS-rngStart)/rngMs)*BAR_C);
      const cE = LABEL_C+Math.round(Math.min(1,(pE-rngStart)/rngMs)*BAR_C);
      const dur = Math.round((pE-pS)/86400000);
      const lbl = p.label.includes('\u2014') ? p.label.split('\u2014')[1].trim().substring(0,28) : p.label.substring(0,28);
      const r = nextRow(20);
      sc(r.getCell(1), { v:lbl, font:{name:'Arial',size:8,color:{argb:pClr},bold:true}, fill:'FFF8F9FA', align:{vertical:'middle',horizontal:'left',indent:1,wrapText:true} });
      fillRow(r, 2, LABEL_C, 'FFF8F9FA'); ws.mergeCells(currentRow, 1, currentRow, LABEL_C);
      for (let c = LABEL_C+1; c <= LABEL_C+BAR_C; c++) {
        const inP = c >= cS && c <= Math.max(cS, cE);
        r.getCell(c).fill = { type:'pattern', pattern:'solid', fgColor:{ argb: inP ? pClr : 'FFF0F0F0' } };
        if (inP) r.getCell(c).border = { right:{style:'thin',color:{argb:'FFFFFFFF'}}, left:{style:'thin',color:{argb:'FFFFFFFF'}} };
      }
      const vc = LABEL_C+BAR_C+1;
      sc(r.getCell(vc), { v:dur+'j', font:{name:'Arial',bold:true,size:9,color:{argb:pClr}}, fill:'FFFFFFFF', align:{vertical:'middle',horizontal:'center'} });
      fillRow(r, vc+1, NC, 'FFFFFFFF'); if (NC > vc) ws.mergeCells(currentRow, vc, currentRow, NC);
    });
    // Marqueur Go Live
    { const r = nextRow(18);
      const glPct = Math.min(1,Math.max(0,(new Date('2026-07-15')-rngStart)/rngMs));
      const glCell = LABEL_C+1+Math.round(glPct*BAR_C);
      sc(r.getCell(1), { v:'>>> GO LIVE <<<', font:{name:'Arial',bold:true,size:8.5,color:{argb:'FFFF5722'}}, fill:'FFECF0F1', align:{vertical:'middle',horizontal:'center'} });
      fillRow(r, 2, LABEL_C, 'FFECF0F1'); ws.mergeCells(currentRow, 1, currentRow, LABEL_C);
      for (let c = LABEL_C+1; c <= LABEL_C+BAR_C; c++) {
        if (c === glCell) { r.getCell(c).fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFFF5722'}}; r.getCell(c).value='\u2605'; r.getCell(c).font={name:'Arial',bold:true,size:10,color:{argb:'FFFFFFFF'}}; r.getCell(c).alignment={vertical:'middle',horizontal:'center'}; }
        else r.getCell(c).fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFECF0F1'}};
      }
      const vc = LABEL_C+BAR_C+1;
      sc(r.getCell(vc), { v:'15 Jul', font:{name:'Arial',bold:true,size:9,color:{argb:'FFFF5722'}}, fill:'FFFFFFFF', align:{vertical:'middle',horizontal:'center'} });
      fillRow(r, vc+1, NC, 'FFFFFFFF'); if (NC > vc) ws.mergeCells(currentRow, vc, currentRow, NC); }

    // Avancement par phase (depuis les tâches child)
    addSpacer(10);
    addSectionTitle('AVANCEMENT PAR PHASE  (% moyen des t\u00E2ches)');
    addSpacer(4);
    phases.forEach(p => {
      const childTasks = ganttTasks.filter(t => t.phase === p.phase && t.type === 'task');
      const avgPct = childTasks.length
        ? Math.round(childTasks.reduce((s, t) => {
            const ov = (state.ganttOverrides||{})[t.id]||{};
            const subs = (state.ganttSubtasks||{})[t.id]||[];
            const tp = subs.length ? Math.round(subs.reduce((a,b) => a+(b.pct||0),0)/subs.length)
                                   : (ov._pct!=null ? ov._pct : Math.round((t.pct||0)*100));
            return s + tp;
          }, 0) / childTasks.length)
        : 0;
      const shortLbl = p.label.includes('\u2014') ? p.label.split('\u2014')[1].trim().substring(0,25) : p.label.substring(0,25);
      addBarRow(shortLbl + ' (' + childTasks.length + ' t\u00E2ches)', avgPct, 100, 'FF1F3864', 'FFF0F4FF');
    });

  } else if (tabId === 'perimetremodules') {
    // ── KPIs Périmètre ─────────────────────────────────────────────────
    const perim = (state.perimeter && state.perimeter.length) ? state.perimeter : (typeof DEFAULT_PERIMETER !== 'undefined' ? DEFAULT_PERIMETER : []);
    const perimByDom = {};
    perim.forEach(p => { perimByDom[p.domaine||'Autre'] = (perimByDom[p.domaine||'Autre']||0)+1; });
    const withDev = perim.filter(p => p.impactDev && p.impactDev.trim() && p.impactDev !== 'Aucun').length;
    const withMig = perim.filter(p => p.impactMigration && p.impactMigration.trim() && p.impactMigration !== 'Aucun').length;
    const nDoms   = Object.keys(perimByDom).length;

    addKpiCards([
      { c1:1, c2:5,   label:'MODULES TOTAUX', bigVal:String(perim.length), sub:'Modules / sous-modules',
        color:'FF1F3864', light:'FFF0F4FF', accent:'FFE3EAF5' },
      { c1:6, c2:10,  label:'DOMAINES', bigVal:String(nDoms), sub:'Domaines fonctionnels',
        color:'FFE63329', light:'FFFFF5F5', accent:'FFFCE8E7' },
      { c1:11, c2:15, label:'IMPACT D\u00C9V', bigVal:String(withDev), sub:'Modules avec impact d\u00E9veloppement',
        color:'FFE8702A', light:'FFFFF8F2', accent:'FFFFE9D0' },
      { c1:16, c2:20, label:'IMPACT MIGRATION', bigVal:String(withMig), sub:'Modules avec impact migration',
        color:'FF2E7D52', light:'FFF0FFF4', accent:'FFE0F5EA' },
    ]);
    const domEntries = Object.entries(perimByDom).sort((a,b) => b[1]-a[1]);
    if (domEntries.length) {
      const maxD = Math.max(...domEntries.map(e => e[1]), 1);
      addSectionTitle('R\u00C9PARTITION PAR DOMAINE  (' + perim.length + ' modules au total)');
      addSpacer(4);
      domEntries.forEach(([dom, cnt]) => addBarRow(dom, cnt, maxD, 'FF1F3864', 'FFF0F4FF'));
    }

  } else {
    // ── Dashboard global (analyse/TCD + default) ───────────────────────
    const gapsTotal = gaps.length, gapsP1 = gaps.filter(g => g.prio==='P1').length;
    const _gArbDecs=_getArbDecisions(),_gArbDefKey=_getArbDefaultKey();
    let decided = 0; const byDec = {};
    _gArbDecs.forEach(d=>{byDec[d.key]=0;});
    arbitrages.forEach(a => { const s=(state.arbitrages[a.id]||{}).decision||_gArbDefKey; byDec[s]=(byDec[s]||0)+1; if(s!==_gArbDefKey) decided++; });
    let actG=0, actR=0, actO=0; actions.forEach(a => { const r=(state.actions[a.id]||{}).rag||'X'; if(r==='G')actG++; else if(r==='R')actR++; else if(r==='O'||r==='A')actO++; });
    const daysLeft = Math.max(0, Math.ceil((new Date('2026-07-15') - todayDate) / 86400000));

    addKpiCards([
      { c1:1, c2:5,   label:'GAPS TOTAUX', bigVal:String(gapsTotal), sub:gapsP1+' Priorit\u00E9 P1',
        color:'FFE63329', light:'FFFFF5F5', accent:'FFFCE8E7' },
      { c1:6, c2:10,  label:'ARBITRAGES', bigVal:decided+'/'+arbitrages.length, sub:Math.round(decided/arbitrages.length*100)+'% finalis\u00E9s',
        color:'FF1F3864', light:'FFF0F4FF', accent:'FFE3EAF5' },
      { c1:11, c2:15, label:'ACTIONS', bigVal:actG+'/'+actions.length, sub:'R:'+actR+' O:'+actO,
        color:'FF2E7D52', light:'FFF0FFF4', accent:'FFE0F5EA' },
      { c1:16, c2:20, label:'GO LIVE', bigVal:'J\u2212'+daysLeft, sub:'15 Juillet 2026',
        color:'FF37474F', light:'FFF8F9FA', accent:'FFECEFF1' },
    ]);
    addSectionTitle('VUE PROGRAMME \u2014 Arbitrages par D\u00E9cision');
    addSpacer(4);
    _gArbDecs.forEach(d => { addBarRow(d.label, byDec[d.key]||0, arbitrages.length, 'FF'+d.color.replace('#',''), 'FFF8F9FA'); });
  }

  addSpacer(12);
  // ── FOOTER ─────────────────────────────────────────────────────────────
  { const r = nextRow(20);
    sc(r.getCell(1), { v:'CBS \u2014 Capital Banking Solutions  \u00B7  Tableau de Bord \u2014 '+( {'arbitrages':'Arbitrages','actions':'Actions','gaps':'GAPs','risques':'Risques','gantt':'Retroplanning','perimetremodules':'P\u00E9rim\u00E8tre','analyse':'Analyse'}[tabId]||'Programme' )+'  \u00B7  Document Confidentiel',
      font:{ name:'Arial', italic:true, size:8, color:{argb:'FFFFFFFF'} },
      fill:'FF1F3864', align:{ vertical:'middle', horizontal:'center' } });
    fillRow(r, 2, NC, 'FF1F3864'); ws.mergeCells(currentRow, 1, currentRow, NC); }
}

/* ── Excel (XLSX) export with CBS header row ─────────────────────────── */
/* ── Excel (XLSX) export — Charte graphique CBS complète ─────────────── */
async function _cbsExportXLSX(headers, rows, filename, title, tabId) {
  if (typeof ExcelJS === 'undefined') { alert('Librairie ExcelJS non chargée.'); return; }

  const wb = new ExcelJS.Workbook();
  wb.creator    = 'CBS — Capital Banking Solutions';
  wb.lastModifiedBy = 'BOA CI Pilotage App';
  wb.created    = new Date();
  wb.modified   = new Date();

  // ── Onglet 1 : Tableau de Bord KPI (inséré en premier, spécifique au tab) ─
  _cbsBuildDashboardSheet(wb, tabId || '');

  const ws = wb.addWorksheet('Export CBS', {
    pageSetup: { paperSize: 9, orientation: headers.length > 7 ? 'landscape' : 'portrait',
                 fitToPage: true, fitToWidth: 1, fitToHeight: 0,
                 margins: { left: 0.5, right: 0.5, top: 0.75, bottom: 0.75 } },
    views: [{ state: 'frozen', ySplit: 5, xSplit: 0 }]
  });

  const nCols  = headers.length;
  const today  = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });

  /* ── Helpers ─────────────────────────────────────────────────────── */
  const thinGray   = { style: 'thin',   color: { argb: 'FFD0D3D4' } };
  const thinBlue   = { style: 'thin',   color: { argb: 'FF1F3864' } };
  const medRed     = { style: 'medium', color: { argb: 'FFE63329' } };
  const allThin    = { top: thinGray, left: thinGray, bottom: thinGray, right: thinGray };

  function styleCell(cell, opts) {
    if (opts.font)      cell.font      = opts.font;
    if (opts.fill)      cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: opts.fill } };
    if (opts.align)     cell.alignment = opts.align;
    if (opts.border)    cell.border    = opts.border;
    if (opts.numFmt)    cell.numFmt    = opts.numFmt;
  }

  /* ── Column widths (auto) ────────────────────────────────────────── */
  const allDataRows = [headers, ...rows];
  ws.columns = headers.map((h, ci) => ({
    key: 'c' + ci,
    width: Math.min(52, Math.max(11, Math.ceil(
      Math.max(...allDataRows.map(r => String(r[ci] ?? '').length)) * 1.05
    )))
  }));

  /* ── ROW 1 : Bandeau logo CBS (rouge) ───────────────────────────── */
  const r1 = ws.addRow(['CBS  —  Capital Banking Solutions']);
  r1.height = 34;
  const c1 = r1.getCell(1);
  styleCell(c1, {
    font:  { name: 'Arial', bold: true, size: 15, color: { argb: 'FFFFFFFF' } },
    fill:  'FFE63329',
    align: { vertical: 'middle', horizontal: 'left', indent: 2 }
  });
  // Remplir toutes les cellules de la ligne en rouge (pour le fond continu)
  for (let ci = 2; ci <= nCols; ci++) {
    styleCell(r1.getCell(ci), { fill: 'FFE63329' });
  }
  ws.mergeCells(1, 1, 1, nCols);

  /* ── ROW 2 : Nom du programme (bleu foncé) ──────────────────────── */
  const r2 = ws.addRow(['BOA CI  —  Pilotage Programme Upgrade IGOR V2 → V4']);
  r2.height = 22;
  const c2 = r2.getCell(1);
  styleCell(c2, {
    font:  { name: 'Arial', bold: true, size: 10, color: { argb: 'FFFFFFFF' } },
    fill:  'FF1F3864',
    align: { vertical: 'middle', horizontal: 'left', indent: 2 }
  });
  for (let ci = 2; ci <= nCols; ci++) {
    styleCell(r2.getCell(ci), { fill: 'FF1F3864' });
  }
  ws.mergeCells(2, 1, 2, nCols);

  /* ── ROW 3 : Titre du document + date + mention confidentiel ────── */
  const r3 = ws.addRow([title + '     |     Exporté le : ' + today + '     |     Document Confidentiel']);
  r3.height = 18;
  const c3 = r3.getCell(1);
  styleCell(c3, {
    font:  { name: 'Arial', italic: true, size: 9, color: { argb: 'FF1F3864' } },
    fill:  'FFEEF2F7',
    align: { vertical: 'middle', horizontal: 'left', indent: 2 },
    border: { bottom: thinBlue, left: thinBlue, right: thinBlue }
  });
  for (let ci = 2; ci <= nCols; ci++) {
    styleCell(r3.getCell(ci), {
      fill:   'FFEEF2F7',
      border: { bottom: thinBlue, right: thinBlue }
    });
  }
  ws.mergeCells(3, 1, 3, nCols);

  /* ── ROW 4 : Spacer ─────────────────────────────────────────────── */
  const r4 = ws.addRow([]);
  r4.height = 7;

  /* ── ROW 5 : En-têtes colonnes (bleu foncé, centré, bordures) ───── */
  const r5 = ws.addRow(headers);
  r5.height = 24;
  for (let ci = 1; ci <= nCols; ci++) {
    styleCell(r5.getCell(ci), {
      font:   { name: 'Arial', bold: true, size: 9, color: { argb: 'FFFFFFFF' } },
      fill:   'FF1F3864',
      align:  { vertical: 'middle', horizontal: 'center', wrapText: true },
      border: { top: medRed, left: thinGray, bottom: thinGray, right: thinGray }
    });
  }

  /* ── ROWS 6+ : Données (alternance blanc / gris clair CBS) ─────── */
  rows.forEach((row, ri) => {
    const isEven = ri % 2 === 1;
    const bgArgb = isEven ? 'FFF5F5F5' : 'FFFFFFFF';
    const dr = ws.addRow(row.map(v => (v == null ? '' : v)));
    dr.height = 16;
    for (let ci = 1; ci <= nCols; ci++) {
      const cell = dr.getCell(ci);
      styleCell(cell, {
        font:   { name: 'Arial', size: 9, color: { argb: 'FF1A1A1A' } },
        fill:   bgArgb,
        align:  { vertical: 'middle', horizontal: 'left', wrapText: true, indent: 1 },
        border: allThin
      });
    }
  });

  /* ── FOOTER ROW : total enregistrements ─────────────────────────── */
  const footerRow = ws.addRow([rows.length + ' enregistrement' + (rows.length > 1 ? 's' : '') + '  —  ' + title]);
  footerRow.height = 16;
  const fc1 = footerRow.getCell(1);
  styleCell(fc1, {
    font:   { name: 'Arial', italic: true, size: 8, color: { argb: 'FF54565A' } },
    fill:   'FFEEF2F7',
    align:  { vertical: 'middle', horizontal: 'left', indent: 2 },
    border: { top: thinBlue }
  });
  for (let ci = 2; ci <= nCols; ci++) {
    styleCell(footerRow.getCell(ci), {
      fill:   'FFEEF2F7',
      border: { top: thinBlue }
    });
  }
  ws.mergeCells(6 + rows.length, 1, 6 + rows.length, nCols);

  /* ── Téléchargement ──────────────────────────────────────────────── */
  const buffer = await wb.xlsx.writeBuffer();
  const blob   = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url    = URL.createObjectURL(blob);
  const a      = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
}

/* ── PDF export — Charte graphique CBS complète ─────────────────────── */
function _cbsExportPDF(headers, rows, filename, title) {
  if (typeof window.jspdf === 'undefined' && typeof jsPDF === 'undefined') {
    alert('Librairie PDF non chargée.'); return;
  }
  const { jsPDF: JPDF } = window.jspdf || { jsPDF };
  const isLandscape = headers.length > 6;
  const doc = new JPDF({ orientation: isLandscape ? 'landscape' : 'portrait', unit: 'mm', format: 'a4' });
  const pgW = doc.internal.pageSize.getWidth();
  const pgH = doc.internal.pageSize.getHeight();
  const today = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });

  // ── Fonction de dessin de l'en-tête CBS (répété sur chaque page) ──
  function drawCBSHeader() {
    // Bandeau rouge CBS logo
    doc.setFillColor(230, 51, 41);
    doc.rect(0, 0, pgW, 14, 'F');

    // Bloc "CBS" blanc à gauche
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(6, 2.5, 18, 9, 1, 1, 'F');
    doc.setTextColor(230, 51, 41);
    doc.setFontSize(10); doc.setFont('helvetica', 'bold');
    doc.text('CBS', 15, 8.8, { align: 'center' });

    // Texte "Capital Banking Solutions" à droite du bloc
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(9); doc.setFont('helvetica', 'bold');
    doc.text('Capital Banking Solutions', 28, 7, { baseline: 'middle' });
    doc.setFontSize(7.5); doc.setFont('helvetica', 'normal');
    doc.text('BOA CI  —  Programme Upgrade IGOR V2 → V4', 28, 11.5, { baseline: 'middle' });

    // Date en haut à droite
    doc.setFontSize(7); doc.setTextColor(255, 220, 215);
    doc.text(today, pgW - 6, 7, { align: 'right', baseline: 'middle' });
    doc.text('Document Confidentiel', pgW - 6, 11.5, { align: 'right', baseline: 'middle' });

    // Bandeau titre bleu foncé
    doc.setFillColor(31, 56, 100);
    doc.rect(0, 14, pgW, 9, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(8.5); doc.setFont('helvetica', 'bold');
    doc.text(title || filename, 6, 19.2, { baseline: 'middle' });

    // Ligne rouge séparatrice sous le titre
    doc.setDrawColor(230, 51, 41);
    doc.setLineWidth(0.5);
    doc.line(0, 23, pgW, 23);
  }

  // ── Fonction footer CBS ────────────────────────────────────────────
  function drawCBSFooter(pageNum, totalPages) {
    // Bandeau bleu foncé en bas
    doc.setFillColor(31, 56, 100);
    doc.rect(0, pgH - 9, pgW, 9, 'F');
    // Ligne rouge au dessus du footer
    doc.setDrawColor(230, 51, 41);
    doc.setLineWidth(0.6);
    doc.line(0, pgH - 9, pgW, pgH - 9);
    // Texte footer
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(7); doc.setFont('helvetica', 'normal');
    doc.text('CBS — Capital Banking Solutions  •  Confidentiel  •  BOA CI Pilotage Programme IGOR V4', 6, pgH - 3.5);
    doc.setFont('helvetica', 'bold');
    doc.text('Page ' + pageNum + (totalPages ? ' / ' + totalPages : ''), pgW - 6, pgH - 3.5, { align: 'right' });
  }

  // ── Première page : en-tête ────────────────────────────────────────
  drawCBSHeader();

  // ── Tableau ───────────────────────────────────────────────────────
  doc.autoTable({
    head:    [headers],
    body:    rows.map(r => r.map(v => v == null ? '' : String(v))),
    startY:  26,
    margin:  { left: 6, right: 6, bottom: 13 },
    tableWidth: 'auto',
    styles: {
      font: 'helvetica', fontSize: 7.5, cellPadding: { top: 2.5, right: 3, bottom: 2.5, left: 3 },
      overflow: 'linebreak', valign: 'middle', lineColor: [208, 211, 212], lineWidth: 0.2
    },
    headStyles: {
      fillColor: [31, 56, 100], textColor: [255, 255, 255],
      fontStyle: 'bold', fontSize: 8, halign: 'center',
      lineWidth: 0.3, lineColor: [230, 51, 41]
    },
    bodyStyles:            { textColor: [26, 26, 26] },
    alternateRowStyles:    { fillColor: [245, 245, 245] },
    columnStyles:          { 0: { halign: 'center', cellWidth: 'auto' } },
    didDrawPage: (data) => {
      // Réafficher l'en-tête sur les pages suivantes
      if (data.pageNumber > 1) drawCBSHeader();
      drawCBSFooter(data.pageNumber);
    }
  });

  // ── Mettre à jour le footer de la 1ère page avec le total de pages ─
  const totalPages = doc.internal.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    drawCBSFooter(i, totalPages);
  }

  doc.save(filename);
}

/* ── Data getters — dispatch ─────────────────────────────────────────── */
function _cbsGetExportData(tabId) {
  switch (tabId) {
    case 'arbitrages':   return _cbsGetArbitragesData();
    case 'actions':      return _cbsGetActionsData();
    case 'gaps':         return _cbsGetGapsData();
    case 'risques':      return _cbsGetRisquesData();
    case 'gantt':        return _cbsGetGanttData();
    case 'perimetremodules': return _cbsGetPerimetreData();
    case 'analyse':      return _cbsGetTcdData();
    case 'interfaces':   return _cbsGetInterfacesData();
    case 'archi':        return _cbsGetArchiData();
    default:             return null;
  }
}

/* ── Arbitrages ─────────────────────────────────────────────────────── */
function _cbsGetArbitragesData() {
  const decLabels = {}; _getArbDecisions().forEach(d => { decLabels[d.key] = d.icon + ' ' + d.label; });
  const headers = ['N°','Domaine','Source de la demande','Développement Spécifique','Priorité','Deadline','Responsable','Décision','Commentaire'];
  const allArbs = [...arbitrages, ...(state.customArbitrages||[])];
  const rows = allArbs.map(a => {
    const s = state.arbitrages[a.id] || {};
    return [
      a.id,
      s.domain   || a.domain   || '',
      s.source   || a.source   || '',
      s.label    || a.label    || '',
      s.prio     || a.prio     || '',
      s.deadline || a.deadline || '',
      s.resp     || a.resp     || '',
      decLabels[s.decision || _getArbDefaultKey()] || s.decision || '',
      s.commentaire || ''
    ];
  });
  const _arbCount = allArbs.length;
  return { title: 'Suivi Arbitrages — ' + _arbCount + ' Développements Spécifiques BOA', headers, rows };
}

/* ── Actions ────────────────────────────────────────────────────────── */
function _cbsGetActionsData() {
  const ragLabels = { R:'🔴 Rouge', A:'🟡 Ambre', G:'🟢 Vert', X:'⬜ Non défini' };
  const headers = ['ID','Domaine','Action','Responsable','Échéance','Urgence','RAG','% Avancement','Date Fin','Assigné à','Notes'];
  const projectActions = Array.isArray(state.customActions) ? state.customActions : [];
  const rows = projectActions.map(a => {
    const s = state.actions[a.id] || {};
    return [a.id, a.domain, a.action, a.resp, a.echeance, a.urgence,
      ragLabels[s.rag || _actionStatusToLegacyRag(s.status) || 'X'] || s.rag || s.status || '',
      (s.pct != null ? s.pct + '%' : '0%'),
      s.dateFin || '', s.assignee || '', s.note || ''];
  });
  const _actCount = projectActions.length;
  return { title: 'Plan d\'Actions — ' + _actCount + ' Actions', headers, rows };
}

/* ── GAPs ───────────────────────────────────────────────────────────── */
function _cbsGetGapsData() {
  const headers = ['N°','GAP ID','Domaine','Processus','Description','Priorité CBS','Priorité BOA','Phase BOA','Bank Model','Responsable','Statut CBS','Décision BOA','Notes','Commentaire'];
  const rows = gaps.map(g => {
    const s = state.gaps[g.ref] || {};
    return [g.n, g.ref, g.domain, g.processus, g.desc,
      g.prio_cbs, g.prio, g.phase, g.bm, g.resp, g.statut,
      s.decision || '', s.note || '', g.commentaire || ''];
  });
  const _gapCount = gaps.length + (state.customGaps||[]).length;
  return { title: 'Matrice des ' + _gapCount + ' GAPs — Arbitrage & Suivi', headers, rows };
}

/* ── Risques ────────────────────────────────────────────────────────── */
function _cbsGetRisquesData() {
  const headers = ['ID','Titre','Domaine','Probabilité','Impact','Criticité','Statut','Plan de mitigation','Propriétaire','Date détection'];
  const rows = (state.risks || []).map(r => [
    r.id || '', r.title || '', r.domain || '',
    r.proba || '', r.impact || '', r.crit || '',
    r.statut || '', r.mitigation || '', r.owner || '', r.dateDetect || ''
  ]);
  return { title: 'Registre des Risques — BOA CI Upgrade IGOR V4', headers, rows };
}

/* ── Interfaces Techniques ──────────────────────────────────────────── */
function _cbsGetInterfacesData() {
  const statusLabels = { done: 'Terminé', partial: 'Partiel', pending_boa: 'Pending BOA', pending_cbs: 'Pending CBS' };
  const impactLabels = { no_impact: 'No Impact', minor: '1 Impact', multiple: 'Multiple Impacts', tbd: 'TBD' };
  const headers = ['Interface', 'Responsable', 'Date cible', 'Statut analyse', 'Impact', 'Commentaires'];
  const ifaces = (state.technique && state.technique.interfaces) ? state.technique.interfaces : getTechInterfaces();
  const rows = ifaces.map(i => [
    i.name || '',
    i.owner || '',
    i.deadline || '',
    statusLabels[i.status] || i.status || '',
    impactLabels[i.impact] || i.impact || '',
    (i.comments || []).map(c => c.text || '').join(' | ')
  ]);
  return { title: 'Gestion des Interfaces — BOA CI Upgrade IGOR V4', headers, rows };
}

/* ── Architecture & Environnements ─────────────────────────────────── */
function _cbsGetArchiData() {
  const domainLabels = { infra: 'Infrastructure', data: 'Data / Migration', secu: 'Sécurité', reseau: 'Réseau', autre: 'Autre' };
  const envLabels    = { all: 'Tous / Transverse', DEV: 'DEV', REC: 'REC', UAT: 'UAT', PROD: 'PROD', TRANSVERSE: 'Transverse' };
  const headers = ['Titre', 'Environnement', 'Domaine', 'Description', 'Nb Actions', 'Créé le'];
  const archis = (state.technique && state.technique.archi) ? state.technique.archi : [];
  const rows = archis.map(a => [
    a.title || '',
    envLabels[a.env] || a.env || '',
    domainLabels[a.domain] || a.domain || '',
    a.desc || '',
    (a.actions || []).length,
    a.createdAt ? a.createdAt.slice(0, 10) : ''
  ]);
  return { title: 'Architecture & Environnements — BOA CI Upgrade IGOR V4', headers, rows };
}

/* ── Gantt / Planning ───────────────────────────────────────────────── */
function _cbsGetGanttData() {
  const allTasks = [...ganttTasks, ...(state.ganttCustom || [])];
  const typeLabels = { phase: 'Phase', task: 'Tâche', jalon: 'Jalon' };
  const headers = ['ID','Type','Libellé','Phase','Début','Fin','Durée (j)','Resp.','% Avancement','Prédécesseurs'];
  const rows = allTasks.map(t => {
    const ov  = (state.ganttOverrides || {})[t.id] || {};
    const subs = (!['phase','jalon'].includes(t.type)) ? ((state.ganttSubtasks || {})[t.id] || []) : [];
    const pct  = subs.length
      ? Math.round(subs.reduce((s, sb) => s + (sb.pct || 0), 0) / subs.length)
      : (ov._pct != null ? ov._pct : Math.round((t.pct || 0) * 100));
    return [t.id, typeLabels[t.type] || t.type, t.label, t.phase || '',
      ov._start || t.start || '', ov._end || t.end || '',
      t.dur || '', t.owner || '', pct + '%',
      (t.pred || []).join(', ')];
  });
  return { title: 'Retroplanning Gantt — BOA CI Upgrade IGOR V4', headers, rows };
}

/* ── Périmètre Modules ──────────────────────────────────────────────── */
function _cbsGetPerimetreData() {
  const perim = state.perimeter && state.perimeter.length ? state.perimeter : DEFAULT_PERIMETER;
  const headers = ['Domaine','Module / Sous-module','Version cible','Fonctionnalités','Impact Dév.','Impact Migration','BM#1','Commentaire'];
  const rows = perim.map(p => [
    p.domaine || '', p.sousModule || '', p.version || '',
    p.fonctionnalites || '', p.impactDev || '', p.impactMigration || '',
    p.bm1 || '', p.commentaire || ''
  ]);
  return { title: 'Périmètre Modules — BOA CI Upgrade IGOR V2 → V4', headers, rows };
}

/* ── TCD (last rendered pivot) ──────────────────────────────────────── */
function _cbsGetTcdData() {
  const d = window._lastTcdData;
  if (!d) { alert('Générez d\'abord un tableau croisé.'); return null; }
  const { rowVals, colVals, result, colTotals, rowField, colField, fmt } = d;
  const headers = [rowField + (colField && colField !== '(aucune)' ? ' / ' + colField : ''), ...colVals, 'Total'];
  const rows = rowVals.map(rv =>
    [rv, ...colVals.map(cv => fmt(result[rv][cv])), fmt(result[rv]['__rowTotal__'])]
  );
  rows.push(['Total', ...colVals.map(cv => fmt(colTotals[cv])), fmt(colTotals['__grandTotal__'])]);
  return { title: 'Tableaux Croisés Dynamiques — Analyse Programme BOA CI', headers, rows };
}

// ════════════════════════════════════════════════════════════════════════
// GAPS CSV LEGACY (kept for backward compat)
// ════════════════════════════════════════════════════════════════════════
function exportGapsCSV() {
  const headers = ['N°','GAP ID','Domaine','Processus','Description','Priorité CBS','Priorité BOA','Phase BOA','Bank Model BOA','Responsable','Statut CBS','Décision BOA','Notes','Commentaire BOA 27/02'];
  const rows = gaps.map(g => [
    g.n, g.ref, g.domain, g.processus, `"${g.desc}"`,
    g.prio_cbs, g.prio, g.phase, g.bm, g.resp, g.statut,
    (state.gaps[g.ref]||{}).decision||'',
    `"${((state.gaps[g.ref]||{}).note||'').replace(/"/g,"'")}"`,
    `"${g.commentaire}"`
  ]);
  const csv = [headers, ...rows].map(r => r.join(';')).join('\n');
  const blob = new Blob(['\ufeff' + csv], {type:'text/csv;charset=utf-8'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const _csvGapCount = gaps.length + (state.customGaps||[]).length;
  a.href = url; a.download = 'BOA_GAPs_' + _csvGapCount + '_' + new Date().toISOString().slice(0,10).replace(/-/g,'') + '.csv'; a.click();
  URL.revokeObjectURL(url);
}

// ════════════════════════════════════════════════════════════════════════
// UTILS
// ════════════════════════════════════════════════════════════════════════

function printSection(tabId) {
  window.print();
}

// ════════════════════════════════════════════════════════════════════════
// INIT
// ════════════════════════════════════════════════════════════════════════

// ─────────────────────────────────────────────────────────────────────────
// APP INIT — called after successful auth
// ─────────────────────────────────────────────────────────────────────────
//** Affiche une bannière d'erreur/avertissement Supabase persistante en haut de page */
function _showOfflineBanner(msg, blocking) {
  let banner = document.getElementById('offline-banner');
  if (!banner) {
    banner = document.createElement('div');
    banner.id = 'offline-banner';
    Object.assign(banner.style, {
      position:'fixed', top:'0', left:'0', right:'0', zIndex:'99999',
      padding:'10px 20px', fontSize:'13px', fontWeight:'600',
      display:'flex', alignItems:'center', justifyContent:'space-between', gap:'12px',
      boxShadow:'0 2px 8px rgba(0,0,0,.2)'
    });
    if (!blocking) {
      const closeBtn = document.createElement('button');
      closeBtn.textContent = 'x';
      closeBtn.addEventListener('click', function() { banner.style.display = 'none'; });
      Object.assign(closeBtn.style, {
        background:'rgba(255,255,255,.2)', border:'1px solid rgba(255,255,255,.4)',
        color:'white', borderRadius:'4px', padding:'2px 10px', cursor:'pointer',
        fontSize:'12px', flexShrink:'0'
      });
      banner._closeBtn = closeBtn;
    }
    document.body.appendChild(banner);
  }
  banner.style.background = blocking ? '#b71c1c' : '#92400e';
  banner.style.color = 'white';
  const span = document.createElement('span');
  span.textContent = msg;
  banner.innerHTML = '';
  banner.appendChild(span);
  if (!blocking && banner._closeBtn) banner.appendChild(banner._closeBtn);
}

// Helper: promesse avec timeout
function _withTimeout(promise, ms, label) {
  const timeout = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('Timeout ' + ms + 'ms — ' + label)), ms)
  );
  return Promise.race([promise, timeout]);
}

function _appStateRpcArgs() {
  if (!currentSession || !currentSession.username || !currentSession.hash) {
    throw new Error('Session applicative absente');
  }
  return {
    p_username: currentSession.username,
    p_password_hash: currentSession.hash
  };
}

async function _loadProjectStateCloud() {
  const args = _appStateRpcArgs();
  const { data, error } = await API.rpc('app_state_get', args);
  return { data, error };
}

async function _saveProjectStateCloud(label) {
  if (!API) return false;
  const args = _appStateRpcArgs();
  // Tagger l'onglet source pour ignorer uniquement notre propre écho (pas les autres onglets du même user)
  const stateToSave = Object.assign({}, state, {
    _rtSavedBy:    currentSession ? currentSession.username : null,
    _rtSavedTabId: _RT_TAB_ID,
    _rtSavedAt:    Date.now()
  });
  const { data, error } = await API.rpc('app_state_save', {
    ...args,
    p_state: stateToSave
  });
  if (error) {
    console.warn((label || 'Project state save') + ' error:', error.message);
    window._sbWriteOK = false;
    return false;
  }
  return data === true;
}

// ── Chargement des référentiels depuis app_defaults (Supabase) ────────────────
async function _loadDefault(key, assignFn, label) {
  if (!API) return false;
  try {
    const { data, error } = await _withTimeout(
      API.from('app_defaults').select('data').eq('key', key).single(),
      8000, 'chargement ' + key
    );
    if (error || !data || !Array.isArray(data.data) || data.data.length === 0) {
      console.warn('[app_defaults] ' + key + ' non disponible — fallback local utilisé.');
      return false;
    }
    assignFn(data.data);
    console.log('[app_defaults] ' + data.data.length + ' ' + label + ' chargés depuis Supabase.');
    return true;
  } catch(e) {
    console.warn('[app_defaults] Impossible de charger ' + key + ':', e.message || e);
    return false;
  }
}

async function loadGapsFromSupabase() {
  return _loadDefault('gaps', d => { gaps = d; }, 'GAPs');
}

async function loadPerimeterFromSupabase() {
  return _loadDefault('default_perimeter', d => { DEFAULT_PERIMETER = d; }, 'modules périmètre');
}

async function loadGanttFromSupabase() {
  return _loadDefault('gantt_tasks', d => { ganttTasks = d; }, 'tâches Gantt');
}

async function loadGanttSubtasksDefaultFromSupabase() {
  if (!API) return false;
  try {
    const { data, error } = await _withTimeout(
      API.from('app_defaults').select('data').eq('key','gantt_subtasks_default').single(),
      8000, 'chargement gantt_subtasks_default'
    );
    if (error || !data || !data.data || typeof data.data !== 'object' || Array.isArray(data.data)) {
      console.warn('[app_defaults] gantt_subtasks_default non disponible.');
      return false;
    }
    ganttSubtasksDefault = data.data;
    console.log('[app_defaults] Sous-tâches Gantt par défaut chargées (' + Object.keys(ganttSubtasksDefault).length + ' tâches parentes).');
    return true;
  } catch(e) {
    console.warn('[app_defaults] Impossible de charger gantt_subtasks_default:', e.message || e);
    return false;
  }
}

async function loadArbitragesFromSupabase() {
  return _loadDefault('arbitrages', d => { arbitrages = d; }, 'arbitrages');
}

async function loadActionsFromSupabase() {
  return _loadDefault('actions', d => { actions = d; }, 'actions');
}

async function loadInterfacesFromSupabase() {
  return _loadDefault('interfaces', d => { DEFAULT_INTERFACES = d; }, 'interfaces techniques');
}

async function loadOwnersFromSupabase() {
  if (!API) return false;
  try {
    const { data, error } = await _withTimeout(
      API.from('app_defaults').select('data').eq('key','owners').single(),
      8000, 'chargement owners'
    );
    if (error || !data || !Array.isArray(data.data)) return false;
    if (!state.shared) state.shared = { owners: [], streams: [] };
    if (!state.shared.owners || state.shared.owners.length === 0) {
      _setOwnerRecords(data.data);
    }
    console.log('[app_defaults] ' + data.data.length + ' owners chargés depuis Supabase.');
    return true;
  } catch(e) { console.warn('[app_defaults] owners:', e.message); return false; }
}

// ─── SAUVEGARDE vers app_defaults (Supabase) ──────────────────────────────────
async function _saveAppDefault(key, data) {
  if (!API) return false;
  try {
    const args = _appStateRpcArgs();
    const { error } = await API.rpc('app_default_save', {
      ...args,
      p_key: key,
      p_data: data
    });
    if (error) { console.warn('[app_defaults] écriture (' + key + '):', error.message); return false; }
    console.log('[app_defaults] ' + key + ' sauvegardé (' + (Array.isArray(data) ? data.length + ' items' : typeof data) + ').');
    return true;
  } catch(e) { console.warn('[app_defaults] save (' + key + '):', e.message); return false; }
}

// ─── UTILITAIRES HISTORIQUE ────────────────────────────────────────────────────
function _getHistoryUser() {
  if (state.loginLogs && state.loginLogs.length > 0) {
    const last = state.loginLogs[state.loginLogs.length - 1];
    return last.user || last.email || 'Utilisateur';
  }
  return 'Utilisateur';
}

function _pushHistory(item, action, changes) {
  if (!item._history) item._history = [];
  item._history.push({
    ts: new Date().toISOString(),
    user: _getHistoryUser(),
    action: action,
    changes: changes || []
  });
}

function _diffFields(oldItem, newItem, fieldLabels) {
  const changes = [];
  Object.entries(fieldLabels).forEach(function([field, label]) {
    const oldVal = String(oldItem[field] || '');
    const newVal = String(newItem[field] || '');
    if (oldVal !== newVal) changes.push({ field, label, old: oldVal, new: newVal });
  });
  return changes;
}

// ── Lookup history par type + ID (évite la sérialisation JSON dans les onclick) ──
function showGapHistory(ref, evt) {
  if (evt) { evt.stopPropagation(); evt.preventDefault(); }
  if (typeof DB !== 'undefined' && sb) {
    DB.loadHistory('gap', null).then(function(hist) {
      const filtered = hist.filter(function(h){ return h.entity_ref === ref; });
      const mapped = filtered.map(function(h){
        return { ts: h.changed_at, user: h.changed_by, action: h.action_type, changes: h.changes||[] };
      });
      const local = (function(){
        const item = (state.customGaps||[]).find(function(g){ return g.ref === ref; })
                  || (gaps||[]).find(function(g){ return g.ref === ref; });
        return item ? (item._history||[]) : [];
      })();
      showItemHistory(mapped.length > 0 ? mapped : local, ref);
    });
    return;
  }
  const item = (state.customGaps||[]).find(function(g){ return g.ref === ref; })
            || (gaps||[]).find(function(g){ return g.ref === ref; });
  showItemHistory(item ? (item._history||[]) : [], ref);
}
function showArbitrageHistory(id, evt) {
  if (evt) { evt.stopPropagation(); evt.preventDefault(); }
  const item = (state.customArbitrages||[]).find(function(a){ return String(a.id) === String(id); })
            || (arbitrages||[]).find(function(a){ return String(a.id) === String(id); });
  const title = item ? (item.label||id) : id;
  if (typeof DB !== 'undefined' && sb) {
    DB.loadHistory('arbitrage', id).then(function(hist) {
      const mapped = hist.map(function(h){
        return { ts: h.changed_at, user: h.changed_by, action: h.action_type, changes: h.changes||[] };
      });
      const local = item ? (item._history||[]) : [];
      showItemHistory(mapped.length > 0 ? mapped : local, title);
    });
    return;
  }
  showItemHistory(item ? (item._history||[]) : [], title);
}
function showActionHistory(id, evt) {
  if (evt) { evt.stopPropagation(); evt.preventDefault(); }
  const item = (state.customActions||[]).find(function(a){ return a.id === id; })
            || (actions||[]).find(function(a){ return a.id === id; });
  const title = item ? (item.action||id) : id;
  if (typeof DB !== 'undefined' && sb) {
    DB.loadHistory('action', null).then(function(hist) {
      const filtered = hist.filter(function(h){ return h.entity_ref === id; });
      const mapped = filtered.map(function(h){
        return { ts: h.changed_at, user: h.changed_by, action: h.action_type, changes: h.changes||[] };
      });
      const local = item ? (item._history||[]) : [];
      showItemHistory(mapped.length > 0 ? mapped : local, title);
    });
    return;
  }
  showItemHistory(item ? (item._history||[]) : [], title);
}

function showItemHistory(historyArr, title) {
  const modal = document.getElementById('item-history-modal');
  const titleEl = document.getElementById('item-history-title');
  const bodyEl  = document.getElementById('item-history-body');
  if (!modal) return;
  titleEl.textContent = 'Historique — ' + title;
  if (!historyArr || historyArr.length === 0) {
    bodyEl.innerHTML = '<div style="text-align:center;padding:40px 20px;">'
      + '<div style="font-size:36px;margin-bottom:14px;opacity:.6;">🕐</div>'
      + '<div style="font-size:14px;font-weight:700;color:#e2e8f0;margin-bottom:8px;">Aucun historique enregistré</div>'
      + '<div style="font-size:12px;color:#64748b;max-width:320px;margin:0 auto;line-height:1.5;">L\'historique sera tracé automatiquement dès la prochaine modification de cet élément (champs modifiés, date, utilisateur).</div>'
      + '</div>';
  } else {
    const sorted = [...historyArr].sort(function(a,b){ return new Date(b.ts) - new Date(a.ts); });
    bodyEl.innerHTML = sorted.map(function(entry) {
      const dt = new Date(entry.ts);
      const dtStr = dt.toLocaleDateString('fr-FR') + ' à ' + dt.toLocaleTimeString('fr-FR', {hour:'2-digit', minute:'2-digit'});
      const actionLabel = {created:'Créé', updated:'Modifié', deleted:'Supprimé'}[entry.action] || entry.action;
      const dotColor   = {created:'#22c55e', updated:'#3b82f6', deleted:'#ef4444'}[entry.action] || '#64748b';
      const changesHtml = (entry.changes || []).map(function(c) {
        return '<div style="margin:5px 0 5px 12px;font-size:12px;">'
          + '<span style="color:#94a3b8;">' + (c.label || c.field) + ' :</span> '
          + '<span style="color:#f87171;text-decoration:line-through;">' + (c.old || '—') + '</span>'
          + '<span style="color:#64748b;"> → </span>'
          + '<span style="color:#4ade80;">' + (c.new || '—') + '</span>'
          + '</div>';
      }).join('');
      return '<div style="border-left:2px solid #334155;padding:8px 8px 10px 20px;margin-bottom:14px;position:relative;">'
        + '<div style="position:absolute;left:-6px;top:12px;width:10px;height:10px;border-radius:50%;background:' + dotColor + ';"></div>'
        + '<div style="display:flex;justify-content:space-between;align-items:baseline;gap:8px;">'
        + '<span style="font-size:13px;font-weight:700;color:#e2e8f0;">' + actionLabel + '</span>'
        + '<span style="font-size:11px;color:#64748b;white-space:nowrap;">' + dtStr + '</span>'
        + '</div>'
        + '<div style="font-size:12px;color:#64748b;margin-top:2px;">par ' + (entry.user || 'Utilisateur') + '</div>'
        + changesHtml
        + '</div>';
    }).join('');
  }
  modal.style.display = 'block';
}

async function loadStreamsFromSupabase() {
  if (!API) return false;
  try {
    const { data, error } = await _withTimeout(
      API.from('app_defaults').select('data').eq('key','streams').single(),
      8000, 'chargement streams'
    );
    if (error || !data || !Array.isArray(data.data)) return false;
    if (!state.shared) state.shared = { owners: [], streams: [] };
    if (!state.shared.streams || state.shared.streams.length === 0) {
      state.shared.streams = data.data;
    }
    console.log('[app_defaults] ' + data.data.length + ' streams chargés depuis Supabase.');
    return true;
  } catch(e) { console.warn('[app_defaults] streams:', e.message); return false; }
}

async function initApp(isRetry) {
  window._boaInitializing = true;
  const syncEl = document.getElementById('sync-status');
  const setSync = (icon, text, color, bg, showRetry) => {
    if (!syncEl) return;
    syncEl.innerHTML = icon + '\u00A0' + text +
      (showRetry ? ' <button onclick="retryConnection()" title="Relancer la connexion" style="margin-left:5px;background:none;border:1px solid currentColor;border-radius:4px;padding:1px 6px;font-size:10px;cursor:pointer;font-weight:700;color:inherit;">&#x21BA;</button>' : '');
    syncEl.style.color = color;
    syncEl.style.background = bg;
    syncEl.title = text;
  };

  if (!isRetry) setSync('\u23F3', 'Connexion\u2026', '#1565c0', '#e3f2fd', false);

  if (!API) {
    // Supabase non disponible — mode local
    const reason = (SUPABASE_URL === 'YOUR_SUPABASE_URL')
      ? 'Clés Supabase non configurées'
      : 'Librairie Supabase introuvable (CDN\u00A0?)';
    // ── Supabase non configuré — mode local uniquement ──────────────────────
    const localSaved = localStorage.getItem('boa_v4_state');
    if (localSaved) {
      try { applyParsedState(JSON.parse(localSaved)); } catch(e) {}
    }
    setSync('\uD83D\uDCBE', 'Mode local — données non synchronisées', '#b45309', '#fef3c7', false);
    _showOfflineBanner('Supabase non configuré — ' + reason + '. Les modifications ne seront pas sauvegardées dans le cloud.');
    console.warn('Supabase non disponible:', reason);
    window._sbWriteOK = false;
  } else {
    try {
      // ── Lecture de l'état depuis Supabase ────────────────────────────────
      const { data: rData, error: rErr } = await _withTimeout(
        _loadProjectStateCloud(),
        8000, 'lecture Supabase'
      );

      if (rErr && rErr.code !== 'PGRST116') {
        // Erreur réelle (pas juste "row not found") → fallback localStorage avec avertissement
        const localSaved = localStorage.getItem('boa_v4_state');
        if (localSaved) {
          try { applyParsedState(JSON.parse(localSaved)); } catch(e) {}
          setSync('\u26A0\uFE0F', 'Mode hors ligne (cache local)', '#b45309', '#fef3c7', true);
          _showOfflineBanner('\u26A0\uFE0F Connexion Supabase impossible (' + (rErr.message||'').substring(0,60) + '). Données chargées depuis le cache local — les modifications ne seront pas sauvegardées.');
        } else {
          // Pas de cache → bloquer avec message d'erreur clair
          setSync('\u26D4', 'Connexion impossible — aucune donnée locale', '#b71c1c', '#ffebee', true);
          _showOfflineBanner('\u26D4 Impossible de se connecter à Supabase et aucune donnée locale trouvée. Vérifiez votre connexion réseau et relancez la page.', true);
        }
        window._sbWriteOK = false;
      } else {
        // Lecture OK (ou row inexistante pour un premier démarrage)
        if (rData && Object.keys(rData).length > 0) {
          applyParsedState(rData);
        } else {
          // Première utilisation — state vide est correct
          const localSaved = localStorage.getItem('boa_v4_state');
          if (localSaved) { try { applyParsedState(JSON.parse(localSaved)); } catch(e) {} }
        }

        // ── Ne jamais écrire au démarrage : la première écriture aura lieu lors d'une vraie modification utilisateur.
        const canWriteCloud = currentSession && (currentSession.role === 'editor' || currentSession.role === 'admin');
        const wErr = null;

        if (wErr) {
          const code = wErr.code || '';
          const msg  = wErr.message || 'Erreur inconnue';
          console.error('Supabase write error:', code, msg);
          const hint = code === '42501' ? 'RLS: permission refus\u00e9e'
                     : msg.includes('pause') || msg.includes('503') ? 'Projet Supabase en pause\u00A0?'
                     : code + ': ' + msg.substring(0, 35);
          setSync('\u26D4', hint, '#b71c1c', '#ffebee', true);
          _showOfflineBanner('\u26D4 Lecture OK mais \u00e9criture impossible (' + hint + '). Vos modifications ne seront pas sauvegard\u00e9es dans le cloud.');
          window._sbWriteOK = false;
        } else {
          window._sbWriteOK = !!canWriteCloud;
          setSync('\u2601\uFE0F', canWriteCloud ? 'Cloud sync OK' : 'Cloud lecture seule', '#2e7d32', '#e8f5e9', false);

          // Temps réel — un seul canal pour éviter de dépasser la limite Supabase
          if (!window._boaRealtimeChannel) {
            window._boaRealtimeChannel = (SupabaseAdapter.isReady() ? SupabaseAdapter.getClient().channel('boa_state') : null)
              .on('postgres_changes',
                { event: 'UPDATE', schema: 'public', table: 'project_state' },
                payload => {
                  console.log('[Realtime] UPDATE reçu sur project_state', {
                    hasNew: !!payload.new,
                    keys: payload.new ? Object.keys(payload.new) : [],
                    hasStateData: !!(payload.new && payload.new.state_data)
                  });
                  if (!payload.new || !payload.new.state_data) {
                    console.warn('[Realtime] payload.new.state_data absent — colonnes reçues:', payload.new ? Object.keys(payload.new) : 'aucune');
                    return;
                  }

                  // ── 1. Anti-écho : ignorer uniquement notre propre onglet ───
                  const rtTabId = payload.new.state_data._rtSavedTabId;
                  const rtAt    = payload.new.state_data._rtSavedAt || 0;
                  const rtBy    = payload.new.state_data._rtSavedBy;
                  if (rtTabId && rtTabId === _RT_TAB_ID && (Date.now() - rtAt) < 15000) {
                    return; // Écho de notre propre onglet — on ignore
                  }

                  // ── 2. Protection modale : ne pas écraser si édition en cours ─
                  const authorName = rtBy || 'Un collègue';
                  if (_realtimeIsModalOpen()) {
                    window._realtimePendingPayload = payload;
                    _realtimeShowPendingBanner(authorName);
                    return;
                  }

                  // ── 3. Appliquer + notifier ───────────────────────────────────
                  _realtimeApplyPayload(payload, authorName);
                }
              ).subscribe((status, err) => {
                console.log('[Realtime] statut canal boa_state:', status, err || '');
              });
          }
        }
      }
    } catch(e) {
      console.error('Supabase exception:', e);
      const isTimeout = e.message && e.message.startsWith('Timeout');
      const hint = isTimeout ? 'D\u00e9lai d\u00e9pass\u00e9 — r\u00e9seau ou projet Supabase en pause'
                             : (e.message ? e.message.substring(0, 60) : 'Exception inconnue');
      setSync('\u26D4', hint, '#b71c1c', '#ffebee', true);
      window._sbWriteOK = false;
      // Fallback localStorage — afficher une bannière d'avertissement visible
      const localSaved = localStorage.getItem('boa_v4_state');
      if (localSaved) {
        try { applyParsedState(JSON.parse(localSaved)); } catch(ex) {}
        _showOfflineBanner('\u26D4 ' + hint + '. Donn\u00e9es charg\u00e9es depuis le cache local — les modifications ne seront PAS sauvegard\u00e9es.', false);
      } else {
        _showOfflineBanner('\u26D4 ' + hint + '. Aucune donn\u00e9e locale disponible. V\u00e9rifiez votre connexion et rechargez la page.', true);
      }
    }
  }
  // Charger les référentiels depuis Supabase (app_defaults) — fallback local si indisponible
  if (sb) await Promise.all([
    loadGapsFromSupabase(),
    loadPerimeterFromSupabase(),
    loadGanttFromSupabase(),
    loadGanttSubtasksDefaultFromSupabase(),
    loadArbitragesFromSupabase(),
    loadActionsFromSupabase(),
    loadInterfacesFromSupabase(),
    loadOwnersFromSupabase(),
    loadStreamsFromSupabase()
  ]);
  // Charger depuis les tables relationnelles v2 (prioritaires sur app_defaults)
  if (API && typeof DB !== 'undefined') {
    try {
      await DB.loadAll();
      // NE PAS appeler DB.subscribeAll() — crée trop de canaux realtime (dépasse la limite Supabase)
      // Le canal boa_state (project_state) suffit pour la synchronisation multi-onglets
      console.log('[DB v2] tables relationnelles chargées.');
    } catch(e) {
      console.warn('[DB v2] chargement tables:', e.message);
    }
  }

  // Initialiser les sous-tâches par défaut — tâche par tâche (merge, pas remplacement global)
  if (ganttSubtasksDefault && Object.keys(ganttSubtasksDefault).length > 0) {
    if (!state.ganttSubtasks) state.ganttSubtasks = {};
    let _subsApplied = 0;
    Object.keys(ganttSubtasksDefault).forEach(function(taskId) {
      if (!state.ganttSubtasks[taskId] || state.ganttSubtasks[taskId].length === 0) {
        state.ganttSubtasks[taskId] = JSON.parse(JSON.stringify(ganttSubtasksDefault[taskId]));
        _subsApplied++;
      }
    });
    if (_subsApplied > 0) {
      console.log('[Gantt] ' + _subsApplied + ' tâche(s) enrichie(s) avec sous-tâches par défaut.');
      saveState('init_subtasks_default');
    }
  }

  countdowns();
  _enrichDomainMaps();
  _populateDomainFilterSelects();
  renderDashboard();
  renderArbitrages();
  renderActions();
  renderGaps();
  const _ct = document.getElementById('gantt-chain-toggle');
  if (_ct) _ct.checked = !!state.ganttChain;
  if (!state.ganttCollapsed) state.ganttCollapsed = {};
  applyRoleUI();

  // ── Auto-refresh dashboard toutes les 60s (filet de sécurité) ────────────
  if (!window._dashAutoRefresh) {
    window._dashAutoRefresh = setInterval(() => {
      const dashTab = document.getElementById('tab-dashboard');
      if (dashTab && dashTab.classList.contains('active')) {
        renderDashboard();
      }
    }, 60000);
  }
  window._boaInitializing = false;
}

// ════════════════════════════════════════════════════════
// DÉMARRAGE DIRECT (sans authentification)
// ════════════════════════════════════════════════════════
currentRole = 'owner';

async function retryConnection() {
  const syncEl = document.getElementById('sync-status');
  if (syncEl) {
    syncEl.innerHTML = '\u23F3\u00A0Reconnexion\u2026';
    syncEl.style.color = '#1565c0';
    syncEl.style.background = '#e3f2fd';
  }
  // Réinitialisation du client gérée par api.js — aucune action requise ici
  await initApp(true);
  renderDashboard(); renderArbitrages(); renderActions(); renderGaps();
}

// ─── AUTHENTIFICATION (Supabase multi-utilisateurs) ──────────────────────────
const SESSION_KEY = 'boa_session_v2';
let currentSession = null; // { username, displayName, role, hash, permissions }

// ID unique par onglet/navigateur — distingue 2 onglets du même utilisateur
const _RT_TAB_ID = Math.random().toString(36).slice(2);
let _pendingCredEmail = '';  // email saisi lors de la création, utilisé pour le mailto Outlook

// ── Référentiel des onglets (pour le modal permissions) ───────────────────────
const ALL_TABS = [
  { id:'dashboard',        label:'📊 Tableau de bord' },
  { id:'perimetremodules', label:'🗂 Périmètre' },
  { id:'analyse',          label:'📈 Analyse CBS' },
  { id:'gantt',            label:'📅 Planning Gantt' },
  { id:'arbitrages',       label:'⚖️ Arbitrages' },
  { id:'actions',          label:'✅ Plan d\'action' },
  { id:'gaps',             label:'🔍 GAPs' },
  { id:'risques',          label:'⚠️ Risques' },
  { id:'technique',        label:'🔧 Technique' }
];

// ── Helpers permissions ───────────────────────────────────────────────────────
function hasFunctionAccess(fnKey) {
  if (!currentSession || !currentSession.permissions) return true;
  const fns = currentSession.permissions.functions;
  if (!fns) return true;
  return fns[fnKey] !== false;
}

function hasTabAccess(tabId) {
  if (!currentSession || !currentSession.permissions) return true;
  const tabs = currentSession.permissions.tabs;
  if (!tabs || !Array.isArray(tabs)) return true;
  return tabs.includes(tabId);
}

function canExport()     { return hasFunctionAccess('export'); }
function canAddDelete()  { return hasFunctionAccess('add_delete') && canEdit(); }
function canUserMgmt()   { return hasFunctionAccess('user_mgmt') && currentSession?.role === 'admin'; }

function hasProgrammeAccess() {
  if (!currentSession || !currentSession.permissions) return true;
  return currentSession.permissions.programme_access !== false;
}
function hasProjectAccess(projectId) {
  if (!currentSession || !currentSession.permissions) return true;
  const scope = currentSession.permissions.project_scope;
  if (!scope || scope === 'all') return true;
  return Array.isArray(scope) && scope.includes(projectId);
}
function hasStreamAccess(streamId) {
  if (!currentSession || !currentSession.permissions) return true;
  const scope = currentSession.permissions.stream_scope;
  if (!scope || scope === 'all') return true;
  return Array.isArray(scope) && scope.includes(streamId);
}
// Un risque passe le filtre si : aucun stream attribué (risque global) OU au moins un stream accessible
function _riskPassesStreamFilter(risk) {
  if (!risk || !risk.streams || risk.streams.length === 0) return true;
  return risk.streams.some(sid => hasStreamAccess(sid));
}

// ── Mapping domaines hérités (string) → stream ID ─────────────────────────────
function _legacyDomainToStream(domain) {
  const map = {
    'infra':'stream_infra','Infrastructure':'stream_infra',
    'data':'stream_data','Data / Migration':'stream_data',
    'secu':'stream_secu','Sécurité':'stream_secu',
    'reseau':'stream_infra','Réseau':'stream_infra',
    'Référentiel':'stream_cbs','Référentiel Clients & Comptes':'stream_cbs',
    'Engagements':'stream_cbs','Engagements & Risques':'stream_cbs',
    'Comptabilité':'stream_cbs','Comptabilité & Finance':'stream_cbs',
    'Négoce Intl':'stream_cbs','Négoce International':'stream_cbs',
    'MDP':'stream_cbs','Moyens de Paiement':'stream_cbs',
    'Agence':'stream_cbs','Poste Agence & Guichet':'stream_cbs',
    'Trésorerie':'stream_cbs','Trésorerie et Change interbancaire':'stream_cbs',
    'TFJ y compris courus':'stream_cbs','Habilitations':'stream_secu',
    'Conformité LAB/FT':'stream_secu','Interfaces / Intégration':'stream_if',
  };
  return map[domain] || null;
}

// Filtre générique domaine pour tout item (actions, GAPs, gantt, archi)
function _itemPassesDomainFilter(item) {
  if (!currentSession || !currentSession.permissions) return true;
  const scope = currentSession.permissions.stream_scope;
  if (!scope || scope === 'all') return true;
  if (Array.isArray(item.domains) && item.domains.length > 0) {
    return item.domains.some(sid => scope.includes(sid));
  }
  if (item.domain) {
    const mapped = _legacyDomainToStream(item.domain);
    if (mapped) return scope.includes(mapped);
  }
  return true; // non tagué = visible par tous
}

// ── Chips de domaines réutilisables dans les modals ───────────────────────────
function _renderItemDomainChips(containerId, selectedIds) {
  const streams = getAllStreams();
  const container = document.getElementById(containerId);
  if (!container) return;
  const allSel = selectedIds === null;
  container.innerHTML = streams.map(s => {
    const sel = allSel || (Array.isArray(selectedIds) && selectedIds.includes(s.id));
    return `<button type="button" class="item-domain-chip${sel ? ' idc-sel' : ''}"
      data-stream="${s.id}" data-color="${s.color}"
      onclick="_toggleItemDomainChip(this)"
      style="padding:4px 10px;border-radius:20px;border:2px solid ${s.color};cursor:pointer;font-size:10px;font-weight:600;
             background:${sel?s.color:'white'};color:${sel?'white':s.color};transition:all .12s;">
      ${s.icon} ${_esc(s.name)}</button>`;
  }).join('');
}
function _toggleItemDomainChip(el) {
  const color = el.dataset.color;
  el.classList.toggle('idc-sel');
  el.style.background = el.classList.contains('idc-sel') ? color : 'white';
  el.style.color       = el.classList.contains('idc-sel') ? 'white' : color;
}
function _readItemDomainChips(containerId) {
  const chips = [...document.querySelectorAll(`#${containerId} .item-domain-chip`)];
  const sel = chips.filter(c => c.classList.contains('idc-sel')).map(c => c.dataset.stream);
  return (sel.length === chips.length && chips.length > 0) ? null : sel;
}

// Populer dynamiquement les selects de filtre domaine depuis getAllStreams()
function _populateDomainFilterSelects() {
  const streams = getAllStreams();
  const opts = streams.map(s => `<option value="${s.id}">${s.icon} ${s.name}</option>`).join('');
  // Selects de filtre (option vide = "Tous")
  ['act-filter-domain','gaps-filter-domain','archi-filter-domain'].forEach(id => {
    const sel = document.getElementById(id);
    if (!sel) return;
    const cur = sel.value;
    sel.innerHTML = '<option value="">Tous les domaines</option>' + opts;
    if (cur) sel.value = cur;
  });
  // Select de formulaire ajout archi (option vide = "— Choisir —")
  const naDom = document.getElementById('na-domain');
  if (naDom) {
    const cur = naDom.value;
    naDom.innerHTML = '<option value="">— Choisir —</option>' + opts;
    if (cur) naDom.value = cur;
  }
}

// ── Utilitaires ──────────────────────────────────────────────────────────────
async function sha256hex(str) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function generateTempPassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#';
  let pwd = '';
  for (let i = 0; i < 10; i++) pwd += chars[Math.floor(Math.random() * chars.length)];
  return pwd;
}

function escHtml(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function showToast(msg, duration) {
  const el = document.getElementById('toast-notif');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), duration || 3000);
}

function copyTempPwd() {
  const el = document.getElementById('reset-temp-pwd');
  if (!el) return;
  el.select();
  document.execCommand('copy');
  showToast('Mot de passe copié dans le presse-papiers');
}

// ── BOOTSTRAP ADMIN — initialisation premier compte ──────────────────────────
let _bootstrapClicks = 0, _bootstrapTimer = null;
function _bootstrapClick() {
  _bootstrapClicks++;
  clearTimeout(_bootstrapTimer);
  _bootstrapTimer = setTimeout(() => { _bootstrapClicks = 0; }, 2000);
  if (_bootstrapClicks >= 5) {
    _bootstrapClicks = 0;
    clearTimeout(_bootstrapTimer);
    document.getElementById('bs-username').value = '';
    document.getElementById('bs-display').value  = '';
    document.getElementById('bs-password').value = '';
    document.getElementById('bs-error').textContent = '';
    document.getElementById('bootstrap-sql-section').classList.add('hidden');
    document.getElementById('bootstrap-overlay').classList.remove('hidden');
  }
}

async function generateBootstrapSQL() {
  const username = (document.getElementById('bs-username').value || '').trim().toLowerCase();
  const display  = (document.getElementById('bs-display').value  || '').trim();
  const password = (document.getElementById('bs-password').value || '').trim();
  const tableName = (document.getElementById('bs-table').value   || '').trim();
  const errEl    = document.getElementById('bs-error');
  errEl.textContent = '';

  if (!username || !display || !password) {
    errEl.textContent = 'Identifiant, nom affiché et mot de passe sont requis.'; return;
  }
  if (!/^[a-z0-9_.\-]+$/.test(username)) {
    errEl.textContent = 'Identifiant : lettres minuscules, chiffres, _, . et - uniquement.'; return;
  }
  if (password.length < 8) {
    errEl.textContent = 'Mot de passe : 8 caractères minimum.'; return;
  }
  if (!tableName) {
    errEl.textContent = 'Renseignez d\'abord le nom de la table (exécutez le script de découverte).'; return;
  }

  const hash = await sha256hex(password);
  const safeUser = username.replace(/'/g, "''");
  const safeDisp = display.replace(/'/g, "''");
  const safeTable = tableName.replace(/[^a-zA-Z0-9_]/g, '');

  const sqlInsert =
`-- ════════════════════════════════════════════════════════
--  CRÉER L'ADMINISTRATEUR — ${safeTable}
--  Généré le ${new Date().toLocaleString('fr-FR')}
--  Hash SHA-256 calculé côté navigateur
-- ════════════════════════════════════════════════════════

-- ── 1. Autoriser le rôle admin (modifie la contrainte si besoin) ─────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = '${safeTable}_role_check'
      AND NOT pg_get_constraintdef(oid) ILIKE '%admin%'
  ) THEN
    ALTER TABLE ${safeTable} DROP CONSTRAINT ${safeTable}_role_check;
    ALTER TABLE ${safeTable} ADD CONSTRAINT ${safeTable}_role_check
      CHECK (role = ANY (ARRAY['reader','editor','admin']));
    RAISE NOTICE 'Contrainte mise à jour pour inclure admin.';
  ELSE
    RAISE NOTICE 'Contrainte déjà compatible ou inexistante — aucune modification.';
  END IF;
END $$;

-- ── 2. Créer / promouvoir l'administrateur ────────────────────────────────────
INSERT INTO ${safeTable}
  (id, username, display_name, password_hash, role, must_change_password, created_at)
VALUES (
  gen_random_uuid(),
  '${safeUser}',
  '${safeDisp}',
  '${hash}',
  'admin',
  false,
  now()
)
ON CONFLICT (username) DO UPDATE SET
  role                 = 'admin',
  password_hash        = EXCLUDED.password_hash,
  must_change_password = false;

-- ── 3. Vérification ───────────────────────────────────────────────────────────
SELECT username, display_name, role FROM ${safeTable}
WHERE username = '${safeUser}';`;

  document.getElementById('bootstrap-sql-block').textContent = sqlInsert;
  document.getElementById('bootstrap-sql-section').classList.remove('hidden');
  document.getElementById('bootstrap-sql-block').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function _copyText(txt, msg) {
  navigator.clipboard.writeText(txt).then(
    () => showToast(msg || 'Copié ✓'),
    () => {
      const ta = document.createElement('textarea');
      ta.value = txt; document.body.appendChild(ta);
      ta.select(); document.execCommand('copy'); document.body.removeChild(ta);
      showToast(msg || 'Copié ✓');
    }
  );
}
function copyBootstrapSQL() {
  const txt = document.getElementById('bootstrap-sql-block').textContent;
  if (!txt) return;
  _copyText(txt, 'Script SQL copié ✓');
}
function copyDiscoverySQL() {
  _copyText(
    'SELECT table_name\nFROM information_schema.tables\nWHERE table_schema = \'public\'\nORDER BY table_name;',
    'Requête de découverte copiée ✓'
  );
}

// ── ENVOI IDENTIFIANTS VIA OUTLOOK ───────────────────────────────────────────
function sendCredsMail() {
  const email       = (document.getElementById('reset-email-display').value || '').trim();
  const displayName = (document.getElementById('reset-target-name').textContent || '').trim();
  const username    = (document.getElementById('reset-target-username').textContent || '').trim();
  const tempPwd     = (document.getElementById('reset-temp-pwd').value || '').trim();
  if (!email) {
    document.getElementById('reset-email-display').focus();
    document.getElementById('reset-email-display').style.borderColor = 'var(--red)';
    showToast('⚠ Veuillez renseigner l\'adresse email du destinataire');
    setTimeout(() => { document.getElementById('reset-email-display').style.borderColor = ''; }, 2500);
    return;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    showToast('⚠ Format d\'email invalide'); return;
  }
  const appUrl  = window.location.href.split('?')[0];
  const subject = encodeURIComponent('[IGOR V4] Accès plateforme — Vos identifiants de connexion');
  const body    = encodeURIComponent(
`Bonjour ${displayName},

Votre compte a été créé sur la plateforme de pilotage du Programme IGOR V2 → V4 (BOA Afrique).

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Identifiant      : ${username}
  Mot de passe     : ${tempPwd}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🔒 Ce mot de passe est temporaire. Vous serez invité(e) à le modifier dès votre première connexion.

Accès à la plateforme :
${appUrl}

En cas de difficulté, contactez l'administrateur du programme.

Cordialement,
L'équipe Programme IGOR V4 — CBS`
  );
  window.location.href = `mailto:${encodeURIComponent(email)}?subject=${subject}&body=${body}`;
}

// ── LOGIN ─────────────────────────────────────────────────────────────────────
async function doLogin() {
  const btn   = document.getElementById('login-btn');
  const errEl = document.getElementById('login-error');
  const user  = (document.getElementById('login-user').value || '').trim().toLowerCase();
  const pass  = document.getElementById('login-pass').value || '';
  errEl.textContent = '';
  if (!user || !pass) { errEl.textContent = 'Veuillez renseigner l\'identifiant et le mot de passe.'; return; }
  btn.disabled = true; btn.textContent = '…';
  try {
    if (!API) {
      errEl.textContent = 'Connexion au serveur impossible. Vérifiez votre connexion.';
      return;
    }
    const hash = await sha256hex(pass);
    const { data, error } = await _withTimeout(
      API.rpc('auth_login', { p_username: user, p_password_hash: hash }),
      8000, 'auth_login'
    );
    if (error || !data || data.length === 0) {
      errEl.textContent = 'Identifiant ou mot de passe incorrect.';
      _addLoginLog('login_failed', user, '—', '—');
      return;
    }
    try {
      const statusResp = await _withTimeout(
        API.rpc('app_user_status_get', { p_username: user, p_password_hash: hash }),
        5000, 'app_user_status_get'
      );
      if (statusResp.error) throw statusResp.error;
      if (statusResp.data && statusResp.data.is_active === false) {
        errEl.textContent = 'Votre compte est suspendu. Contactez un administrateur.';
        _addLoginLog('login_failed', user, '—', 'suspended');
        return;
      }
    } catch(e) {
      console.warn('[login] statut utilisateur:', e.message || e);
    }
    const ud = data[0];
    currentSession = { username: user, displayName: ud.display_name, role: ud.role, hash, permissions: ud.permissions || null };
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(currentSession));
    _addLoginLog('login', user, ud.display_name, ud.role);
    if (ud.must_change_password) {
      showChangePassword(true);   // force le changement avant d'accéder au dashboard
    } else {
      applySession(currentSession);
      document.getElementById('login-overlay').classList.add('hidden');
      await initApp(false);
      _sessionStart();   // Démarrer le timer d'inactivité
    }
  } catch(e) {
    errEl.textContent = 'Erreur de connexion : ' + e.message;
  } finally {
    btn.disabled = false; btn.textContent = 'Connexion';
  }
}

// ── CHANGEMENT DE MOT DE PASSE ────────────────────────────────────────────────
function showChangePassword(isFirstLogin) {
  const overlay = document.getElementById('change-password-overlay');
  document.getElementById('chpwd-title').textContent = isFirstLogin
    ? 'Première connexion — choisissez votre mot de passe'
    : 'Modifier mon mot de passe';
  const oldGrp = document.getElementById('chpwd-old-group');
  oldGrp.style.display = isFirstLogin ? 'none' : 'block';
  document.getElementById('chpwd-btn').onclick = () => doChangePassword(isFirstLogin);
  document.getElementById('chpwd-cancel-btn').style.display = isFirstLogin ? 'none' : '';
  document.getElementById('chpwd-error').textContent = '';
  document.getElementById('chpwd-new').value = '';
  document.getElementById('chpwd-confirm').value = '';
  if (document.getElementById('chpwd-old')) document.getElementById('chpwd-old').value = '';
  overlay.classList.remove('hidden');
}

async function doChangePassword(isFirstLogin) {
  const btn      = document.getElementById('chpwd-btn');
  const errEl    = document.getElementById('chpwd-error');
  const newPass  = document.getElementById('chpwd-new').value || '';
  const confPass = document.getElementById('chpwd-confirm').value || '';
  errEl.textContent = '';
  if (!newPass || !confPass) { errEl.textContent = 'Veuillez remplir tous les champs.'; return; }
  if (newPass !== confPass)  { errEl.textContent = 'Les mots de passe ne correspondent pas.'; return; }
  if (newPass.length < 8)    { errEl.textContent = 'Le mot de passe doit contenir au moins 8 caractères.'; return; }
  btn.disabled = true; btn.textContent = '…';
  try {
    const newHash = await sha256hex(newPass);
    const oldHash = isFirstLogin
      ? currentSession.hash
      : await sha256hex(document.getElementById('chpwd-old').value || '');
    const { data, error } = await _withTimeout(
      API.rpc('auth_change_password', {
        p_username: currentSession.username,
        p_old_hash: oldHash,
        p_new_hash: newHash
      }),
      8000, 'auth_change_password'
    );
    if (error) { errEl.textContent = 'Erreur serveur : ' + error.message; return; }
    if (data === false) { errEl.textContent = isFirstLogin ? 'Erreur interne.' : 'Ancien mot de passe incorrect.'; return; }
    // Mettre à jour la session avec le nouveau hash
    currentSession.hash = newHash;
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(currentSession));
    document.getElementById('change-password-overlay').classList.add('hidden');
    if (isFirstLogin) {
      applySession(currentSession);
      document.getElementById('login-overlay').classList.add('hidden');
      await initApp(false);
      _sessionStart();   // Démarrer le timer d'inactivité
    } else {
      showToast('Mot de passe modifié avec succès');
    }
  } catch(e) {
    errEl.textContent = 'Erreur : ' + e.message;
  } finally {
    btn.disabled = false; btn.textContent = 'Enregistrer';
  }
}

// ── LOGOUT ────────────────────────────────────────────────────────────────────
function doLogout() {
  _sessionStop();   // Arrêter le timer d'inactivité
  if (currentSession) {
    _addLoginLog('logout', currentSession.username, currentSession.displayName, currentSession.role);
  }
  currentSession = null;
  sessionStorage.removeItem(SESSION_KEY);
  document.getElementById('login-user').value = '';
  document.getElementById('login-pass').value = '';
  document.getElementById('login-error').textContent = '';
  document.getElementById('login-overlay').classList.remove('hidden');
}

// ── APPLICATION DE LA SESSION ─────────────────────────────────────────────────
function applySession(session) {
  const role     = session.role;
  const isAdmin  = role === 'admin';
  const isEditor = role === 'editor';
  const canWrite = isAdmin || isEditor;

  // Badge & nom
  const badgeText = isAdmin ? 'Admin' : (isEditor ? 'Éditeur' : 'Lecture seule');
  const badgeCls  = isAdmin ? 'role-badge role-admin' : (isEditor ? 'role-badge role-owner' : 'role-badge role-viewer');
  document.getElementById('user-name').textContent       = session.displayName;
  document.getElementById('user-role-badge').textContent = badgeText;
  document.getElementById('user-role-badge').className   = badgeCls;

  // Classe CSS sur body pour enforcement global
  document.body.classList.remove('reader-mode', 'editor-mode', 'admin-mode');
  document.body.classList.add(canWrite ? (isAdmin ? 'admin-mode' : 'editor-mode') : 'reader-mode');

  // Éléments editor-only/owner-only
  document.querySelectorAll('.owner-only, .editor-only').forEach(el => {
    el.style.display = canWrite ? '' : 'none';
  });
  // Éléments admin-only
  document.querySelectorAll('.admin-only').forEach(el => {
    el.style.display = isAdmin ? '' : 'none';
  });

  // En mode lecture : désactiver champs et boutons d'édition
  if (!canWrite) {
    document.querySelectorAll(
      'input:not(.login-input):not(.chpwd-input), select:not(#newuser-role), textarea'
    ).forEach(el => { el.disabled = true; });
    document.querySelectorAll(
      'button.btn-save, button[onclick*="save"], button[onclick*="Save"]'
    ).forEach(el => { el.disabled = true; });
    // Réactiver les sélecteurs TCD (toujours accessibles à tous les rôles)
    document.querySelectorAll('#tab-analyse select, #tab-analyse input, #tab-analyse button').forEach(el => {
      el.disabled = false;
    });
  }

  // ── Permissions par utilisateur (onglets + fonctions) ────────────────────
  const perms = session.permissions || {};
  const tabsAllowed = perms.tabs || null;  // null = tous les onglets

  // Onglets : masquer les boutons non autorisés
  document.querySelectorAll('.tab-btn').forEach(btn => {
    const m = (btn.getAttribute('onclick') || '').match(/switchTab\('([^']+)'/);
    if (!m) return;
    const tabId = m[1];
    btn.style.display = (tabsAllowed && !tabsAllowed.includes(tabId)) ? 'none' : '';
  });

  // Si l'onglet actif n'est plus accessible, basculer sur dashboard
  const activeTab = document.querySelector('.tab-content.active');
  if (activeTab && tabsAllowed) {
    const activeId = activeTab.id.replace('tab-', '');
    if (!tabsAllowed.includes(activeId)) {
      const firstBtn = document.querySelector('.tab-btn:not([style*="display: none"]):not([style*="display:none"])');
      if (firstBtn) firstBtn.click();
    }
  }

  // Fonctions : classes CSS sur body pour masquer les éléments
  const fns = perms.functions || {};
  document.body.classList.toggle('perm-no-export',    fns.export     === false);
  document.body.classList.toggle('perm-no-edit',      fns.edit_data  === false);
  document.body.classList.toggle('perm-no-add-delete',fns.add_delete === false);
  document.body.classList.toggle('perm-no-user-mgmt', fns.user_mgmt  === false);

  // Badge responsables provisoires (s'il y en a des non configurés)
  if (typeof _refreshOwnerBadge === 'function') {
    setTimeout(_refreshOwnerBadge, 500); // délai pour que le DOM soit prêt
  }
}

// ── GESTION DES UTILISATEURS (éditeur / admin) ──────────────────────────────
async function openUserMgmt() {
  if (!currentSession || !canEdit()) return;
  // Masquer l'option Administrateur si l'utilisateur courant n'est pas admin
  const adminOpt = document.getElementById('newuser-role-admin');
  if (adminOpt) adminOpt.style.display = currentSession.role === 'admin' ? '' : 'none';
  _selectedUsers.clear();
  const filterEl = document.getElementById('user-filter-status');
  if (filterEl) filterEl.value = '';
  document.getElementById('user-mgmt-modal').classList.remove('hidden');
  await loadUserList();
}

// ── MODAL PERMISSIONS ─────────────────────────────────────────────────────────
let _permTargetUsername = '';
let _userPermsCache = {}; // { username → permissions object | null }
let _userStatusCache   = {}; // { username → { is_active, suspended_at, suspended_by } }
let _userStatusOverride = {}; // { username → is_active } — vérité locale en attente de sync Supabase
let _selectedUsers = new Set();
let _lastRenderedUsers = [];

function _userIsActiveValue(value) {
  if (value === false || value === 0) return false;
  const v = String(value ?? '').trim().toLowerCase();
  if (v === 'false' || v === 'f' || v === '0' || v === 'no' || v === 'non') return false;
  if (v === 'true' || v === 't' || v === '1' || v === 'yes' || v === 'oui') return true;
  return value !== undefined && value !== null ? true : true;
}

function _userStatusRecord(row) {
  const key = String((row && row.username) || '').toLowerCase();
  // Override local (action en cours de sync) — priorité absolue
  if (Object.prototype.hasOwnProperty.call(_userStatusOverride, key)) {
    const statusRow = _userStatusCache[key] || row || {};
    return { raw: statusRow, isActive: _userStatusOverride[key] };
  }
  const statusRow = _userStatusCache[key] || row || {};
  const hasActiveFlag = Object.prototype.hasOwnProperty.call(statusRow, 'is_active');
  return {
    raw: statusRow,
    isActive: hasActiveFlag ? _userIsActiveValue(statusRow.is_active) : true
  };
}

function _refreshUserSelectionInfo() {
  const el = document.getElementById('user-selection-count');
  if (!el) return;
  const count = _selectedUsers.size;
  el.textContent = count + (count > 1 ? ' sélectionnés' : ' sélectionné');
}

function toggleUserSelection(username, checked) {
  if (checked) _selectedUsers.add(username);
  else _selectedUsers.delete(username);
  _refreshUserSelectionInfo();
}

function selectAllVisibleUsers() {
  _lastRenderedUsers.forEach(u => _selectedUsers.add(u));
  loadUserList();
}

function clearUserSelection() {
  _selectedUsers.clear();
  loadUserList();
}

async function _loadUserStatusMap() {
  if (!API || !currentSession || currentSession.role !== 'admin') return {};

  // ── Tentative 1 : RPC app_admin_list_user_status ─────────────────────────
  try {
    const { data, error } = await _withTimeout(
      API.rpc('app_admin_list_user_status', {
        p_admin_username: currentSession.username,
        p_admin_hash: currentSession.hash
      }),
      8000, 'app_admin_list_user_status'
    );
    if (!error && Array.isArray(data) && data.length > 0) {
      console.log('[users] app_admin_list_user_status → ok, retourne', data.length, 'entrées');
      // Normaliser les champs selon différentes conventions possibles
      const map = {};
      data.forEach(row => {
        const key = String(row.username || row.user || row.login || '').toLowerCase();
        if (!key) return;
        const active = row.is_active ?? row.active ?? row.enabled ?? row.status !== 'suspended';
        map[key] = { ...row, is_active: active };
      });
      return map;
    }
    if (error) console.warn('[users] app_admin_list_user_status erreur:', error.message || error);
    else       console.warn('[users] app_admin_list_user_status retourne vide/null — tentative fallback');
  } catch(e) {
    console.warn('[users] app_admin_list_user_status exception:', e.message || e);
  }

  // ── Tentative 2 : requête directe sur la table utilisateurs (fallback) ────
  // Essaie les noms de table courants dans le projet
  const _candidateTables = ['app_users', 'boa_users', 'users', 'auth_users', 'programme_users'];
  for (const tbl of _candidateTables) {
    try {
      const { data: rows, error: tblErr } = await _withTimeout(
        API.from(tbl).select('username, is_active, suspended_at, suspended_by'),
        5000, 'select ' + tbl
      );
      if (!tblErr && Array.isArray(rows) && rows.length > 0) {
        console.log('[users] fallback table', tbl, '→ ok,', rows.length, 'lignes');
        const map = {};
        rows.forEach(row => {
          const key = String(row.username || '').toLowerCase();
          if (key) map[key] = row;
        });
        return map;
      }
    } catch(e2) { /* table n'existe pas */ }
  }

  console.warn('[users] Impossible de charger les statuts de suspension — tous les utilisateurs apparaîtront comme actifs.');
  return {};
}

async function adminSetUsersActive(usernames, isActive) {
  if (!Array.isArray(usernames) || usernames.length === 0) return 0;
  const actionLabel = isActive ? 'réactiver' : 'suspendre';
  const { data, error } = await _withTimeout(
    API.rpc('app_admin_set_users_active', {
      p_admin_username: currentSession.username,
      p_admin_hash: currentSession.hash,
      p_usernames: usernames,
      p_is_active: isActive
    }),
    8000, 'app_admin_set_users_active'
  );
  if (error) throw new Error(error.message || ('Impossible de ' + actionLabel + ' les comptes.'));
  return Number(data || 0);
}

async function bulkSetUsersActive(isActive) {
  const usernames = Array.from(_selectedUsers);
  if (usernames.length === 0) {
    showToast('Aucun utilisateur sélectionné.', 2200);
    return;
  }
  const label = isActive ? 'activer' : 'suspendre';
  if (!confirm((isActive ? 'Activer ' : 'Suspendre ') + usernames.length + ' utilisateur(s) sélectionné(s) ?')) return;
  try {
    const updated = await adminSetUsersActive(usernames, isActive);
    // Override local pour tous les utilisateurs sélectionnés
    usernames.forEach(un => { _userStatusOverride[un.toLowerCase()] = isActive; });
    _selectedUsers.clear();
    showToast(updated + ' utilisateur(s) ' + (isActive ? 'activé(s)' : 'suspendu(s)') + '.', 2600);
    await loadUserList();
  } catch(e) {
    alert('Erreur : ' + e.message);
  }
}

async function toggleUserActive(username, displayName, isActive) {
  const verb = isActive ? 'activer' : 'suspendre';
  if (!confirm((isActive ? 'Activer' : 'Suspendre') + ' "' + displayName + '" ?')) return;
  try {
    await adminSetUsersActive([username], isActive);
    // Override local immédiat — survivra au rechargement même si Supabase est en retard
    _userStatusOverride[username.toLowerCase()] = isActive;
    showToast('Utilisateur ' + (isActive ? 'activé' : 'suspendu') + '.');
    await loadUserList();
  } catch(e) {
    alert('Erreur : ' + e.message);
  }
}

// ── Rendu des chips streams dans le modal permissions ────────────────────────
function _renderPermStreams(allSelected, selectedIds) {
  const streams = getAllStreams();
  const container = document.getElementById('perm-streams-grid');
  if (!container) return;
  container.innerHTML = streams.map(s => {
    const sel = allSelected || selectedIds.includes(s.id);
    return `<button type="button" class="perm-stream-chip${sel ? ' psc-sel' : ''}" data-stream="${s.id}" data-color="${s.color}"
      onclick="_permToggleStreamChip(this)"
      style="padding:5px 12px;border-radius:20px;border:2px solid ${s.color};cursor:pointer;font-size:11px;font-weight:600;
             background:${sel ? s.color : 'white'};color:${sel ? 'white' : s.color};transition:all .15s;">
      ${s.icon} ${_esc(s.name)}</button>`;
  }).join('');
}
function _permToggleStreamChip(el) {
  const color = el.dataset.color;
  el.classList.toggle('psc-sel');
  if (el.classList.contains('psc-sel')) {
    el.style.background = color; el.style.color = 'white';
  } else {
    el.style.background = 'white'; el.style.color = color;
  }
}
function _permSelectAllStreams(checked) {
  document.querySelectorAll('.perm-stream-chip').forEach(el => {
    if (checked) { el.classList.add('psc-sel'); el.style.background = el.dataset.color; el.style.color = 'white'; }
    else { el.classList.remove('psc-sel'); el.style.background = 'white'; el.style.color = el.dataset.color; }
  });
}

// ── Rendu des checkboxes projets dans le modal permissions ───────────────────
function _renderPermProjects(allSelected, selectedIds) {
  const projects = ((state.programme && state.programme.projects) || []).filter(p => p.status !== 'archived');
  const allCb = document.getElementById('perm-proj-all');
  if (allCb) allCb.checked = allSelected;
  const container = document.getElementById('perm-projects-grid');
  if (!container) return;
  if (projects.length === 0) {
    container.innerHTML = '<em style="color:#888;font-size:11px;">Aucun projet actif</em>';
    return;
  }
  container.innerHTML = projects.map(p => {
    const sel = allSelected || selectedIds.includes(p.id);
    return `<label style="display:flex;align-items:center;gap:7px;font-size:12px;cursor:pointer;">
      <input type="checkbox" class="perm-proj-cb" data-proj="${p.id}" ${sel ? 'checked' : ''}
        onchange="_permSyncProjAllCheckbox()">
      <span style="width:10px;height:10px;border-radius:50%;background:${p.color};display:inline-block;flex-shrink:0;"></span>
      ${_esc(p.name)}
    </label>`;
  }).join('');
}
function _permToggleAllProjects(checked) {
  document.querySelectorAll('.perm-proj-cb').forEach(cb => cb.checked = checked);
}
function _permSyncProjAllCheckbox() {
  const cbs = [...document.querySelectorAll('.perm-proj-cb')];
  const allCb = document.getElementById('perm-proj-all');
  if (allCb) allCb.checked = cbs.length > 0 && cbs.every(cb => cb.checked);
}

// ── Profils types prédéfinis ─────────────────────────────────────────────────
function _applyPermProfile(profile) {
  const streamTabs = ['dashboard','risques','actions','technique','gantt'];
  switch(profile) {
    case 'directeur':
      document.getElementById('perm-prog-access').checked  = true;
      const allCbD = document.getElementById('perm-proj-all');
      if (allCbD) allCbD.checked = true;
      _permToggleAllProjects(true);
      _permSelectAllStreams(true);
      _permSelectAllTabs(true);
      document.getElementById('perm-fn-export').checked     = true;
      document.getElementById('perm-fn-edit-data').checked  = true;
      document.getElementById('perm-fn-add-delete').checked = true;
      document.getElementById('perm-fn-user-mgmt').checked  = true;
      showToast('Profil Directeur Programme appliqué — accès total');
      break;
    case 'chef_projet':
      document.getElementById('perm-prog-access').checked  = false;
      _permSelectAllStreams(true);
      _permSelectAllTabs(true);
      document.getElementById('perm-fn-export').checked     = true;
      document.getElementById('perm-fn-edit-data').checked  = true;
      document.getElementById('perm-fn-add-delete').checked = true;
      document.getElementById('perm-fn-user-mgmt').checked  = false;
      showToast('Profil Chef de Projet — sélectionnez les projets accessibles');
      break;
    case 'resp_stream':
      document.getElementById('perm-prog-access').checked  = false;
      _permSelectAllStreams(false); // → l'admin sélectionne manuellement les streams
      document.querySelectorAll('.perm-tab-cb').forEach(cb => cb.checked = streamTabs.includes(cb.dataset.tab));
      document.getElementById('perm-fn-export').checked     = true;
      document.getElementById('perm-fn-edit-data').checked  = false;
      document.getElementById('perm-fn-add-delete').checked = false;
      document.getElementById('perm-fn-user-mgmt').checked  = false;
      showToast('Profil Responsable Domaine — sélectionnez le ou les domaines');
      break;
    case 'observateur':
      document.getElementById('perm-prog-access').checked  = true;
      const allCbO = document.getElementById('perm-proj-all');
      if (allCbO) allCbO.checked = true;
      _permToggleAllProjects(true);
      _permSelectAllStreams(true);
      _permSelectAllTabs(true);
      document.getElementById('perm-fn-export').checked     = false;
      document.getElementById('perm-fn-edit-data').checked  = false;
      document.getElementById('perm-fn-add-delete').checked = false;
      document.getElementById('perm-fn-user-mgmt').checked  = false;
      showToast('Profil Observateur — lecture seule, accès complet');
      break;
  }
}

// ── Ouverture du modal ───────────────────────────────────────────────────────
function openPermissionsModal(username, displayName) {
  _permTargetUsername = username;
  document.getElementById('perm-modal-name').textContent     = displayName;
  document.getElementById('perm-modal-username').textContent = username;
  document.getElementById('perm-modal-error').textContent    = '';

  const perms = _userPermsCache[username] || null;

  // Programme access
  document.getElementById('perm-prog-access').checked = !perms || perms.programme_access !== false;

  // Project scope
  const projScopeAll = !perms || !perms.project_scope || perms.project_scope === 'all';
  const projScope    = projScopeAll ? [] : (Array.isArray(perms.project_scope) ? perms.project_scope : []);
  _renderPermProjects(projScopeAll, projScope);

  // Stream scope
  const streamScopeAll = !perms || !perms.stream_scope || perms.stream_scope === 'all';
  const streamScope    = streamScopeAll ? [] : (Array.isArray(perms.stream_scope) ? perms.stream_scope : []);
  _renderPermStreams(streamScopeAll, streamScope);

  // Tabs
  const tabsAllowed = (perms && Array.isArray(perms.tabs)) ? perms.tabs : null;
  const grid = document.getElementById('perm-tabs-grid');
  grid.innerHTML = ALL_TABS.map(t => `
    <label style="display:flex;align-items:center;gap:8px;background:#f8f9fa;border:1px solid #e0e0e0;border-radius:5px;padding:8px 10px;cursor:pointer;font-size:12px;">
      <input type="checkbox" class="perm-tab-cb" data-tab="${t.id}"
        style="width:14px;height:14px;cursor:pointer;"
        ${(!tabsAllowed || tabsAllowed.includes(t.id)) ? 'checked' : ''}>
      <span>${t.label}</span>
    </label>`).join('');

  // Functions
  const fns = (perms && perms.functions) ? perms.functions : {};
  document.getElementById('perm-fn-export').checked    = fns.export     !== false;
  document.getElementById('perm-fn-edit-data').checked = fns.edit_data  !== false;
  document.getElementById('perm-fn-add-delete').checked= fns.add_delete !== false;
  document.getElementById('perm-fn-user-mgmt').checked = fns.user_mgmt  !== false;
  document.getElementById('perm-fn-use-ai').checked    = fns.use_ai     !== false;

  document.getElementById('permissions-modal').classList.remove('hidden');
}

function closePermissionsModal() {
  document.getElementById('permissions-modal').classList.add('hidden');
  _permTargetUsername = '';
}

function _permSelectAllTabs(checked) {
  document.querySelectorAll('.perm-tab-cb').forEach(cb => cb.checked = checked);
}

async function saveUserPermissions() {
  const errEl = document.getElementById('perm-modal-error');
  errEl.textContent = '';

  // Programme access
  const progAccess = document.getElementById('perm-prog-access').checked;

  // Project scope
  const projCbs     = [...document.querySelectorAll('.perm-proj-cb')];
  const projChecked = projCbs.filter(cb => cb.checked).map(cb => cb.dataset.proj);
  const projScopeAll = projCbs.length === 0 || projChecked.length === projCbs.length;
  const projectScope = projScopeAll ? 'all' : projChecked;

  // Stream scope
  const streamChips    = [...document.querySelectorAll('.perm-stream-chip')];
  const streamSelected = streamChips.filter(el => el.classList.contains('psc-sel')).map(el => el.dataset.stream);
  const streamScopeAll = streamChips.length === 0 || streamSelected.length === streamChips.length;
  const streamScope    = streamScopeAll ? 'all' : streamSelected;

  // Tabs
  const checkedTabs    = [...document.querySelectorAll('.perm-tab-cb:checked')].map(cb => cb.dataset.tab);
  const allTabsChecked = checkedTabs.length === ALL_TABS.length;

  // Functions
  const fns = {
    export:     document.getElementById('perm-fn-export').checked,
    edit_data:  document.getElementById('perm-fn-edit-data').checked,
    add_delete: document.getElementById('perm-fn-add-delete').checked,
    user_mgmt:  document.getElementById('perm-fn-user-mgmt').checked,
    use_ai:     document.getElementById('perm-fn-use-ai').checked
  };
  const allFnsEnabled = Object.values(fns).every(v => v === true);

  // Accès complet → permissions null (propre)
  const isFullAccess = progAccess && projectScope === 'all' && streamScope === 'all' && allTabsChecked && allFnsEnabled;
  const permissions  = isFullAccess ? null : {
    programme_access: progAccess,
    project_scope:    projectScope,
    stream_scope:     streamScope,
    tabs:             allTabsChecked ? null : checkedTabs,
    functions:        fns
  };

  try {
    const { data, error } = await _withTimeout(
      API.rpc('auth_update_permissions', {
        p_admin_username:  currentSession.username,
        p_admin_hash:      currentSession.hash,
        p_target_username: _permTargetUsername,
        p_permissions:     permissions
      }),
      8000, 'auth_update_permissions'
    );
    if (error || data === false) {
      errEl.textContent = 'Erreur : ' + (error?.message || 'Permission refusée');
      return;
    }
    closePermissionsModal();
    showToast('Permissions mises à jour pour ' + _permTargetUsername);
    await loadUserList();
  } catch(e) {
    errEl.textContent = 'Erreur : ' + e.message;
  }
}

async function loadUserList() {
  const tbody = document.getElementById('user-list-tbody');
  tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:20px;color:#888">Chargement…</td></tr>';
  try {
    const [userResp, statusMap] = await Promise.all([
      _withTimeout(
        API.rpc('auth_list_users', {
          p_admin_username: currentSession.username,
          p_admin_hash:     currentSession.hash
        }),
        8000, 'auth_list_users'
      ),
      _loadUserStatusMap()
    ]);
    const { data, error } = userResp;
    if (error || !data) {
      tbody.innerHTML = '<tr><td colspan="7" style="color:var(--red);padding:12px">Erreur : ' + escHtml(error?.message || 'Inconnue') + '</td></tr>';
      return;
    }
    // Construire le cache de statut en fusionnant toutes les sources
    _userStatusCache = {};
    // Source 1 : statuts depuis app_admin_list_user_status ou table directe
    Object.entries(statusMap || {}).forEach(([un, row]) => { _userStatusCache[un] = row; });
    // Source 2 : is_active depuis auth_list_users (si présent)
    (data || []).forEach(u => {
      const key = String(u.username || '').toLowerCase();
      if (!_userStatusCache[key]) _userStatusCache[key] = {};
      if (!Object.prototype.hasOwnProperty.call(_userStatusCache[key], 'is_active')
          && Object.prototype.hasOwnProperty.call(u, 'is_active')) {
        _userStatusCache[key].is_active = u.is_active;
      }
    });
    // Source 3 : overrides locaux de la session (priorité absolue)
    Object.entries(_userStatusOverride).forEach(([un, active]) => {
      if (!_userStatusCache[un]) _userStatusCache[un] = {};
      _userStatusCache[un].is_active = active;
    });

    // Avertissement si aucun statut chargé (tous utilisateurs par défaut = actifs)
    const hasAnyStatus = Object.values(_userStatusCache).some(r => Object.prototype.hasOwnProperty.call(r, 'is_active'));
    const warnEl = document.getElementById('user-status-warn');
    if (warnEl) {
      warnEl.style.display = hasAnyStatus ? 'none' : '';
      warnEl.textContent = hasAnyStatus ? '' : '⚠️ Impossible de lire les statuts de suspension depuis Supabase — les utilisateurs suspendus peuvent apparaître comme actifs. Vérifiez que la fonction app_admin_list_user_status existe.';
    }
    if (data.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:20px;color:#888">Aucun utilisateur</td></tr>';
      return;
    }
    // Alimenter le cache des permissions (évite de passer du JSON dans les attributs onclick)
    _userPermsCache = {};
    data.forEach(u => { _userPermsCache[u.username] = u.permissions || null; });
    const statusFilter = document.getElementById('user-filter-status')?.value || '';
    const filteredUsers = data.filter(u => {
      const isActive = _userStatusRecord(u).isActive;
      if (statusFilter === 'active') return isActive;
      if (statusFilter === 'suspended') return !isActive;
      return true;
    });
    _lastRenderedUsers = filteredUsers.map(u => u.username);
    _selectedUsers.forEach(u => { if (!_lastRenderedUsers.includes(u)) _selectedUsers.delete(u); });
    _refreshUserSelectionInfo();
    if (filteredUsers.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:20px;color:#888">Aucun utilisateur pour ce filtre.</td></tr>';
      return;
    }

    tbody.innerHTML = filteredUsers.map(u => {
      const isMe      = u.username === currentSession.username;
      const roleLabel = u.role === 'admin' ? 'Admin' : (u.role === 'editor' ? 'Éditeur' : 'Lecteur');
      const roleCls   = u.role === 'admin' ? 'role-admin' : (u.role === 'editor' ? 'role-owner' : 'role-viewer');
      const { raw: statusRow, isActive } = _userStatusRecord(u);
      const lastLogin = u.last_login
        ? new Date(u.last_login).toLocaleDateString('fr-FR', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' })
        : '—';
      const mdpStatus = u.must_change_password
        ? '<span style="color:var(--red);font-weight:700">⚠ À changer</span>'
        : '<span style="color:var(--green)">✓ OK</span>';
      const accountStatus = isActive
        ? '<span style="display:inline-flex;align-items:center;gap:5px;background:#ecfdf5;color:#15803d;border:1px solid #86efac;border-radius:999px;padding:3px 8px;font-size:10px;font-weight:700;">Actif</span>'
        : '<span style="display:inline-flex;align-items:center;gap:5px;background:#fff1f2;color:#b91c1c;border:1px solid #fda4af;border-radius:999px;padding:3px 8px;font-size:10px;font-weight:700;">Suspendu</span>';
      const suspendInfo = !isActive && statusRow.suspended_by
        ? `<div style="font-size:10px;color:#94a3b8;margin-top:3px;">par ${escHtml(statusRow.suspended_by)}</div>`
        : '';
      // ── Boutons de changement de rôle (gestion 3 niveaux reader/editor/admin) ──
      const iCurrAdmin = currentSession?.role === 'admin';
      let roleChangeHtml = '';
      if (!isMe) {
        const un  = escHtml(u.username);
        const dn  = escHtml(u.display_name);
        if (u.role === 'admin') {
          roleChangeHtml += `<button class="btn-users" style="font-size:10px;margin-right:4px"
            onclick="adminUpdateRole('${un}','${dn}','editor','Éditeur')">↓ Éditeur</button>`;
          roleChangeHtml += `<button class="btn-users" style="font-size:10px;margin-right:4px"
            onclick="adminUpdateRole('${un}','${dn}','reader','Lecteur')">↓ Lecteur</button>`;
        } else if (u.role === 'editor') {
          roleChangeHtml += `<button class="btn-users" style="font-size:10px;margin-right:4px"
            onclick="adminUpdateRole('${un}','${dn}','reader','Lecteur')">↓ Lecteur</button>`;
          if (iCurrAdmin) roleChangeHtml += `<button class="btn-users" style="font-size:10px;margin-right:4px"
            onclick="adminUpdateRole('${un}','${dn}','admin','Admin')">↑ Admin</button>`;
        } else { // reader
          roleChangeHtml += `<button class="btn-users" style="font-size:10px;margin-right:4px"
            onclick="adminUpdateRole('${un}','${dn}','editor','Éditeur')">↑ Éditeur</button>`;
          if (iCurrAdmin) roleChangeHtml += `<button class="btn-users" style="font-size:10px;margin-right:4px"
            onclick="adminUpdateRole('${un}','${dn}','admin','Admin')">↑ Admin</button>`;
        }
      }
      const toggleBtn = !isMe
        ? (isActive
            ? `<button class="btn-users" style="font-size:10px;margin-right:4px;color:#b91c1c;border-color:#fca5a5;background:#fff5f5" onclick="toggleUserActive('${escHtml(u.username)}','${escHtml(u.display_name)}',false)">⏸ Suspendre</button>`
            : `<button class="btn-users" style="font-size:10px;margin-right:4px;color:#15803d;border-color:#86efac;background:#f0fdf4" onclick="toggleUserActive('${escHtml(u.username)}','${escHtml(u.display_name)}',true)">✅ Activer</button>`)
        : '';
      const selected = _selectedUsers.has(u.username);
      return `<tr style="border-bottom:1px solid #f0f0f0;${!isActive ? 'background:#fff8f8;' : ''}">
        <td style="padding:8px 6px;text-align:center;">
          ${!isMe ? `<input type="checkbox" ${selected ? 'checked' : ''} onchange="toggleUserSelection('${escHtml(u.username)}', this.checked)">` : ''}
        </td>
        <td style="padding:8px 10px;font-weight:600">
          ${escHtml(u.display_name)}<br>
          <small style="color:#888;font-weight:400">${escHtml(u.username)}</small>
          ${isMe ? '<span style="font-size:10px;color:var(--red);margin-left:4px">(vous)</span>' : ''}
        </td>
        <td style="padding:8px 10px"><span class="role-badge ${roleCls}">${roleLabel}</span></td>
        <td style="padding:8px 10px">${accountStatus}${suspendInfo}</td>
        <td style="padding:8px 10px;font-size:11px">${mdpStatus}</td>
        <td style="padding:8px 10px;font-size:11px;color:#888">${lastLogin}</td>
        <td style="padding:8px 10px;white-space:normal">
          <div style="display:flex;flex-wrap:wrap;gap:4px;align-items:flex-start;">
          <button class="btn-users" style="font-size:10px;margin-right:0"
            onclick="adminResetPassword('${escHtml(u.username)}','${escHtml(u.display_name)}')">🔑 Reset MDP</button>
          ${!isMe ? `
          ${toggleBtn}
          ${roleChangeHtml}
          <button class="btn-users" style="font-size:10px;margin-right:0"
            onclick="openPermissionsModal('${escHtml(u.username)}','${escHtml(u.display_name)}')">⚙️ Accès</button>
          <button class="btn-users" style="font-size:10px;color:var(--red);border-color:var(--red)"
            onclick="adminDeleteUser('${escHtml(u.username)}','${escHtml(u.display_name)}')">🗑</button>
          ` : ''}
          </div>
        </td>
      </tr>`;
    }).join('');
  } catch(e) {
    tbody.innerHTML = '<tr><td colspan="7" style="color:var(--red);padding:12px">Erreur : ' + escHtml(e.message) + '</td></tr>';
  }
}

async function adminResetPassword(username, displayName) {
  if (!confirm('Réinitialiser le mot de passe de "' + displayName + '" ?\nUn mot de passe temporaire sera généré.')) return;
  const tempPwd  = generateTempPassword();
  const tempHash = await sha256hex(tempPwd);
  const { data, error } = await _withTimeout(
    API.rpc('auth_admin_reset', {
      p_admin_username:  currentSession.username,
      p_admin_hash:      currentSession.hash,
      p_target_username: username,
      p_temp_hash:       tempHash
    }),
    8000, 'auth_admin_reset'
  );
  if (error || !data) { alert('Erreur : ' + (error?.message || 'Inconnue')); return; }
  _pendingCredEmail = '';
  document.getElementById('reset-target-name').textContent     = displayName;
  document.getElementById('reset-target-username').textContent = username;
  document.getElementById('reset-temp-pwd').value              = tempPwd;
  document.getElementById('reset-email-display').value         = '';
  document.getElementById('reset-result-modal').classList.remove('hidden');
  await loadUserList();
}

async function adminUpdateRole(username, displayName, newRole, newRoleLabel) {
  if (!confirm('Changer le rôle de "' + displayName + '" en ' + newRoleLabel + ' ?')) return;
  const { data, error } = await _withTimeout(
    API.rpc('auth_update_role', {
      p_admin_username:  currentSession.username,
      p_admin_hash:      currentSession.hash,
      p_target_username: username,
      p_new_role:        newRole
    }),
    8000, 'auth_update_role'
  );
  if (error || !data) { alert('Erreur : ' + (error?.message || 'Inconnue')); return; }
  showToast('Rôle mis à jour');
  await loadUserList();
}

async function adminDeleteUser(username, displayName) {
  if (!confirm('Supprimer "' + displayName + '" (' + username + ') ?\nCette action est irréversible.')) return;
  const { data, error } = await _withTimeout(
    API.rpc('auth_delete_user', {
      p_admin_username:  currentSession.username,
      p_admin_hash:      currentSession.hash,
      p_target_username: username
    }),
    8000, 'auth_delete_user'
  );
  if (error || !data) { alert('Erreur : ' + (error?.message || 'Inconnue')); return; }
  showToast('Utilisateur supprimé');
  await loadUserList();
}

async function adminCreateUser() {
  const username    = (document.getElementById('newuser-username').value || '').trim().toLowerCase();
  const displayName = (document.getElementById('newuser-display').value  || '').trim();
  const email       = (document.getElementById('newuser-email').value    || '').trim();
  const role        =  document.getElementById('newuser-role').value;
  const errEl       =  document.getElementById('newuser-error');
  const btn         =  document.querySelector('.umgmt-add-btn');
  errEl.textContent = '';

  // ── Validations ──────────────────────────────────────────────────────────
  if (!username || !displayName) { errEl.textContent = 'Identifiant et nom complet requis.'; return; }
  if (!/^[a-z0-9_.\-]+$/.test(username)) {
    errEl.textContent = 'Identifiant : lettres minuscules, chiffres, _, . et - uniquement.'; return;
  }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errEl.textContent = 'Format d\'email invalide.'; return;
  }
  if (role === 'admin' && currentSession?.role !== 'admin') {
    errEl.textContent = '⛔ Seul un Administrateur peut créer un compte Administrateur.'; return;
  }
  if (!API) { errEl.textContent = '⛔ Connexion au serveur impossible.'; return; }

  // ── Indicateur de chargement ──────────────────────────────────────────────
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Création…'; }

  try {
    const tempPwd  = generateTempPassword();
    const tempHash = await sha256hex(tempPwd);
    const { data, error } = await _withTimeout(
      API.rpc('auth_create_user', {
        p_admin_username: currentSession.username,
        p_admin_hash:     currentSession.hash,
        p_new_username:   username,
        p_display_name:   displayName,
        p_role:           role,
        p_temp_hash:      tempHash
      }),
      10000, 'auth_create_user'
    );

    if (error || !data) {
      const msg = error?.message || '';
      errEl.textContent =
        (msg.includes('unique') || error?.code === '23505')
          ? '⚠️ Cet identifiant est déjà utilisé.'
          : (msg.includes('permission') || msg.includes('admin') || msg.includes('droit') || msg.includes('403'))
            ? '⛔ Permission refusée — droits insuffisants.'
            : (msg.includes('Timeout'))
              ? '⏱ Délai dépassé — vérifiez la connexion et réessayez.'
              : '❌ Erreur : ' + (msg || 'Inconnue (vérifiez la console)');
      console.error('[adminCreateUser] erreur RPC:', error);
      return;
    }

    // ── Succès ───────────────────────────────────────────────────────────────
    _pendingCredEmail = email;
    document.getElementById('newuser-username').value            = '';
    document.getElementById('newuser-display').value             = '';
    document.getElementById('newuser-email').value               = '';
    document.getElementById('reset-target-name').textContent     = displayName;
    document.getElementById('reset-target-username').textContent = username;
    document.getElementById('reset-temp-pwd').value              = tempPwd;
    document.getElementById('reset-email-display').value         = email;
    document.getElementById('reset-result-modal').classList.remove('hidden');
    await loadUserList();

  } catch(e) {
    const msg = e?.message || String(e);
    errEl.textContent = msg.includes('Timeout')
      ? '⏱ Délai dépassé — vérifiez la connexion et réessayez.'
      : '❌ Erreur : ' + msg;
    console.error('[adminCreateUser] exception:', e);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '+ Créer'; }
  }
}

// ── SYSTEM USERS DATALIST ────────────────────────────────────────────────────
async function _loadSystemUsersDatalist() {
  const dl = document.getElementById('dl-act-resp');
  if (!dl) return;
  const base = getOwnerRecords().map(o => {
    const label = _ownerMetaLabel(o);
    return `<option value="${escHtml(o.name)}"${label ? ` label="${escHtml(label)}"` : ''}>`;
  }).join('');
  dl.innerHTML = base;
  if (!API || !currentSession) return;
  try {
    const { data } = await _withTimeout(
      API.rpc('auth_list_users', {
        p_admin_username: currentSession.username,
        p_admin_hash:     currentSession.hash
      }),
      5000, 'auth_list_users'
    );
    if (data && data.length) {
      dl.innerHTML = base + data.map(u => `<option value="${escHtml(u.display_name)}">`).join('');
    }
  } catch(e) { /* silencieux */ }
}

// ── RELANCE PAR MAIL ──────────────────────────────────────────────────────────
function openRelanceModal(id) {
  const all = [...actions, ...(state.customActions || [])];
  const a   = all.find(x => x.id === id);
  if (!a) return;
  const sv     = state.actions[id] || {};
  const ragLbl = { G: '✅ Terminée', O: '🔄 En cours', R: '⚠️ En retard', X: '⏳ À faire' };
  const dateStr = sv.dateFin ? 'Date fin réelle : ' + sv.dateFin
                : (a.echeance ? 'Échéance prévue  : ' + a.echeance : '');
  document.getElementById('relance-action-ref').textContent   = a.id;
  document.getElementById('relance-action-label').textContent = a.action.slice(0, 80) + (a.action.length > 80 ? '…' : '');
  document.getElementById('relance-to').value      = sv.email || '';
  document.getElementById('relance-cc').value      = '';
  document.getElementById('relance-subject').value = `[IGOR V4] Relance — Action ${a.id} : ${a.action.slice(0, 55)}`;
  document.getElementById('relance-body').value =
    `Bonjour,

Je me permets de vous relancer concernant l'action suivante dans le cadre du Programme IGOR V2 → V4 :

`
    + `Référence    : ${a.id}
`
    + `Action       : ${a.action}
`
    + `Responsable  : ${a.resp || '—'}
`
    + (dateStr ? `${dateStr}
` : '')
    + `Statut       : ${ragLbl[sv.rag || 'X']}
`
    + `Avancement   : ${sv.pct || 0}%
`
    + (sv.commentaire ? `
Commentaire  : ${sv.commentaire}
` : '')
    + `
Merci de bien vouloir mettre à jour le tableau de bord ou de me communiquer un point d'avancement.

`
    + `Cordialement,
${currentSession ? currentSession.displayName : 'Programme IGOR V4'}
BOA Côte d'Ivoire — Pilotage IGOR`;
  document.getElementById('relance-modal').classList.remove('hidden');
}

function sendRelanceMail() {
  const to      = (document.getElementById('relance-to').value || '').trim();
  const cc      = (document.getElementById('relance-cc').value || '').trim();
  const subject = document.getElementById('relance-subject').value || '';
  const body    = document.getElementById('relance-body').value    || '';
  const mailUrl = `mailto:${encodeURIComponent(to)}`
    + `?subject=${encodeURIComponent(subject)}`
    + `&body=${encodeURIComponent(body)}`
    + (cc ? `&cc=${encodeURIComponent(cc)}` : '');
  window.open(mailUrl, '_self');
  document.getElementById('relance-modal').classList.add('hidden');
}

// ── LOGS DE CONNEXION ────────────────────────────────────────────────────────
function openLoginLogs() {
  if (!currentSession || currentSession.role !== 'admin') return;
  document.getElementById('login-logs-modal').classList.remove('hidden');
  renderLoginLogs();
}

function renderLoginLogs() {
  const actionF = (document.getElementById('log-filter-action') || {}).value || '';
  const userF   = ((document.getElementById('log-filter-user')   || {}).value || '').toLowerCase().trim();
  let logs = (state.loginLogs || []).filter(l => {
    if (actionF && l.action !== actionF) return false;
    if (userF && !l.username.toLowerCase().includes(userF) && !l.displayName.toLowerCase().includes(userF)) return false;
    return true;
  });
  const contentEl = document.getElementById('login-logs-content');
  if (logs.length === 0) {
    contentEl.innerHTML = '<p style="text-align:center;color:#888;padding:24px;">Aucun log correspondant.</p>';
    return;
  }
  const evLabels = {
    login:        { label: '✅ Connexion',   color: '#2E7D52' },
    logout:       { label: '🔓 Déconnexion', color: '#E8702A' },
    login_failed: { label: '❌ Échec',        color: '#E63329' }
  };
  const roleLabels = { admin: 'Admin', editor: 'Éditeur', reader: 'Lecteur' };
  contentEl.innerHTML = `<table style="width:100%;border-collapse:collapse;font-size:12px;">
    <thead>
      <tr style="border-bottom:2px solid #eee;background:#f8f9fa;">
        <th style="padding:8px 10px;text-align:left;font-weight:700;">Date / Heure</th>
        <th style="padding:8px 10px;text-align:left;font-weight:700;">Événement</th>
        <th style="padding:8px 10px;text-align:left;font-weight:700;">Utilisateur</th>
        <th style="padding:8px 10px;text-align:left;font-weight:700;">Rôle</th>
        <th style="padding:8px 10px;text-align:left;font-weight:700;color:#aaa;">User-Agent</th>
      </tr>
    </thead>
    <tbody>
      ${logs.map(l => {
        const ev = evLabels[l.action] || { label: escHtml(l.action), color: '#888' };
        const dt = (() => { try { return new Date(l.ts).toLocaleString('fr-FR', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit', second:'2-digit' }); } catch(e2) { return l.ts; } })();
        const rl = roleLabels[l.role] || escHtml(l.role);
        return '<tr style="border-bottom:1px solid #f0f0f0;">'
          + '<td style="padding:7px 10px;color:#888;white-space:nowrap;">' + dt + '</td>'
          + '<td style="padding:7px 10px;font-weight:700;color:' + ev.color + ';">' + ev.label + '</td>'
          + '<td style="padding:7px 10px;"><strong>' + escHtml(l.displayName) + '</strong>'
          + '<span style="color:#aaa;font-size:10px;margin-left:6px;">' + escHtml(l.username) + '</span></td>'
          + '<td style="padding:7px 10px;"><span class="role-badge '
          + (l.role === 'admin' ? 'role-admin' : (l.role === 'editor' ? 'role-owner' : 'role-viewer'))
          + '" style="font-size:10px;">' + rl + '</span></td>'
          + '<td style="padding:7px 10px;color:#bbb;font-size:10px;max-width:220px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;" title="' + escHtml(l.ua) + '">' + escHtml(l.ua) + '</td>'
          + '</tr>';
      }).join('')}
    </tbody>
  </table>`;
}

function clearLoginLogs() {
  if (!currentSession || currentSession.role !== 'admin') return;
  if (!confirm('Vider tous les logs de connexion ? Cette action est irréversible.')) return;
  state.loginLogs = [];
  // Direct persist without saveState (readers cannot call saveState)
  try { localStorage.setItem('boa_v4_state', JSON.stringify(state)); } catch(e) {}
  if (API && window._sbWriteOK) {
    _saveProjectStateCloud('clearLoginLogs save');
  }
  renderLoginLogs();
}

// ── SOUMISSION PAR ENTRÉE ─────────────────────────────────────────────────────
document.addEventListener('keydown', function(e) {
  if (e.key !== 'Enter') return;
  if (!document.getElementById('login-overlay').classList.contains('hidden')) { doLogin(); return; }
  if (!document.getElementById('change-password-overlay').classList.contains('hidden')) {
    const btn = document.getElementById('chpwd-btn');
    if (btn && !btn.disabled) btn.click();
  }
});

// ════════════════════════════════════════════════════════════════════════════
// CHATBOT AI — Assistant Projet (Gemini 1.5 Flash)
// ════════════════════════════════════════════════════════════════════════════

let _chatHistory    = [];   // [{role:'user'|'model', parts:[{text}]}]
let _chatIsOpen     = false;
let _chatTyping     = false;
let _chatMinimized  = false;

// ── Minimiser / restaurer le panneau ─────────────────────────────────────
function _chatToggleMinimize() {
  const panel = document.getElementById('chatbot-panel');
  const btn   = document.getElementById('chatbot-minimize-btn');
  if (!panel) return;
  _chatMinimized = !_chatMinimized;
  panel.classList.toggle('chatbot-minimized', _chatMinimized);
  if (btn) btn.textContent = _chatMinimized ? '▲' : '▼';
  if (!_chatMinimized) {
    setTimeout(() => document.getElementById('chatbot-input')?.focus(), 150);
  }
}

// ── Ouvrir / fermer le panneau ────────────────────────────────────────────
function _canUseAI() {
  return hasFunctionAccess('use_ai');
}

function toggleChatbot() {
  if (!_canUseAI()) {
    alert('⛔ Accès à PILOT non autorisé pour votre compte.\n\nContactez un administrateur pour activer cette fonctionnalité.');
    return;
  }
  const panel = document.getElementById('chatbot-panel');
  if (!panel) return;
  _chatIsOpen = !_chatIsOpen;
  panel.classList.toggle('open', _chatIsOpen);

  // Toujours restaurer si on ré-ouvre depuis l'état minimisé
  if (_chatIsOpen && _chatMinimized) {
    _chatMinimized = false;
    panel.classList.remove('chatbot-minimized');
    const btn = document.getElementById('chatbot-minimize-btn');
    if (btn) btn.textContent = '▼';
  }

  const badge = document.getElementById('chatbot-badge');
  if (badge) badge.style.display = 'none';

  if (_chatIsOpen && _chatHistory.length === 0) {
    _chatWelcome();
    _chatUpdateBadge();
  }
  if (_chatIsOpen) {
    setTimeout(() => document.getElementById('chatbot-input')?.focus(), 150);
  }
}

function _chatWelcome() {
  const proj = (state.programme && state.programme.projects || [])
    .find(p => p.id === state.currentProjectId);
  const name = proj ? proj.name : 'votre projet';
  _appendChatMsg('ai',
    `👋 Bonjour ! Je suis **PILOT**, votre assistant de pilotage de projet.\n\nJe connais l'état actuel de **${name}** : tâches, actions, retards, phases et KPIs.\n\nQue voulez-vous savoir ?`
  );
}

// ── Contexte projet injecté dans chaque requête ───────────────────────────
function _buildProjectContext() {
  const today    = new Date().toLocaleDateString('fr-FR');
  const todayISO = new Date().toISOString().split('T')[0];

  // ── Projet courant ────────────────────────────────────────────────────
  const proj     = (state.programme && state.programme.projects || [])
    .find(p => p.id === state.currentProjectId);
  const projName = proj ? proj.name : (state.currentProjectId ? state.currentProjectId : 'Aucun projet sélectionné');
  const cp       = proj ? (proj.chefDeProjet || proj.chef || '—') : '—';

  if (!state.currentProjectId) {
    return `
=== CONTEXTE PROJET (aujourd'hui : ${today}) ===
⚠️ Aucun projet ouvert. Ouvrez un projet depuis l'écran Programme pour obtenir une analyse détaillée.
Projets disponibles : ${(state.programme && state.programme.projects || []).map(p=>p.name).join(', ') || '(aucun)'}
===`;
  }

  // ── Tâches Gantt — uniquement les données du projet courant ──────────
  // On prend :
  //   1. Les tâches custom créées dans ce projet (state.ganttCustom)
  //   2. Les tâches du template qui ont des overrides dans ce projet (state.gantt)
  const customTasks   = (state.ganttCustom || []).filter(t => !( state.ganttHidden||[]).includes(t.id));
  const templateWithOverrides = ganttTasks.filter(t =>
    state.gantt[t.id] && !( state.ganttHidden||[]).includes(t.id)
  );
  const allProjTasks  = [...templateWithOverrides, ...customTasks];

  // ── Helper : calcule les dates effectives d'une phase depuis ses tâches enfants
  //   (les lignes de phase dans les fichiers importés ont souvent debut/fin vides)
  function _phaseEffectiveDates(phase, allTasks) {
    let { start, end } = getTaskDates(phase);
    if (start && end) return { start, end }; // dates déjà renseignées → OK

    // Chercher min(start) et max(end) parmi toutes les tâches de la même phase
    // Pour les tâches custom, elles partagent la même clé CSS (phase.phase)
    // OU elles ont la même position hiérarchique (subphaseId ou predecesseurs)
    // On se base sur l'ID de la phase comme phaseRef OU sur la clé CSS partagée
    const children = allTasks.filter(t => {
      if (t.type === 'phase') return false;
      // Appartient à cette phase si : même clé CSS, ou subphaseId pointe vers une
      // sous-phase qui appartient à ce parent, ou insertAfterId dans la phase
      const sameCSS = phase.phase && t.phase === phase.phase;
      const subphases = (state.ganttSubphases || []).filter(sp => sp.phaseId === phase.id);
      const inSubphase = subphases.some(sp => t.subphaseId === sp.id);
      return sameCSS || inSubphase;
    });

    if (children.length === 0) return { start: start || '—', end: end || '—' };

    let minS = null, maxE = null;
    children.forEach(t => {
      const { start: cs, end: ce } = getTaskDates(t);
      if (cs && (!minS || cs < minS)) minS = cs;
      if (ce && (!maxE || ce > maxE)) maxE = ce;
    });
    return { start: minS || start || '—', end: maxE || end || '—' };
  }

  const phases    = allProjTasks.filter(t => t.type === 'phase' && !(state.ganttSubphases||[]).some(sp => sp.id === t.id));
  const phasesCtx = phases.length > 0 ? phases.map(p => {
    const { start, end } = _phaseEffectiveDates(p, allProjTasks);
    const ov    = state.gantt[p.id] || {};
    const label = ov._label || p.label || '';
    // Tâches enfants pour calcul % avancement
    const subT  = allProjTasks.filter(s => {
      if (s.type === 'phase') return false;
      const sameCSS = p.phase && s.phase === p.phase;
      const subphases = (state.ganttSubphases || []).filter(sp => sp.phaseId === p.id);
      return sameCSS || subphases.some(sp => s.subphaseId === sp.id);
    });
    const pct   = subT.length > 0
      ? Math.round(subT.reduce((acc, s) => {
          const o = state.gantt[s.id] || {};
          const taskPct = o._pct != null ? o._pct : (o.pct != null ? Math.round(o.pct * 100) : Math.round((s.pct||0)*100));
          return acc + taskPct;
        }, 0) / subT.length)
      : (ov._pct != null ? ov._pct : Math.round((p.pct||0)*100));
    const endReal = (end && end !== '—') ? end : '';
    const isLate = endReal && endReal < todayISO && pct < 100;
    const isDone = pct >= 100;
    const status = isDone ? '✅ TERMINÉE' : isLate ? '⚠️ EN RETARD' : (start && start <= todayISO ? '▶️ EN COURS' : '⏳ À VENIR');
    // Détail tâches (top 8 pour ne pas saturer le contexte)
    const taskLines = subT.slice(0, 8).map(t => {
      const { start: ts, end: te } = getTaskDates(t);
      const to = state.gantt[t.id] || {};
      const tp = to._pct != null ? to._pct : (to.pct != null ? Math.round(to.pct*100) : Math.round((t.pct||0)*100));
      return `      • ${t.label||t.id} | ${ts||'—'} → ${te||'—'} | ${tp}%`;
    }).join('\n');
    return `  - ${label} | ${start} → ${end} | ${pct}% | ${status}\n${taskLines ? taskLines + '\n' : ''}`;
  }).join('') : '  (aucune phase avec données dans ce projet — Gantt vide ou non configuré)';

  // ── Actions — uniquement les actions du projet courant ───────────────
  const allActs = (state.customActions || []);
  let aTodo=0, aInProg=0, aDone=0, aBlocked=0, aOverdue=0;
  const overdueList = [];
  allActs.forEach(a => {
    const sv = state.actions[a.id] || {};
    const st = sv.status || a.status || 'todo';
    if (st==='done') aDone++;
    else if (st==='in_progress') aInProg++;
    else if (st==='blocked') aBlocked++;
    else aTodo++;
    if (_isActionOverdue(a, allActs)) {
      aOverdue++;
      const endD = _calcActionEndDate(a.id, allActs) || sv.dateFin || a.dateFin || '';
      overdueList.push(`${a.id} | ${a.action} | resp:${a.resp||'—'} | fin:${endD}`);
    }
  });

  // ── Risques ──
  const risks     = (state.risks || state.risques || []);
  const critRisks = risks.filter(r =>
    (r.niveau||r.criticite||'') === 'Critique' ||
    (r.impact||0) >= 4 ||
    (r.prob||0) * (r.impact||0) >= 12
  );

  // ── Jalons à venir — uniquement dans ce projet ───────────────────────
  const jalons = allProjTasks
    .filter(t => t.type === 'jalon')
    .map(t => { const {start} = getTaskDates(t); return {label:t.label||'', date:start}; })
    .filter(j => j.date && j.date >= todayISO)
    .sort((a,b) => a.date > b.date ? 1 : -1)
    .slice(0, 5);

  return `
=== CONTEXTE PROJET (aujourd'hui : ${today}) ===
Projet : ${projName}
Chef de projet : ${cp}

PHASES GANTT :
${phasesCtx}

PLAN D'ACTION — STATISTIQUES :
  Total : ${allActs.length} actions
  À faire : ${aTodo} | En cours : ${aInProg} | Terminées : ${aDone} | Bloquées : ${aBlocked}
  EN RETARD : ${aOverdue}
${overdueList.length ? overdueList.slice(0,10).map(l=>'  ⚠️ '+l).join('\n') : '  ✅ Aucune action en retard'}

JALONS À VENIR :
${jalons.length ? jalons.map(j=>`  🔷 ${j.date} — ${j.label}`).join('\n') : '  (aucun jalon à venir)'}

RISQUES CRITIQUES :
${critRisks.length ? critRisks.slice(0,5).map(r=>`  🔴 ${r.desc||r.title||r.description||r.label||''}`).join('\n') : '  ✅ Aucun risque critique'}
===`;
}

// ── Suggestions rapides ───────────────────────────────────────────────────
const _CHAT_SUGGESTIONS = {
  '📊 Point projet':   'Fais-moi un point complet sur l\'avancement du projet : phases, actions, retards et points d\'attention.',
  '⚠️ Retards':        'Quelles sont les actions et phases en retard ? Qu\'est-ce que tu recommandes pour rattraper le retard ?',
  '📅 Cette semaine':  'Qu\'est-ce qui doit être fait cette semaine ? Donne-moi une liste priorisée des actions urgentes.',
  '🎯 Prioriser':      'Aide-moi à prioriser les actions en cours. Quelles sont les 3 choses les plus critiques sur lesquelles se concentrer ?',
};

function useSuggestion(btn) {
  const text = _CHAT_SUGGESTIONS[btn.textContent.trim()] || btn.textContent.trim();
  const inp = document.getElementById('chatbot-input');
  if (inp) { inp.value = text; inp.focus(); }
  sendChatMessage();
}

// ── Envoyer un message ────────────────────────────────────────────────────
async function sendChatMessage() {
  const inp  = document.getElementById('chatbot-input');
  const text = (inp?.value || '').trim();
  if (!text || _chatTyping) return;

  inp.value = '';
  inp.style.height = 'auto';

  // Vérifier que la session est active
  const provider = (typeof CONFIG !== 'undefined' && CONFIG.gemini && CONFIG.gemini.provider) || 'groq';
  if (!currentSession || !currentSession.username || !currentSession.hash) {
    _appendChatMsg('ai', '⚙️ **Session expirée** — Veuillez vous reconnecter pour utiliser l\'assistant.');
    return;
  }

  _appendChatMsg('user', text);

  // Construire le contexte projet frais
  const ctx = _buildProjectContext();

  // Système prompt
  const systemPrompt = `Tu es PILOT, l'assistant expert en pilotage de projet de transformation bancaire.
Tu aides le chef de projet et son équipe à piloter le projet, anticiper les risques et prendre de bonnes décisions.
Tu réponds en français, de façon concise, structurée et actionnable.
Tu utilises le contexte du projet fourni pour répondre avec précision.
Si tu détectes des risques ou retards, tu les signales clairement avec des recommandations concrètes.
Format : utilise des listes et du **gras** pour structurer. Sois direct et professionnel.`;

  // Afficher indicateur de frappe
  const typingId = _appendChatTyping();
  _chatTyping = true;
  _setChatSendState(false);

  try {
    const model = (CONFIG.gemini && CONFIG.gemini.model) || 'llama-3.3-70b-versatile';
    let resp, answer;

    // ── Proxy Supabase Edge Function (clé Groq stockée côté serveur) ──────
    const recentHistory = _chatHistory.slice(-20).map(m => ({
      role:    m.role === 'model' ? 'assistant' : 'user',
      content: m.parts[0].text
    }));
    const messages = [
      { role: 'system', content: systemPrompt + '\n\n' + ctx },
      ...recentHistory,
      { role: 'user',   content: text }
    ];
    _chatHistory.push({ role: 'user', parts: [{ text }] });

    const proxyUrl = (CONFIG.supabase.url) + '/functions/v1/chat-proxy';
    resp = await fetch(proxyUrl, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${CONFIG.supabase.anonKey}`,
        'x-boa-user':    currentSession.username,
        'x-boa-hash':    currentSession.hash
      },
      body: JSON.stringify({ model, messages, max_tokens: 1024, temperature: 0.7 })
    });

    _removeTyping(typingId);
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      const msg = err?.error || err?.error?.message || 'Erreur ' + resp.status;
      _appendChatMsg('ai', `❌ ${msg}`);
      _chatHistory.pop(); return;
    }
    const data = await resp.json();
    answer = data?.choices?.[0]?.message?.content || '_(réponse vide)_';

    _appendChatMsg('ai', answer);
    _chatHistory.push({ role: 'model', parts: [{ text: answer }] });

    // Limiter l'historique à 20 échanges
    if (_chatHistory.length > 40) _chatHistory = _chatHistory.slice(-40);

  } catch(e) {
    _removeTyping(typingId);
    _appendChatMsg('ai', `❌ Erreur réseau : ${e.message}\n\nVérifiez votre connexion internet.`);
    _chatHistory.pop();
  } finally {
    _chatTyping = false;
    _setChatSendState(true);
  }
}

// ── Helpers UI ────────────────────────────────────────────────────────────
function _appendChatMsg(role, text) {
  const box = document.getElementById('chatbot-messages');
  if (!box) return;

  const div = document.createElement('div');
  div.className = role === 'user' ? 'chat-msg-user' : role === 'ai' ? 'chat-msg-ai' : 'chat-msg-sys';

  // Rendu markdown basique : **gras**, *italic*, listes, sauts de ligne
  let html = escHtml(text)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>')
    .replace(/\n/g, '<br>');

  div.innerHTML = html;
  box.appendChild(div);
  box.scrollTop = box.scrollHeight;
  return div;
}

function _appendChatTyping() {
  const box = document.getElementById('chatbot-messages');
  if (!box) return null;
  const id  = 'chat-typing-' + Date.now();
  const div = document.createElement('div');
  div.id    = id;
  div.className = 'chat-msg-ai';
  div.innerHTML = '<span style="display:inline-flex;gap:4px;align-items:center;">'
    + '<span style="width:6px;height:6px;border-radius:50%;background:#1565C0;animation:chatDot .8s infinite;"></span>'
    + '<span style="width:6px;height:6px;border-radius:50%;background:#1565C0;animation:chatDot .8s .2s infinite;"></span>'
    + '<span style="width:6px;height:6px;border-radius:50%;background:#1565C0;animation:chatDot .8s .4s infinite;"></span>'
    + '</span>';
  box.appendChild(div);
  box.scrollTop = box.scrollHeight;

  // Injection animation si pas encore présente
  if (!document.getElementById('chatDotStyle')) {
    const s = document.createElement('style');
    s.id = 'chatDotStyle';
    s.textContent = '@keyframes chatDot{0%,80%,100%{opacity:.2;transform:scale(.8)}40%{opacity:1;transform:scale(1)}}';
    document.head.appendChild(s);
  }
  return id;
}

function _removeTyping(id) {
  if (id) document.getElementById(id)?.remove();
}

function _setChatSendState(enabled) {
  const btn = document.getElementById('chatbot-send-btn');
  if (btn) {
    btn.disabled = !enabled;
    btn.style.opacity = enabled ? '1' : '0.5';
  }
}

function clearChatHistory() {
  _chatHistory = [];
  const box = document.getElementById('chatbot-messages');
  if (box) box.innerHTML = '';
  _chatWelcome();
}

// ── Badge notification (actions en retard) ────────────────────────────────
function _chatUpdateBadge() {
  const fab   = document.getElementById('chatbot-fab');
  const badge = document.getElementById('chatbot-badge');

  // Masquer le bouton flottant si l'utilisateur n'a pas accès à l'AI
  if (fab) fab.style.display = _canUseAI() ? '' : 'none';

  if (!badge || _chatIsOpen || !_canUseAI()) {
    if (badge) badge.style.display = 'none';
    return;
  }
  const allActs = (state.customActions || []);
  const n = allActs.filter(a => _isActionOverdue(a, allActs)).length;
  if (n > 0) {
    badge.textContent = n;
    badge.style.display = 'flex';
  } else {
    badge.style.display = 'none';
  }
}

// ── Ctrl+/- : zoom Gantt natif (intercepté avant le browser) ─────────────────
// useCapture:true = phase de capture → on intercepte AVANT le zoom navigateur
document.addEventListener('keydown', (e) => {
  if (!(e.ctrlKey || e.metaKey)) return;
  const ganttTab = document.getElementById('tab-gantt');
  if (!ganttTab || !ganttTab.classList.contains('active')) return;
  const k = e.key;
  if (k === '=' || k === '+' || e.code === 'NumpadAdd') {
    e.preventDefault(); e.stopImmediatePropagation();
    changeGanttScale(0.1);
  } else if (k === '-' || k === '_' || e.code === 'NumpadSubtract') {
    e.preventDefault(); e.stopImmediatePropagation();
    changeGanttScale(-0.1);
  } else if (k === '0' || e.code === 'Numpad0') {
    e.preventDefault(); e.stopImmediatePropagation();
    resetGanttScale();
  }
}, true); // capture phase

// ═══════════════════════════════════════════════════════════════════════════
// SESSION TIMEOUT — Déconnexion automatique après 30 min d'inactivité
// ═══════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════════
// REALTIME HELPERS — Protection modale + attribution + pending banner
// ═══════════════════════════════════════════════════════════════════════════

window._realtimePendingPayload = null;

/** Détecte si un modal d'édition est ouvert */
function _realtimeIsModalOpen() {
  const modals = [
    'add-task-modal', 'subtask-modal', 'arb-modal', 'action-modal',
    'gap-modal', 'user-mgmt-modal', 'permissions-modal',
    'change-password-overlay', 'owners-modal', 'risque-modal'
  ];
  return modals.some(id => {
    const el = document.getElementById(id);
    if (!el) return false;
    return el.style.display === 'flex' || el.style.display === 'block'
        || (!el.classList.contains('hidden') && el.offsetParent !== null);
  });
}

/** Applique le payload realtime et affiche un toast d'attribution */
function _realtimeApplyPayload(payload, authorName) {
  const _prevProjId = state.currentProjectId;
  applyParsedState(payload.new.state_data);
  if (_prevProjId) {
    const _pData = (state.projectData || {})[_prevProjId] || _defaultProjectState();
    state.currentProjectId = _prevProjId;
    _PROJECT_STATE_KEYS.forEach(k => {
      state[k] = _pData[k] !== undefined ? _pData[k] : _defaultProjectState()[k];
    });
  }
  renderDashboard(); renderArbitrages(); renderActions(); renderGaps();
  const at = document.querySelector('.tab-content.active');
  if (at && at.id === 'tab-gantt') renderGantt();
  // Toast d'attribution
  showToast('🔄 Synchronisé — ' + authorName + ' a mis à jour le projet');
  // Cacher la bannière pending si elle était visible
  _realtimeHidePendingBanner();
  window._realtimePendingPayload = null;
}

/** Affiche la bannière "modifications en attente" */
function _realtimeShowPendingBanner(authorName) {
  let banner = document.getElementById('realtime-pending-banner');
  if (!banner) return;
  banner.querySelector('#rt-author-name').textContent = authorName;
  banner.style.display = 'flex';
}

/** Cache la bannière */
function _realtimeHidePendingBanner() {
  const banner = document.getElementById('realtime-pending-banner');
  if (banner) banner.style.display = 'none';
}

/** Appelé par le bouton "Actualiser" de la bannière */
function realtimeApplyPending() {
  if (window._realtimePendingPayload) {
    const rtBy = window._realtimePendingPayload.new.state_data._rtSavedBy || 'Un collègue';
    _realtimeApplyPayload(window._realtimePendingPayload, rtBy);
  } else {
    _realtimeHidePendingBanner();
  }
}

/** Appelé par le bouton "Ignorer" de la bannière */
function realtimeIgnorePending() {
  window._realtimePendingPayload = null;
  _realtimeHidePendingBanner();
}

// ═══════════════════════════════════════════════════════════════════════════
const SESSION_TIMEOUT_MS = 30 * 60 * 1000;   // 30 minutes
const SESSION_WARNING_MS =  2 * 60 * 1000;   // Avertissement 2 min avant

let _sessionTimer          = null;
let _sessionWarningTimer   = null;
let _sessionCountdownTimer = null;
let _sessionListenersAdded = false;

function _sessionResetTimers() {
  if (!currentSession) return;

  clearTimeout(_sessionTimer);
  clearTimeout(_sessionWarningTimer);
  clearInterval(_sessionCountdownTimer);

  // Cacher le modal si visible
  const overlay = document.getElementById('session-timeout-overlay');
  if (overlay && !overlay.classList.contains('hidden')) {
    overlay.classList.add('hidden');
  }

  // Avertissement à 28 min
  _sessionWarningTimer = setTimeout(_sessionShowWarning, SESSION_TIMEOUT_MS - SESSION_WARNING_MS);

  // Déconnexion à 30 min
  _sessionTimer = setTimeout(_sessionAutoLogout, SESSION_TIMEOUT_MS);
}

function _sessionShowWarning() {
  if (!currentSession) return;
  const overlay = document.getElementById('session-timeout-overlay');
  if (!overlay) return;
  overlay.classList.remove('hidden');

  let remaining = Math.floor(SESSION_WARNING_MS / 1000);
  _sessionUpdateCountdown(remaining);
  clearInterval(_sessionCountdownTimer);
  _sessionCountdownTimer = setInterval(() => {
    remaining--;
    _sessionUpdateCountdown(remaining);
    if (remaining <= 0) clearInterval(_sessionCountdownTimer);
  }, 1000);
}

function _sessionUpdateCountdown(seconds) {
  const el = document.getElementById('session-timeout-countdown');
  if (!el) return;
  const m = Math.floor(seconds / 60);
  const s = Math.max(0, seconds % 60);
  el.textContent = `${m}:${s.toString().padStart(2, '0')}`;
}

function _sessionAutoLogout() {
  clearInterval(_sessionCountdownTimer);
  const overlay = document.getElementById('session-timeout-overlay');
  if (overlay) overlay.classList.add('hidden');
  doLogout();
  setTimeout(() => {
    const err = document.getElementById('login-error');
    if (err) err.textContent = '⏱️ Session expirée après 30 min d\'inactivité. Veuillez vous reconnecter.';
  }, 100);
}

function _sessionKeepAlive() {
  _sessionResetTimers();
}

function _sessionStart() {
  if (!_sessionListenersAdded) {
    ['mousemove','mousedown','keydown','scroll','touchstart','click'].forEach(evt =>
      document.addEventListener(evt, _sessionResetTimers, { passive: true })
    );
    _sessionListenersAdded = true;
  }
  _sessionResetTimers();
}

function _sessionStop() {
  clearTimeout(_sessionTimer);
  clearTimeout(_sessionWarningTimer);
  clearInterval(_sessionCountdownTimer);
  const overlay = document.getElementById('session-timeout-overlay');
  if (overlay) overlay.classList.add('hidden');
}

// ── DOMContentLoaded ──────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', async () => {
  document.getElementById('mobile-bottom-nav')?.remove();
  loadUIPreferences(); // Restore layout + dark mode preferences
  const raw = sessionStorage.getItem(SESSION_KEY);
  if (raw) {
    try {
      const sess = JSON.parse(raw);
      if (sess.username && sess.role && sess.hash && sess.displayName) {
        currentSession = sess;
        applySession(sess);
        document.getElementById('login-overlay').classList.add('hidden');
        await initApp(false);
        _sessionStart();   // Reprendre le timer sur session restaurée
        return;
      }
    } catch(e) { /* session corrompue */ }
  }
  // Pas de session → overlay de login (affiché par défaut)
});


// ─── TECHNIQUE TAB ───────────────────────────────────────────────────────────

let techEnvFilter = 'all';

// ── Sub-section switch ────────────────────────────────────────────────────────
function switchTechSection(section) {
  document.getElementById('tech-section-interfaces').style.display = section === 'interfaces' ? '' : 'none';
  document.getElementById('tech-section-archi').style.display      = section === 'archi'      ? '' : 'none';
  document.getElementById('tpill-interfaces').classList.toggle('active', section === 'interfaces');
  document.getElementById('tpill-archi').classList.toggle('active',      section === 'archi');
  if (section === 'interfaces') renderInterfaces();
  if (section === 'archi')      renderArchi();
}

// ── Entry point called by switchTab ──────────────────────────────────────────
function renderTechnique() {
  const archiVisible = document.getElementById('tech-section-archi').style.display !== 'none';
  if (archiVisible) renderArchi();
  else              renderInterfaces();
}

// ─── INTERFACES ──────────────────────────────────────────────────────────────

const STATUS_LABELS = { done:'Terminé', partial:'Partiel', pending_boa:'Pending BOA', pending_cbs:'Pending CBS' };
const STATUS_CSS    = { done:'tb-done', partial:'tb-partial', pending_boa:'tb-pending', pending_cbs:'tb-pending' };
const IMPACT_LABELS = { no_impact:'No Impact', minor:'1 Impact', multiple:'Multi', tbd:'TBD' };
const IMPACT_CSS    = { no_impact:'tb-no-impact', minor:'tb-1-impact', multiple:'tb-multi', tbd:'tb-tbd' };
const ARB_LABELS    = { pending:'En attente', submitted:'Soumis', validated:'Validé ✓', rejected:'Rejeté ✗' };
const ARB_CSS       = { pending:'arb-pending', submitted:'arb-submitted', validated:'arb-validated', rejected:'arb-rejected' };

function renderInterfaces() {
  const ifaces   = getTechInterfaces();
  const search   = (document.getElementById('iface-search')?.value || '').toLowerCase();
  const fStatus  = document.getElementById('iface-filter-status')?.value || '';

  // KPI bar
  const total       = ifaces.length;
  const done        = ifaces.filter(i => i.status === 'done').length;
  const partial     = ifaces.filter(i => i.status === 'partial').length;
  const pending     = ifaces.filter(i => i.status.startsWith('pending')).length;
  const withActions = ifaces.filter(i => i.actions && i.actions.length).length;
  const arbPending  = ifaces.reduce((acc, i) =>
    acc + (i.actions || []).filter(a => (a.arbitrage || 'pending') === 'pending').length, 0);

  document.getElementById('iface-kpi-bar').innerHTML = `
    <div class="tech-kpi"><span class="tech-kpi-val">${total}</span><span class="tech-kpi-lbl">Interfaces</span></div>
    <div class="tech-kpi" style="border-left:2px solid #27ae60">
      <span class="tech-kpi-val" style="color:#27ae60">${done}</span><span class="tech-kpi-lbl">Terminées</span>
    </div>
    <div class="tech-kpi" style="border-left:2px solid #e67e22">
      <span class="tech-kpi-val" style="color:#e67e22">${partial}</span><span class="tech-kpi-lbl">Partielles</span>
    </div>
    <div class="tech-kpi" style="border-left:2px solid var(--red)">
      <span class="tech-kpi-val" style="color:var(--red)">${pending}</span><span class="tech-kpi-lbl">Pending</span>
    </div>
    <div class="tech-kpi" style="border-left:2px solid var(--primary)">
      <span class="tech-kpi-val" style="color:var(--primary)">${withActions}</span><span class="tech-kpi-lbl">Avec actions</span>
    </div>
    <div class="tech-kpi" style="border-left:2px solid #8e44ad">
      <span class="tech-kpi-val" style="color:#8e44ad">${arbPending}</span><span class="tech-kpi-lbl">Arbitrages en attente</span>
    </div>`;

  // Filter
  const filtered = ifaces.filter(i => {
    if (fStatus && i.status !== fStatus) return false;
    if (search && !i.name.toLowerCase().includes(search)) return false;
    return true;
  });

  if (!filtered.length) {
    document.getElementById('iface-cards-container').innerHTML =
      '<div style="text-align:center;color:var(--gray);padding:40px;font-size:13px;">Aucune interface correspondant aux critères.</div>';
    return;
  }

  document.getElementById('iface-cards-container').innerHTML = `
  <table class="iface-table">
    <thead>
      <tr>
        <th style="width:28px;">#</th>
        <th style="min-width:140px;">Interface</th>
        <th style="width:118px;">Statut</th>
        <th style="width:95px;">Impact</th>
        <th style="width:148px;">Responsable</th>
        <th style="width:118px;">Date cible</th>
        <th>Commentaires</th>
        <th style="width:105px;">Arbitrages</th>
        <th style="width:52px;"></th>
      </tr>
    </thead>
    <tbody>
      ${filtered.map((iface, idx) => buildIfaceRow(iface, idx + 1)).join('')}
    </tbody>
  </table>`;
}

function buildIfaceRow(iface, idx) {
  const border = iface.status === 'done' ? '#27ae60' : iface.status === 'partial' ? '#e67e22' : '#e74c3c';

  // Status select (data-status drives CSS color)
  const statusOpts = [
    {v:'done',        l:'Terminé (DONE)'},
    {v:'partial',     l:'Partiel'},
    {v:'pending_boa', l:'Pending BOA'},
    {v:'pending_cbs', l:'Pending CBS'},
  ].map(o => `<option value="${o.v}"${iface.status===o.v?' selected':''}>${o.l}</option>`).join('');

  // Impact select (data-impact drives CSS color)
  const impactOpts = [
    {v:'no_impact', l:'No Impact'},
    {v:'minor',     l:'1 Impact'},
    {v:'multiple',  l:'Multiple'},
    {v:'tbd',       l:'TBD'},
  ].map(o => `<option value="${o.v}"${iface.impact===o.v?' selected':''}>${o.l}</option>`).join('');

  // Comments column — contenteditable text chips + delete button
  const comments = iface.comments || [];
  const commentHtml = comments.map((c, i) => `
    <div class="iface-comment-line">
      <span class="iface-comment-line-text iface-cmt-edit"
        contenteditable="true"
        onclick="event.stopPropagation()"
        onkeydown="if(event.key==='Enter'){event.preventDefault();this.blur();}"
        onblur="saveIfaceComment('${iface.id}',${i},this.innerText)"
        title="Cliquer pour modifier">${escHtml(c)}</span>
      <button class="iface-comment-del editor-only" onclick="event.stopPropagation();deleteIfaceComment('${iface.id}',${i})" title="Supprimer ce commentaire">✕</button>
    </div>`).join('');

  // Arbitrage summary
  const acts = iface.actions || [];
  const ac = { validated:0, submitted:0, pending:0, rejected:0 };
  acts.forEach(a => { const s = a.arbitrage||'pending'; if (ac[s]!==undefined) ac[s]++; });
  const arbSummary = acts.length === 0 ? '<span style="color:#ccc;font-size:11px;">—</span>'
    : [
        ac.validated ? `<span style="color:#27ae60;font-size:11px;font-weight:700;">${ac.validated}✓</span>` : '',
        ac.submitted ? `<span style="color:#2980b9;font-size:11px;font-weight:700;">${ac.submitted}◉</span>` : '',
        ac.pending   ? `<span style="color:#e65100;font-size:11px;font-weight:700;">${ac.pending}⏳</span>`  : '',
        ac.rejected  ? `<span style="color:#e74c3c;font-size:11px;font-weight:700;">${ac.rejected}✗</span>` : '',
      ].filter(Boolean).join('<span style="color:#e0e0e0;margin:0 2px;">|</span>') || `<span style="font-size:11px;">${acts.length}</span>`;

  return `
  <tr class="iface-row" id="iface-row-${iface.id}">
    <td onclick="toggleIfaceRow('${iface.id}')" style="cursor:pointer;color:var(--gray);font-size:11px;border-left:4px solid ${border};padding-left:10px;user-select:none;">${idx}</td>
    <td style="font-weight:600;">
      <input type="text" class="iface-inline-input" value="${escAttr(iface.name)}"
        onclick="event.stopPropagation()"
        onblur="saveIfaceField('${iface.id}','name',this.value,false)" />
    </td>
    <td>
      <select class="iface-inline-select" onclick="event.stopPropagation()"
        data-status="${iface.status}"
        onchange="this.dataset.status=this.value;saveIfaceField('${iface.id}','status',this.value,true)">${statusOpts}</select>
    </td>
    <td>
      <select class="iface-inline-select" onclick="event.stopPropagation()"
        data-impact="${iface.impact||'tbd'}"
        onchange="this.dataset.impact=this.value;saveIfaceField('${iface.id}','impact',this.value,true)">${impactOpts}</select>
    </td>
    <td>
      <input type="text" class="iface-inline-input" value="${escAttr(iface.owner||'')}"
        placeholder="—" onclick="event.stopPropagation()"
        list="dl-owners" autocomplete="off"
        onblur="saveIfaceField('${iface.id}','owner',this.value,false)" />
    </td>
    <td>
      <input type="date" class="iface-inline-input" value="${iface.deadline||''}"
        onclick="event.stopPropagation()"
        onchange="saveIfaceField('${iface.id}','deadline',this.value,false)" />
    </td>
    <td onclick="event.stopPropagation();" style="min-width:180px;">
      ${commentHtml}
      <button class="iface-comment-del editor-only" onclick="addTechComment('interface','${iface.id}')"
        style="color:#aaa;font-size:10px;margin-top:2px;" title="Ajouter un commentaire">+ commentaire</button>
    </td>
    <td onclick="toggleIfaceRow('${iface.id}')" style="cursor:pointer;">${arbSummary}</td>
    <td onclick="event.stopPropagation();" style="white-space:nowrap;text-align:right;padding-right:8px;">
      <button class="tech-btn-sm editor-only" onclick="openEditInterface('${iface.id}')" title="Modifier" style="margin-right:2px;">✏️</button>
      <button class="tech-btn-sm editor-only" onclick="deleteInterface('${iface.id}')" title="Supprimer" style="color:var(--red);">🗑</button>
      <span style="cursor:pointer;color:var(--gray);font-size:11px;margin-left:4px;" id="iface-chevron-${iface.id}"
        onclick="toggleIfaceRow('${iface.id}')">▼</span>
    </td>
  </tr>
  <tr>
    <td colspan="9" class="iface-detail-cell">
      <div class="iface-detail-inner" id="iface-body-${iface.id}">
        ${buildTechActionsHtml('interface', iface.id, iface.actions || [])}
        <div style="margin-top:10px;" class="editor-only">
          <button class="tech-btn-sm" onclick="addTechAction('interface','${iface.id}')">+ Action d'arbitrage</button>
        </div>
      </div>
    </td>
  </tr>`;
}

function toggleIfaceRow(id) {
  const body    = document.getElementById('iface-body-'    + id);
  const chevron = document.getElementById('iface-chevron-' + id);
  const open    = body.style.display !== 'none';
  body.style.display = open ? 'none' : '';
  if (chevron) chevron.textContent = open ? '▼' : '▲';
}

// legacy alias so _reopenCard still works
function toggleIfaceCard(id) { toggleIfaceRow(id); }

// Escape for HTML attribute values
function escAttr(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// Save a single interface field — rerender=true only for badge-impacting fields (status/impact)
function saveIfaceField(id, field, value, rerender) {
  if (!state.technique.interfaces) {
    state.technique.interfaces = JSON.parse(JSON.stringify(getTechInterfaces()));
  }
  const iface = state.technique.interfaces.find(i => i.id === id);
  if (!iface) return;
  iface[field] = value;
  saveState();
  if (rerender) renderInterfaces();
}

// Delete a comment by index from an interface
function deleteIfaceComment(ifaceId, commentIdx) {
  if (!state.technique.interfaces) {
    state.technique.interfaces = JSON.parse(JSON.stringify(getTechInterfaces()));
  }
  const iface = state.technique.interfaces.find(i => i.id === ifaceId);
  if (!iface || !iface.comments) return;
  iface.comments.splice(commentIdx, 1);
  saveState();
  renderInterfaces();
}

// ─── ARCHITECTURE ─────────────────────────────────────────────────────────────

const DOMAIN_LABELS = {
  infra:'Infrastructure', data:'Data / Migration', secu:'Sécurité', reseau:'Réseau', autre:'Autre',
  stream_cbs:'Core Banking', stream_if:'Interfaces & Connecteurs', stream_infra:'Infrastructure & Réseau',
  stream_secu:'Sécurité', stream_data:'Data & Migration', stream_mobile:'Mobile & Digital'
};
const DOMAIN_CSS    = {
  infra:'domain-infra', data:'domain-data', secu:'domain-secu', reseau:'domain-reseau', autre:'domain-autre',
  stream_cbs:'domain-infra', stream_if:'domain-reseau', stream_infra:'domain-infra',
  stream_secu:'domain-secu', stream_data:'domain-data', stream_mobile:'domain-autre'
};

// Enrichit DOMAIN_LABELS et DOMAIN_CSS depuis getAllStreams() (appelé après init)
function _enrichDomainMaps() {
  getAllStreams().forEach(s => {
    if (!DOMAIN_LABELS[s.id]) DOMAIN_LABELS[s.id] = s.icon + ' ' + s.name;
    if (!DOMAIN_CSS[s.id])    DOMAIN_CSS[s.id]    = 'domain-autre';
  });
}

function setEnvFilter(env) {
  techEnvFilter = env;
  document.querySelectorAll('.env-stage').forEach(el => el.classList.remove('active'));
  const el = document.getElementById('estage-' + env);
  if (el) el.classList.add('active');
  renderArchi();
}

function renderArchi() {
  const items   = state.technique.archi || [];
  const fDomain = document.getElementById('archi-filter-domain')?.value || '';
  const fArb    = document.getElementById('archi-filter-arb')?.value    || '';

  // Pipeline counters
  ['all','DEV','REC','UAT','PROD','TRANSVERSE'].forEach(env => {
    const cnt = env === 'all' ? items.length : items.filter(i => i.env === env).length;
    const el  = document.getElementById('ecnt-' + env);
    if (el) el.textContent = cnt;
  });

  // KPI bar
  const ac = { pending:0, submitted:0, validated:0, rejected:0 };
  items.forEach(item => (item.actions||[]).forEach(a => {
    const s = a.arbitrage || 'pending';
    if (ac[s] !== undefined) ac[s]++;
  }));
  document.getElementById('archi-kpi-bar').innerHTML = `
    <div class="tech-kpi"><span class="tech-kpi-val">${items.length}</span><span class="tech-kpi-lbl">Éléments</span></div>
    <div class="tech-kpi" style="border-left:2px solid #8e44ad">
      <span class="tech-kpi-val" style="color:#8e44ad">${ac.pending}</span><span class="tech-kpi-lbl">En attente</span>
    </div>
    <div class="tech-kpi" style="border-left:2px solid #2980b9">
      <span class="tech-kpi-val" style="color:#2980b9">${ac.submitted}</span><span class="tech-kpi-lbl">Soumis</span>
    </div>
    <div class="tech-kpi" style="border-left:2px solid #27ae60">
      <span class="tech-kpi-val" style="color:#27ae60">${ac.validated}</span><span class="tech-kpi-lbl">Validés</span>
    </div>
    <div class="tech-kpi" style="border-left:2px solid var(--red)">
      <span class="tech-kpi-val" style="color:var(--red)">${ac.rejected}</span><span class="tech-kpi-lbl">Rejetés</span>
    </div>`;

  // Filter
  const filtered = items.filter(item => {
    if (techEnvFilter !== 'all' && item.env !== techEnvFilter) return false;
    // Filtre domaine : comparer stream ID avec item.domains[] ou legacy mapping
    if (fDomain) {
      const inDomains = Array.isArray(item.domains) && item.domains.includes(fDomain);
      const legacyMatch = _legacyDomainToStream(item.domain) === fDomain;
      if (!inDomains && !legacyMatch) return false;
    }
    // Filtre permission utilisateur (stream_scope)
    if (!_itemPassesDomainFilter(item)) return false;
    if (fArb && !(item.actions||[]).some(a => (a.arbitrage || 'pending') === fArb)) return false;
    return true;
  });

  if (!filtered.length) {
    document.getElementById('archi-cards-container').innerHTML =
      `<div style="text-align:center;color:var(--gray);padding:40px;font-size:13px;">
        ${items.length === 0
          ? 'Aucun élément. Cliquez « + Ajouter un élément » pour commencer.'
          : 'Aucun élément correspondant aux critères.'}
      </div>`;
    return;
  }
  document.getElementById('archi-cards-container').innerHTML = filtered.map(buildArchiCard).join('');
}

function buildArchiCard(item) {
  const _dStream = getAllStreams().find(s => s.id === item.domain);
  const dLabel  = DOMAIN_LABELS[item.domain] || (_dStream ? _dStream.icon + ' ' + _dStream.name : item.domain) || '—';
  const dCss    = DOMAIN_CSS[item.domain]    || 'domain-autre';
  const actHtml = buildTechActionsHtml('archi', item.id, item.actions || []);
  const envLabel = item.env === 'all' ? 'Tous Envs' : item.env;

  return `
  <div class="archi-card ${dCss}" id="archi-card-${item.id}">
    <div class="iface-header" onclick="toggleArchiCard('${item.id}')">
      <div style="display:flex;align-items:center;gap:10px;flex:1;">
        <span style="font-weight:600;font-size:13px;">${escHtml(item.title)}</span>
        <span class="tbadge" style="background:#eef2ff;color:#3730a3;border-radius:4px;padding:2px 7px;font-size:10px;">${escHtml(envLabel)}</span>
        <span class="tbadge" style="border-radius:4px;padding:2px 7px;font-size:10px;">${dLabel}</span>
      </div>
      <div style="display:flex;gap:6px;align-items:center;">
        <span style="font-size:11px;color:var(--gray);">${(item.actions||[]).length} action(s)</span>
        <button class="tech-btn-sm editor-only" onclick="event.stopPropagation();editArchi('${item.id}')" title="Modifier">✏️</button>
        <button class="tech-btn-sm editor-only" onclick="event.stopPropagation();deleteArchi('${item.id}')" title="Supprimer" style="color:var(--red);">🗑</button>
        <span style="color:var(--gray);font-size:12px;" id="archi-chevron-${item.id}">▼</span>
      </div>
    </div>
    <div class="iface-body" id="archi-body-${item.id}" style="display:none;">
      ${item.desc ? '<div style="font-size:12px;color:#555;margin-bottom:10px;padding:8px;background:#f9f9f9;border-radius:4px;">' + escHtml(item.desc) + '</div>' : ''}
      ${actHtml}
      <div style="margin-top:10px;" class="editor-only">
        <button class="tech-btn-sm" onclick="addTechAction('archi','${item.id}')">+ Action</button>
      </div>
    </div>
  </div>`;
}

function toggleArchiCard(id) {
  const body    = document.getElementById('archi-body-'    + id);
  const chevron = document.getElementById('archi-chevron-' + id);
  const open    = body.style.display !== 'none';
  body.style.display = open ? 'none' : '';
  if (chevron) chevron.textContent = open ? '▼' : '▲';
}

// ─── SHARED: ACTIONS HTML ─────────────────────────────────────────────────────

function buildTechActionsHtml(type, parentId, actions) {
  if (!actions.length) {
    return '<div style="font-size:11px;color:#aaa;font-style:italic;padding:4px 0;">Aucune action définie.</div>';
  }
  const nextMap = { pending:'submitted', submitted:'validated', validated:'rejected', rejected:'pending' };
  const rows = actions.map(a => {
    const arb      = a.arbitrage || 'pending';
    const arbLabel = ARB_LABELS[arb] || arb;
    const arbCss   = ARB_CSS[arb]   || 'arb-pending';
    const nextArb  = nextMap[arb]   || 'pending';
    return `
    <div style="display:flex;align-items:flex-start;gap:8px;padding:6px 8px;background:#fafafa;border-radius:5px;margin-bottom:5px;border:1px solid #eee;">
      <div style="flex:1;">
        <div style="font-size:12px;font-weight:600;color:#333;">${escHtml(a.label)}</div>
        ${a.owner    ? '<div style="font-size:10px;color:#888;margin-top:2px;">👤 ' + escHtml(a.owner) + '</div>' : ''}
        ${a.deadline ? '<div style="font-size:10px;color:#888;">📅 ' + escHtml(a.deadline) + '</div>' : ''}
        ${a.note     ? '<div style="font-size:11px;color:#555;margin-top:3px;font-style:italic;">' + escHtml(a.note) + '</div>' : ''}
      </div>
      <div style="display:flex;flex-direction:column;gap:4px;align-items:flex-end;min-width:130px;">
        <span class="arb-chip ${arbCss}" onclick="setTechArbitrage('${type}','${parentId}','${a.id}','${nextArb}')"
          title="Cliquer pour faire avancer l'arbitrage" style="cursor:pointer;">${arbLabel}</span>
        <div style="display:flex;gap:4px;" class="editor-only">
          <button class="tech-btn-sm" onclick="editTechAction('${type}','${parentId}','${a.id}')">✏️</button>
          <button class="tech-btn-sm" onclick="deleteTechAction('${type}','${parentId}','${a.id}')" style="color:var(--red);">🗑</button>
        </div>
      </div>
    </div>`;
  }).join('');
  return '<div style="margin-bottom:4px;">' + rows + '</div>';
}

// ── Helper: get parent array ───────────────────────────────────────────────────
function _getTechParent(type, parentId) {
  if (type === 'interface') {
    const ifaces = getTechInterfaces();
    return ifaces.find(i => i.id === parentId);
  }
  return (state.technique.archi || []).find(i => i.id === parentId);
}
function _commitTechState(type, parent) {
  if (type === 'interface') {
    if (!state.technique.interfaces) {
      state.technique.interfaces = JSON.parse(JSON.stringify(getTechInterfaces()));
    }
    // parent object is already in the array; nothing extra needed
  }
}
function _reopenCard(type, parentId) {
  const prefix  = type === 'interface' ? 'iface' : 'archi';
  const body    = document.getElementById(prefix + '-body-'    + parentId);
  const chevron = document.getElementById(prefix + '-chevron-' + parentId);
  if (body) { body.style.display = ''; if (chevron) chevron.textContent = '▲'; }
}

// ── Add action ─────────────────────────────────────────────────────────────────
function addTechAction(type, parentId) {
  const label = prompt('Libellé de l\'action :');
  if (!label || !label.trim()) return;
  const owner    = prompt('Responsable (optionnel) :')                       || '';
  const deadline = prompt('Échéance (optionnel, ex: 2026-04-01) :')         || '';
  const note     = prompt('Note / contexte (optionnel) :')                   || '';

  // Ensure state has the interfaces array before modifying
  if (type === 'interface' && !state.technique.interfaces) {
    state.technique.interfaces = JSON.parse(JSON.stringify(getTechInterfaces()));
  }
  const parent = _getTechParent(type, parentId);
  if (!parent) return;
  parent.actions = parent.actions || [];
  parent.actions.push({
    id: 'act_' + Date.now(), label: label.trim(),
    owner: owner.trim(), deadline: deadline.trim(), note: note.trim(),
    arbitrage: 'pending', createdAt: new Date().toISOString()
  });
  saveState('Action ajoutée', label.trim().substring(0, 80) + (type === 'archi' ? ' [Archi]' : ''));
  if (type === 'interface') renderInterfaces(); else renderArchi();
  setTimeout(() => _reopenCard(type, parentId), 50);
}

// ── Edit action ────────────────────────────────────────────────────────────────
function editTechAction(type, parentId, actionId) {
  if (type === 'interface' && !state.technique.interfaces) {
    state.technique.interfaces = JSON.parse(JSON.stringify(getTechInterfaces()));
  }
  const parent = _getTechParent(type, parentId);
  if (!parent) return;
  const a = (parent.actions || []).find(x => x.id === actionId);
  if (!a) return;
  const label    = prompt('Libellé :', a.label);     if (label === null) return;
  const owner    = prompt('Responsable :', a.owner || '');
  const deadline = prompt('Échéance :', a.deadline || '');
  const note     = prompt('Note :', a.note || '');
  a.label    = label.trim() || a.label;
  a.owner    = (owner    || '').trim();
  a.deadline = (deadline || '').trim();
  a.note     = (note     || '').trim();
  saveState('Action modifiée', a.label.substring(0, 80));
  if (type === 'interface') renderInterfaces(); else renderArchi();
  setTimeout(() => _reopenCard(type, parentId), 50);
}

// ── Delete action ──────────────────────────────────────────────────────────────
function deleteTechAction(type, parentId, actionId) {
  if (!confirm('Supprimer cette action ?')) return;
  if (type === 'interface' && !state.technique.interfaces) {
    state.technique.interfaces = JSON.parse(JSON.stringify(getTechInterfaces()));
  }
  const parent = _getTechParent(type, parentId);
  if (!parent) return;
  const _delAct = (parent.actions || []).find(a => a.id === actionId);
  parent.actions = (parent.actions || []).filter(a => a.id !== actionId);
  saveState('Action supprimée', _delAct ? _delAct.label.substring(0, 80) : actionId);
  if (type === 'interface') renderInterfaces(); else renderArchi();
  setTimeout(() => _reopenCard(type, parentId), 50);
}

// ── Arbitrage cycling ─────────────────────────────────────────────────────────
function setTechArbitrage(type, parentId, actionId, newStatus) {
  if (type === 'interface' && !state.technique.interfaces) {
    state.technique.interfaces = JSON.parse(JSON.stringify(getTechInterfaces()));
  }
  const parent = _getTechParent(type, parentId);
  if (!parent) return;
  const a = (parent.actions || []).find(x => x.id === actionId);
  if (!a) return;
  a.arbitrage = newStatus;
  saveState('Arbitrage modifié', (a.label || actionId).substring(0, 60) + ' → ' + (ARB_LABELS[newStatus] || newStatus));
  if (type === 'interface') renderInterfaces(); else renderArchi();
  setTimeout(() => _reopenCard(type, parentId), 50);
}

// ── Add comment to interface ───────────────────────────────────────────────────
function addTechComment(type, parentId) {
  const comment = prompt('Nouveau commentaire :');
  if (!comment || !comment.trim()) return;
  if (type === 'interface') {
    if (!state.technique.interfaces) {
      state.technique.interfaces = JSON.parse(JSON.stringify(getTechInterfaces()));
    }
    const parent = _getTechParent(type, parentId);
    if (!parent) return;
    parent.comments = parent.comments || [];
    parent.comments.push(comment.trim());
    saveState('Commentaire ajouté', comment.trim().substring(0, 80));
    renderInterfaces();
    setTimeout(() => _reopenCard(type, parentId), 50);
  }
}

// ─── INTERFACE CRUD ───────────────────────────────────────────────────────────

function openAddInterface() {
  const form = document.getElementById('add-iface-form');
  document.getElementById('ni-name').value     = '';
  document.getElementById('ni-owner').value    = '';
  document.getElementById('ni-deadline').value = '';
  document.getElementById('ni-status').value   = 'done';
  document.getElementById('ni-impact').value   = 'no_impact';
  document.getElementById('ni-comment').value  = '';
  document.getElementById('ni-edit-id').value  = '';
  const titleEl = document.getElementById('ni-form-title');
  const saveBtn = document.getElementById('ni-save-btn');
  if (titleEl) titleEl.textContent = 'NOUVELLE INTERFACE';
  if (saveBtn) saveBtn.textContent = 'Créer';
  form.style.display = '';
  form.scrollIntoView({ behavior:'smooth', block:'nearest' });
}

// Open the add-form pre-filled for editing an existing interface
function openEditInterface(id) {
  const ifaces = getTechInterfaces();
  const iface  = ifaces.find(i => i.id === id);
  if (!iface) return;
  document.getElementById('ni-name').value     = iface.name     || '';
  document.getElementById('ni-owner').value    = iface.owner    || '';
  document.getElementById('ni-deadline').value = iface.deadline || '';
  document.getElementById('ni-status').value   = iface.status   || 'done';
  document.getElementById('ni-impact').value   = iface.impact   || 'tbd';
  document.getElementById('ni-comment').value  = '';
  document.getElementById('ni-edit-id').value  = id;
  const titleEl = document.getElementById('ni-form-title');
  const saveBtn = document.getElementById('ni-save-btn');
  if (titleEl) titleEl.textContent = '✏️ MODIFIER L\'INTERFACE';
  if (saveBtn) saveBtn.textContent = 'Mettre à jour';
  const form = document.getElementById('add-iface-form');
  form.style.display = '';
  form.scrollIntoView({ behavior:'smooth', block:'nearest' });
  document.getElementById('ni-name').focus();
}

// Unified save function — creates or updates depending on ni-edit-id
function saveIfaceForm() {
  const editId   = (document.getElementById('ni-edit-id')?.value || '').trim();
  const name     = document.getElementById('ni-name').value.trim();
  const owner    = document.getElementById('ni-owner').value.trim();
  const deadline = document.getElementById('ni-deadline').value.trim();
  const status   = document.getElementById('ni-status').value;
  const impact   = document.getElementById('ni-impact').value;
  const comment  = document.getElementById('ni-comment').value.trim();
  if (!name) { alert('Le nom de l\'interface est requis.'); return; }

  if (!state.technique.interfaces) {
    state.technique.interfaces = JSON.parse(JSON.stringify(getTechInterfaces()));
  }

  if (editId) {
    // ── Update mode ───────────────────────────────────────────
    const iface = state.technique.interfaces.find(i => i.id === editId);
    if (!iface) return;
    iface.name     = name;
    iface.owner    = owner;
    iface.deadline = deadline;
    iface.status   = status;
    iface.impact   = impact;
    if (comment) { if (!iface.comments) iface.comments = []; iface.comments.push(comment); }
  } else {
    // ── Create mode ───────────────────────────────────────────
    state.technique.interfaces.push({
      id: 'if_' + Date.now(), name, owner, deadline, status, impact,
      comments: comment ? [comment] : [],
      actions: []
    });
  }

  saveState(editId ? 'Interface modifiée' : 'Interface créée', name);
  document.getElementById('add-iface-form').style.display = 'none';
  renderInterfaces();
}

// Save an edited comment (contenteditable onblur)
function saveIfaceComment(ifaceId, idx, newText) {
  const text = (newText || '').trim();
  if (!text) { deleteIfaceComment(ifaceId, idx); return; }
  if (!state.technique.interfaces) {
    state.technique.interfaces = JSON.parse(JSON.stringify(getTechInterfaces()));
  }
  const iface = state.technique.interfaces.find(i => i.id === ifaceId);
  if (!iface || !Array.isArray(iface.comments) || idx >= iface.comments.length) return;
  if (iface.comments[idx] === text) return; // unchanged — skip save
  iface.comments[idx] = text;
  saveState();
  // No rerender needed — contenteditable DOM already shows the updated text
}

function saveNewInterface() {
  // Redirect to unified saveIfaceForm (kept for backward compatibility)
  saveIfaceForm();
}

function editInterface(id) {
  if (!state.technique.interfaces) {
    state.technique.interfaces = JSON.parse(JSON.stringify(getTechInterfaces()));
  }
  const iface = state.technique.interfaces.find(i => i.id === id);
  if (!iface) return;
  const name     = prompt('Nom de l\'interface :', iface.name);
  if (name === null) return;
  const owner    = prompt('Responsable :', iface.owner || '');
  if (owner === null) return;
  const deadline = prompt('Date cible (YYYY-MM-DD) :', iface.deadline || '');
  if (deadline === null) return;
  const status   = prompt('Statut (done / partial / pending_boa / pending_cbs) :', iface.status);
  if (status === null) return;
  const impact   = prompt('Impact (no_impact / minor / multiple / tbd) :', iface.impact || 'tbd');
  iface.name     = name.trim()     || iface.name;
  iface.owner    = owner.trim();
  iface.deadline = deadline.trim();
  if (['done','partial','pending_boa','pending_cbs'].includes(status)) iface.status = status;
  if (['no_impact','minor','multiple','tbd'].includes(impact))         iface.impact = impact;
  saveState();
  renderInterfaces();
}

function deleteInterface(id) {
  if (!confirm('Supprimer cette interface ?')) return;
  if (!state.technique.interfaces) {
    state.technique.interfaces = JSON.parse(JSON.stringify(getTechInterfaces()));
  }
  const _delIface = state.technique.interfaces.find(i => i.id === id);
  state.technique.interfaces = state.technique.interfaces.filter(i => i.id !== id);
  saveState('Interface supprimée', _delIface ? _delIface.name : id);
  renderInterfaces();
}

// ─── ARCHITECTURE CRUD ────────────────────────────────────────────────────────

function openAddArchi() {
  const form = document.getElementById('add-archi-form');
  form.style.display = '';
  document.getElementById('na-title').value  = '';
  document.getElementById('na-env').value    = 'all';
  document.getElementById('na-domain').value = 'stream_infra';
  document.getElementById('na-desc').value   = '';
  form.scrollIntoView({ behavior:'smooth', block:'nearest' });
}

function saveNewArchi() {
  const title  = document.getElementById('na-title').value.trim();
  const env    = document.getElementById('na-env').value;
  const domain = document.getElementById('na-domain').value;
  const desc   = document.getElementById('na-desc').value.trim();
  if (!title) { alert('Le titre est requis.'); return; }
  state.technique.archi = state.technique.archi || [];
  state.technique.archi.push({
    id: 'ar_' + Date.now(), title, env, domain, desc,
    actions: [], createdAt: new Date().toISOString()
  });
  saveState();
  document.getElementById('add-archi-form').style.display = 'none';
  renderArchi();
}

function editArchi(id) {
  const item = (state.technique.archi || []).find(i => i.id === id);
  if (!item) return;
  const title  = prompt('Titre :', item.title);                if (title === null) return;
  const env    = prompt('Environnement (all / DEV / REC / UAT / PROD / TRANSVERSE) :', item.env);
  if (env === null) return;
  const _domainList = getAllStreams().map(s => s.id).concat(['infra','data','secu','reseau','autre']);
  const domain = prompt('Domaine (' + getAllStreams().map(s => s.id).join(' / ') + ') :', item.domain);
  const desc   = prompt('Description :', item.desc || '');
  item.title  = title.trim() || item.title;
  if (['all','DEV','REC','UAT','PROD','TRANSVERSE'].includes(env))   item.env    = env;
  if (domain && _domainList.includes(domain))                        item.domain = domain;
  item.desc   = (desc || '').trim();
  saveState();
  renderArchi();
}

function deleteArchi(id) {
  if (!confirm('Supprimer cet élément d\'architecture ?')) return;
  state.technique.archi = (state.technique.archi || []).filter(i => i.id !== id);
  saveState();
  renderArchi();
}

// ─── CBS REPORT GENERATOR (pptxgenjs CDN) ────────────────────────────────────
const CBS_LOGO_B64 = null; // Logo supprimé — configurable via paramètres programme

function cbsSlide(pres, title, subtitle) {
  const slide = pres.addSlide();
  slide.background = { color: 'FFFFFF' };
  if (CBS_LOGO_B64) slide.addImage({ data: CBS_LOGO_B64, x: 0.3, y: 0.1, w: 1.3, h: 0.5 });
  slide.addText(title, {
    x: 1.8, y: 0.1, w: 10.3, h: 0.5, fontFace: 'Arial', fontSize: 22, bold: true,
    color: '000000', valign: 'middle', margin: 0
  });
  if (subtitle) {
    slide.addText(subtitle, {
      x: 1.8, y: 0.58, w: 10.3, h: 0.22, fontFace: 'Arial', fontSize: 10,
      color: '54565A', valign: 'middle', margin: 0
    });
  }
  slide.addShape(pres.shapes.RECTANGLE, {
    x: 0.3, y: 0.76, w: 12.73, h: 0.04, fill: { color: 'E63329' }, line: { color: 'E63329' }
  });
  slide.addShape(pres.shapes.RECTANGLE, {
    x: 0, y: 7.3, w: 13.33, h: 0.04, fill: { color: 'E63329' }, line: { color: 'E63329' }
  });
  const _projLabel = (state.currentProjectId && state.programme && state.programme.projects)
    ? ((state.programme.projects.find(p => p.id === state.currentProjectId) || {}).name || '')
    : (state.programme && state.programme.name ? state.programme.name : '');
  const _footerTxt = 'CAPITAL BANKING SOLUTIONS \u2014 All Rights Reserved \u00A9 ' + new Date().getFullYear() + (_projLabel ? '  |  ' + _projLabel : '');
  slide.addText(_footerTxt, {
    x: 0, y: 7.34, w: 13.33, h: 0.16, fontFace: 'Arial', fontSize: 7,
    color: '54565A', align: 'center', valign: 'middle', margin: 0
  });
  return slide;
}

// ── Report Modal Logic ────────────────────────────────────────────────────────
let _reportType = 'synth';

function openReportModal() {
  _reportType = 'flash';  // Flash sélectionné par défaut
  const domSet = new Set();
  gaps.forEach(g => domSet.add(g.domain));
  arbitrages.forEach(a => domSet.add(a.domain));
  actions.forEach(a => domSet.add(a.domain));
  const domains = [...domSet].sort();
  const sel = document.getElementById('rpt-domain-sel');
  if (sel) sel.innerHTML = domains.map(d => `<option value="${d}">${d}</option>`).join('');
  _updateReportTypeUI('flash');
  document.getElementById('report-select-modal').style.display = 'flex';
}
function closeReportModal() {
  document.getElementById('report-select-modal').style.display = 'none';
}
function selectReportType(t) {
  _reportType = t;
  _updateReportTypeUI(t);
}
function _updateReportTypeUI(t) {
  ['flash','synth','detail','domain'].forEach(k => {
    const el = document.getElementById('rpt-card-' + k);
    if (!el) return;
    const isActive = k === t;
    el.style.borderColor = isActive ? (k === 'flash' ? '#0F172A' : '#E63329') : '#E0E0E0';
    el.style.background  = isActive ? (k === 'flash' ? '#F1F5F9' : '#FFF5F5') : '#FAFAFA';
    const titleEl = el.querySelector('div > div > div:first-child');
    if (titleEl) titleEl.style.color = isActive ? (k === 'flash' ? '#0F172A' : '#E63329') : '#333';
  });
  const dr = document.getElementById('rpt-domain-row');
  if (dr) dr.style.display = t === 'domain' ? 'flex' : 'none';
  const fr = document.getElementById('rpt-flash-row');
  if (fr) fr.style.display = t === 'flash' ? 'flex' : 'none';
}
async function launchReportGeneration() {
  const domain = _reportType === 'domain' ? (document.getElementById('rpt-domain-sel')||{}).value : null;
  const flashOpts = _reportType === 'flash' ? {
    side: (document.getElementById('rpt-flash-side')||{}).value || '',
    resp: (document.getElementById('rpt-flash-resp')||{}).value || '',
  } : null;
  closeReportModal();
  await generateCBSReport(_reportType, domain, flashOpts);
}

// ── CBS Slide Helpers ─────────────────────────────────────────────────────────
function _cbsCover(pres, today, type, domain) {
  const subtitles = {
    synth:  'Rapport Commex / Pilotage \u2014 Vue Synth\u00E9tique',
    detail: 'Rapport D\u00E9taill\u00E9 \u2014 Analyse par Domaine',
    domain: 'Rapport D\u00E9taill\u00E9 \u2014 Domaine\u00A0: ' + (domain || ''),
  };
  const cover = pres.addSlide();
  cover.background = { color: 'FFFFFF' };
  cover.addShape(pres.shapes.RECTANGLE, { x: 0, y: 0, w: 13.33, h: 0.85, fill: { color: 'E63329' }, line: { color: 'E63329' } });
  cover.addShape(pres.shapes.RECTANGLE, { x: 0, y: 6.65, w: 13.33, h: 0.85, fill: { color: 'E63329' }, line: { color: 'E63329' } });
  if (CBS_LOGO_B64) cover.addImage({ data: CBS_LOGO_B64, x: 5.3, y: 1.15, w: 2.73, h: 1.04 });
  cover.addText("BOA C\u00F4te d'Ivoire", { x: 1, y: 2.5, w: 11.33, h: 0.95, fontFace: 'Arial', fontSize: 40, bold: true, color: '000000', align: 'center' });
  cover.addText('Upgrade IGOR V2 \u2192 V4', { x: 1, y: 3.38, w: 11.33, h: 0.6, fontFace: 'Arial', fontSize: 24, bold: true, color: 'E63329', align: 'center' });
  cover.addText(subtitles[type] || 'Rapport de Pilotage Programme', { x: 1, y: 4.0, w: 11.33, h: 0.45, fontFace: 'Arial', fontSize: 16, color: '54565A', align: 'center' });
  const _coverGl = _getMilestone('go_live');
  const _coverGlStr = _coverGl ? _coverGl.toLocaleDateString('fr-FR', {day:'numeric', month:'long', year:'numeric'}) : '';
  const _coverDateLine = (_coverGlStr ? 'Go Live cible\u00A0: ' + _coverGlStr + '   |   ' : '') + today;
  cover.addText(_coverDateLine, { x: 1, y: 4.5, w: 11.33, h: 0.35, fontFace: 'Arial', fontSize: 12, color: '888888', align: 'center' });
  cover.addText('CONFIDENTIEL \u2014 Diffusion restreinte', { x: 1, y: 5.0, w: 11.33, h: 0.32, fontFace: 'Arial', fontSize: 11, bold: true, color: 'E63329', align: 'center' });
  cover.addText('CAPITAL BANKING SOLUTIONS  |  All Rights Reserved \u00A9 2026', { x: 0, y: 6.65, w: 13.33, h: 0.85, fontFace: 'Arial', fontSize: 10, color: 'FFFFFF', align: 'center', valign: 'middle' });
}
function _cbsConclusion(pres) {
  const conc = pres.addSlide();
  conc.background = { color: 'FFFFFF' };
  conc.addShape(pres.shapes.RECTANGLE, { x: 0, y: 0, w: 13.33, h: 0.85, fill: { color: 'E63329' }, line: { color: 'E63329' } });
  conc.addShape(pres.shapes.RECTANGLE, { x: 0, y: 6.65, w: 13.33, h: 0.85, fill: { color: 'E63329' }, line: { color: 'E63329' } });
  if (CBS_LOGO_B64) conc.addImage({ data: CBS_LOGO_B64, x: 5.3, y: 1.1, w: 2.73, h: 1.04 });
  conc.addText('Conclusion & Prochaines \u00C9tapes', { x: 1, y: 2.3, w: 11.33, h: 0.7, fontFace: 'Arial', fontSize: 28, bold: true, color: '000000', align: 'center' });

  // Générer les prochaines étapes depuis les données réelles
  const _cD = _projUsesCBS();
  const _cAllArbs = _cD ? [...arbitrages, ...(state.customArbitrages||[])] : (state.customArbitrages||[]);
  const _cAllActs = _cD ? [...actions,    ...(state.customActions||[])]    : (state.customActions||[]);
  const arbPending = _cAllArbs.filter(a => { const dec = (state.arbitrages[a.id]||{}).decision; return !dec || dec === _getArbDefaultKey(); }).length;
  const actTodo    = _cAllActs.filter(a => { const sv = state.actions[a.id]||{}; const st = sv.status || (!sv.status && sv.rag ? {R:'blocked',O:'in_progress',G:'done',X:'todo'}[sv.rag] : 'todo'); return st === 'todo'; }).length;
  const actBlocked = _cAllActs.filter(a => { const sv = state.actions[a.id]||{}; return sv.status === 'blocked' || (!sv.status && sv.rag === 'R'); }).length;
  const dfMs = _getMilestone('design_freeze');
  const glMs = _getMilestone('go_live');
  const dfStr = dfMs ? dfMs.toLocaleDateString('fr-FR', {day:'numeric',month:'long',year:'numeric'}) : null;
  const glStr = glMs ? glMs.toLocaleDateString('fr-FR', {day:'numeric',month:'long',year:'numeric'}) : null;

  const steps = [];
  if (arbPending > 0) steps.push('Finaliser les ' + arbPending + ' arbitrage' + (arbPending > 1 ? 's' : '') + ' sp\u00E9cifiques en attente' + (dfStr ? ' \u2014 Design Freeze ' + dfStr : ''));
  if (actBlocked > 0) steps.push('D\u00E9bloquer ' + actBlocked + ' action' + (actBlocked > 1 ? 's' : '') + ' bloqu\u00E9e' + (actBlocked > 1 ? 's' : '') + ' \u2014 traitement prioritaire requis');
  if (actTodo > 0)    steps.push('D\u00E9marrer les ' + actTodo + ' action' + (actTodo > 1 ? 's' : '') + ' non encore initialis\u00E9e' + (actTodo > 1 ? 's' : ''));
  if (glStr)          steps.push('Maintenir le cap sur le Go Live cible\u00A0: ' + glStr);
  if (steps.length === 0) steps.push('Programme sur les rails \u2014 maintenir la cadence et les revues hebdomadaires');
  steps.push('Prochain COPIL de suivi programme \u2014 revue des arbitrages & avancement actions');

  steps.forEach((s, i) => conc.addText((i + 1) + '.  ' + s, { x: 1.5, y: 3.1 + i * 0.5, w: 10.33, h: 0.45, fontFace: 'Arial', fontSize: 12, color: i === 0 ? 'E63329' : '000000', bold: i === 0 }));
  conc.addText('CAPITAL BANKING SOLUTIONS  |  All Rights Reserved \u00A9 2026', { x: 0, y: 6.65, w: 13.33, h: 0.85, fontFace: 'Arial', fontSize: 10, color: 'FFFFFF', align: 'center', valign: 'middle' });
}
function _cbsSommaire(pres, type, domain) {
  const sl = cbsSlide(pres, 'Sommaire');
  const items = type === 'synth' ? [
    '1.   Tableau de Bord Ex\u00E9cutif',
    '2.   Retroplanning \u2014 Phases & Jalons',
    '3.   Synth\u00E8se Arbitrages',
    "4.   Synth\u00E8se Plan d\u2019Actions",
    '5.   Analyse GAP \u2014 Synth\u00E8se par Domaine',
    '6.   P\u00E9rim\u00E8tre Modules \u2014 Analyse V2 \u2192 V4',
    '7.   Risques & Alertes Programme',
    '8.   Interfaces Techniques',
    '9.   Conclusion & Prochaines \u00C9tapes',
  ] : type === 'detail' ? [
    '1.   Tableau de Bord Ex\u00E9cutif',
    '2.   Retroplanning \u2014 Phases & Jalons',
    '3.   Suivi Arbitrages \u2014 D\u00E9tail complet',
    "4.   Plan d\u2019Actions \u2014 D\u00E9tail complet",
    '5.   Analyse GAP \u2014 Synth\u00E8se par Domaine',
    '6.   Analyse GAP \u2014 D\u00E9tail par Domaine',
    '7.   P\u00E9rim\u00E8tre Modules \u2014 Analyse V2 \u2192 V4',
    '8.   Risques & Alertes Programme',
    '9.   Interfaces Techniques',
    '10.  Conclusion & Prochaines \u00C9tapes',
  ] : [
    "1.   Vue d\u2019ensemble du Domaine",
    '2.   Arbitrages \u2014 ' + (domain || ''),
    "3.   Plan d\u2019Actions \u2014 " + (domain || ''),
    '4.   Analyse GAP \u2014 ' + (domain || ''),
    '5.   P\u00E9rim\u00E8tre Modules \u2014 Analyse V2 \u2192 V4',
    '6.   Risques & Alertes Programme',
    '7.   Interfaces Techniques',
    '8.   Conclusion & Prochaines \u00C9tapes',
  ];
  sl.addText(items.map((t, i) => ({ text: t, options: { breakLine: i < items.length - 1 } })), {
    x: 2.0, y: 1.1, w: 9.0, h: 5.5, fontFace: 'Arial', fontSize: type === 'domain' ? 20 : 18, color: '000000', lineSpacingMultiple: 1.7
  });
}
function _cbsDashboard(pres, today) {
  // ── Données calculées depuis l'état réel ─────────────────────────────────
  const _cbsD = _projUsesCBS();
  const _dAllGaps = _cbsD ? [...gaps, ...(state.customGaps||[])] : (state.customGaps||[]);
  const _dAllArbs = _cbsD ? [...arbitrages, ...(state.customArbitrages||[])] : (state.customArbitrages||[]);
  const _dAllActs = _cbsD ? [...actions,    ...(state.customActions||[])]    : (state.customActions||[]);
  const gapsTotal  = _dAllGaps.length;
  const gapsP1     = _dAllGaps.filter(g => (state.gaps[g.ref]||{}).prio || g.prio === 'P1').length;
  const arbTotal   = _dAllArbs.length;
  const arbDec     = _dAllArbs.filter(a => { const d = (state.arbitrages[a.id]||{}).decision; return d && d !== _getArbDefaultKey(); }).length;
  // Actions : compatible status + rag
  const actDone   = _dAllActs.filter(a => { const sv = state.actions[a.id]||{}; return sv.status === 'done' || (!sv.status && sv.rag === 'G'); }).length;
  const actInProg = _dAllActs.filter(a => { const sv = state.actions[a.id]||{}; return sv.status === 'in_progress' || (!sv.status && sv.rag === 'O'); }).length;
  const actTotal  = _dAllActs.length;
  const glMilestone = _getMilestone('go_live');
  const glLabel = glMilestone ? glMilestone.toLocaleDateString('fr-FR', {day:'2-digit', month:'2-digit'}).replace('/','/') : '—';
  const gapsDoms = new Set(_dAllGaps.map(g => g.domain || g.domaine)).size;

  const dash = cbsSlide(pres, 'Tableau de Bord Ex\u00E9cutif', '\u00C9tat du Programme au ' + today);
  const kpis = [
    { val: String(gapsTotal),  label: 'GAPs identifi\u00E9s',      sub: gapsDoms + ' domaine' + (gapsDoms > 1 ? 's' : ''), bg: 'E63329' },
    { val: String(gapsP1),     label: 'GAPs Priorit\u00E9 1',      sub: 'Critiques \u00B7 priorit\u00E9s BOA',            bg: 'B71C1C' },
    { val: String(arbDec),     label: 'Arbitrages d\u00E9cid\u00E9s', sub: 'sur ' + arbTotal + ' sp\u00E9cifiques',       bg: 'E8702A' },
    { val: String(actDone),    label: 'Actions termin\u00E9es',    sub: 'sur ' + actTotal + ' actions plan',              bg: '2E7D52' },
    { val: glLabel,            label: 'Go Live cible',             sub: glMilestone ? glMilestone.getFullYear().toString() : 'Non configuré', bg: '1565C0' },
  ];
  kpis.forEach((k, i) => {
    const x = 0.3 + i * 2.55, y = 1.05, w = 2.3, h = 2.0;
    dash.addShape(pres.shapes.RECTANGLE, { x, y, w, h, fill: { color: k.bg }, line: { color: k.bg } });
    dash.addText(k.val,   { x, y: y + 0.1,  w, h: 0.9,  fontFace: 'Arial', fontSize: 40, bold: true, color: 'FFFFFF', align: 'center', valign: 'middle', margin: 0 });
    dash.addText(k.label, { x, y: y + 1.0,  w, h: 0.5,  fontFace: 'Arial', fontSize: 10, bold: true, color: 'FFFFFF', align: 'center', valign: 'middle', margin: 0 });
    dash.addText(k.sub,   { x, y: y + 1.52, w, h: 0.35, fontFace: 'Arial', fontSize: 8,              color: 'FFFFFF', align: 'center', valign: 'middle', margin: 0 });
  });
  dash.addText([
    { text: 'Avancement Actions\u00A0: ',           options: { bold: true,  color: '000000' } },
    { text: String(actDone) + ' termin\u00E9es',   options: { bold: true,  color: '2E7D52' } },
    { text: '  |  ',                               options: {               color: 'AAAAAA' } },
    { text: String(actInProg) + ' en cours',       options: { bold: true,  color: 'E8702A' } },
    { text: '  |  ',                               options: {               color: 'AAAAAA' } },
    { text: String(actTotal - actDone - actInProg) + ' non d\u00E9marr\u00E9es', options: { color: '888888' } },
  ], { x: 0.3, y: 3.2, w: 12.73, h: 0.45, fontFace: 'Arial', fontSize: 12, valign: 'middle' });

  // Alertes dynamiques dans la slide
  const _dAlertes = [];
  const arbPending = arbTotal - arbDec;
  if (arbPending > 0) _dAlertes.push({ text: '\u26A0\uFE0F  ' + arbPending + ' arbitrage' + (arbPending > 1 ? 's' : '') + ' sp\u00E9cifique' + (arbPending > 1 ? 's' : '') + ' BOA en attente \u2014 impact direct Go Live', fill: 'FDEEEC', line: 'E63329' });
  const actBlocked = _dAllActs.filter(a => { const sv = state.actions[a.id]||{}; return sv.status === 'blocked' || (!sv.status && sv.rag === 'R'); }).length;
  if (actBlocked > 0) _dAlertes.push({ text: '\u26A0\uFE0F  ' + actBlocked + ' action' + (actBlocked > 1 ? 's' : '') + ' bloqu\u00E9e' + (actBlocked > 1 ? 's' : '') + ' \u2014 traitement requis', fill: 'FEF3E2', line: 'E8702A' });
  const unresolvedP1 = _dAllGaps.filter(g => { const s = state.gaps[g.ref]||{}; const p = s.prio || g.prio; const st = s.statut || g.statut || ''; return p === 'P1' && !['Couvert','Validé','Adoption','Exclu'].some(k => st.includes(k)); }).length;
  if (unresolvedP1 > 0) _dAlertes.push({ text: '\u2139\uFE0F  ' + unresolvedP1 + ' GAP' + (unresolvedP1 > 1 ? 's' : '') + ' P1 non r\u00E9solus \u2014 suivi requis', fill: 'EEF0F8', line: '3949AB' });
  _dAlertes.slice(0, 3).forEach((a, i) => {
    dash.addShape(pres.shapes.RECTANGLE, { x: 0.3, y: 3.75 + i * 0.65, w: 12.73, h: 0.55, fill: { color: a.fill }, line: { color: a.line, pt: 0.5 } });
    dash.addText(a.text, { x: 0.5, y: 3.75 + i * 0.65, w: 12.5, h: 0.55, fontFace: 'Arial', fontSize: 11, color: '000000', valign: 'middle' });
  });
}
function _cbsRetro(pres) {
  const retro = cbsSlide(pres, 'Retroplanning \u2014 Phases & Jalons', 'Programme IGOR V4 \u00B7 Janvier \u2192 Ao\u00FBt 2026');
  const phases6 = ganttTasks.filter(t => t.type === 'phase');
  const jalons6  = ganttTasks.filter(t => t.type === 'jalon');
  const rStart = new Date('2026-01-01'), rTotalDays = 227;
  const bBarX = 2.65, bBarW = 10.0;
  const gBX = d => bBarX + ((new Date(d) - rStart) / 86400000 / rTotalDays) * bBarW;
  const gBW = (s, e) => Math.max(0.08, ((new Date(e) - new Date(s)) / 86400000 / rTotalDays) * bBarW);
  [{ l:'Jan',m:0 },{ l:'F\u00E9v',m:1 },{ l:'Mar',m:2 },{ l:'Avr',m:3 },
   { l:'Mai',m:4 },{ l:'Jun',m:5 },{ l:'Jul',m:6 },{ l:'Ao\u00FB',m:7 }
  ].forEach(({ l, m }) => {
    const mx = bBarX + ((new Date(2026, m, 1) - rStart) / 86400000 / rTotalDays) * bBarW;
    retro.addText(l, { x: mx, y: 1.0, w: 1.1, h: 0.2, fontFace: 'Arial', fontSize: 8, color: '888888', align: 'center', margin: 0 });
    retro.addShape(pres.shapes.LINE, { x: mx + 0.55, y: 1.18, w: 0, h: 5.5, line: { color: 'EEEEEE', width: 0.5 } });
  });
  const phColors = ['1565C0', 'E8702A', '8E24AA', '2E7D52', '0097A7', 'E63329'];
  phases6.forEach((p, i) => {
    const ov = state.gantt[p.id] || {};
    const s = ov.start || p.start, e = ov.end || p.end;
    const bx = gBX(s), bw = gBW(s, e), by = 1.3 + i * 0.82, bh = 0.62;
    retro.addShape(pres.shapes.RECTANGLE, { x: bx, y: by, w: bw, h: bh, fill: { color: phColors[i % 6] }, line: { color: phColors[i % 6] } });
    const pct = Math.round(((ov.pct !== undefined ? ov.pct : (p.pct || 0))) * 100);
    if (bw > 0.9) retro.addText(s.slice(5) + ' \u2192 ' + e.slice(5) + '  (' + pct + '%)', { x: bx, y: by, w: bw, h: bh, fontFace: 'Arial', fontSize: 7.5, color: 'FFFFFF', align: 'center', valign: 'middle', margin: 0 });
    const phShort = p.label.replace(/^PHASE \d+ \u2014 /, '').replace(/^PHASE \d+ — /, '').slice(0, 28);
    retro.addText('P' + i + '  ' + phShort, { x: 0.2, y: by, w: 2.4, h: bh, fontFace: 'Arial', fontSize: 7.5, bold: true, color: phColors[i % 6], valign: 'middle', margin: 0 });
  });
  jalons6.forEach(j => {
    const ov = state.gantt[j.id] || {};
    const s = ov.start || j.start;
    retro.addShape(pres.shapes.LINE, { x: gBX(s), y: 1.18, w: 0, h: 5.5, line: { color: 'E63329', width: 0.75, dashType: 'dash' } });
  });
}
function _cbsArbitragesSynth(pres) {
  const sl = cbsSlide(pres, 'Synth\u00E8se Arbitrages \u2014 Vue Executive', 'D\u00E9veloppements sp\u00E9cifiques BOA CI \u00B7 ' + arbitrages.length + ' arbitrages');
  const domMap = {};
  arbitrages.forEach(a => {
    if (!domMap[a.domain]) domMap[a.domain] = { total: 0, p1: 0, p2: 0, decided: 0, pending: 0 };
    const dm = domMap[a.domain];
    const dec = (state.arbitrages[a.id]||{}).decision || _getArbDefaultKey();
    dm.total++; if (a.prio === 'P1') dm.p1++; else dm.p2++;
    if (dec !== _getArbDefaultKey()) dm.decided++; else dm.pending++;
  });
  const hdrs = ['Domaine','Total','P1','P2','D\u00E9cid\u00E9s','En attente'].map(t => ({
    text: t, options: { fill: { color: 'E63329' }, color: 'FFFFFF', bold: true, fontFace: 'Arial', fontSize: 8.5, align: 'center', border: { pt: 0.5, color: 'FFFFFF' } }
  }));
  const rows = [hdrs];
  Object.entries(domMap).forEach(([dom, d], ri) => {
    const bg = ri % 2 === 0 ? 'FFFFFF' : 'F5F5F5';
    const c = (txt, opt) => ({ text: String(txt), options: { fontFace: 'Arial', fontSize: 8.5, fill: { color: bg }, border: { pt: 0.3, color: 'DDDDDD' }, ...opt } });
    rows.push([
      c(dom, {}),
      c(d.total,   { align: 'center', bold: true }),
      c(d.p1,      { align: 'center', color: d.p1 > 0 ? 'E63329' : '888888', bold: d.p1 > 0 }),
      c(d.p2,      { align: 'center', color: d.p2 > 0 ? 'E8702A' : '888888' }),
      c(d.decided, { align: 'center', color: d.decided > 0 ? '2E7D52' : '888888', bold: d.decided > 0 }),
      c(d.pending, { align: 'center', color: d.pending > 0 ? 'E63329' : '2E7D52', bold: d.pending > 0 }),
    ]);
  });
  sl.addTable(rows, { x: 0.3, y: 0.9, w: 12.73, colW: [4.5, 0.9, 0.9, 0.9, 1.3, 1.23] });
  const p1Undec = arbitrages.filter(a => a.prio === 'P1' && !((state.arbitrages[a.id]||{}).decision && (state.arbitrages[a.id]||{}).decision !== _getArbDefaultKey()));
  if (p1Undec.length > 0) {
    sl.addShape(pres.shapes.RECTANGLE, { x: 0.3, y: 4.35, w: 12.73, h: 0.3, fill: { color: 'FDEEEC' }, line: { color: 'E63329', pt: 0.5 } });
    sl.addText('\u26A0\uFE0F  P1 non d\u00E9cid\u00E9s (' + p1Undec.length + ')\u00A0: ' + p1Undec.slice(0,5).map(a => a.id + '. ' + a.label.slice(0,40)).join(' \u00B7 '), {
      x: 0.5, y: 4.35, w: 12.5, h: 0.3, fontFace: 'Arial', fontSize: 8, color: 'E63329', bold: true, valign: 'middle'
    });
  }
}
function _cbsActionsSynth(pres) {
  const sl = cbsSlide(pres, "Synth\u00E8se Plan d\u2019Actions", actions.length + ' actions \u00B7 Vue Executive');
  const ragLabel = { G: 'Termin\u00E9es', O: 'En cours', R: 'En retard', X: 'Non d\u00E9marr\u00E9es' };
  const ragColor = { G: '2E7D52', O: 'E8702A', R: 'E63329', X: '888888' };
  const ragCounts = { G: 0, O: 0, R: 0, X: 0 };
  actions.forEach(a => { const r = (state.actions[a.id]||{}).rag || 'X'; if (r in ragCounts) ragCounts[r]++; });
  Object.entries(ragCounts).forEach(([rag, cnt], i) => {
    const x = 0.3 + i * 3.18, y = 0.95, w = 2.85, h = 1.4;
    sl.addShape(pres.shapes.RECTANGLE, { x, y, w, h, fill: { color: ragColor[rag] }, line: { color: ragColor[rag] } });
    sl.addText(String(cnt), { x, y: y + 0.1,  w, h: 0.75, fontFace: 'Arial', fontSize: 36, bold: true, color: 'FFFFFF', align: 'center', valign: 'middle', margin: 0 });
    sl.addText(ragLabel[rag], { x, y: y + 0.9,  w, h: 0.4,  fontFace: 'Arial', fontSize: 10, bold: true, color: 'FFFFFF', align: 'center', valign: 'middle', margin: 0 });
  });
  const domMap = {};
  actions.forEach(a => {
    if (!domMap[a.domain]) domMap[a.domain] = { total: 0, G: 0, O: 0, R: 0, X: 0 };
    const r = (state.actions[a.id]||{}).rag || 'X';
    domMap[a.domain].total++; if (r in domMap[a.domain]) domMap[a.domain][r]++;
  });
  const hdrs = ['Domaine','Total','Termin\u00E9es','En cours','En retard','Non d\u00E9marr\u00E9es'].map(t => ({
    text: t, options: { fill: { color: 'E63329' }, color: 'FFFFFF', bold: true, fontFace: 'Arial', fontSize: 8.5, align: 'center', border: { pt: 0.5, color: 'FFFFFF' } }
  }));
  const rows = [hdrs];
  Object.entries(domMap).forEach(([dom, d], ri) => {
    const bg = ri % 2 === 0 ? 'FFFFFF' : 'F5F5F5';
    const c = (txt, opt) => ({ text: String(txt), options: { fontFace: 'Arial', fontSize: 8.5, fill: { color: bg }, border: { pt: 0.3, color: 'DDDDDD' }, ...opt } });
    rows.push([
      c(dom, {}),
      c(d.total, { align: 'center', bold: true }),
      c(d.G, { align: 'center', color: d.G > 0 ? '2E7D52' : '888888', bold: d.G > 0 }),
      c(d.O, { align: 'center', color: d.O > 0 ? 'E8702A' : '888888', bold: d.O > 0 }),
      c(d.R, { align: 'center', color: d.R > 0 ? 'E63329' : '888888', bold: d.R > 0 }),
      c(d.X, { align: 'center', color: '888888' }),
    ]);
  });
  sl.addTable(rows, { x: 0.3, y: 2.5, w: 12.73, colW: [3.5, 0.9, 1.3, 1.1, 1.1, 1.83] });
}
function _cbsArbitragesTable(pres, domainFilter) {
  const filtered = domainFilter ? arbitrages.filter(a => a.domain === domainFilter) : arbitrages;
  if (!filtered.length) return;
  const decLabel = {}; _getArbDecisions().forEach(d => { decLabel[d.key] = d.icon + ' ' + d.label; });
  const decColor = {}; _getArbDecisions().forEach(d => { decColor[d.key] = d.color.replace('#',''); });
  const chunkSz = domainFilter ? Math.max(filtered.length, 1) : 13;
  const chunks = []; for (let i = 0; i < filtered.length; i += chunkSz) chunks.push(filtered.slice(i, i + chunkSz));
  chunks.forEach((chunk, ci) => {
    const sub = domainFilter
      ? 'Domaine\u00A0: ' + domainFilter + ' \u00B7 ' + filtered.length + ' arbitrages'
      : '(' + (ci+1) + '/' + chunks.length + ') \u00B7 Items ' + chunk[0].id + '\u2013' + chunk[chunk.length-1].id + ' sur ' + filtered.length;
    const sl = cbsSlide(pres, 'Suivi Arbitrages \u2014 D\u00E9veloppements Sp\u00E9cifiques BOA', sub);
    const hdrs = ['N\u00B0','Domaine','Sujet Arbitrage','Prio.','Resp.','D\u00E9cision'].map(t => ({
      text: t, options: { fill: { color: 'E63329' }, color: 'FFFFFF', bold: true, fontFace: 'Arial', fontSize: 8.5, align: 'center', border: { pt: 0.5, color: 'FFFFFF' } }
    }));
    const rows = [hdrs];
    chunk.forEach((a, ri) => {
      const dec = (state.arbitrages[a.id]||{}).decision || _getArbDefaultKey();
      const bg  = ri % 2 === 0 ? 'FFFFFF' : 'F5F5F5';
      rows.push([
        { text: String(a.id), options: { fontFace: 'Arial', fontSize: 8, align: 'center', fill: { color: bg }, border: { pt: 0.3, color: 'DDDDDD' } } },
        { text: a.domain,     options: { fontFace: 'Arial', fontSize: 7.5, fill: { color: bg }, border: { pt: 0.3, color: 'DDDDDD' } } },
        { text: a.label,      options: { fontFace: 'Arial', fontSize: 7.5, fill: { color: bg }, border: { pt: 0.3, color: 'DDDDDD' } } },
        { text: a.prio,       options: { fontFace: 'Arial', fontSize: 8, align: 'center', bold: true, color: a.prio === 'P1' ? 'E63329' : 'E8702A', fill: { color: bg }, border: { pt: 0.3, color: 'DDDDDD' } } },
        { text: a.resp,       options: { fontFace: 'Arial', fontSize: 7.5, align: 'center', fill: { color: bg }, border: { pt: 0.3, color: 'DDDDDD' } } },
        { text: decLabel[dec]||dec, options: { fontFace: 'Arial', fontSize: 7.5, align: 'center', bold: dec !== _getArbDefaultKey(), color: decColor[dec]||'888888', fill: { color: bg }, border: { pt: 0.3, color: 'DDDDDD' } } },
      ]);
    });
    sl.addTable(rows, { x: 0.3, y: 0.9, w: 12.73, colW: [0.5, 2.3, 5.0, 0.6, 1.2, 3.13] });
  });
}
function _cbsActionsTable(pres, domainFilter) {
  const filtered = domainFilter ? actions.filter(a => a.domain === domainFilter) : actions;
  if (!filtered.length) return;
  const ragLabel = { G: 'Termin\u00E9e', O: 'En cours', R: 'En retard', X: 'Non d\u00E9marr\u00E9e' };
  const ragColor = { G: '2E7D52', O: 'E8702A', R: 'E63329', X: '888888' };
  const urgColor = { Critique: 'E63329', Haute: 'E8702A', Normale: '54565A' };
  const chunks = []; for (let i = 0; i < filtered.length; i += 15) chunks.push(filtered.slice(i, i + 15));
  chunks.forEach((chunk, ci) => {
    const sub = domainFilter
      ? 'Domaine\u00A0: ' + domainFilter + ' \u00B7 ' + filtered.length + ' actions'
      : '(' + (ci+1) + '/' + chunks.length + ') \u00B7 Actions ' + chunk[0].id + '\u2013' + chunk[chunk.length-1].id + ' sur ' + filtered.length;
    const sl = cbsSlide(pres, "Plan d\u2019Actions", sub);
    const hdrs = ['ID','Domaine','Action','Resp.','\u00C9ch\u00E9ance','Urgence','Statut'].map(t => ({
      text: t, options: { fill: { color: 'E63329' }, color: 'FFFFFF', bold: true, fontFace: 'Arial', fontSize: 8.5, align: 'center', border: { pt: 0.5, color: 'FFFFFF' } }
    }));
    const rows = [hdrs];
    chunk.forEach((a, ri) => {
      const rag = (state.actions[a.id]||{}).rag || 'X';
      const bg  = ri % 2 === 0 ? 'FFFFFF' : 'F5F5F5';
      rows.push([
        { text: a.id,         options: { fontFace: 'Arial', fontSize: 8, align: 'center', bold: true, fill: { color: bg }, border: { pt: 0.3, color: 'DDDDDD' } } },
        { text: a.domain,     options: { fontFace: 'Arial', fontSize: 7.5, fill: { color: bg }, border: { pt: 0.3, color: 'DDDDDD' } } },
        { text: (a.action||'').slice(0,64) + ((a.action||'').length > 64 ? '\u2026' : ''), options: { fontFace: 'Arial', fontSize: 7, fill: { color: bg }, border: { pt: 0.3, color: 'DDDDDD' } } },
        { text: a.resp,       options: { fontFace: 'Arial', fontSize: 7.5, align: 'center', fill: { color: bg }, border: { pt: 0.3, color: 'DDDDDD' } } },
        { text: a.echeance,   options: { fontFace: 'Arial', fontSize: 7.5, align: 'center', fill: { color: bg }, border: { pt: 0.3, color: 'DDDDDD' } } },
        { text: a.urgence,    options: { fontFace: 'Arial', fontSize: 7.5, align: 'center', bold: a.urgence === 'Critique', color: urgColor[a.urgence]||'000000', fill: { color: bg }, border: { pt: 0.3, color: 'DDDDDD' } } },
        { text: ragLabel[rag]||'\u2014', options: { fontFace: 'Arial', fontSize: 7.5, align: 'center', bold: rag !== 'X', color: ragColor[rag]||'888888', fill: { color: bg }, border: { pt: 0.3, color: 'DDDDDD' } } },
      ]);
    });
    sl.addTable(rows, { x: 0.3, y: 0.9, w: 12.73, colW: [0.6, 1.2, 4.5, 1.25, 1.0, 1.0, 1.18] });
  });
}
function _cbsGapSynth(pres) {
  const _gapSynthTotal = gaps.length + (state.customGaps||[]).length;
  const sl = cbsSlide(pres, 'Analyse GAP \u2014 Synth\u00E8se par Domaine', 'Registre BOA \u00B7 ' + _gapSynthTotal + ' GAP' + (_gapSynthTotal !== 1 ? 's' : '') + ' identifi\u00E9' + (_gapSynthTotal !== 1 ? 's' : ''));
  const domMap = {};
  gaps.forEach(g => {
    if (!domMap[g.domain]) domMap[g.domain] = { total: 0, p1: 0, p2: 0, p3: 0, decided: 0, pending: 0 };
    const dm = domMap[g.domain], saved = state.gaps[g.ref] || {};
    const prio = saved.prio || g.prio, statut = saved.statut || g.statut || '';
    dm.total++; if (prio === 'P1') dm.p1++; else if (prio === 'P2' || prio === 'P2.1') dm.p2++; else dm.p3++;
    const isDecided = ['Couvert','Valid\u00E9','Adoption','Exclu','V2','couvert','valid\u00E9'].some(kw => statut.includes(kw));
    if (isDecided) dm.decided++; else dm.pending++;
  });
  const hdrs = ['Domaine','Total','P1 Critique','P2 Haute','P3 Std','D\u00E9cid\u00E9s','En attente'].map(t => ({
    text: t, options: { fill: { color: 'E63329' }, color: 'FFFFFF', bold: true, fontFace: 'Arial', fontSize: 8.5, align: 'center', border: { pt: 0.5, color: 'FFFFFF' } }
  }));
  const rows = [hdrs];
  Object.entries(domMap).forEach(([dom, d], ri) => {
    const bg = ri % 2 === 0 ? 'FFFFFF' : 'F5F5F5';
    const c = (txt, opt) => ({ text: String(txt), options: { fontFace: 'Arial', fontSize: 8.5, fill: { color: bg }, border: { pt: 0.3, color: 'DDDDDD' }, ...opt } });
    rows.push([
      c(dom, {}),
      c(d.total,   { align: 'center', bold: true }),
      c(d.p1,      { align: 'center', color: d.p1 > 0 ? 'E63329' : '888888', bold: d.p1 > 0 }),
      c(d.p2,      { align: 'center', color: d.p2 > 0 ? 'E8702A' : '888888', bold: d.p2 > 0 }),
      c(d.p3,      { align: 'center', color: '888888' }),
      c(d.decided, { align: 'center', color: d.decided > 0 ? '2E7D52' : '888888', bold: d.decided > 0 }),
      c(d.pending, { align: 'center', color: d.pending > 0 ? 'E63329' : '2E7D52', bold: d.pending > 0 }),
    ]);
  });
  sl.addTable(rows, { x: 0.3, y: 0.9, w: 12.73, colW: [3.5, 0.9, 1.1, 1.0, 0.9, 1.1, 1.23] });
}
function _cbsGapDomainSlides(pres, domainFilter) {
  const domains = domainFilter ? [domainFilter] : [...new Set(gaps.map(g => g.domain))];
  domains.forEach(dom => {
    const domGaps = gaps.filter(g => g.domain === dom);
    const chunkSz = 11;
    const totalChunks = Math.ceil(domGaps.length / chunkSz);
    for (let ci = 0; ci < domGaps.length; ci += chunkSz) {
      const chunk = domGaps.slice(ci, ci + chunkSz);
      const sub = 'Domaine\u00A0: ' + dom + (totalChunks > 1 ? ' \u00B7 ' + (Math.floor(ci/chunkSz)+1) + '/' + totalChunks : '') + ' \u00B7 ' + domGaps.length + ' GAPs';
      const sl = cbsSlide(pres, 'Analyse GAP \u2014 D\u00E9tail par Domaine', sub);
      const hdrs = ['R\u00E9f.','Processus','Description','Prio.','Type','Resp.','Statut','Cx.'].map(t => ({
        text: t, options: { fill: { color: 'E63329' }, color: 'FFFFFF', bold: true, fontFace: 'Arial', fontSize: 8, align: 'center', border: { pt: 0.5, color: 'FFFFFF' } }
      }));
      const rows = [hdrs];
      chunk.forEach((g, ri) => {
        const saved = state.gaps[g.ref] || {};
        const prio   = saved.prio   || g.prio;
        const statut = saved.statut || g.statut || '';
        const prioColor = prio === 'P1' ? 'E63329' : (prio === 'P2' || prio === 'P2.1') ? 'E8702A' : '888888';
        const bg = ri % 2 === 0 ? 'FFFFFF' : 'F5F5F5';
        const c = (txt, opt) => ({ text: String(txt||''), options: { fontFace: 'Arial', fontSize: 7, fill: { color: bg }, border: { pt: 0.3, color: 'DDDDDD' }, ...opt } });
        rows.push([
          c(g.ref,                                                 { fontSize: 6.5, align: 'center' }),
          c((g.processus||'').slice(0,20),                        {}),
          c((g.desc||'').slice(0,65) + ((g.desc||'').length > 65 ? '\u2026' : ''), {}),
          c(prio,                                                   { align: 'center', bold: true, color: prioColor }),
          c(g.type||'',                                            { align: 'center' }),
          c(g.resp||'',                                            { align: 'center' }),
          c(statut.slice(0,20),                                    {}),
          c(g.complexite||'',                                      { align: 'center' }),
        ]);
      });
      sl.addTable(rows, { x: 0.15, y: 0.9, w: 13.0, colW: [1.1, 1.6, 3.9, 0.55, 1.0, 0.9, 1.7, 0.55] });
    }
  });
}
function _cbsDomainOverview(pres, today, domain) {
  const sl = cbsSlide(pres, 'Vue d\u2019ensemble \u2014 ' + domain, '\u00C9tat au ' + today);
  const dArbs = arbitrages.filter(a => a.domain === domain);
  const dActs = actions.filter(a => a.domain === domain);
  const dGaps = gaps.filter(g => g.domain === domain);
  const arbDec  = dArbs.filter(a => { const d = (state.arbitrages[a.id]||{}).decision; return d && d !== _getArbDefaultKey(); }).length;
  const actDone = dActs.filter(a => (state.actions[a.id]||{}).rag === 'G').length;
  const actOng  = dActs.filter(a => (state.actions[a.id]||{}).rag === 'O').length;
  const gapP1   = dGaps.filter(g => ((state.gaps[g.ref]||{}).prio || g.prio) === 'P1').length;
  const kpis = [
    { val: String(dArbs.length),  label: 'Arbitrages',       sub: arbDec + ' d\u00E9cid\u00E9s',       bg: 'E8702A' },
    { val: String(dActs.length),  label: 'Actions',          sub: actDone + ' termin\u00E9es',          bg: '2E7D52' },
    { val: String(dGaps.length),  label: 'GAPs identifi\u00E9s', sub: gapP1 + ' Priorit\u00E9 1',       bg: 'E63329' },
    { val: String(actOng),        label: 'Actions en cours', sub: 'sur ' + dActs.length,               bg: '1565C0' },
  ];
  kpis.forEach((k, i) => {
    const x = 0.3 + i * 3.18, y = 1.05, w = 2.85, h = 1.7;
    sl.addShape(pres.shapes.RECTANGLE, { x, y, w, h, fill: { color: k.bg }, line: { color: k.bg } });
    sl.addText(k.val,   { x, y: y + 0.1,  w, h: 0.85, fontFace: 'Arial', fontSize: 36, bold: true, color: 'FFFFFF', align: 'center', valign: 'middle', margin: 0 });
    sl.addText(k.label, { x, y: y + 1.0,  w, h: 0.4,  fontFace: 'Arial', fontSize: 10, bold: true, color: 'FFFFFF', align: 'center', valign: 'middle', margin: 0 });
    sl.addText(k.sub,   { x, y: y + 1.35, w, h: 0.3,  fontFace: 'Arial', fontSize: 8.5,            color: 'FFFFFF', align: 'center', valign: 'middle', margin: 0 });
  });
  const undecArbs = dArbs.filter(a => { const d = (state.arbitrages[a.id]||{}).decision; return !d || d === _getArbDefaultKey(); });
  if (undecArbs.length > 0) {
    sl.addShape(pres.shapes.RECTANGLE, { x: 0.3, y: 2.9,  w: 12.73, h: 0.35, fill: { color: 'FDEEEC' }, line: { color: 'E63329', pt: 0.5 } });
    sl.addText('\u26A0\uFE0F  ' + undecArbs.length + ' arbitrage(s) sans d\u00E9cision dans ce domaine', { x: 0.5, y: 2.9, w: 12.5, h: 0.35, fontFace: 'Arial', fontSize: 10, bold: true, color: 'E63329', valign: 'middle' });
  }
  const lateActs = dActs.filter(a => (state.actions[a.id]||{}).rag === 'R');
  if (lateActs.length > 0) {
    sl.addShape(pres.shapes.RECTANGLE, { x: 0.3, y: 3.35, w: 12.73, h: 0.35, fill: { color: 'FEF3E2' }, line: { color: 'E8702A', pt: 0.5 } });
    sl.addText('\u26A0\uFE0F  ' + lateActs.length + ' action(s) en retard dans ce domaine', { x: 0.5, y: 3.35, w: 12.5, h: 0.35, fontFace: 'Arial', fontSize: 10, bold: true, color: 'E8702A', valign: 'middle' });
  }
}

// ── Périmètre Modules Slide ───────────────────────────────────────────────────
function _cbsPerimetreSlide(pres) {
  const stats  = getPerimetreStats();
  const total  = stats.total || 1; // avoid div/0
  const pctV4  = Math.round(stats.v4 / total * 100);
  const sl = cbsSlide(pres, 'Périmètre Modules — IGOR V2 \u2192 V4',
    'Analyse fonctionnelle \u00B7 ' + stats.total + ' modules \u00B7 ' + new Date().toLocaleDateString('fr-FR', { day:'2-digit', month:'long', year:'numeric' }));

  // KPI band — 6 boxes
  const kpis = [
    { val: String(stats.total),     label: 'Modules total',    sub: 'périmètre BOA CI',          bg: '54565A' },
    { val: pctV4 + '%',             label: 'Cible V4',         sub: stats.v4 + ' mods cible V4', bg: '1565C0' },
    { val: String(stats.upgrades),  label: 'Upgrades \u2191',  sub: 'V2 \u2192 V4 migration',    bg: '2E7D52' },
    { val: String(stats.downgrades),label: 'Downgrades \u2193',sub: 'V4 \u2192 V2 maintien',     bg: 'E8702A' },
    { val: String(stats.majeur),    label: 'Impact Majeur',    sub: 'dév. significatif',          bg: 'E63329' },
    { val: String(stats.commented), label: 'Commentés',        sub: 'modules avec notes',         bg: '7c3aed' },
  ];
  kpis.forEach((k, i) => {
    const x = 0.3 + i * 2.13, y = 0.9, w = 1.9, h = 1.5;
    sl.addShape(pres.shapes.RECTANGLE, { x, y, w, h, fill: { color: k.bg }, line: { color: k.bg } });
    sl.addText(k.val,   { x, y: y + 0.05, w, h: 0.72, fontFace: 'Arial', fontSize: 28, bold: true, color: 'FFFFFF', align: 'center', valign: 'middle' });
    sl.addText(k.label, { x, y: y + 0.8,  w, h: 0.38, fontFace: 'Arial', fontSize: 9,  bold: true, color: 'FFFFFF', align: 'center', valign: 'middle' });
    sl.addText(k.sub,   { x, y: y + 1.18, w, h: 0.26, fontFace: 'Arial', fontSize: 7.5,            color: 'FFFFFF', align: 'center', valign: 'middle' });
  });

  // V4 coverage progress bar
  const barY = 2.56;
  sl.addText('Couverture V4 — ' + pctV4 + '%', { x: 0.3, y: barY, w: 5, h: 0.26, fontFace: 'Arial', fontSize: 9, bold: true, color: '333333', valign: 'middle' });
  sl.addShape(pres.shapes.RECTANGLE, { x: 0.3, y: barY + 0.28, w: 12.73, h: 0.2, fill: { color: 'E8E8E8' }, line: { color: 'E0E0E0' } });
  if (pctV4 > 0) sl.addShape(pres.shapes.RECTANGLE, { x: 0.3, y: barY + 0.28, w: 12.73 * pctV4 / 100, h: 0.2, fill: { color: '1565C0' }, line: { color: '1565C0' } });
  sl.addText(pctV4 + '%', { x: 0.3, y: barY + 0.28, w: 12.73, h: 0.2, fontFace: 'Arial', fontSize: 8, bold: true, color: 'FFFFFF', align: 'center', valign: 'middle' });

  // Domain breakdown table
  const tableY = 3.22;
  const colW   = [3.9, 1.1, 1.1, 1.3, 1.3, 1.4, 3.33];
  const hdrs   = ['Domaine', 'Total', 'V4', 'Upgrades\u2191', 'Downgrades\u2193', 'Impact Maj.', 'Sous-modules (aperçu)'];
  hdrs.forEach((h, c) => {
    const x = 0.3 + colW.slice(0, c).reduce((a, b) => a + b, 0);
    sl.addShape(pres.shapes.RECTANGLE, { x, y: tableY, w: colW[c], h: 0.28, fill: { color: 'E63329' }, line: { color: 'E63329' } });
    sl.addText(h, { x, y: tableY, w: colW[c], h: 0.28, fontFace: 'Arial', fontSize: 7.5, bold: true, color: 'FFFFFF', align: 'center', valign: 'middle' });
  });
  const domKeys = Object.keys(stats.byDomain).slice(0, 11);
  domKeys.forEach((dom, r) => {
    const d = stats.byDomain[dom];
    const rowY  = tableY + 0.28 + r * 0.28;
    const rowBg = r % 2 === 0 ? 'F9F9F9' : 'FFFFFF';
    // Gather sub-module names for this domain
    const subMods = DEFAULT_PERIMETER.filter(p => p.domaine === dom).map(p => p.sousModule).slice(0, 3).join(', ');
    const vals = [dom, String(d.total), String(d.v4), String(d.upgrades), String(d.downgrades), String(d.majeur), subMods + (DEFAULT_PERIMETER.filter(p => p.domaine === dom).length > 3 ? '…' : '')];
    vals.forEach((v, c) => {
      const x = 0.3 + colW.slice(0, c).reduce((a, b) => a + b, 0);
      sl.addShape(pres.shapes.RECTANGLE, { x, y: rowY, w: colW[c], h: 0.28, fill: { color: rowBg }, line: { color: 'E8E8E8', pt: 0.5 } });
      sl.addText(v, { x, y: rowY, w: colW[c], h: 0.28, fontFace: 'Arial', fontSize: 7.5, color: c === 0 ? '1a1a1a' : '333333', align: c === 0 ? 'left' : 'center', valign: 'middle', margin: [0, 3, 0, 3] });
    });
  });
}

// ── Risques & Alertes Slide ───────────────────────────────────────────────────
function _cbsRisquesSlide(pres) {
  const risks     = state.risks || [];
  const critColor = c => c >= 15 ? 'E63329' : c >= 8 ? 'E8702A' : c >= 4 ? 'F9A825' : '2E7D52';
  const critLabel = c => c >= 15 ? 'Critique' : c >= 8 ? 'Élevée' : c >= 4 ? 'Modérée' : 'Faible';
  const statLabel = { ouvert: 'Ouvert', en_cours: 'En cours', surveille: 'Surveillé', clos: 'Clos', accepte: 'Accepté' };
  const critique  = risks.filter(r => r.prob * r.impact >= 15).length;
  const elevee    = risks.filter(r => { const c = r.prob * r.impact; return c >= 8 && c < 15; }).length;
  const ouverts   = risks.filter(r => r.statut === 'ouvert').length;
  const enCours   = risks.filter(r => r.statut === 'en_cours').length;
  const clos      = risks.filter(r => r.statut === 'clos' || r.statut === 'accepte').length;

  const sl = cbsSlide(pres, 'Risques & Alertes Programme',
    risks.length + ' risque(s) enregistré(s) · ' + new Date().toLocaleDateString('fr-FR', { day:'2-digit', month:'long', year:'numeric' }));

  // KPI band — 5 boxes
  const kpis = [
    { val: String(risks.length), label: 'Total Risques',   sub: 'registre des risques',   bg: '54565A' },
    { val: String(critique),     label: 'Critiques',       sub: 'criticité ≥ 15',          bg: 'E63329' },
    { val: String(elevee),       label: 'Élevés',          sub: 'criticité 8–14',          bg: 'E8702A' },
    { val: String(ouverts),      label: 'Ouverts',         sub: 'action requise',          bg: 'B71C1C' },
    { val: String(clos),         label: 'Clos / Acceptés', sub: 'traités ou acceptés',     bg: '2E7D52' },
  ];
  kpis.forEach((k, i) => {
    const x = 0.3 + i * 2.55, y = 0.9, w = 2.3, h = 1.5;
    sl.addShape(pres.shapes.RECTANGLE, { x, y, w, h, fill: { color: k.bg }, line: { color: k.bg } });
    sl.addText(k.val,   { x, y: y + 0.05, w, h: 0.72, fontFace: 'Arial', fontSize: 28, bold: true, color: 'FFFFFF', align: 'center', valign: 'middle' });
    sl.addText(k.label, { x, y: y + 0.8,  w, h: 0.38, fontFace: 'Arial', fontSize: 9,  bold: true, color: 'FFFFFF', align: 'center', valign: 'middle' });
    sl.addText(k.sub,   { x, y: y + 1.18, w, h: 0.26, fontFace: 'Arial', fontSize: 7.5,            color: 'FFFFFF', align: 'center', valign: 'middle' });
  });

  if (risks.length === 0) {
    sl.addShape(pres.shapes.RECTANGLE, { x: 0.3, y: 2.7, w: 12.73, h: 0.6, fill: { color: 'E8F5E9' }, line: { color: '2E7D52', pt: 0.5 } });
    sl.addText('✅  Aucun risque enregistré dans le registre programme', { x: 0.3, y: 2.7, w: 12.73, h: 0.6, fontFace: 'Arial', fontSize: 13, color: '2E7D52', bold: true, align: 'center', valign: 'middle' });
    return;
  }

  // Risk table
  const tableY = 2.6;
  const colW   = [3.3, 1.0, 1.0, 1.7, 1.6, 1.7, 2.23];
  const hdrs   = ['Description', 'Prob.', 'Impact', 'Criticité', 'Catégorie', 'Statut', 'Responsable / Plan'];
  hdrs.forEach((h, c) => {
    const x = 0.3 + colW.slice(0, c).reduce((a, b) => a + b, 0);
    sl.addShape(pres.shapes.RECTANGLE, { x, y: tableY, w: colW[c], h: 0.28, fill: { color: 'E63329' }, line: { color: 'E63329' } });
    sl.addText(h, { x, y: tableY, w: colW[c], h: 0.28, fontFace: 'Arial', fontSize: 7.5, bold: true, color: 'FFFFFF', align: 'center', valign: 'middle' });
  });
  risks.slice(0, 13).forEach((r, ri) => {
    const crit  = r.prob * r.impact;
    const rowY  = tableY + 0.28 + ri * 0.28;
    const rowBg = ri % 2 === 0 ? 'F9F9F9' : 'FFFFFF';
    const cc    = critColor(crit);
    const ownerPlan = [r.owner, r.plan].filter(Boolean).join(' / ').slice(0, 45) || '—';
    const vals  = [
      (r.desc || '—').slice(0, 52) + ((r.desc || '').length > 52 ? '…' : ''),
      String(r.prob  || '—'),
      String(r.impact || '—'),
      crit + ' — ' + critLabel(crit),
      (r.cat || '—').slice(0, 22),
      statLabel[r.statut] || r.statut || '—',
      ownerPlan,
    ];
    vals.forEach((v, c) => {
      const x      = 0.3 + colW.slice(0, c).reduce((a, b) => a + b, 0);
      const isCrit = c === 3;
      sl.addShape(pres.shapes.RECTANGLE, { x, y: rowY, w: colW[c], h: 0.28, fill: { color: isCrit ? cc + '22' : rowBg }, line: { color: 'E8E8E8', pt: 0.5 } });
      sl.addText(v, { x, y: rowY, w: colW[c], h: 0.28, fontFace: 'Arial', fontSize: 7.5, color: isCrit ? cc : (c === 0 ? '1a1a1a' : '333333'), bold: isCrit, align: c === 0 ? 'left' : 'center', valign: 'middle', margin: [0, 3, 0, 3] });
    });
  });
  if (risks.length > 13) {
    const lastY = tableY + 0.28 + 13 * 0.28;
    sl.addText('… et ' + (risks.length - 13) + ' risque(s) supplémentaire(s) — voir le registre des risques complet dans le dashboard', {
      x: 0.3, y: lastY, w: 12.73, h: 0.26, fontFace: 'Arial', fontSize: 8, color: '888888', align: 'center', italic: true });
  }
}

// ── Interfaces Techniques Slide ───────────────────────────────────────────────
function _cbsTechniqueSlide(pres) {
  const ifaces   = getTechInterfaces();
  const total    = ifaces.length;
  const done     = ifaces.filter(i => i.status === 'done').length;
  const partial  = ifaces.filter(i => i.status === 'partial').length;
  const pendBOA  = ifaces.filter(i => i.status === 'pending_boa').length;
  const pendCBS  = ifaces.filter(i => i.status === 'pending_cbs').length;
  const noImpact = ifaces.filter(i => i.status === 'no_impact').length;
  const pctDone  = total > 0 ? Math.round(done / total * 100) : 0;
  let arbVal = 0, arbSub = 0, arbPend = 0, arbRej = 0;
  ifaces.forEach(iface => {
    (iface.actions || []).forEach(a => {
      if      (a.arbitrage === 'validated')  arbVal++;
      else if (a.arbitrage === 'submitted')  arbSub++;
      else if (a.arbitrage === 'rejected')   arbRej++;
      else                                    arbPend++;
    });
  });
  const arbTotal = arbVal + arbSub + arbPend + arbRej;

  const sl = cbsSlide(pres, 'Interfaces Techniques',
    total + ' interfaces · ' + pctDone + '% intégrées · ' + new Date().toLocaleDateString('fr-FR', { day:'2-digit', month:'long', year:'numeric' }));

  // KPI band — 5 boxes
  const kpis = [
    { val: String(total),    label: 'Interfaces total', sub: 'périmètre technique',                    bg: '54565A' },
    { val: String(done),     label: 'Intégrées',        sub: 'statut Done',                            bg: '2E7D52' },
    { val: String(partial),  label: 'Partielles',       sub: 'intégration partielle',                  bg: '1565C0' },
    { val: String(pendBOA),  label: 'Attente BOA',      sub: 'décision BOA requise',                   bg: 'E8702A' },
    { val: String(arbTotal), label: 'Actions / Arb.',   sub: arbVal + ' val. · ' + arbPend + ' pend.', bg: '7c3aed' },
  ];
  kpis.forEach((k, i) => {
    const x = 0.3 + i * 2.55, y = 0.9, w = 2.3, h = 1.5;
    sl.addShape(pres.shapes.RECTANGLE, { x, y, w, h, fill: { color: k.bg }, line: { color: k.bg } });
    sl.addText(k.val,   { x, y: y + 0.05, w, h: 0.72, fontFace: 'Arial', fontSize: 28, bold: true, color: 'FFFFFF', align: 'center', valign: 'middle' });
    sl.addText(k.label, { x, y: y + 0.8,  w, h: 0.38, fontFace: 'Arial', fontSize: 9,  bold: true, color: 'FFFFFF', align: 'center', valign: 'middle' });
    sl.addText(k.sub,   { x, y: y + 1.18, w, h: 0.26, fontFace: 'Arial', fontSize: 7.5,            color: 'FFFFFF', align: 'center', valign: 'middle' });
  });

  // Progress bar
  const barY = 2.56;
  sl.addText('Taux d\'intégration — ' + pctDone + '%', { x: 0.3, y: barY, w: 5, h: 0.26, fontFace: 'Arial', fontSize: 9, bold: true, color: '333333', valign: 'middle' });
  sl.addShape(pres.shapes.RECTANGLE, { x: 0.3, y: barY + 0.28, w: 12.73, h: 0.2, fill: { color: 'E8E8E8' }, line: { color: 'E0E0E0' } });
  if (pctDone > 0) sl.addShape(pres.shapes.RECTANGLE, { x: 0.3, y: barY + 0.28, w: 12.73 * pctDone / 100, h: 0.2, fill: { color: '2E7D52' }, line: { color: '2E7D52' } });
  sl.addText(pctDone + '%', { x: 0.3, y: barY + 0.28, w: 12.73, h: 0.2, fontFace: 'Arial', fontSize: 8, bold: true, color: 'FFFFFF', align: 'center', valign: 'middle' });

  // Interface table — top 10
  const tableY = 3.2;
  const statLabel = { done: '\u2713 Intégrée', partial: '~ Partielle', pending_boa: '\u23F3 Attente BOA', pending_cbs: '\u23F3 Attente CBS', no_impact: '\u2014 Sans impact', '': 'Non défini' };
  const statColor = { done: '2E7D52', partial: '1565C0', pending_boa: 'E8702A', pending_cbs: '888888', no_impact: '888888', '': '888888' };
  const impactLabel = { no_impact: 'Aucun', minor: 'Mineur', multiple: 'Multiple', tbd: 'À définir', '': 'Non défini' };
  const colW = [3.7, 1.6, 1.3, 2.0, 4.83];
  const hdrs = ['Interface', 'Statut', 'Impact', 'Responsable', 'Actions & Arbitrages'];
  hdrs.forEach((h, c) => {
    const x = 0.3 + colW.slice(0, c).reduce((a, b) => a + b, 0);
    sl.addShape(pres.shapes.RECTANGLE, { x, y: tableY, w: colW[c], h: 0.28, fill: { color: 'E63329' }, line: { color: 'E63329' } });
    sl.addText(h, { x, y: tableY, w: colW[c], h: 0.28, fontFace: 'Arial', fontSize: 8, bold: true, color: 'FFFFFF', align: 'center', valign: 'middle' });
  });
  ifaces.slice(0, 10).forEach((iface, ri) => {
    const rowY  = tableY + 0.28 + ri * 0.28;
    const rowBg = ri % 2 === 0 ? 'F9F9F9' : 'FFFFFF';
    const sc    = statColor[iface.status] || '888888';
    const arbCount     = (iface.actions || []).length;
    const arbValidated = (iface.actions || []).filter(a => a.arbitrage === 'validated').length;
    const actStr = arbCount > 0 ? arbCount + ' action' + (arbCount > 1 ? 's' : '') + (arbValidated > 0 ? ' (' + arbValidated + ' arb. val.)' : '') : '—';
    const vals = [
      (iface.name || '—').slice(0, 48),
      statLabel[iface.status] || iface.status || '—',
      impactLabel[iface.impact] || iface.impact || '—',
      (iface.owner || '—').slice(0, 24),
      actStr,
    ];
    vals.forEach((v, c) => {
      const x      = 0.3 + colW.slice(0, c).reduce((a, b) => a + b, 0);
      const isStat = c === 1;
      sl.addShape(pres.shapes.RECTANGLE, { x, y: rowY, w: colW[c], h: 0.28, fill: { color: rowBg }, line: { color: 'E8E8E8', pt: 0.5 } });
      sl.addText(v, { x, y: rowY, w: colW[c], h: 0.28, fontFace: 'Arial', fontSize: 7.5, color: isStat ? sc : (c === 0 ? '1a1a1a' : '333333'), bold: isStat, align: c === 0 ? 'left' : 'center', valign: 'middle', margin: [0, 3, 0, 3] });
    });
  });
  if (ifaces.length > 10) {
    const lastY = tableY + 0.28 + 10 * 0.28;
    sl.addText('… et ' + (ifaces.length - 10) + ' interface(s) supplémentaire(s) — voir le tableau de bord Technique', {
      x: 0.3, y: lastY, w: 12.73, h: 0.26, fontFace: 'Arial', fontSize: 8, color: '888888', align: 'center', italic: true });
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// FLASH REPORT — Point Hebdomadaire (5 slides)
// ═════════════════════════════════════════════════════════════════════════════

function _flashWeekNum(d) {
  const dt = d ? new Date(d) : new Date();
  dt.setHours(0, 0, 0, 0);
  dt.setDate(dt.getDate() + 3 - (dt.getDay() + 6) % 7);
  const w1 = new Date(dt.getFullYear(), 0, 4);
  return 1 + Math.round(((dt - w1) / 86400000 - 3 + (w1.getDay() + 6) % 7) / 7);
}
function _flashWeekBounds(dateStr) {
  const d = dateStr ? new Date(dateStr) : new Date();
  const day = (d.getDay() + 6) % 7;
  const mon = new Date(d); mon.setDate(d.getDate() - day);
  const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
  return { start: mon.toISOString().slice(0, 10), end: sun.toISOString().slice(0, 10) };
}
function _flashAddDays(dateStr, n) {
  const d = new Date(dateStr); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10);
}
function _flashFmtDate(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
}

/** Agrège toutes les données nécessaires pour les 5 slides */
function _flashGetData(opts) {
  const sideF  = opts.side || '';
  const respF  = (opts.resp || '').trim();
  const today  = new Date().toISOString().slice(0, 10);
  const week   = _flashWeekBounds(today);
  const nextWeek = _flashWeekBounds(_flashAddDays(week.end, 1));

  // Actions (filtrées)
  const allActs = (state.customActions || []).filter(a => {
    if (sideF && (a.side || '') !== sideF) return false;
    if (respF && (a.resp || '') !== respF) return false;
    return true;
  });
  const allActsForDeps = state.customActions || [];

  // Gantt tasks (filtrées, sans phases/jalons)
  const allTasks = [...ganttTasks, ...(state.ganttCustom || [])].filter(t => {
    const type = String(t.type || '').toLowerCase();
    if (['phase','jalon','milestone','subtask','sous-tache','sous-tâche'].includes(type)) return false;
    if (sideF) {
      const ov = state.gantt[t.id] || {};
      const s  = ov._side || t.side || '';
      if (s && s !== sideF) return false;
    }
    return true;
  });

  // Avancement global Gantt
  const pctSum = allTasks.reduce((s, t) => {
    const ov = state.gantt[t.id] || {};
    return s + (ov._pct != null ? ov._pct : (t.pct || 0));
  }, 0);
  const globalPct = allTasks.length ? Math.round(pctSum / allTasks.length * 100) : 0;

  // KPI actions
  const actOverdue      = allActs.filter(a => {
    const sv = state.actions[a.id] || {};
    if (['done','cancelled'].includes(sv.status)) return false;
    const { end } = _actionDateRange(a, allActsForDeps);
    return end && end < today;
  });
  const actDoneThisWeek = allActs.filter(a => {
    const sv = state.actions[a.id] || {};
    if (sv.status !== 'done') return false;
    const df = sv.dateFin || sv.dateDebut || '';
    return df >= week.start && df <= week.end;
  });
  const actInProg   = allActs.filter(a => (state.actions[a.id] || {}).status === 'in_progress');
  const actBlocked  = allActs.filter(a => (state.actions[a.id] || {}).status === 'blocked');

  // Tâches Gantt actives S + S+1
  const planEnd = nextWeek.end;
  const activeTasks = allTasks.filter(t => {
    const { start, end } = getTaskDates(t);
    return start <= planEnd && end >= week.start;
  }).sort((a, b) => {
    const da = getTaskDates(a).start, db = getTaskDates(b).start;
    return da.localeCompare(db);
  });

  // Actions prioritaires (pas terminées, pas annulées)
  const priorityActs = allActs.filter(a => {
    const sv = state.actions[a.id] || {};
    return !['done','cancelled'].includes(sv.status || 'todo');
  }).sort((a, b) => {
    const sa = (state.actions[a.id] || {}).status || 'todo';
    const sb = (state.actions[b.id] || {}).status || 'todo';
    const order = { blocked: 0, in_progress: 1, todo: 2 };
    const ea = _actionDateRange(a, allActsForDeps).end || '9999';
    const eb = _actionDateRange(b, allActsForDeps).end || '9999';
    return (order[sa] ?? 3) - (order[sb] ?? 3) || ea.localeCompare(eb);
  });

  // RAG alerts
  const ragAlerts = allTasks.filter(t => {
    const ov = state.gantt[t.id] || {};
    const rag = t._custom ? (t.rag || null) : (ov._rag || null);
    return rag === 'R' || rag === 'O';
  });

  // Sans date / sans responsable
  const actNoDate = allActs.filter(a => {
    const sv = state.actions[a.id] || {};
    return !['done','cancelled'].includes(sv.status) && !sv.dateDebut;
  });
  const actNoResp = allActs.filter(a => {
    const sv = state.actions[a.id] || {};
    return !['done','cancelled'].includes(sv.status) && (!a.resp || a.resp === '—');
  });

  const _proj = (state.programme && state.programme.projects && state.currentProjectId)
    ? (state.programme.projects.find(p => p.id === state.currentProjectId) || {}).name || ''
    : (state.programme && state.programme.name) || state.currentProjectId || 'Projet';
  const _cp = (state.programme && state.programme.chefProjet) || '';

  return {
    today, week, nextWeek, allActsForDeps,
    globalPct, actOverdue, actDoneThisWeek, actInProg, actBlocked,
    activeTasks, priorityActs, ragAlerts, actNoDate, actNoResp,
    weekNum: _flashWeekNum(),
    projLabel: _proj,
    cpName: _cp,
    sideLabel: sideF ? '  ·  ' + sideF : '',
    respLabel: respF ? '  ·  ' + respF : '',
  };
}

// ── Slide 1 — Page de titre ───────────────────────────────────────────────────
function _flashCover(pres, data) {
  const slide = pres.addSlide();
  slide.background = { color: '0F172A' };
  slide.addShape(pres.shapes.RECTANGLE, { x: 0, y: 0,    w: 13.33, h: 1.3, fill: { color: 'E63329' }, line: { color: 'E63329' } });
  slide.addShape(pres.shapes.RECTANGLE, { x: 0, y: 6.75, w: 13.33, h: 0.75, fill: { color: 'E63329' }, line: { color: 'E63329' } });
  slide.addText('FLASH REPORT', {
    x: 0.5, y: 0, w: 12.33, h: 1.3,
    fontFace: 'Arial', fontSize: 38, bold: true, color: 'FFFFFF', align: 'center', valign: 'middle'
  });
  // Badge semaine
  slide.addShape(pres.shapes.RECTANGLE, { x: 4.9, y: 1.75, w: 3.53, h: 0.55, fill: { color: 'E63329' }, line: { color: 'E63329' } });
  slide.addText('Semaine\u00A0' + data.weekNum + '\u2003\u00B7\u2003' + data.today, {
    x: 4.9, y: 1.75, w: 3.53, h: 0.55, fontFace: 'Arial', fontSize: 12, bold: true, color: 'FFFFFF', align: 'center', valign: 'middle'
  });
  slide.addText('POINT HEBDOMADAIRE', {
    x: 0.5, y: 2.5, w: 12.33, h: 0.7, fontFace: 'Arial', fontSize: 28, bold: true, color: 'FFFFFF', align: 'center', valign: 'middle'
  });
  slide.addText(data.projLabel + data.sideLabel + data.respLabel, {
    x: 0.5, y: 3.3, w: 12.33, h: 0.4, fontFace: 'Arial', fontSize: 15, color: '94A3B8', align: 'center', valign: 'middle'
  });
  if (data.cpName) {
    slide.addText('Chef de Projet\u00A0: ' + data.cpName, {
      x: 0.5, y: 3.8, w: 12.33, h: 0.32, fontFace: 'Arial', fontSize: 11, color: '64748B', align: 'center', valign: 'middle'
    });
  }
  const wS = new Date(data.week.start).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long' });
  const wE = new Date(data.week.end).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
  slide.addText('P\u00E9riode\u00A0: ' + wS + ' \u2014 ' + wE, {
    x: 0.5, y: 4.25, w: 12.33, h: 0.28, fontFace: 'Arial', fontSize: 9.5, color: '475569', align: 'center', valign: 'middle'
  });
  slide.addText('CAPITAL BANKING SOLUTIONS \u2014 Confidentiel', {
    x: 0, y: 6.75, w: 13.33, h: 0.75, fontFace: 'Arial', fontSize: 9, color: 'FFFFFF', align: 'center', valign: 'middle'
  });
}

// ── Slide 2 — KPIs Semaine ────────────────────────────────────────────────────
function _flashKPIs(pres, data) {
  const sl = cbsSlide(pres, 'Tableau de Bord \u2014 Semaine\u00A0' + data.weekNum, '\u00C9tat au ' + data.today + data.sideLabel + data.respLabel);
  const kpis = [
    { val: data.globalPct + '%',                   label: 'Avancement Global',   sub: 'planning Gantt',              bg: '1565C0' },
    { val: String(data.actOverdue.length),          label: 'En Retard',           sub: '\u00e0 traiter en priorit\u00e9', bg: data.actOverdue.length   > 0 ? 'E63329' : '2E7D52' },
    { val: String(data.actDoneThisWeek.length),     label: 'Termin\u00e9es / S',  sub: 'livr\u00e9es cette semaine',  bg: '2E7D52' },
    { val: String(data.actInProg.length),           label: 'En Cours',            sub: 'actions actives',             bg: 'E8702A' },
    { val: String(data.actBlocked.length),          label: 'Bloqu\u00e9es',       sub: 'n\u00e9cessite d\u00e9blocage', bg: data.actBlocked.length   > 0 ? 'B71C1C' : '64748B' },
  ];
  kpis.forEach((k, i) => {
    const x = 0.2 + i * 2.59, y = 1.05, w = 2.35, h = 2.0;
    sl.addShape(pres.shapes.RECTANGLE, { x, y, w, h, fill: { color: k.bg }, line: { color: k.bg } });
    sl.addText(k.val,   { x, y: y + 0.1,  w, h: 0.85, fontFace: 'Arial', fontSize: 36, bold: true, color: 'FFFFFF', align: 'center', valign: 'middle', margin: 0 });
    sl.addText(k.label, { x, y: y + 1.0,  w, h: 0.5,  fontFace: 'Arial', fontSize: 10, bold: true, color: 'FFFFFF', align: 'center', valign: 'middle', margin: 0 });
    sl.addText(k.sub,   { x, y: y + 1.52, w, h: 0.35, fontFace: 'Arial', fontSize: 8,              color: 'FFFFFF', align: 'center', valign: 'middle', margin: 0 });
  });
  // Barre avancement
  sl.addText('Avancement global\u00a0: ', { x: 0.2, y: 3.25, w: 2.3, h: 0.35, fontFace: 'Arial', fontSize: 10, bold: true, color: '000000', valign: 'middle' });
  sl.addShape(pres.shapes.RECTANGLE, { x: 2.55, y: 3.32, w: 10.2, h: 0.22, fill: { color: 'E2E8F0' }, line: { color: 'E2E8F0' } });
  if (data.globalPct > 0) {
    sl.addShape(pres.shapes.RECTANGLE, { x: 2.55, y: 3.32, w: Math.max(0.05, 10.2 * data.globalPct / 100), h: 0.22, fill: { color: '1565C0' }, line: { color: '1565C0' } });
  }
  sl.addText(data.globalPct + '%', { x: 12.78, y: 3.25, w: 0.55, h: 0.35, fontFace: 'Arial', fontSize: 10, bold: true, color: '1565C0', valign: 'middle', align: 'right' });
  // Alertes
  const alerts = [];
  if (data.actBlocked.length > 0) alerts.push({ text: '\ud83d\udd34  ' + data.actBlocked.length + ' action(s) bloqu\u00e9e(s) \u2014 d\u00e9blocage requis', fill: 'FDEEEC', line: 'E63329', col: 'B91C1C' });
  if (data.actOverdue.length  > 0) alerts.push({ text: '\u26a0\ufe0f  ' + data.actOverdue.length  + ' action(s) en retard \u2014 traitement prioritaire', fill: 'FEF3E2', line: 'E8702A', col: 'B45309' });
  if (alerts.length === 0) alerts.push({ text: '\u2705  Aucune action en retard ni bloqu\u00e9e \u2014 programme dans les d\u00e9lais', fill: 'ECFDF5', line: '2E7D52', col: '065F46' });
  alerts.slice(0, 2).forEach((a, i) => {
    sl.addShape(pres.shapes.RECTANGLE, { x: 0.2, y: 3.75 + i * 0.65, w: 13.0, h: 0.55, fill: { color: a.fill }, line: { color: a.line, pt: 0.5 } });
    sl.addText(a.text, { x: 0.35, y: 3.75 + i * 0.65, w: 12.8, h: 0.55, fontFace: 'Arial', fontSize: 11, color: a.col, valign: 'middle' });
  });
}

// ── Slide 3 — Planning Semaine ────────────────────────────────────────────────
function _flashPlanning(pres, data) {
  const today = data.today;
  const tasks = data.activeTasks.slice(0, 18);
  const sl = cbsSlide(pres,
    'Planning \u2014 Sem.\u00a0' + data.weekNum + ' & S+1',
    'T\u00e2ches actives du ' + _flashFmtDate(data.week.start) + ' au ' + _flashFmtDate(data.nextWeek.end) + data.sideLabel
  );
  if (tasks.length === 0) {
    sl.addText('Aucune t\u00e2che active sur cette p\u00e9riode.', { x: 0.3, y: 3.0, w: 12.7, h: 0.5, fontFace: 'Arial', fontSize: 13, color: '94A3B8', align: 'center' });
    return;
  }
  const C = (v, bg, opts) => ({ text: String(v ?? ''), options: { fontFace: 'Arial', fontSize: 8, fill: { color: bg || 'FFFFFF' }, border: { pt: 0.3, color: 'E2E8F0' }, ...(opts || {}) } });
  const hdr = (t, bg) => ({ text: t, options: { fill: { color: bg || '1565C0' }, color: 'FFFFFF', bold: true, fontFace: 'Arial', fontSize: 8, align: 'center', border: { pt: 0.5, color: 'FFFFFF' } } });
  const rows = [[hdr('T\u00e2che'), hdr('Responsable'), hdr('D\u00e9but'), hdr('Fin'), hdr('Avt.'), hdr('Statut')]];
  tasks.forEach((t, ri) => {
    const ov = state.gantt[t.id] || {};
    const { start, end } = getTaskDates(t);
    const pct = Math.round(((ov._pct != null ? ov._pct : (t.pct || 0))) * 100);
    const owner = (ov._owner || t.owner || t.resp || '\u2014').slice(0, 18);
    const label = (ov._label || t.label || '').slice(0, 48);
    const rag   = t._custom ? (t.rag || null) : (ov._rag || null);
    const isLate = end < today;
    const isStart = start >= data.week.start && start <= data.week.end;
    const bg = rag === 'R' ? 'FFF5F5' : rag === 'O' ? 'FFFBEB' : ri % 2 === 0 ? 'FFFFFF' : 'F8FAFC';
    const statusTxt = isLate ? 'En retard' : pct >= 100 ? 'Termin\u00e9' : pct > 0 ? 'En cours' : '\u00c0 d\u00e9m.';
    const statusCol = isLate ? 'E63329' : pct >= 100 ? '2E7D52' : pct > 0 ? 'E8702A' : '94A3B8';
    rows.push([
      C((isLate ? '\u26a0 ' : isStart ? '\u25b6 ' : '') + label, bg),
      C(owner, bg, { align: 'center' }),
      C(_flashFmtDate(start), bg, { align: 'center' }),
      C(_flashFmtDate(end), bg, { align: 'center', color: isLate ? 'E63329' : '000000', bold: isLate }),
      C(pct + '%', bg, { align: 'center', bold: true, color: pct >= 100 ? '2E7D52' : '1565C0' }),
      C(statusTxt, bg, { align: 'center', bold: true, color: statusCol }),
    ]);
  });
  const rowH = Math.min(0.32, 6.15 / (tasks.length + 1));
  sl.addTable(rows, { x: 0.15, y: 0.92, w: 13.0, colW: [5.0, 2.1, 1.2, 1.2, 0.85, 1.8], rowH });
  if (data.activeTasks.length > 18) sl.addText('+ ' + (data.activeTasks.length - 18) + ' autres t\u00e2ches\u2026', { x: 0.15, y: 7.12, w: 13.0, h: 0.18, fontFace: 'Arial', fontSize: 7, color: '94A3B8', align: 'right' });
}

// ── Slide 4 — Actions Prioritaires ───────────────────────────────────────────
function _flashActions(pres, data) {
  const today = data.today;
  const acts  = data.priorityActs.slice(0, 20);
  const allA  = data.allActsForDeps;
  const sl = cbsSlide(pres,
    'Actions Prioritaires \u2014 Suivi Semaine\u00a0' + data.weekNum,
    acts.length + ' action(s) \u00e0 suivre\u2003\u00b7\u2003en cours, en retard, \u00e0 d\u00e9marrer' + data.sideLabel + data.respLabel
  );
  if (acts.length === 0) {
    sl.addShape(pres.shapes.RECTANGLE, { x: 0.3, y: 2.2, w: 12.73, h: 0.6, fill: { color: 'ECFDF5' }, line: { color: '2E7D52', pt: 0.5 } });
    sl.addText('\u2705  Aucune action en suspens \u2014 toutes les actions actives sont \u00e0 jour.', { x: 0.5, y: 2.2, w: 12.5, h: 0.6, fontFace: 'Arial', fontSize: 12, bold: true, color: '065F46', valign: 'middle' });
    return;
  }
  const STATUS_FR  = { todo: '\u00c0 faire', in_progress: 'En cours', done: 'Termin\u00e9', blocked: '\ud83d\udd34 Bloqu\u00e9', cancelled: 'Annul\u00e9' };
  const STATUS_COL = { todo: '64748B', in_progress: '1565C0', done: '2E7D52', blocked: 'E63329', cancelled: '888888' };
  const C = (v, bg, opts) => ({ text: String(v ?? ''), options: { fontFace: 'Arial', fontSize: 7.5, fill: { color: bg || 'FFFFFF' }, border: { pt: 0.3, color: 'E2E8F0' }, ...(opts || {}) } });
  const hdr = t => ({ text: t, options: { fill: { color: 'E63329' }, color: 'FFFFFF', bold: true, fontFace: 'Arial', fontSize: 8, align: 'center', border: { pt: 0.5, color: 'FFFFFF' } } });
  const rows = [[hdr('R\u00e9f.'), hdr('Action / D\u00e9cision'), hdr('Responsable'), hdr('C\u00f4t\u00e9'), hdr('\u00c9ch\u00e9ance'), hdr('Avt.'), hdr('Statut')]];
  acts.forEach((a, ri) => {
    const sv     = state.actions[a.id] || {};
    const status = sv.status || 'todo';
    const pct    = sv.pct || 0;
    const { end: echStr } = _actionDateRange(a, allA);
    const isOverdue = echStr && echStr < today && !['done','cancelled'].includes(status);
    const bg = status === 'blocked' ? 'FDEEEC' : isOverdue ? 'FFF5F5' : ri % 2 === 0 ? 'FFFFFF' : 'F8FAFC';
    rows.push([
      C(a.id, bg, { fontSize: 7, color: 'E63329', bold: true, align: 'center' }),
      C((isOverdue ? '\u26a0 ' : '') + (a.action || '').slice(0, 55), bg),
      C((a.resp || '\u2014').slice(0, 16), bg, { align: 'center' }),
      C(a.side || '\u2014', bg, { align: 'center' }),
      C(_flashFmtDate(echStr), bg, { align: 'center', color: isOverdue ? 'E63329' : '000000', bold: isOverdue }),
      C(pct + '%', bg, { align: 'center', bold: true, color: pct >= 100 ? '2E7D52' : pct > 0 ? '1565C0' : '94A3B8' }),
      C(STATUS_FR[status] || status, bg, { align: 'center', bold: true, color: STATUS_COL[status] || '000000' }),
    ]);
  });
  const rowH = Math.min(0.3, 6.1 / (acts.length + 1));
  sl.addTable(rows, { x: 0.15, y: 0.92, w: 13.0, colW: [1.1, 4.3, 1.8, 0.85, 1.15, 0.75, 1.45], rowH });
  if (data.priorityActs.length > 20) sl.addText('+ ' + (data.priorityActs.length - 20) + ' autres actions\u2026', { x: 0.15, y: 7.12, w: 13.0, h: 0.18, fontFace: 'Arial', fontSize: 7, color: '94A3B8', align: 'right' });
}

// ── Slide 5 — Points d'Attention ─────────────────────────────────────────────
function _flashAttention(pres, data) {
  const sl = cbsSlide(pres, 'Points d\u2019Attention \u2014 Semaine\u00a0' + data.weekNum, '\u00c9l\u00e9ments n\u00e9cessitant une d\u00e9cision ou un suivi imm\u00e9diat');
  let y = 1.0;
  const _sec = (title, color, lines, max) => {
    sl.addShape(pres.shapes.RECTANGLE, { x: 0.15, y, w: 13.0, h: 0.36, fill: { color }, line: { color } });
    sl.addText(title, { x: 0.3, y, w: 12.8, h: 0.36, fontFace: 'Arial', fontSize: 11, bold: true, color: 'FFFFFF', valign: 'middle' });
    y += 0.36;
    if (lines.length === 0) {
      sl.addText('  \u2705 Aucun \u00e9l\u00e9ment.', { x: 0.15, y, w: 13.0, h: 0.3, fontFace: 'Arial', fontSize: 9.5, color: '2E7D52', valign: 'middle' });
      y += 0.36;
    } else {
      lines.slice(0, max).forEach(line => {
        sl.addText(line, { x: 0.3, y, w: 12.8, h: 0.29, fontFace: 'Arial', fontSize: 9, color: '1E293B', valign: 'middle' });
        y += 0.29;
      });
      if (lines.length > max) {
        sl.addText('  + ' + (lines.length - max) + ' autre(s)\u2026', { x: 0.3, y, w: 12.8, h: 0.22, fontFace: 'Arial', fontSize: 8, color: '94A3B8', valign: 'middle' });
        y += 0.25;
      }
      y += 0.08;
    }
  };
  // Bloquées
  _sec('\ud83d\udd34  Actions Bloqu\u00e9es (' + data.actBlocked.length + ')', 'B91C1C',
    data.actBlocked.map(a => '  \u2022  ' + a.id + '\u2003' + (a.action || '').slice(0, 68) + '\u2003[' + (a.resp || '\u2014') + ']'), 5);
  // RAG
  _sec('\ud83d\udfe0  Alertes RAG Gantt (' + data.ragAlerts.length + ')', 'B45309',
    data.ragAlerts.map(t => {
      const ov  = state.gantt[t.id] || {};
      const rag = t._custom ? (t.rag || '') : (ov._rag || '');
      const lbl = (ov._label || t.label || t.id).slice(0, 58);
      const own = (ov._owner || t.owner || '\u2014');
      const cm  = (t._custom ? (t.commentaire || '') : (ov._commentaire || '')).slice(0, 38);
      return '  ' + (rag === 'R' ? '\ud83d\udd34' : '\ud83d\udfe0') + '  ' + lbl + '\u2003[' + own + ']' + (cm ? '\u2003\u2014 ' + cm : '');
    }), 4);
  // À compléter
  const misc = [
    ...data.actNoDate.slice(0, 3).map(a => '  \ud83d\udcc5  Sans date\u00a0: ' + a.id + '\u2003' + (a.action || '').slice(0, 60)),
    ...data.actNoResp.slice(0, 3).map(a => '  \ud83d\udc64  Sans resp.\u00a0: ' + a.id + '\u2003' + (a.action || '').slice(0, 60)),
  ];
  _sec('\u26aa  \u00c0 Compl\u00e9ter \u2014 ' + data.actNoDate.length + ' sans date\u2003\u00b7\u2003' + data.actNoResp.length + ' sans responsable', '64748B', misc, 5);
}

// ── Dispatcher principal ──────────────────────────────────────────────────────
function _flashReportSlides(pres, today, opts) {
  const data = _flashGetData(opts || {});
  _flashCover(pres, data);
  _flashKPIs(pres, data);
  _flashPlanning(pres, data);
  _flashActions(pres, data);
  _flashAttention(pres, data);
}

// ── Main Report Dispatcher ────────────────────────────────────────────────────
async function generateCBSReport(type, domain, flashOpts) {
  type = type || 'synth';
  if (typeof PptxGenJS === 'undefined') {
    alert('La librairie PptxGenJS n\u2019a pas pu se charger.\nV\u00E9rifiez votre connexion Internet puis rechargez la page.');
    return;
  }
  const btn = document.getElementById('btn-gen-rapport');
  const origHTML = btn ? btn.innerHTML : '';
  if (btn) { btn.disabled = true; btn.innerHTML = '\u23F3 G\u00E9n\u00E9ration\u2026'; }
  try {
    const pres = new PptxGenJS();
    pres.layout  = 'LAYOUT_WIDE';
    pres.author  = 'Capital Banking Solutions';
    pres.subject = 'BOA CI \u2014 Rapport Pilotage IGOR V4';
    pres.title   = "BOA C\u00F4te d'Ivoire \u2014 Upgrade IGOR V4";
    const today = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });

    // ── Dispatch selon le type ────────────────────────────────────────────────
    if (type === 'flash') {
      _flashReportSlides(pres, today, flashOpts || {});
    } else if (type === 'synth') {
      _cbsCover(pres, today, 'synth', null);
      _cbsSommaire(pres, 'synth', null);
      _cbsDashboard(pres, today);
      _cbsRetro(pres);
      _cbsArbitragesSynth(pres);
      _cbsActionsSynth(pres);
      _cbsGapSynth(pres);
      _cbsPerimetreSlide(pres);
      _cbsRisquesSlide(pres);
      _cbsTechniqueSlide(pres);
      _cbsConclusion(pres);
    } else if (type === 'detail') {
      _cbsCover(pres, today, 'detail', null);
      _cbsSommaire(pres, 'detail', null);
      _cbsDashboard(pres, today);
      _cbsRetro(pres);
      _cbsArbitragesTable(pres, null);
      _cbsActionsTable(pres, null);
      _cbsGapSynth(pres);
      _cbsGapDomainSlides(pres, null);
      _cbsPerimetreSlide(pres);
      _cbsRisquesSlide(pres);
      _cbsTechniqueSlide(pres);
      _cbsConclusion(pres);
    } else if (type === 'domain') {
      _cbsCover(pres, today, 'domain', domain);
      _cbsSommaire(pres, 'domain', domain);
      _cbsDomainOverview(pres, today, domain);
      _cbsArbitragesTable(pres, domain);
      _cbsActionsTable(pres, domain);
      _cbsGapDomainSlides(pres, domain);
      _cbsPerimetreSlide(pres);
      _cbsRisquesSlide(pres);
      _cbsTechniqueSlide(pres);
      _cbsConclusion(pres);
    }

    // ── Export ────────────────────────────────────────────────────────────────
    const _wn = _flashWeekNum ? _flashWeekNum() : '';
    const typeLabel = {
      flash:  'Flash_S' + _wn,
      synth:  'Synthetique',
      detail: 'Detaille',
      domain: 'Domaine_' + (domain || '').replace(/[^a-zA-Z0-9]/g, '_')
    };
    const fname = 'BOA_CI_Rapport_IGOR_' + (typeLabel[type] || 'Rapport') + '_' + new Date().toISOString().slice(0, 10) + '.pptx';
    await pres.writeFile({ fileName: fname });

  } catch (err) {
    console.error('CBS Report error:', err);
    alert('Erreur lors de la g\u00E9n\u00E9ration\u00A0: ' + err.message);
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = origHTML; }
  }
}



function openOwnersModal() {
  _renderOwnerDomainDatalist();
  renderOwnersModal();
  document.getElementById('owners-modal').style.display = 'flex';
}
function closeOwnersModal() {
  document.getElementById('owners-modal').style.display = 'none';
}
// ── Référentiel responsables — rendu générique ───────────────────────────────
// _renderOwnersList() peut être appelé depuis le modal ET depuis l'onglet Paramétrage
function _renderOwnersList(el, all) {
  if (!el) return;
  if (all.length === 0) {
    el.innerHTML = '<div style="font-size:12px;color:#94a3b8;font-style:italic;padding:10px 0;">Aucun responsable enregistré.</div>';
    return;
  }
  const cols = 'minmax(130px,1.4fr) 88px 100px minmax(110px,1fr) minmax(140px,1.1fr) 38px';
  el.innerHTML = `
    <div style="display:grid;grid-template-columns:${cols};gap:6px;align-items:center;margin-bottom:6px;padding:0 2px;font-size:10px;font-weight:800;color:#64748b;text-transform:uppercase;">
      <div>Responsable</div><div>Entité</div><div>Intervention</div><div>Domaine</div><div>Email</div><div></div>
    </div>
    ${all.map((o, idx) => `
      <div style="display:grid;grid-template-columns:${cols};gap:6px;align-items:center;padding:7px 6px;border:1px solid ${o._placeholder ? '#fecaca' : '#e5e7eb'};border-radius:8px;background:${o._placeholder ? '#fff5f5' : '#fafafa'};margin-bottom:5px;">
        <input value="${_esc(o.name)}" onchange="updateOwnerField(${idx},'name',this.value)" placeholder="Nom / équipe" style="width:100%;padding:6px 7px;border:1px solid #d1d5db;border-radius:4px;font-size:11px;box-sizing:border-box;" ${o._placeholder ? 'title="Responsable provisoire — issu d\'un import"' : ''}>
        <select onchange="updateOwnerField(${idx},'side',this.value)" style="width:100%;padding:6px 6px;border:1px solid #d1d5db;border-radius:4px;font-size:11px;box-sizing:border-box;">
          <option value="" ${!o.side?'selected':''}>—</option>
          <option value="BOA" ${o.side==='BOA'?'selected':''}>BOA</option>
          <option value="CBS" ${o.side==='CBS'?'selected':''}>CBS</option>
          <option value="BOA + CBS" ${o.side==='BOA + CBS'?'selected':''}>BOA+CBS</option>
          <option value="Externe" ${o.side==='Externe'?'selected':''}>Externe</option>
        </select>
        <select onchange="updateOwnerField(${idx},'interventionType',this.value)" style="width:100%;padding:6px 6px;border:1px solid #d1d5db;border-radius:4px;font-size:11px;box-sizing:border-box;">
          <option value="" ${!o.interventionType?'selected':''}>—</option>
          <option value="Métier" ${o.interventionType==='Métier'?'selected':''}>Métier</option>
          <option value="Technique" ${o.interventionType==='Technique'?'selected':''}>Technique</option>
          <option value="Mixte" ${o.interventionType==='Mixte'?'selected':''}>Mixte</option>
        </select>
        <input value="${_esc(o.domain)}" list="dl-owner-domains" onchange="updateOwnerField(${idx},'domain',this.value)" placeholder="ex: Crédits…" style="width:100%;padding:6px 7px;border:1px solid #d1d5db;border-radius:4px;font-size:11px;box-sizing:border-box;">
        <input value="${_esc(o.email||'')}" type="email" onchange="updateOwnerField(${idx},'email',this.value)" placeholder="prenom.nom@…" style="width:100%;padding:6px 7px;border:1px solid #d1d5db;border-radius:4px;font-size:11px;box-sizing:border-box;">
        <button onclick="removeOwner(${idx})" style="background:none;border:none;color:#E63329;cursor:pointer;font-size:15px;line-height:1;padding:0 3px;" title="Supprimer">✕</button>
      </div>
    `).join('')}
  `;
}

function renderOwnersModal() {
  const el = document.getElementById('owners-list-render');
  if (!el) return;
  _renderOwnersList(el, getOwnerRecords());
}

function _renderOwnersInParam() {
  const el = document.getElementById('param-owners-render');
  if (!el) return;
  _renderOwnersList(el, getOwnerRecords());
}

function addOwner(prefix) {
  const p = prefix || 'owner-new';
  const nameInput   = document.getElementById(p + '-input');
  const sideInput   = document.getElementById(p + '-side');
  const typeInput   = document.getElementById(p + '-type');
  const domainInput = document.getElementById(p + '-domain');
  const emailInput  = document.getElementById(p + '-email');
  const name = (nameInput?.value || '').trim();
  if (!name) return;
  if (getOwnersList().some(o => o.toLowerCase() === name.toLowerCase())) {
    if (nameInput) { nameInput.value = ''; nameInput.focus(); }
    showToast('⚠️ "' + name + '" existe déjà dans le référentiel.', 2000);
    return;
  }
  const records = getOwnerRecords();
  records.push({
    name,
    side:             (sideInput?.value   || '').trim(),
    interventionType: (typeInput?.value   || '').trim(),
    domain:           (domainInput?.value || '').trim(),
    email:            (emailInput?.value  || '').trim(),
  });
  _setOwnerRecords(records);
  _refreshOwnersReferentialUI();
  _scheduleOwnersReferentialSave('Ajout responsable');
  if (nameInput)   nameInput.value   = '';
  if (sideInput)   sideInput.value   = '';
  if (typeInput)   typeInput.value   = '';
  if (domainInput) domainInput.value = '';
  if (emailInput)  emailInput.value  = '';
}
function updateOwnerField(idx, field, value) {
  const records = getOwnerRecords();
  if (!records[idx]) return;
  records[idx][field] = String(value || '').trim();
  _setOwnerRecords(records);
  _refreshOwnersReferentialUI();
  _scheduleOwnersReferentialSave('Mise à jour responsable');
}
function removeOwner(idx) {
  const records = getOwnerRecords();
  const owner = records[idx];
  if (!owner) return;
  if (!confirm('Supprimer le responsable "' + owner.name + '" ?')) return;
  records.splice(idx, 1);
  _setOwnerRecords(records);
  _refreshOwnersReferentialUI();
  _scheduleOwnersReferentialSave('Suppression responsable');
}


// ════════════════════════════════════════════════════════════════════════
// VUE KANBAN — Arbitrages / Actions / GAPs / Risques
// ════════════════════════════════════════════════════════════════════════

const _viewModes = { arbitrages: 'list', actions: 'list', gaps: 'list', risques: 'list' };

function setViewMode(tab, mode) {
  _viewModes[tab] = mode;

  // Toggle button active state
  const prefix = tab.replace('arbitrages','arb').replace('actions','act').replace('gaps','gaps').replace('risques','risks');
  const listBtn   = document.getElementById(prefix + '-btn-list');
  const kanbanBtn = document.getElementById(prefix + '-btn-kanban');
  const calendarBtn = document.getElementById(prefix + '-btn-calendar');
  if (listBtn)   { listBtn.classList.toggle('active',   mode === 'list');   }
  if (kanbanBtn) { kanbanBtn.classList.toggle('active', mode === 'kanban'); }
  if (calendarBtn) { calendarBtn.classList.toggle('active', mode === 'calendar'); }

  // Show/hide containers
  const listView   = document.getElementById(prefix + '-list-view');
  const kanbanView = document.getElementById(prefix + '-kanban-view');
  const calendarView = document.getElementById(prefix + '-calendar-view');
  if (listView)   listView.style.display   = mode === 'list'   ? '' : 'none';
  if (kanbanView) kanbanView.style.display = mode === 'kanban' ? '' : 'none';
  if (calendarView) calendarView.style.display = mode === 'calendar' ? '' : 'none';

  // Re-render
  if (mode === 'kanban') {
    if (tab === 'arbitrages') renderKanbanArbitrages();
    if (tab === 'actions')    renderKanbanActions();
    if (tab === 'gaps')       renderKanbanGaps();
    if (tab === 'risques')    renderKanbanRisques();
  } else if (mode === 'list') {
    if (tab === 'arbitrages') renderArbitrages();
    if (tab === 'actions')    renderActions();
    if (tab === 'gaps')       renderGaps();
    if (tab === 'risques')    renderRisques();
  } else if (mode === 'calendar') {
    if (tab === 'actions') renderActions();
  }
}

// ── Kanban builder helper ─────────────────────────────────────────────────────
// columns = [{ id, title, color, cards: [{id, title, meta:[{text,bg,color}]}] }]
// tab     = 'arbitrages'|'actions'|'gaps'|'risques'  (null = no drag)
function _buildKanban(containerId, columns, tab) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const dnd = canEdit() && !!tab;          // drag actif seulement si éditeur/admin
  const colId = col => String(col.id).replace(/'/g, '');  // safe pour inline handler

  const html = '<div class="kanban-board">' +
    columns.map(col => {
      const cid = colId(col);
      const cards = col.cards.length
        ? col.cards.map(card => {
            const cardId = String(card.id ?? '').replace(/'/g, '\x27');
            const drag   = dnd
              ? ` draggable="true"
                  ondragstart="_kbDragStart(event,'${tab}','${cardId}','${cid}')"
                  ondragend="_kbDragEnd(event)"`
              : '';
            const cls    = dnd ? 'kanban-card kanban-card-draggable' : 'kanban-card';
            const click  = tab === 'actions'
              ? ` onclick="_kbCardClick(event,'${tab}','${cardId}')"
                  title="Cliquer pour modifier l'action"`
              : '';
            return `<div class="${cls}"${drag}${click} style="${tab === 'actions' ? 'cursor:pointer;' : ''}">
              <div class="kanban-card-title">${escHtml(card.title)}</div>
              ${card.meta && card.meta.length
                ? '<div class="kanban-card-meta">' + card.meta.map(m =>
                    `<span class="kanban-badge" style="background:${m.bg};color:${m.color};border:1px solid ${m.border||m.bg};"${m._title ? ` title="${escAttr(m._title)}"` : ''}>${escHtml(String(m.text))}</span>`
                  ).join('') + '</div>'
                : ''}
              ${card.extraHtml || ''}
            </div>`;
          }).join('')
        : '<div class="kanban-empty">Aucun élément</div>';

      const dropAttrs = dnd
        ? ` ondragover="_kbDragOver(event,this)"
            ondragleave="_kbDragLeave(event,this)"
            ondrop="_kbDrop(event,this,'${tab}','${cid}')"`
        : '';

      return `<div class="kanban-col">
        <div class="kanban-col-header" style="background:${col.color};">
          <span class="kanban-col-title">${col.title}</span>
          <span class="kanban-col-badge">${col.cards.length}</span>
        </div>
        <div class="kanban-col-body"${dropAttrs}>${cards}</div>
      </div>`;
    }).join('') + '</div>';

  container.innerHTML = html;
}

// ── Drag & Drop handlers ──────────────────────────────────────────────────────
let _kbDrag = {};
let _kbSuppressClickUntil = 0;

function _kbDragStart(event, tab, cardId, colId) {
  _kbDrag = { tab, cardId, fromCol: colId };
  _kbSuppressClickUntil = Date.now() + 250;
  event.dataTransfer.effectAllowed = 'move';
  event.dataTransfer.setData('text/plain', cardId);
  // Opacité différée pour voir la carte au drag
  requestAnimationFrame(() => event.target.classList.add('kanban-card-dragging'));
}

function _kbDragEnd(event) {
  event.target.classList.remove('kanban-card-dragging');
  _kbSuppressClickUntil = Date.now() + 250;
  // Nettoyer tous les dragover restants
  document.querySelectorAll('.kanban-col-dragover').forEach(el => el.classList.remove('kanban-col-dragover'));
}

function _kbDragOver(event, colBody) {
  event.preventDefault();
  event.dataTransfer.dropEffect = 'move';
  colBody.closest('.kanban-col').classList.add('kanban-col-dragover');
}

function _kbDragLeave(event, colBody) {
  // Ignorer si on entre dans un enfant du même col
  const col = colBody.closest('.kanban-col');
  if (col && col.contains(event.relatedTarget)) return;
  col.classList.remove('kanban-col-dragover');
}

function _kbDrop(event, colBody, tab, toColId) {
  event.preventDefault();
  colBody.closest('.kanban-col').classList.remove('kanban-col-dragover');
  const { tab: dTab, cardId, fromCol } = _kbDrag;
  _kbDrag = {};
  if (!cardId || dTab !== tab || fromCol === toColId) return;
  if (!canEdit()) { showToast('Mode lecture : modifications non autorisées.'); return; }

  if (tab === 'arbitrages') {
    setArbDecision(parseInt(cardId), 'decision', toColId);
    renderKanbanArbitrages();
  } else if (tab === 'actions') {
    setActionStatus(cardId, toColId);
    renderKanbanActions();
  } else if (tab === 'gaps') {
    if (!state.gaps[cardId]) state.gaps[cardId] = {};
    state.gaps[cardId].prio = toColId;
    saveState('GAP priorité modifiée', cardId + ' → ' + toColId);
    renderKanbanGaps();
  } else if (tab === 'risques') {
    const idx = parseInt(cardId);
    if (state.risks && state.risks[idx]) {
      state.risks[idx].statut = toColId;
      saveState('Risque statut modifié', (state.risks[idx].desc || '').substring(0, 60) + ' → ' + toColId);
      renderKanbanRisques();
    }
  }
}

function _kbCardClick(event, tab, cardId) {
  if (Date.now() < _kbSuppressClickUntil) return;
  if (tab === 'actions') openEditActionModal(cardId);
}

function toggleKanbanSection(btn) {
  const targetId = btn?.getAttribute('data-target');
  const panel = targetId ? document.getElementById(targetId) : null;
  if (!panel) return;
  const isOpen = panel.style.display !== 'none';
  panel.style.display = isOpen ? 'none' : 'block';
  btn.setAttribute('aria-expanded', isOpen ? 'false' : 'true');
  btn.querySelector('.kb-sec-chevron').textContent = isOpen ? '▸' : '▾';
}

// ── Arbitrages Kanban ─────────────────────────────────────────────────────────
function renderKanbanArbitrages() {
  const _kDecs = _getArbDecisions();
  const _kDefKey = _getArbDefaultKey();
  const cols = _kDecs.map(d => ({ id: d.key, title: d.icon + ' ' + d.label, color: d.color, cards: [] }));
  const prioColors = { P1: { bg: '#FDEEEC', color: '#E63329', border: '#E63329' }, P2: { bg: '#FEF3E2', color: '#E8702A', border: '#E8702A' }, P3: { bg: '#F5F5F5', color: '#888', border: '#ccc' } };
  const fDomain = (document.getElementById('arb-filter-domain')?.value || '').toLowerCase();
  const fDec    = document.getElementById('arb-filter-dec')?.value || '';

  arbitrages.forEach(a => {
    const sv  = state.arbitrages[a.id] || {};
    const dec = sv.decision || _kDefKey;
    if (fDomain && !a.domain.toLowerCase().includes(fDomain)) return;
    if (fDec && dec !== fDec) return;
    const col = cols.find(c => c.id === dec);
    if (!col) return;
    const pc = prioColors[a.prio] || prioColors.P3;
    const meta = [
      { text: a.prio || '—', bg: pc.bg, color: pc.color, border: pc.border },
      { text: a.domain, bg: '#f0f4ff', color: '#1565C0', border: '#c5d8ff' },
      { text: a.resp || '—', bg: '#f5f5f5', color: '#54565A', border: '#ddd' },
    ];
    if (a.deadline) meta.push({ text: '📅 ' + a.deadline, bg: '#fff', color: '#888', border: '#eee' });
    col.cards.push({ id: a.id, title: a.label.slice(0, 90) + (a.label.length > 90 ? '…' : ''), meta });
  });
  _buildKanban('arb-kanban-view', cols, 'arbitrages');
}

// ── Actions Kanban ────────────────────────────────────────────────────────────
function _normalizeActionMultiValueInput(value, splitPattern) {
  return [...new Set(String(value || '')
    .split(splitPattern)
    .map(v => v.trim())
    .filter(Boolean))];
}

function _actionParticipants(act) {
  if (Array.isArray(act?.participants)) return act.participants.filter(Boolean);
  return _normalizeActionMultiValueInput(act?.participantsText || '', /[,;\n]/);
}

function _actionParticipantsText(act) {
  return _actionParticipants(act).join(', ');
}

function _actionDocuments(act) {
  if (Array.isArray(act?.documents)) return act.documents.filter(Boolean);
  return _normalizeActionMultiValueInput(act?.documentsText || '', /\r?\n/);
}

function _actionDocumentsText(act) {
  return _actionDocuments(act).join('\n');
}

let _actionModalComments = [];

function _getActionCommentAuthor() {
  return currentSession ? (currentSession.displayName || currentSession.username || 'Utilisateur') : 'Utilisateur';
}

function _normalizeActionComments(arr, fallbackComment) {
  const base = Array.isArray(arr) ? arr : [];
  const normalized = base
    .map(c => ({
      id: c && c.id ? String(c.id) : ('c_' + Math.random().toString(36).slice(2, 10)),
      text: String((c && (c.text ?? c.commentaire ?? '')) || '').trim(),
      author: String((c && (c.author ?? c.user ?? 'Utilisateur')) || 'Utilisateur').trim() || 'Utilisateur',
      createdAt: String((c && (c.createdAt ?? c.ts ?? '')) || '')
    }))
    .filter(c => c.text);
  if (normalized.length === 0 && String(fallbackComment || '').trim()) {
    normalized.push({
      id: 'legacy_' + Date.now(),
      text: String(fallbackComment).trim(),
      author: 'Historique',
      createdAt: ''
    });
  }
  return normalized;
}

function _renderActionCommentsThread() {
  const container = document.getElementById('action-modal-comments-thread');
  const hidden = document.getElementById('action-modal-comment');
  if (!container) return;
  if (hidden) hidden.value = _actionModalComments.length ? _actionModalComments[_actionModalComments.length - 1].text : '';
  container.innerHTML = _actionModalComments.length
    ? _actionModalComments.map(c => {
        const ts = c.createdAt ? new Date(c.createdAt) : null;
        const tsLabel = ts && !isNaN(ts.getTime())
          ? ts.toLocaleString('fr-FR', { day:'2-digit', month:'2-digit', year:'2-digit', hour:'2-digit', minute:'2-digit' })
          : 'Horodatage indisponible';
        return `<div style="border:1px solid #e2e8f0;border-radius:8px;padding:8px 10px;background:#fff;">
          <div style="display:flex;gap:8px;align-items:center;justify-content:space-between;margin-bottom:4px;flex-wrap:wrap;">
            <span style="font-size:11px;font-weight:700;color:#0f172a;">${escHtml(c.author)}</span>
            <span style="font-size:10px;color:#64748b;">${escHtml(tsLabel)}</span>
          </div>
          <div style="font-size:12px;color:#334155;white-space:pre-wrap;line-height:1.45;">${escHtml(c.text)}</div>
        </div>`;
      }).join('')
    : '<div style="font-size:11px;color:#94a3b8;">Aucun commentaire validé pour cette action.</div>';
}

function addActionCommentFromModal() {
  const input = document.getElementById('action-modal-comment-input');
  if (!input) return;
  const text = String(input.value || '').trim();
  if (!text) return;
  _actionModalComments.push({
    id: 'c_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
    text,
    author: _getActionCommentAuthor(),
    createdAt: new Date().toISOString()
  });
  input.value = '';
  _renderActionCommentsThread();
}

// ── Owner quick-pick chips (participants / CP) ────────────────────────────────
// Renders clickable owner chips into a container so existing owners can be
// picked without typing. addFnName = JS function name called with the owner name.
// hiddenInputId (optional) = id of the hidden input holding current selections
//   → already-selected owners get a ✓ and are dimmed
function _renderOwnerQuickPick(containerId, addFnName, hiddenInputId) {
  const el = document.getElementById(containerId);
  if (!el) return;
  const owners = getOwnerRecords().filter(o => !o._placeholder);
  if (owners.length === 0) {
    el.innerHTML = '<span style="font-size:10px;color:#94a3b8;">Aucun responsable dans le référentiel.</span>';
    return;
  }
  const hiddenEl = hiddenInputId ? document.getElementById(hiddenInputId) : null;
  const selected = hiddenEl ? new Set(_normalizeActionMultiValueInput(hiddenEl.value || '', /[,;\n]/).map(s => s.toLowerCase())) : new Set();
  el.innerHTML = owners.map(o => {
    const sideColor = o.side === 'BOA' ? '#1565C0' : o.side === 'CBS' ? '#7c3aed' : '#475569';
    const sideBg    = o.side === 'BOA' ? '#dbeafe' : o.side === 'CBS' ? '#ede9fe' : '#f1f5f9';
    const already   = selected.has(o.name.toLowerCase());
    return `<button type="button"
      onclick="${addFnName}('${String(o.name).replace(/'/g,"\\'")}')"
      title="${escAttr(o.name + (o.domain ? ' · ' + o.domain : '') + (o.email ? ' · ' + o.email : ''))}"
      style="display:inline-flex;align-items:center;gap:4px;background:${already ? '#dcfce7' : sideBg};color:${already ? '#15803d' : sideColor};border:1px solid ${already ? '#86efac' : sideBg};border-radius:999px;padding:3px 9px;font-size:10px;font-weight:600;cursor:pointer;white-space:nowrap;opacity:${already ? '.7' : '1'};">
      ${already ? '✓ ' : ''}${escHtml(o.name)}${o.domain ? `<span style="font-weight:400;opacity:.7;"> · ${escHtml(o.domain)}</span>` : ''}
    </button>`;
  }).join('');
}

// Called when clicking a quick-pick chip for gantt participant
function _ganttQuickPick(name) {
  const current = _normalizeActionMultiValueInput(document.getElementById('new-task-participants')?.value || '', /[,;\n]/);
  if (!current.includes(name)) {
    current.push(name);
    _setGanttParticipants(current);
  }
}
// Called when clicking a quick-pick chip for action participant
function _actionQuickPick(name) {
  const current = _normalizeActionMultiValueInput(document.getElementById('action-modal-participants')?.value || '', /[,;\n]/);
  if (!current.includes(name)) {
    current.push(name);
    _setActionParticipants(current);
  }
}

// ── Gantt task participants helpers ──────────────────────────────────────────
function _setGanttParticipants(names) {
  const normalized = [...new Set((Array.isArray(names) ? names : [])
    .map(v => String(v || '').trim())
    .filter(Boolean))];
  const hidden = document.getElementById('new-task-participants');
  const container = document.getElementById('new-task-participants-chips');
  if (hidden) hidden.value = normalized.join(', ');
  if (!container) return;
  container.innerHTML = normalized.length
    ? normalized.map(name => `<span style="display:inline-flex;align-items:center;gap:6px;background:#eef2ff;color:#3730a3;border:1px solid #c7d2fe;border-radius:999px;padding:4px 8px;font-size:11px;font-weight:700;">
        <span>${escHtml(name)}</span>
        <button type="button" onclick="removeGanttParticipant('${String(name).replace(/'/g, "\\'")}')" style="border:none;background:none;color:#6366f1;cursor:pointer;font-size:12px;line-height:1;padding:0;">✕</button>
      </span>`).join('')
    : '<span style="font-size:11px;color:#94a3b8;">Aucun participant ajouté.</span>';
  // Refresh quick-pick to show ✓ on already-selected owners
  _renderOwnerQuickPick('new-task-quickpick', '_ganttQuickPick', 'new-task-participants');
}

function addGanttParticipant() {
  const input = document.getElementById('new-task-participant-input');
  if (!input) return;
  const candidate = String(input.value || '').trim();
  if (!candidate) return;
  const current = _normalizeActionMultiValueInput(document.getElementById('new-task-participants')?.value || '', /[,;\n]/);
  current.push(candidate);
  _setGanttParticipants(current);
  input.value = '';
  input.focus();
}

function removeGanttParticipant(name) {
  const current = _normalizeActionMultiValueInput(document.getElementById('new-task-participants')?.value || '', /[,;\n]/);
  _setGanttParticipants(current.filter(v => v !== name));
}

function _setActionParticipants(names) {
  const normalized = [...new Set((Array.isArray(names) ? names : [])
    .map(v => String(v || '').trim())
    .filter(Boolean))];
  const hidden = document.getElementById('action-modal-participants');
  const container = document.getElementById('action-modal-participants-chips');
  if (hidden) hidden.value = normalized.join(', ');
  if (!container) return;
  container.innerHTML = normalized.length
    ? normalized.map(name => `<span style="display:inline-flex;align-items:center;gap:6px;background:#eef2ff;color:#3730a3;border:1px solid #c7d2fe;border-radius:999px;padding:4px 8px;font-size:11px;font-weight:700;">
        <span>${escHtml(name)}</span>
        <button type="button" onclick="removeActionParticipant('${String(name).replace(/'/g, "\\'")}')" style="border:none;background:none;color:#6366f1;cursor:pointer;font-size:12px;line-height:1;padding:0;">✕</button>
      </span>`).join('')
    : '<span style="font-size:11px;color:#94a3b8;">Aucun autre intervenant sélectionné.</span>';
  // Refresh quick-pick to show ✓ on already-selected owners
  _renderOwnerQuickPick('action-quickpick', '_actionQuickPick', 'action-modal-participants');
}

function addActionParticipant() {
  const input = document.getElementById('action-modal-participant-input');
  if (!input) return;
  const candidate = String(input.value || '').trim();
  if (!candidate) return;
  const current = _normalizeActionMultiValueInput(document.getElementById('action-modal-participants')?.value || '', /[,;\n]/);
  current.push(candidate);
  _setActionParticipants(current);
  input.value = '';
  input.focus();
}

function removeActionParticipant(name) {
  const current = _normalizeActionMultiValueInput(document.getElementById('action-modal-participants')?.value || '', /[,;\n]/);
  _setActionParticipants(current.filter(v => v !== name));
}

function filterActionDeps() {
  _renderActDepsSearchable(document.getElementById('action-modal-deps')?.value || '');
}

function _actionMatchesPeriodFilter(action, allActions, period) {
  const p = String(period || '').trim();
  if (!p) return true;
  const range = _actionDateRange(action, allActions);
  const endStr = range.end || '';
  if (p === 'no_date') return !endStr;
  if (!endStr) return false;
  const end = new Date(endStr + 'T00:00:00');
  if (Number.isNaN(end.getTime())) return false;
  const today = new Date();
  today.setHours(0,0,0,0);
  const weekEnd = new Date(today);
  weekEnd.setDate(weekEnd.getDate() + (6 - ((weekEnd.getDay() + 6) % 7)));
  const inSameMonth = end.getFullYear() === today.getFullYear() && end.getMonth() === today.getMonth();
  // Utiliser _isActionOverdue pour respecter le statut et le % avancement
  if (p === 'overdue') return _isActionOverdue(action, allActions);
  if (p === 'today') return end.getTime() === today.getTime();
  if (p === 'this_week') return end >= today && end <= weekEnd;
  if (p === 'next_7_days') {
    const next7 = new Date(today);
    next7.setDate(next7.getDate() + 7);
    return end >= today && end <= next7;
  }
  if (p === 'this_month') return inSameMonth;
  return true;
}

function _syncActionPeriodSegment() {
  const current = (document.getElementById('act-filter-period') || {}).value || '';
  ['','overdue','today','this_week','next_7_days','this_month','no_date'].forEach(v => {
    const btn = document.getElementById('act-period-btn-' + (v || 'all'));
    if (!btn) return;
    const active = v === current;
    btn.style.background = active ? '#1565C0' : 'transparent';
    btn.style.color = active ? '#fff' : '#475569';
  });
}

function setActionPeriodFilter(period) {
  const el = document.getElementById('act-filter-period');
  if (!el) return;
  el.value = period || '';
  _syncActionPeriodSegment();
  renderActions();
}

function renderKanbanActions() {
  // Map new statuses to kanban columns
  const _statusColMap = { todo:'todo', in_progress:'in_progress', blocked:'blocked', done:'done', cancelled:'cancelled' };
  const cols = [
    { id: 'todo',        title: '⬜ À faire',  color: '#64748b', cards: [] },
    { id: 'in_progress', title: '🔵 En cours', color: '#1565C0', cards: [] },
    { id: 'blocked',     title: '🔴 Bloqué',   color: '#b91c1c', cards: [] },
    { id: 'done',        title: '✅ Terminé',  color: '#15803d', cards: [] },
    { id: 'cancelled',   title: '⛔ Annulé',   color: '#9ca3af', cards: [] },
  ];
  const fCat    = (document.getElementById('act-filter-cat')    || {}).value || '';
  const fDomain = (document.getElementById('act-filter-domain') || {}).value || '';
  const fResp   = (document.getElementById('act-filter-resp')   || {}).value || '';
  const fStatus = (document.getElementById('act-filter-status') || {}).value || '';
  const fSide   = (document.getElementById('act-filter-side')   || {}).value || '';
  const periodF = (document.getElementById('act-filter-period') || {}).value || '';
  const dateFromF = (document.getElementById('act-filter-date-from') || {}).value || '';
  const dateToF   = (document.getElementById('act-filter-date-to')   || {}).value || '';

  const allActions = Array.isArray(state.customActions) ? state.customActions : [];
  allActions
  .slice()
  .sort((a, b) => {
    const ka = _actionSortKey(a, allActions);
    const kb = _actionSortKey(b, allActions);
    return ka[0] - kb[0] || ka[1].localeCompare(kb[1]) || ka[2].localeCompare(kb[2]);
  })
  .forEach(a => {
    const sv     = state.actions[a.id] || {};
    const cat    = a.category || 'metier';
    const status = sv.status || 'todo';
    const side   = a.side || sv.side || '';
    const participants = _actionParticipants(a);
    const docs = _actionDocuments(a);
    const comment = String(sv.commentaire || '').trim();
    if (fCat && cat !== fCat) return;
    if (fDomain) {
      const domainMatch = (a.domain || '') === fDomain;
      const inDomains = Array.isArray(a.domains) && a.domains.includes(fDomain);
      if (!domainMatch && !inDomains) return;
    }
    if (fResp && (a.resp || '') !== fResp) return;
    if (!_itemPassesDomainFilter(a)) return;
    if (fStatus && status   !== fStatus) return;
    if (fSide   && side     !== fSide)   return;
    const range = _actionDateRange(a, allActions);
    if (!_actionMatchesPeriodFilter(a, allActions, periodF)) return;
    if (dateFromF && (!range.start || range.start < dateFromF)) return;
    if (dateToF && (!range.end || range.end > dateToF)) return;
    const col = cols.find(c => c.id === status);
    if (!col) return;
    const st = _ACT_STATUS[status] || _ACT_STATUS.todo;
    const overdue = _isActionOverdue(a, allActions);
    const meta = [
      { text: a.domain || '—', bg: '#f0f4ff', color: '#1565C0', border: '#c5d8ff' },
      { text: a.resp   || '—', bg: '#f5f5f5', color: '#54565A', border: '#ddd' },
      { text: side || '—',     bg: side==='BOA'?'#dbeafe':side.startsWith('CBS')?'#ede9fe':'#f5f5f5',
                               color: side==='BOA'?'#1565C0':side.startsWith('CBS')?'#7c3aed':'#64748b', border: '#e2e8f0' },
    ];
    if (overdue) meta.unshift({ text: 'Retard', bg: '#fee2e2', color: '#b91c1c', border: '#fca5a5' });
    const displayRange = _actionDateRange(a, allActions);
    if (displayRange.end) meta.push({ text: 'Fin ' + displayRange.end, bg: overdue ? '#fff1f2' : '#fff', color: overdue ? '#b91c1c' : '#64748b', border: overdue ? '#fca5a5' : '#e5e7eb' });
    const pct = sv.pct;
    if (pct) meta.push({ text: pct+'%', bg: st.bg, color: st.color, border: st.border });
    if (participants.length) meta.push({ text: participants.length === 1 ? participants[0].substring(0,16) : '+' + participants.length + ' pers.', bg: '#ecfeff', color: '#0f766e', border: '#99f6e4', _title: participants.join(', ') });
    const deps = (a.dependsOn || []).map(depId => allActions.find(x => x.id === depId)).filter(Boolean);
    if (comment) meta.push({ text: 'Commentaire', bg: '#fef3c7', color: '#92400e', border: '#fcd34d' });
    if (deps.length) meta.push({ text: 'Deps ' + deps.length, bg: '#f8fafc', color: '#334155', border: '#cbd5e1' });
    if (docs.length) meta.push({ text: 'Docs ' + docs.length, bg: '#eef2ff', color: '#4338ca', border: '#c7d2fe' });
    const depPreview  = deps.length ? escHtml(((deps[0].id || '') + ' — ' + (deps[0].action || '')).slice(0, 80)) : '';
    const docPreview  = docs.length ? escHtml(String(docs[0] || '').slice(0, 80)) : '';
    const partPreview = participants.length ? escHtml(participants[0].substring(0, 30)) : '';
    const depHtml = deps.length
      ? '<details class="kanban-inline-section" onclick="event.stopPropagation()">'
          + '<summary class="kanban-inline-summary" onclick="event.stopPropagation()">'
            + '<span class="kanban-inline-title">Dépendances</span>'
            + '<span class="kanban-inline-count">' + deps.length + '</span>'
          + '</summary>'
          + '<div class="kanban-inline-preview">' + depPreview + (deps.length > 1 ? ' +' + (deps.length - 1) : '') + '</div>'
          + '<div class="kanban-inline-list">'
            + deps.map(d => '<div class="kanban-inline-item">• ' + escHtml((d.id || '') + ' — ' + (d.action || '')) + '</div>').join('')
          + '</div>'
        + '</details>'
      : '';
    const partHtml = participants.length
      ? '<details class="kanban-inline-section" onclick="event.stopPropagation()">'
          + '<summary class="kanban-inline-summary" onclick="event.stopPropagation()">'
            + '<span class="kanban-inline-title">Participants</span>'
            + '<span class="kanban-inline-count">' + participants.length + '</span>'
          + '</summary>'
          + '<div class="kanban-inline-preview">' + partPreview + (participants.length > 1 ? ' +' + (participants.length - 1) : '') + '</div>'
          + '<div class="kanban-inline-list">'
            + participants.map(p => '<div class="kanban-inline-item">• ' + escHtml(p) + '</div>').join('')
          + '</div>'
        + '</details>'
      : '';
    const docHtml = docs.length
      ? '<details class="kanban-inline-section" onclick="event.stopPropagation()">'
          + '<summary class="kanban-inline-summary" onclick="event.stopPropagation()">'
            + '<span class="kanban-inline-title">Documents</span>'
            + '<span class="kanban-inline-count">' + docs.length + '</span>'
          + '</summary>'
          + '<div class="kanban-inline-preview" style="word-break:break-word;">' + docPreview + (docs.length > 1 ? ' +' + (docs.length - 1) : '') + '</div>'
          + '<div class="kanban-inline-list">'
            + docs.map(d => '<div class="kanban-inline-item" style="word-break:break-word;">• ' + escHtml(d) + '</div>').join('')
          + '</div>'
        + '</details>'
      : '';
    const extraSections = depHtml || partHtml || docHtml
      ? '<div class="kanban-inline-sections">' + partHtml + depHtml + docHtml + '</div>'
      : '';
    col.cards.push({ id: a.id, title: a.action.slice(0,90) + (a.action.length>90?'…':''), meta, extraHtml: extraSections });
  });
  _buildKanban('act-kanban-view', cols, 'actions');
}

// ── GAPs Kanban ───────────────────────────────────────────────────────────────
function renderKanbanGaps() {
  const cols = [
    { id: 'P1',  title: '🔴 P1 — Critique', color: '#E63329', cards: [] },
    { id: 'P2',  title: '🟠 P2 — Haute',    color: '#E8702A', cards: [] },
    { id: 'P2.1',title: '🟠 P2.1 — Haute',  color: '#E8702A', cards: [] },
    { id: 'P3',  title: '⚪ P3 — Standard', color: '#888',    cards: [] },
  ];
  const statColors = {
    'En attente':       { bg:'#F5F5F5',  color:'#888',    border:'#ccc' },
    'En analyse':       { bg:'#FEF3E2',  color:'#E8702A', border:'#E8702A' },
    'Validé V4 Standard':   { bg:'#E8F5ED',  color:'#2E7D52', border:'#2E7D52' },
    'Validé Spécifique':    { bg:'#EEF0F8',  color:'#3949AB', border:'#3949AB' },
    'Reporté Phase II':     { bg:'#FEF3E2',  color:'#E8702A', border:'#E8702A' },
    'Exclu périmètre':      { bg:'#FDEEEC',  color:'#E63329', border:'#E63329' },
  };
  const fDomain  = document.getElementById('gaps-filter-domain')?.value  || '';
  const fPrio    = document.getElementById('gaps-filter-prio')?.value    || '';
  const fSearch  = (document.getElementById('gaps-search')?.value || '').toLowerCase();

  gaps.forEach(g => {
    const sv     = state.gaps[g.ref] || {};
    const prio   = sv.prio || g.prio;
    const statut = sv.statut || g.statut || 'En attente';
    if (fDomain && g.domain !== fDomain) return;
    if (fPrio   && prio    !== fPrio)   return;
    if (fSearch && !g.desc.toLowerCase().includes(fSearch) && !g.ref.toLowerCase().includes(fSearch)) return;
    const col = cols.find(c => c.id === prio);
    if (!col) return;
    const sc  = statColors[statut] || statColors['En attente'];
    const meta = [
      { text: g.ref,    bg: '#f0f4ff', color: '#1565C0', border: '#c5d8ff' },
      { text: g.domain.split('&')[0].trim().slice(0,18), bg: '#f5f5f5', color: '#54565A', border: '#ddd' },
      { text: statut.slice(0,22),   bg: sc.bg, color: sc.color, border: sc.border },
    ];
    if (g.bm) meta.push({ text: g.bm, bg: '#e8f5e9', color: '#2E7D52', border: '#a5d6a7' });
    col.cards.push({ id: g.ref, title: g.desc.slice(0, 85) + (g.desc.length > 85 ? '…' : ''), meta });
  });
  // Merge P2 + P2.1 into one block for display
  const merged = [
    cols[0],
    { id: 'P2', title: '🟠 P2 / P2.1 — Haute', color: cols[1].color, cards: [...cols[1].cards, ...cols[2].cards] },
    cols[3],
  ];
  _buildKanban('gaps-kanban-view', merged, 'gaps');
}

// ── Risques Kanban ────────────────────────────────────────────────────────────
function renderKanbanRisques() {
  const cols = [
    { id: 'ouvert',    title: '🔴 Ouvert',      color: '#E63329', cards: [] },
    { id: 'en_cours',  title: '🟠 En cours',    color: '#E8702A', cards: [] },
    { id: 'surveille', title: '🟡 Surveillé',   color: '#F9A825', cards: [] },
    { id: 'clos',      title: '🟢 Clos / Acc.', color: '#2E7D52', cards: [] },
  ];
  const critColor = c => c >= 15 ? { bg:'#FDEEEC', color:'#E63329', border:'#E63329' }
    : c >= 8  ? { bg:'#FEF3E2', color:'#E8702A', border:'#E8702A' }
    : c >= 4  ? { bg:'#FFFDE7', color:'#F9A825', border:'#F9A825' }
    :            { bg:'#E8F5ED', color:'#2E7D52', border:'#2E7D52' };
  const critLabel = c => c >= 15 ? 'Critique' : c >= 8 ? 'Élevée' : c >= 4 ? 'Modérée' : 'Faible';

  (state.risks || []).forEach((r, i) => {
    const statut = r.statut || 'ouvert';
    const colId  = statut === 'accepte' ? 'clos' : statut;
    const col    = cols.find(c => c.id === colId);
    if (!col) return;
    const crit = (r.prob || 0) * (r.impact || 0);
    const cc   = critColor(crit);
    const meta = [
      { text: critLabel(crit) + ' (' + crit + ')', bg: cc.bg, color: cc.color, border: cc.border },
      { text: r.cat || '—', bg: '#f0f4ff', color: '#1565C0', border: '#c5d8ff' },
      { text: r.owner || '—', bg: '#f5f5f5', color: '#54565A', border: '#ddd' },
    ];
    if (r.prob || r.impact) meta.push({ text: 'P' + (r.prob||0) + ' × I' + (r.impact||0), bg:'#fff', color:'#888', border:'#eee' });
    col.cards.push({
      id: i,
      title: (r.desc || '—').slice(0, 90) + ((r.desc||'').length > 90 ? '…' : ''),
      meta,
    });
  });
  _buildKanban('risks-kanban-view', cols, 'risques');
}

// ════════════════════════════════════════════════════════════════════════
// ANALYSE — TABLEAUX CROISÉS DYNAMIQUES
// ════════════════════════════════════════════════════════════════════════

// ── Field definitions per source ─────────────────────────────────────────────
const TCD_SOURCES = {
  perimetre: {
    label: '🗂️ Périmètre Modules',
    dims: ['Domaine', 'Sous-module', 'Version cible', 'Impact Dév.', 'BM#1'],
    vals: ['Nombre'],
  },
  gaps: {
    label: '📋 GAPs',
    dims: ['Domaine', 'Priorité', 'Statut', 'Responsable'],
    vals: ['Nombre'],
  },
  arbitrages: {
    label: '⚖️ Arbitrages',
    dims: ['Domaine', 'Priorité', 'Décision', 'Responsable'],
    vals: ['Nombre'],
  },
  actions: {
    label: '✅ Actions',
    dims: ['Domaine', 'Responsable', 'Statut RAG'],
    vals: ['Nombre'],
  },
  risques: {
    label: '⚠️ Risques',
    dims: ['Catégorie', 'Statut', 'Niveau criticité'],
    vals: ['Nombre', 'Probabilité', 'Impact', 'Criticité (P×I)'],
  },
  interfaces: {
    label: '🔌 Interfaces Techniques',
    dims: ['Responsable', 'Statut analyse', 'Impact', 'Date cible'],
    vals: ['Nombre'],
  },
  archi: {
    label: '🏗️ Architecture & Environnements',
    dims: ['Environnement', 'Domaine'],
    vals: ['Nombre'],
  },
};

// ── Build row objects for a given source ─────────────────────────────────────
function _getTcdRows(source) {
  switch (source) {
    case 'perimetre':
      return DEFAULT_PERIMETER.map((_, i) => {
        const r = getPerimetreRow(i);
        return {
          'Domaine':       r.domaine  || '—',
          'Sous-module':   r.sousModule || '—',
          'Version cible': r.version  || '—',
          'Impact Dév.':   r.impactDev || '—',
          'BM#1':          r.bm1      || '—',
          'Nombre':        1,
        };
      });
    case 'gaps':
      return gaps.map(g => {
        const sv = state.gaps[g.ref] || {};
        return {
          'Domaine':      g.domain  || '—',
          'Priorité':     g.prio    || '—',
          'Statut':       sv.statut || g.statut || '—',
          'Responsable':  g.resp    || '—',
          'Nombre':       1,
        };
      });
    case 'arbitrages':
      return arbitrages.map(a => {
        const sv = state.arbitrages[a.id] || {};
        const decLabels = {}; _getArbDecisions().forEach(d => { decLabels[d.key] = d.label; });
        return {
          'Domaine':      a.domain || '—',
          'Priorité':     a.prio   || '—',
          'Décision':     decLabels[sv.decision] || 'En cours',
          'Responsable':  a.resp   || '—',
          'Nombre':       1,
        };
      });
    case 'actions':
      return actions.map(a => {
        const sv   = state.actions[a.id] || {};
        const ragL = { R:'🔴 En retard', O:'🟠 En cours', G:'🟢 Terminée', X:'⚪ Non démarré' };
        return {
          'Domaine':      a.domain || '—',
          'Responsable':  a.resp   || '—',
          'Statut RAG':   ragL[sv.rag] || '⚪ Non démarré',
          'Nombre':       1,
        };
      });
    case 'risques':
      return (state.risks || []).map(r => {
        const crit = (r.prob || 0) * (r.impact || 0);
        const niv  = crit >= 15 ? 'Critique' : crit >= 8 ? 'Élevée' : crit >= 4 ? 'Modérée' : 'Faible';
        return {
          'Catégorie':       r.cat    || '—',
          'Statut':          r.statut || '—',
          'Niveau criticité':niv,
          'Nombre':          1,
          'Probabilité':     r.prob   || 0,
          'Impact':          r.impact || 0,
          'Criticité (P×I)': crit,
        };
      });
    case 'interfaces': {
      const statusLabels = { done:'Terminé', partial:'Partiel', pending_boa:'Pending BOA', pending_cbs:'Pending CBS' };
      const impactLabels = { no_impact:'No Impact', minor:'1 Impact', multiple:'Multiple Impacts', tbd:'TBD' };
      const ifaces = (state.technique && state.technique.interfaces) ? state.technique.interfaces : getTechInterfaces();
      return ifaces.map(i => ({
        'Responsable':    i.owner    || '—',
        'Statut analyse': statusLabels[i.status] || i.status || '—',
        'Impact':         impactLabels[i.impact] || i.impact || '—',
        'Date cible':     i.deadline ? i.deadline.slice(0, 7) : '—',
        'Nombre':         1,
      }));
    }
    case 'archi': {
      const domainLabels = { infra:'Infrastructure', data:'Data / Migration', secu:'Sécurité', reseau:'Réseau', autre:'Autre' };
      const envLabels    = { all:'Transverse', DEV:'DEV', REC:'REC', UAT:'UAT', PROD:'PROD', TRANSVERSE:'Transverse' };
      const archis = (state.technique && state.technique.archi) ? state.technique.archi : [];
      return archis.map(a => ({
        'Environnement': envLabels[a.env] || a.env || '—',
        'Domaine':       domainLabels[a.domain] || a.domain || '—',
        'Nombre':        1,
      }));
    }
    default:
      return [];
  }
}

// ── Core pivot computation ────────────────────────────────────────────────────
function _computePivot(rows, rowField, colField, valueField, aggFunc) {
  const useCol = colField && colField !== '(aucune)';

  // Sorted unique values
  const rowVals = [...new Set(rows.map(r => String(r[rowField] ?? '—')))].sort();
  const colVals = useCol
    ? [...new Set(rows.map(r => String(r[colField] ?? '—')))].sort()
    : ['Total'];

  // Accumulate raw arrays per (row, col)
  const matrix = {}; // matrix[rv][cv] = [numbers]
  rowVals.forEach(rv => { matrix[rv] = {}; colVals.forEach(cv => { matrix[rv][cv] = []; }); });

  rows.forEach(row => {
    const rv = String(row[rowField] ?? '—');
    const cv = useCol ? String(row[colField] ?? '—') : 'Total';
    if (matrix[rv] && matrix[rv][cv] !== undefined) {
      matrix[rv][cv].push(Number(row[valueField] ?? 1));
    }
  });

  // Aggregation
  const agg = arr => {
    if (!arr || !arr.length) return 0;
    switch (aggFunc) {
      case 'sum':  return arr.reduce((a, b) => a + b, 0);
      case 'avg':  return Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 10) / 10;
      default:     return arr.length; // count (+ pct variants use count then compute %)
    }
  };

  // Build numeric result matrix + totals
  const result = {};
  const colTotals = {};
  let grandTotal = 0;
  colVals.forEach(cv => { colTotals[cv] = 0; });

  rowVals.forEach(rv => {
    result[rv] = {};
    let rowTotal = 0;
    colVals.forEach(cv => {
      const v = agg(matrix[rv][cv]);
      result[rv][cv] = v;
      colTotals[cv] += v;
      rowTotal += v;
    });
    result[rv]['__rowTotal__'] = rowTotal;
    grandTotal += rowTotal;
  });
  colTotals['__grandTotal__'] = grandTotal;

  // Apply percentage if needed
  if (aggFunc === 'pct_total') {
    rowVals.forEach(rv => {
      colVals.forEach(cv => { result[rv][cv] = grandTotal ? Math.round(result[rv][cv] / grandTotal * 1000) / 10 : 0; });
      result[rv]['__rowTotal__'] = grandTotal ? Math.round(result[rv]['__rowTotal__'] / grandTotal * 1000) / 10 : 0;
    });
    colVals.forEach(cv => { colTotals[cv] = grandTotal ? Math.round(colTotals[cv] / grandTotal * 1000) / 10 : 0; });
    colTotals['__grandTotal__'] = 100;
  } else if (aggFunc === 'pct_row') {
    rowVals.forEach(rv => {
      const rt = result[rv]['__rowTotal__'];
      colVals.forEach(cv => { result[rv][cv] = rt ? Math.round(result[rv][cv] / rt * 1000) / 10 : 0; });
      result[rv]['__rowTotal__'] = 100;
    });
    colVals.forEach(cv => { colTotals[cv] = grandTotal ? Math.round(colTotals[cv] / grandTotal * 1000) / 10 : 0; });
    colTotals['__grandTotal__'] = 100;
  } else if (aggFunc === 'pct_col') {
    rowVals.forEach(rv => {
      colVals.forEach(cv => {
        const ct = colTotals[cv];
        result[rv][cv] = ct ? Math.round(result[rv][cv] / ct * 1000) / 10 : 0;
      });
      result[rv]['__rowTotal__'] = grandTotal ? Math.round(result[rv]['__rowTotal__'] / grandTotal * 1000) / 10 : 0;
    });
    colVals.forEach(cv => { colTotals[cv] = 100; });
    colTotals['__grandTotal__'] = 100;
  }

  return { rowVals, colVals, result, colTotals, grandTotal, isPct: aggFunc.startsWith('pct') };
}

// ── Update selectors when source changes ──────────────────────────────────────
function onTcdSourceChange() {
  const src = document.getElementById('tcd-source').value;
  const cfg = TCD_SOURCES[src];
  if (!cfg) return;

  const rowSel   = document.getElementById('tcd-row');
  const colSel   = document.getElementById('tcd-col');
  const valSel   = document.getElementById('tcd-value');

  rowSel.innerHTML = cfg.dims.map(d => `<option value="${d}">${d}</option>`).join('');
  colSel.innerHTML = '<option value="(aucune)">(aucune)</option>' +
    cfg.dims.map(d => `<option value="${d}">${d}</option>`).join('');
  valSel.innerHTML = cfg.vals.map(v => `<option value="${v}">${v}</option>`).join('');

  // Sensible defaults per source
  const defaults = {
    perimetre:  { row: 'Domaine',    col: 'Impact Dév.', val: 'Nombre' },
    gaps:       { row: 'Domaine',    col: 'Priorité',    val: 'Nombre' },
    arbitrages: { row: 'Domaine',    col: 'Décision',    val: 'Nombre' },
    actions:    { row: 'Domaine',    col: 'Statut RAG',  val: 'Nombre' },
    risques:    { row: 'Catégorie',  col: 'Niveau criticité', val: 'Nombre' },
  };
  const def = defaults[src] || {};
  if (def.row) rowSel.value = def.row;
  if (def.col) colSel.value = def.col;
  if (def.val) valSel.value = def.val;
}

// ── Apply a preset configuration ──────────────────────────────────────────────
function applyTcdPreset(source, rowF, colF, valF, aggF) {
  const srcSel = document.getElementById('tcd-source');
  if (srcSel) { srcSel.value = source; onTcdSourceChange(); }
  const rowSel = document.getElementById('tcd-row');
  const colSel = document.getElementById('tcd-col');
  const valSel = document.getElementById('tcd-value');
  const aggSel = document.getElementById('tcd-agg');
  if (rowSel) rowSel.value = rowF;
  if (colSel) colSel.value = colF;
  if (valSel) valSel.value = valF;
  if (aggSel) aggSel.value = aggF;
  renderPivotTable();
}

// ── TCD Chart instances (pour destroy avant re-render) ────────────────────────
let _tcdChartPie = null;
let _tcdChartBar = null;

// ── Palette CBS pour les charts ───────────────────────────────────────────────
const _tcdPalette = [
  '#E63329','#1565C0','#2E7D52','#E8702A','#6B21A8','#0891B2',
  '#D97706','#15803D','#B91C1C','#1D4ED8','#047857','#7C3AED',
  '#C2410C','#0369A1','#166534','#9333EA','#EA580C','#0284C7'
];

// ── Sauvegarder le TCD courant ────────────────────────────────────────────────
function saveTcd() {
  const source   = document.getElementById('tcd-source')?.value;
  const rowField = document.getElementById('tcd-row')?.value;
  const colField = document.getElementById('tcd-col')?.value;
  const valField = document.getElementById('tcd-value')?.value;
  const aggFunc  = document.getElementById('tcd-agg')?.value;
  if (!source || !rowField) { alert('Configurez et générez d\'abord un TCD avant de sauvegarder.'); return; }

  const srcLabels = { perimetre:'Périmètre', gaps:'GAPs', arbitrages:'Arbitrages', actions:'Actions', risques:'Risques' };
  const defaultName = (srcLabels[source] || source) + ' — ' + rowField + (colField && colField !== '(aucune)' ? ' × ' + colField : '');
  const name = prompt('Nom de ce TCD :', defaultName);
  if (name === null) return;

  state.savedTcds = state.savedTcds || [];
  state.savedTcds.push({ name: name.trim() || defaultName, source, rowField, colField, valField, aggFunc, savedAt: new Date().toISOString() });
  saveState();
  renderSavedTcds();
}

// ── Afficher la liste des TCDs sauvegardés ────────────────────────────────────
function renderSavedTcds() {
  const panel = document.getElementById('tcd-saved-panel');
  const list  = document.getElementById('tcd-saved-list');
  if (!panel || !list) return;
  const saved = state.savedTcds || [];
  if (saved.length === 0) { panel.style.display = 'none'; return; }
  panel.style.display = '';
  list.innerHTML = saved.map((t, i) => `
    <div style="display:inline-flex;align-items:center;gap:4px;background:#EEF2F7;border:1px solid #90b3f7;border-radius:20px;padding:4px 10px 4px 12px;font-size:11px;font-weight:600;color:#1565C0;cursor:pointer;"
         onclick="applySavedTcd(${i})" title="Charger : ${escHtml(t.name)}">
      📌 ${escHtml(t.name)}
      <button onclick="event.stopPropagation();deleteSavedTcd(${i})"
        style="background:none;border:none;cursor:pointer;color:#E63329;font-size:13px;line-height:1;padding:0 0 0 4px;"
        title="Supprimer">✕</button>
    </div>`).join('');
}

// ── Charger un TCD sauvegardé ─────────────────────────────────────────────────
function applySavedTcd(idx) {
  const t = (state.savedTcds || [])[idx];
  if (!t) return;
  const srcSel = document.getElementById('tcd-source');
  if (srcSel) { srcSel.value = t.source; onTcdSourceChange(); }
  setTimeout(() => {
    const rowSel = document.getElementById('tcd-row');
    const colSel = document.getElementById('tcd-col');
    const valSel = document.getElementById('tcd-value');
    const aggSel = document.getElementById('tcd-agg');
    if (rowSel) rowSel.value = t.rowField;
    if (colSel) colSel.value = t.colField;
    if (valSel) valSel.value = t.valField;
    if (aggSel) aggSel.value = t.aggFunc;
    renderPivotTable();
  }, 50);
}

// ── Supprimer un TCD sauvegardé ───────────────────────────────────────────────
function deleteSavedTcd(idx) {
  if (!confirm('Supprimer ce TCD sauvegardé ?')) return;
  state.savedTcds = (state.savedTcds || []).filter((_, i) => i !== idx);
  saveState();
  renderSavedTcds();
}

// ── Render charts après le pivot ──────────────────────────────────────────────
function _renderTcdCharts(rowVals, colVals, result, rowField, colField) {
  const zone = document.getElementById('tcd-charts-zone');
  if (!zone) return;

  // Données pour camembert : total par ligne
  const pieLabels = rowVals;
  const pieData   = rowVals.map(rv => result[rv]['__rowTotal__'] || 0);
  const total     = pieData.reduce((s, v) => s + v, 0);
  if (total === 0) { zone.style.display = 'none'; return; }
  zone.style.display = '';

  // Destroy anciens charts
  if (_tcdChartPie) { _tcdChartPie.destroy(); _tcdChartPie = null; }
  if (_tcdChartBar) { _tcdChartBar.destroy(); _tcdChartBar = null; }

  // Camembert
  const ctxPie = document.getElementById('tcd-chart-pie');
  if (ctxPie) {
    _tcdChartPie = new Chart(ctxPie, {
      type: 'doughnut',
      data: {
        labels: pieLabels,
        datasets: [{ data: pieData, backgroundColor: _tcdPalette.slice(0, pieLabels.length), borderWidth: 2, borderColor: '#fff' }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { position: 'right', labels: { font: { size: 10 }, boxWidth: 12, padding: 8 } },
          tooltip: { callbacks: { label: ctx => ' ' + ctx.label + ' : ' + ctx.parsed + ' (' + Math.round(ctx.parsed / total * 100) + '%)' } }
        }
      }
    });
  }

  // Barres : si une colonne est définie, barres groupées, sinon barres simples
  const ctxBar = document.getElementById('tcd-chart-bar');
  if (ctxBar) {
    let barDatasets;
    if (colField && colField !== '(aucune)' && colVals.length > 1) {
      // Barres groupées par colonne
      barDatasets = colVals.map((cv, ci) => ({
        label: cv,
        data: rowVals.map(rv => result[rv][cv] || 0),
        backgroundColor: _tcdPalette[ci % _tcdPalette.length] + 'CC',
        borderColor:     _tcdPalette[ci % _tcdPalette.length],
        borderWidth: 1, borderRadius: 4
      }));
    } else {
      barDatasets = [{
        label: rowField,
        data: pieData,
        backgroundColor: rowVals.map((_, i) => _tcdPalette[i % _tcdPalette.length] + 'CC'),
        borderColor:     rowVals.map((_, i) => _tcdPalette[i % _tcdPalette.length]),
        borderWidth: 1, borderRadius: 4
      }];
    }
    _tcdChartBar = new Chart(ctxBar, {
      type: 'bar',
      data: { labels: rowVals, datasets: barDatasets },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { display: barDatasets.length > 1, labels: { font: { size: 10 }, boxWidth: 12 } }
        },
        scales: {
          x: { ticks: { font: { size: 9 }, maxRotation: 40 }, grid: { display: false } },
          y: { beginAtZero: true, ticks: { font: { size: 10 } }, grid: { color: '#f0f0f0' } }
        }
      }
    });
  }
}

// ── Render the pivot table ────────────────────────────────────────────────────
function renderPivotTable() {
  const source   = (document.getElementById('tcd-source')?.value) || 'gaps';
  const rowField = (document.getElementById('tcd-row')?.value)    || 'Domaine';
  const colField = (document.getElementById('tcd-col')?.value)    || '(aucune)';
  const valField = (document.getElementById('tcd-value')?.value)  || 'Nombre';
  const aggFunc  = (document.getElementById('tcd-agg')?.value)    || 'count';

  const container = document.getElementById('tcd-result');
  const infoBar   = document.getElementById('tcd-info-bar');
  if (!container) return;

  const rows = _getTcdRows(source);
  if (rows.length === 0) {
    container.innerHTML = '<div style="text-align:center;padding:30px;color:#aaa;">Aucune donnée disponible pour cette source.</div>';
    return;
  }

  const { rowVals, colVals, result, colTotals, grandTotal, isPct } = _computePivot(rows, rowField, colField, valField, aggFunc);
  const fmt = v => isPct ? v + '%' : v;

  // Heat map thresholds
  const allVals = rowVals.flatMap(rv => colVals.map(cv => result[rv][cv]));
  const maxVal  = Math.max(...allVals, 1);
  const heatClass = v => {
    if (v === 0) return 'tcd-heat-0';
    const ratio = v / maxVal;
    if (ratio <= 0.1) return 'tcd-heat-1';
    if (ratio <= 0.2) return 'tcd-heat-2';
    if (ratio <= 0.35) return 'tcd-heat-3';
    if (ratio <= 0.5) return 'tcd-heat-4';
    if (ratio <= 0.65) return 'tcd-heat-5';
    if (ratio <= 0.8) return 'tcd-heat-6';
    return 'tcd-heat-7';
  };

  const srcLabel = (TCD_SOURCES[source] || {}).label || source;
  const colLabel = colField === '(aucune)' ? '' : colField;
  const aggLabels = { count:'Nombre', pct_total:'% total global', pct_row:'% total ligne', pct_col:'% total colonne', sum:'Somme', avg:'Moyenne' };

  // Build HTML
  let html = `<table class="tcd-table">`;

  // Header row
  html += `<tr>`;
  html += `<th class="tcd-th-row">${rowField}${colLabel ? ' \\ ' + colLabel : ''}</th>`;
  colVals.forEach(cv => { html += `<th>${escHtml(cv)}</th>`; });
  html += `<th class="tcd-th-total">Total</th>`;
  html += `</tr>`;

  // Data rows
  rowVals.forEach(rv => {
    html += `<tr>`;
    html += `<td class="tcd-row-header">${escHtml(rv)}</td>`;
    colVals.forEach(cv => {
      const v = result[rv][cv];
      html += `<td class="${heatClass(isPct ? (v / 100 * maxVal) : v)}">${fmt(v)}</td>`;
    });
    html += `<td class="tcd-total-col">${fmt(result[rv]['__rowTotal__'])}</td>`;
    html += `</tr>`;
  });

  // Total row
  html += `<tr>`;
  html += `<td class="tcd-total-row">Total</td>`;
  colVals.forEach(cv => { html += `<td class="tcd-total-row">${fmt(colTotals[cv])}</td>`; });
  html += `<td class="tcd-grand-total">${fmt(colTotals['__grandTotal__'])}</td>`;
  html += `</tr>`;

  html += `</table>`;
  container.innerHTML = html;

  // Info bar
  if (infoBar) {
    infoBar.style.display = '';
    infoBar.innerHTML = `<span style="color:#1565C0;font-weight:700;">${srcLabel}</span> &nbsp;·&nbsp; ` +
      `Ligne : <strong>${rowField}</strong> &nbsp;·&nbsp; ` +
      (colField !== '(aucune)' ? `Colonne : <strong>${colField}</strong> &nbsp;·&nbsp; ` : '') +
      `Valeur : <strong>${valField}</strong> &nbsp;·&nbsp; ` +
      `Agrégation : <strong>${aggLabels[aggFunc] || aggFunc}</strong> &nbsp;·&nbsp; ` +
      `<span style="color:#2E7D52;">${rows.length} enregistrement(s) analysé(s)</span>`;
  }

  // Store last pivot for CSV export
  window._lastTcdData = { rowVals, colVals, result, colTotals, rowField, colField, valField, aggFunc, isPct, fmt };

  // Render charts
  _renderTcdCharts(rowVals, colVals, result, rowField, colField);
}

// ── Export pivot to CSV ───────────────────────────────────────────────────────
function exportPivotCSV() {
  const d = window._lastTcdData;
  if (!d) { alert('Générez d\'abord un tableau croisé.'); return; }
  const { rowVals, colVals, result, colTotals, rowField, colField, fmt } = d;
  const lines = [];
  const sep = ';';

  // Header
  lines.push([rowField + (colField && colField !== '(aucune)' ? ' \\ ' + colField : ''),
    ...colVals, 'Total'].map(v => '"' + String(v).replace(/"/g, '""') + '"').join(sep));

  rowVals.forEach(rv => {
    lines.push([rv, ...colVals.map(cv => fmt(result[rv][cv])), fmt(result[rv]['__rowTotal__'])]
      .map(v => '"' + String(v).replace(/"/g, '""') + '"').join(sep));
  });
  lines.push(['Total', ...colVals.map(cv => fmt(colTotals[cv])), fmt(colTotals['__grandTotal__'])]
    .map(v => '"' + String(v).replace(/"/g, '""') + '"').join(sep));

  const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url;
  a.download = 'BOA_TCD_' + new Date().toISOString().slice(0, 10) + '.csv';
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ── Tab entry point ───────────────────────────────────────────────────────────
function renderAnalyse() {
  // Populate selectors on first open (or if not yet populated)
  const srcSel = document.getElementById('tcd-source');
  const rowSel = document.getElementById('tcd-row');
  if (!rowSel || !rowSel.options.length) {
    onTcdSourceChange();
  }
  // Afficher les TCDs sauvegardés
  renderSavedTcds();
}

// ─── RISQUES / ALERTES ────────────────────────────────────────────────────────
let _riskEditId = null;

function renderAutoAlerts() {
  const container = document.getElementById('auto-alerts-container');
  if (!container) return;
  const alerts = [];

  // ── Source de données selon le projet ─────────────────────────────────────
  const _cbsAA  = _projUsesCBS();
  const _aaArbs = _cbsAA ? [...arbitrages, ...(state.customArbitrages||[])] : (state.customArbitrages||[]);
  const _aaActs = _cbsAA ? [...actions,    ...(state.customActions||[])]    : (state.customActions||[]);
  const _aaGaps = _cbsAA ? [...gaps,       ...(state.customGaps||[])]       : (state.customGaps||[]);

  // Arbitrages P1 non décidés
  _aaArbs.filter(a => a.prio === 'P1').forEach(a => {
    const dec = (state.arbitrages[a.id] || {}).decision || _getArbDefaultKey();
    if (dec === _getArbDefaultKey()) alerts.push({
      level:'critique', icon:'🔴',
      source:'Arbitrage #' + a.id,
      text: a.label + ' — Arbitrage P1 non décidé (resp. ' + (a.resp||'?') + ')',
      domain: a.domain || '—',
    });
  });
  // Actions bloquées ou en retard (status = blocked, ou ancien RAG = R)
  _aaActs.forEach(a => {
    const sv = state.actions[a.id] || {};
    const isBlocked = sv.status === 'blocked' || sv.rag === 'R';
    if (isBlocked) alerts.push({
      level:'critique', icon:'🔴',
      source:'Action ' + a.id,
      text: (a.action||'').slice(0,80) + ((a.action||'').length>80?'…':'') + ' — ' + (sv.status==='blocked'?'Bloquée':'En retard') + ' (resp. ' + (a.resp||'?') + ')',
      domain: a.domain || '—',
    });
  });
  // GAPs P1 non résolus
  _aaGaps.filter(g => {
    const saved = state.gaps[g.ref] || {};
    const prio = saved.prio || g.prio;
    const statut = saved.statut || g.statut || '';
    const resolved = ['Couvert v4','Validé V4','Validé Spécifique','Adoption v4','Exclu périmètre','Couvert nativement'].some(k => statut.includes(k.split(' ')[0]));
    return prio === 'P1' && !resolved;
  }).slice(0, 8).forEach(g => {
    const saved = state.gaps[g.ref] || {};
    const statut = saved.statut || g.statut || '';
    alerts.push({
      level:'haute', icon:'🟠',
      source:'GAP ' + (g.ref||g.id||''),
      text: (g.desc||'').slice(0,90) + ((g.desc||'').length>90?'…':'') + ' — Statut: ' + statut,
      domain: g.domain || '—',
    });
  });
  // Actions sans statut défini (todo) avec urgence critique
  const critDomains = _aaActs.filter(a => {
    const sv = state.actions[a.id] || {};
    const status = sv.status || (sv.rag ? {R:'blocked',O:'in_progress',G:'done',X:'todo'}[sv.rag] : 'todo');
    return a.urgence === 'Critique' && (!status || status === 'todo');
  });
  critDomains.slice(0, 3).forEach(a => alerts.push({
    level:'attention', icon:'🟡',
    source:'Action ' + a.id,
    text: a.action.slice(0,80) + (a.action.length>80?'…':'') + ' — Urgence Critique, action non démarrée',
    domain: a.domain,
  }));

  // Update badge
  const badge = document.getElementById('tab-risk-badge');
  const _badgeVal = (alerts.length + (state.risks||[]).length) || '';
  if (badge) badge.textContent = _badgeVal;
  const _sbr = document.getElementById('sidebar-risk-badge'); if (_sbr) _sbr.textContent = _badgeVal;

  if (alerts.length === 0) {
    container.innerHTML = '<div style="color:#2E7D52;font-size:13px;padding:8px;">✅ Aucune alerte automatique détectée.</div>';
    return;
  }
  const colorMap = { critique:'#FDEEEC', haute:'#FEF3E2', attention:'#FFFDE7' };
  const borderMap = { critique:'#E63329', haute:'#E8702A', attention:'#F9A825' };
  container.innerHTML = alerts.map((a, i) => `
    <div style="display:flex;gap:10px;align-items:flex-start;padding:8px 12px;border-radius:5px;margin-bottom:6px;background:${colorMap[a.level]};border-left:4px solid ${borderMap[a.level]};">
      <span style="font-size:15px;flex-shrink:0;">${a.icon}</span>
      <div style="flex:1;min-width:0;">
        <div style="font-size:10px;font-weight:700;color:${borderMap[a.level]};margin-bottom:1px;">${a.source} · ${a.domain}</div>
        <div style="font-size:11px;color:#333;">${a.text}</div>
      </div>
    </div>`).join('');
}

function renderRisques() {
  renderAutoAlerts();
  const allRisks = state.risks || [];
  // Filtrer par stream si l'utilisateur a une restriction de stream
  const risks = allRisks.filter(r => _riskPassesStreamFilter(r));
  const tbody = document.getElementById('risks-tbody');
  const empty = document.getElementById('risks-empty');
  const countBadge = document.getElementById('risk-count-badge');
  if (!tbody) return;
  if (countBadge) countBadge.textContent = risks.length;
  if (risks.length === 0) {
    tbody.innerHTML = '';
    if (empty) empty.style.display = '';
    return;
  }
  if (empty) empty.style.display = 'none';
  const critColor = crit => crit >= 15 ? '#E63329' : crit >= 8 ? '#E8702A' : crit >= 4 ? '#F9A825' : '#2E7D52';
  const critLabel = crit => crit >= 15 ? 'Critique' : crit >= 8 ? 'Élevée' : crit >= 4 ? 'Modérée' : 'Faible';
  const statutHtml = {
    ouvert:     '<span style="color:#E63329;font-weight:700;">🔴 Ouvert</span>',
    en_cours:   '<span style="color:#E8702A;font-weight:700;">🟠 En cours</span>',
    surveille:  '<span style="color:#F9A825;font-weight:700;">🟡 Surveillé</span>',
    clos:       '<span style="color:#2E7D52;font-weight:700;">🟢 Clos</span>',
    accepte:    '<span style="color:#888;font-weight:700;">⚪ Accepté</span>',
  };
  // Helper: badges streams pour un risque
  const streamsOf = getAllStreams();
  const streamMap = Object.fromEntries(streamsOf.map(s => [s.id, s]));
  const streamBadges = r => {
    if (!r.streams || r.streams.length === 0) return '<span style="font-size:10px;color:#aaa;">—</span>';
    return r.streams.map(sid => {
      const s = streamMap[sid];
      return s ? `<span style="background:${s.color}22;color:${s.color};border:1px solid ${s.color}44;border-radius:10px;padding:1px 7px;font-size:10px;font-weight:600;margin-right:3px;white-space:nowrap;">${s.icon} ${_esc(s.name)}</span>` : '';
    }).join('');
  };
  // Utiliser l'index dans allRisks (pas risks filtré) pour les boutons edit/delete
  tbody.innerHTML = risks.map((r) => {
    const i = allRisks.indexOf(r);
    const crit = r.prob * r.impact;
    const cc = critColor(crit);
    const rowN = risks.indexOf(r);
    const bg = rowN % 2 === 0 ? '#ffffff' : '#fafafa';
    return `<tr style="background:${bg};">
      <td style="padding:7px 10px;border-bottom:1px solid #f0f0f0;font-weight:700;color:#54565A;">${rowN+1}</td>
      <td style="padding:7px 10px;border-bottom:1px solid #f0f0f0;font-size:11px;">${r.cat||'—'}</td>
      <td style="padding:7px 10px;border-bottom:1px solid #f0f0f0;font-size:11px;max-width:240px;">${r.desc||'—'}</td>
      <td style="padding:7px 10px;border-bottom:1px solid #f0f0f0;font-size:11px;">${streamBadges(r)}</td>
      <td style="padding:7px 10px;border-bottom:1px solid #f0f0f0;text-align:center;font-weight:700;">${r.prob||'—'}</td>
      <td style="padding:7px 10px;border-bottom:1px solid #f0f0f0;text-align:center;font-weight:700;">${r.impact||'—'}</td>
      <td style="padding:7px 10px;border-bottom:1px solid #f0f0f0;text-align:center;">
        <span style="background:${cc}20;color:${cc};border:1px solid ${cc};border-radius:4px;padding:2px 8px;font-weight:700;font-size:11px;">${crit} — ${critLabel(crit)}</span>
      </td>
      <td style="padding:7px 10px;border-bottom:1px solid #f0f0f0;font-size:11px;">${r.owner||'—'}</td>
      <td style="padding:7px 10px;border-bottom:1px solid #f0f0f0;text-align:center;">${statutHtml[r.statut]||r.statut||'—'}</td>
      <td style="padding:7px 10px;border-bottom:1px solid #f0f0f0;font-size:11px;max-width:180px;">${r.plan||'—'}</td>
      <td style="padding:7px 10px;border-bottom:1px solid #f0f0f0;text-align:center;white-space:nowrap;">
        <button onclick="openEditRisk(${i})" style="background:#e8f0fe;border:none;border-radius:3px;padding:3px 8px;cursor:pointer;font-size:11px;color:#1565C0;margin-right:4px;">✏️</button>
        <button onclick="deleteRisk(${i})" style="background:#FDEEEC;border:none;border-radius:3px;padding:3px 8px;cursor:pointer;font-size:11px;color:#E63329;">🗑️</button>
      </td>
    </tr>`;
  }).join('');
  // Update badge in tab
  const badge = document.getElementById('tab-risk-badge');
  if (badge) badge.textContent = (risks.length + document.querySelectorAll('#auto-alerts-container>div').length) || '';
}

// ── Helper: chips streams dans le modal risque ────────────────────────────────
function _renderRiskStreamChips(selectedIds) {
  // selectedIds = null → tous sélectionnés (transverse); [] → aucun; [id,...] → sélection
  const streams = getAllStreams();
  const container = document.getElementById('risk-streams-chips');
  if (!container) return;
  container.innerHTML = streams.map(s => {
    // null = tout coché (risque global/transverse), sinon vérifier l'ID
    const sel = selectedIds === null || (Array.isArray(selectedIds) && selectedIds.includes(s.id));
    return `<button type="button" class="risk-stream-chip${sel ? ' rsc-sel' : ''}" data-stream="${s.id}" data-color="${s.color}"
      onclick="_toggleRiskStreamChip(this)"
      style="padding:4px 11px;border-radius:20px;border:2px solid ${s.color};cursor:pointer;font-size:11px;font-weight:600;
             background:${sel ? s.color : 'white'};color:${sel ? 'white' : s.color};transition:all .15s;">
      ${s.icon} ${_esc(s.name)}</button>`;
  }).join('');
}
function _toggleRiskStreamChip(el) {
  const color = el.dataset.color;
  el.classList.toggle('rsc-sel');
  if (el.classList.contains('rsc-sel')) {
    el.style.background = color; el.style.color = 'white';
  } else {
    el.style.background = 'white'; el.style.color = color;
  }
}

function openAddRisk() {
  _riskEditId = null;
  document.getElementById('risk-modal-title').textContent = '⚠️ Nouveau Risque';
  document.getElementById('risk-desc').value = '';
  document.getElementById('risk-cat').value = 'Arbitrage non décidé';
  document.getElementById('risk-owner').value = '';
  document.getElementById('risk-prob').value = '3';
  document.getElementById('risk-impact').value = '3';
  document.getElementById('risk-statut').value = 'ouvert';
  document.getElementById('risk-plan').value = '';
  updateRiskCriticite();
  _renderRiskStreamChips(null); // null = tous cochés par défaut (risque transverse)
  document.getElementById('risk-modal').style.display = 'flex';
}
function openEditRisk(idx) {
  _riskEditId = idx;
  const r = (state.risks||[])[idx];
  if (!r) return;
  document.getElementById('risk-modal-title').textContent = '✏️ Modifier Risque';
  document.getElementById('risk-desc').value   = r.desc  || '';
  document.getElementById('risk-cat').value    = r.cat   || 'Autre';
  document.getElementById('risk-owner').value  = r.owner || '';
  document.getElementById('risk-prob').value   = r.prob  || 3;
  document.getElementById('risk-impact').value = r.impact|| 3;
  document.getElementById('risk-statut').value = r.statut|| 'ouvert';
  document.getElementById('risk-plan').value   = r.plan  || '';
  updateRiskCriticite();
  // streams: null = aucun défini = tout coché (transverse); sinon tableau d'IDs
  _renderRiskStreamChips(Array.isArray(r.streams) ? r.streams : null);
  document.getElementById('risk-modal').style.display = 'flex';
}
function closeRiskModal() {
  document.getElementById('risk-modal').style.display = 'none';
}
function updateRiskCriticite() {
  const p = parseInt(document.getElementById('risk-prob').value) || 3;
  const i = parseInt(document.getElementById('risk-impact').value) || 3;
  const crit = p * i;
  const cc = crit >= 15 ? '#E63329' : crit >= 8 ? '#E8702A' : crit >= 4 ? '#F9A825' : '#2E7D52';
  const cl = crit >= 15 ? 'Critique' : crit >= 8 ? 'Élevée' : crit >= 4 ? 'Modérée' : 'Faible';
  const el = document.getElementById('risk-crit-display');
  if (el) { el.textContent = crit + ' — ' + cl; el.style.color = cc; el.style.background = cc + '20'; el.style.borderColor = cc; }
}
// ════════════════════════════════════════════════════════════════════════
// PISTE D'AUDIT
// ════════════════════════════════════════════════════════════════════════

const _AUDIT_COLORS = {
  'créé':'#22c55e', 'créée':'#22c55e',
  'modifié':'#3b82f6', 'modifiée':'#3b82f6',
  'supprimé':'#ef4444', 'supprimée':'#ef4444',
  'ajouté':'#8b5cf6', 'ajoutée':'#8b5cf6',
  'Arbitrage':'#f59e0b', 'Décision':'#f59e0b',
};

function _auditBadgeColor(action) {
  for (const [k, v] of Object.entries(_AUDIT_COLORS)) {
    if (action.includes(k)) return v;
  }
  return '#6b7280';
}

function openAuditModal() {
  const modal = document.getElementById('audit-modal');
  if (!modal) return;
  modal.style.display = 'flex';
  if (document.getElementById('audit-filter-user'))   document.getElementById('audit-filter-user').value   = '';
  if (document.getElementById('audit-filter-action')) document.getElementById('audit-filter-action').value = '';
  renderAuditLog();
}

function closeAuditModal() {
  const modal = document.getElementById('audit-modal');
  if (modal) modal.style.display = 'none';
}

function renderAuditLog() {
  const tbody  = document.getElementById('audit-tbody');
  const footer = document.getElementById('audit-footer');
  if (!tbody) return;

  const log          = state.auditLog || [];
  const filterUser   = (document.getElementById('audit-filter-user')?.value   || '').toLowerCase().trim();
  const filterAction = (document.getElementById('audit-filter-action')?.value || '').trim();

  const filtered = log.filter(e => {
    if (filterUser   && !(e.user||'').toLowerCase().includes(filterUser))   return false;
    if (filterAction && !(e.action||'').includes(filterAction))             return false;
    return true;
  });

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:28px;color:#bbb;font-size:12px;">Aucune entrée dans la piste d'audit.</td></tr>`;
    if (footer) footer.textContent = log.length === 0 ? 'Aucune modification tracée pour l\'instant.' : 'Aucun résultat pour les filtres sélectionnés.';
    return;
  }

  tbody.innerHTML = filtered.map((e, i) => {
    const d       = new Date(e.ts);
    const dateStr = d.toLocaleDateString('fr-FR', { day:'2-digit', month:'2-digit', year:'numeric' });
    const timeStr = d.toLocaleTimeString('fr-FR', { hour:'2-digit', minute:'2-digit', second:'2-digit' });
    const color   = _auditBadgeColor(e.action || '');
    const rowBg   = i % 2 === 0 ? '#fff' : '#fafbff';
    return `<tr style="background:${rowBg};border-bottom:1px solid #f0f2f7;">
      <td style="padding:8px 12px;white-space:nowrap;color:#555;vertical-align:top;">${dateStr}<br><span style="font-size:10px;color:#aaa;">${timeStr}</span></td>
      <td style="padding:8px 12px;font-weight:600;color:#1a2640;vertical-align:top;">${escHtml(e.user||'—')}</td>
      <td style="padding:8px 12px;vertical-align:top;">
        <span style="background:#e8ecf4;color:#555;padding:1px 7px;border-radius:8px;font-size:10px;white-space:nowrap;">${escHtml(e.role||'—')}</span>
      </td>
      <td style="padding:8px 12px;vertical-align:top;white-space:nowrap;">
        <span style="background:${color}18;color:${color};padding:2px 8px;border-radius:10px;font-size:10px;font-weight:700;">${escHtml(e.action||'—')}</span>
      </td>
      <td style="padding:8px 12px;color:#444;max-width:320px;word-break:break-word;vertical-align:top;">${escHtml(e.detail||'')}</td>
    </tr>`;
  }).join('');

  if (footer) footer.textContent =
    `${filtered.length} entrée${filtered.length > 1 ? 's' : ''} affichée${filtered.length > 1 ? 's' : ''} sur ${log.length} au total · Historique limité aux 300 dernières modifications`;
}

function exportAuditCSV() {
  const log = state.auditLog || [];
  if (log.length === 0) { alert('Aucune entrée à exporter.'); return; }
  const headers = ['Date/Heure', 'Utilisateur', 'Rôle', 'Action', 'Détail'];
  const rows = log.map(e => [
    new Date(e.ts).toLocaleString('fr-FR'),
    e.user || '', e.role || '', e.action || '', e.detail || ''
  ].map(v => '"' + String(v).replace(/"/g, '""') + '"').join(';'));
  const csv  = '\uFEFF' + headers.join(';') + '\n' + rows.join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = 'audit_BOA_IGOR_' + new Date().toISOString().slice(0,10) + '.csv';
  a.click();
  URL.revokeObjectURL(url);
}

function saveRisk() {
  const desc = (document.getElementById('risk-desc').value||'').trim();
  if (!desc) { alert('Veuillez saisir une description.'); return; }
  // Streams sélectionnés (chip avec classe rsc-sel)
  const streamChips = [...document.querySelectorAll('.risk-stream-chip')];
  const allStreamChips = getAllStreams();
  const selStreams = streamChips.filter(el => el.classList.contains('rsc-sel')).map(el => el.dataset.stream);
  // null si tous cochés (transverse) pour économiser de l'espace
  const streams = (selStreams.length === allStreamChips.length) ? null : selStreams;
  const risk = {
    desc,
    cat:     document.getElementById('risk-cat').value,
    owner:   document.getElementById('risk-owner').value,
    prob:    parseInt(document.getElementById('risk-prob').value)||3,
    impact:  parseInt(document.getElementById('risk-impact').value)||3,
    statut:  document.getElementById('risk-statut').value,
    plan:    document.getElementById('risk-plan').value,
    streams: streams,
  };
  if (!state.risks) state.risks = [];
  if (_riskEditId !== null) state.risks[_riskEditId] = risk;
  else state.risks.push(risk);
  saveState(_riskEditId !== null ? 'Risque modifié' : 'Risque créé', desc.substring(0, 80));
  closeRiskModal();
  renderRisques();
  renderDashboard();
}
function deleteRisk(idx) {
  if (!canEdit()) return;
  if (!confirm('Supprimer ce risque ?')) return;
  const _delR = (state.risks||[])[idx];
  (state.risks||[]).splice(idx, 1);
  saveState('Risque supprimé', _delR ? _delR.desc.substring(0, 80) : '');
  renderRisques();
  renderDashboard();
}

// ═══════════════════════════════════════════════════════════════════════════════
// GENERIC DYNAMIC IMPORT ENGINE
// Usage: _openDynImport('risques') | 'actions' | 'arbitrages' | 'gaps'
// ═══════════════════════════════════════════════════════════════════════════════

const _DYN_IMPORT = {
  schema:null, schemaKey:'', rawRows:[], headers:[], mapping:{}, step:1,
  workbook:null,      // SheetJS workbook kept for multi-sheet Excel
  sheetNames:[],      // list of sheet names in the loaded workbook
  selectedSheet:'',   // currently selected sheet name
};

const _IMPORT_SCHEMAS = {
  risques: {
    title: '📥 Importer des Risques',
    fields: [
      { key:'desc',    label:'Description',          required:true,  type:'text', hint:'Libellé du risque' },
      { key:'cat',     label:'Catégorie',             required:false, type:'enum',
        options:['Arbitrage non décidé','Planning / Délai','Technique / Anomalie','Ressources humaines','Budget','Interface / Intégration','Migration données','Réglementaire / Conformité','Autre'],
        default:'Autre', hint:'Ex: Technique' },
      { key:'prob',    label:'Probabilité (1–5)',     required:false, type:'int',  min:1, max:5, default:3, hint:'1=Très faible … 5=Quasi-certain' },
      { key:'impact',  label:'Impact (1–5)',          required:false, type:'int',  min:1, max:5, default:3, hint:'1=Mineur … 5=Catastrophique' },
      { key:'owner',   label:'Owner / Responsable',  required:false, type:'text', hint:'Nom ou entité' },
      { key:'statut',  label:'Statut',               required:false, type:'enum',
        options:['ouvert','en_cours','surveille','clos','accepte'], default:'ouvert',
        hint:'ouvert / en_cours / surveille / clos / accepte' },
      { key:'plan',    label:"Plan d'atténuation",   required:false, type:'text', hint:'Actions de mitigation' },
    ],
    onImport(rows) {
      if (!state.risks) state.risks = [];
      rows.forEach(r => state.risks.push(Object.assign({}, r, { streams: [] })));
      _saveCurrentProjectData();
      saveState('Risques importés', rows.length + ' risque(s)');
    }
  },

  actions: {
    title: '📥 Importer des Actions',
    fields: [
      { key:'action',      label:'Libellé / Action',          required:true,  type:'text', hint:"Description de l'action" },
      { key:'domain',      label:'Domaine',                   required:false, type:'text', hint:'Ex: Core Banking, Interfaces' },
      { key:'resp',        label:'Responsable',               required:false, type:'text', hint:'Nom ou entité' },
      { key:'category',    label:'Catégorie',                 required:false, type:'enum',
        options:['Pilotage','Technique','Organisationnel','Contractuel','Autre'], default:'Autre', hint:'Ex: Technique' },
      { key:'side',        label:'Entité',                    required:false, type:'enum',
        options:['CBS','BOA CI','BOA Groupe','Mixte'], default:'CBS', hint:'CBS / BOA CI / BOA Groupe / Mixte' },
      { key:'urgence',     label:'Urgence',                   required:false, type:'enum',
        options:['Critique','Haute','Moyenne','Basse'], default:'Moyenne', hint:'Critique / Haute / Moyenne / Basse' },
      { key:'dateDebut',   label:'Date début (AAAA-MM-JJ)',   required:false, type:'date', hint:'Ex: 2025-06-01' },
      { key:'dateFin',     label:'Date fin (AAAA-MM-JJ)',     required:false, type:'date', hint:'Ex: 2025-12-31' },
      { key:'status',      label:'Statut',                    required:false, type:'enum',
        options:['todo','in_progress','done','blocked'], default:'todo', hint:'todo / in_progress / done / blocked' },
      { key:'commentaire', label:'Commentaire',               required:false, type:'text', hint:'Note libre' },
    ],
    onImport(rows) {
      if (!Array.isArray(state.customActions)) state.customActions = [];
      if (!state.actions) state.actions = {};
      rows.forEach(r => {
        const id = 'ACT-' + Date.now().toString(36).toUpperCase().slice(-5) + '-' + Math.random().toString(36).slice(2,5).toUpperCase();
        const status = r.status || 'todo';
        const dateDebut = r.dateDebut || ''; const dateFin = r.dateFin || '';
        const payload = Object.assign({}, r); delete payload.status; delete payload.dateDebut; delete payload.dateFin;
        const act = Object.assign({ id }, payload, { _custom:true, _dbProjectId: state.currentProjectId||'', _history:[] });
        _pushHistory(act, 'created');
        state.customActions.push(act);
        state.actions[id] = { status, dateDebut, dateFin, pct: status === 'done' ? 100 : 0 };
      });
      _saveCurrentProjectData();
      saveState('Actions importées', rows.length + ' action(s)');
    }
  },

  arbitrages: {
    title: '📥 Importer des Arbitrages',
    fields: [
      { key:'label',       label:'Libellé',               required:true,  type:'text', hint:"Titre de l'arbitrage" },
      { key:'source',      label:'Source de la demande',  required:false, type:'text', hint:'Ex: Réunion du 01/01, Document xyz' },
      { key:'domain',      label:'Domaine',               required:false, type:'text', hint:'Ex: Core Banking' },
      { key:'prio',        label:'Priorité',              required:false, type:'enum',
        options:['P1','P2','P3'], default:'P2', hint:'P1 / P2 / P3' },
      { key:'resp',        label:'Responsable',           required:false, type:'text', hint:'Nom ou entité' },
      { key:'deadline',    label:'Échéance',              required:false, type:'date', hint:'Ex: 2025-12-31' },
      { key:'decision',    label:'Décision',              required:false, type:'enum',
        options:['en_cours','approuve','rejete','reporte'], default:'en_cours',
        hint:'en_cours / approuve / rejete / reporte' },
      { key:'commentaire', label:'Commentaire',           required:false, type:'text', hint:'Note libre' },
    ],
    onImport(rows) {
      if (!state.customArbitrages) state.customArbitrages = [];
      if (!state.arbitrages) state.arbitrages = {};
      const newArbs = [];
      rows.forEach(r => {
        const id = 'arb_' + Date.now() + '_' + Math.random().toString(36).slice(2,5);
        const dec = r.decision || _getArbDefaultKey();
        const newArb = { id, label:r.label||'', source:r.source||'', domain:r.domain||'', prio:r.prio||'P2',
                         resp:r.resp||'', deadline:r.deadline||'', decision:dec,
                         commentaire:r.commentaire||'', _custom:true, _history:[] };
        _pushHistory(newArb, 'created');
        state.customArbitrages.push(newArb);
        state.arbitrages[id] = { source:r.source||'', domain:r.domain||'', prio:r.prio||'P2',
                                  resp:r.resp||'', deadline:r.deadline||'',
                                  decision:dec, commentaire:r.commentaire||'' };
        newArbs.push(newArb);
      });
      _saveCurrentProjectData();
      saveState('Arbitrages importés', rows.length + ' arbitrage(s)');
      // Persistance DB duale (comme l'ajout manuel) — fire-and-forget
      if (typeof DB !== 'undefined' && typeof DB.saveArbitrage === 'function') {
        newArbs.forEach(a => DB.saveArbitrage(a).catch(e => console.warn('[import arb] DB save:', e.message)));
      }
    }
  },

  gaps: {
    title: '📥 Importer des GAPs',
    fields: [
      { key:'desc',      label:'Description',          required:true,  type:'text', hint:'Description du GAP' },
      { key:'ref',       label:'Référence',            required:false, type:'text', hint:'Ex: GAP-CUSTOM-042 (auto si vide)' },
      { key:'domain',    label:'Domaine',              required:false, type:'text', hint:'Ex: Core Banking' },
      { key:'processus', label:'Processus',            required:false, type:'text', hint:'Processus métier concerné' },
      { key:'prio',      label:'Priorité',             required:false, type:'enum',
        options:['P1','P2','P3'], default:'P2', hint:'P1 / P2 / P3' },
      { key:'phase',     label:'Phase',                required:false, type:'enum',
        options:['I','II','III','IV'], default:'II', hint:'I / II / III / IV' },
      { key:'bm',        label:'Type BM',              required:false, type:'text', default:'BM UEMOA', hint:'Ex: BM UEMOA, Anomalie, Evolution' },
      { key:'resp',      label:'Responsable',          required:false, type:'text', hint:'Nom ou entité' },
    ],
    onImport(rows) {
      if (!state.customGaps) state.customGaps = [];
      if (!state.gaps) state.gaps = {};
      const newGaps = [];
      rows.forEach(r => {
        const n   = ((typeof gaps !== 'undefined' ? gaps : []).length) + state.customGaps.length + 1;
        const ref = r.ref || ('GAP-IMP-' + String(n).padStart(3,'0'));
        const newGap = { n, ref, domain:r.domain||'', processus:r.processus||'', desc:r.desc,
                         prio:r.prio||'P2', prio_cbs:r.prio||'P2', phase:r.phase||'II',
                         phase_cbs:r.phase||'II', bm:r.bm||'BM UEMOA', resp:r.resp||'',
                         _custom:true, _history:[] };
        _pushHistory(newGap, 'created');
        state.customGaps.push(newGap);
        newGaps.push(newGap);
      });
      _saveCurrentProjectData();
      saveState('GAPs importés', rows.length + ' GAP(s)');
      // Persistance DB duale — fire-and-forget
      if (typeof DB !== 'undefined' && typeof DB.saveGap === 'function') {
        newGaps.forEach(g => DB.saveGap(g).catch(e => console.warn('[import gap] DB save:', e.message)));
      }
    }
  },
};

// ── Open / Close ─────────────────────────────────────────────────────────────

function _openDynImport(schemaKey) {
  if (!canEdit()) { alert('Accès refusé.'); return; }
  const schema = _IMPORT_SCHEMAS[schemaKey];
  if (!schema) { console.error('Unknown import schema:', schemaKey); return; }
  Object.assign(_DYN_IMPORT, { schema, schemaKey, rawRows:[], headers:[], mapping:{}, step:1 });
  _dynImportRender();
  document.getElementById('dyn-import-modal').style.display = 'flex';
}

function _closeDynImport() {
  document.getElementById('dyn-import-modal').style.display = 'none';
  _DYN_IMPORT.schema = null;
}

// ── Render (step router) ─────────────────────────────────────────────────────

function _dynImportRender() {
  const inner = document.getElementById('dyn-import-inner');
  if (!inner || !_DYN_IMPORT.schema) return;
  const s = _DYN_IMPORT;

  // Step indicator
  const stepNames = ['Fichier', 'Mapping', 'Aperçu'];
  const stepBar = stepNames.map((name, i) => {
    const n      = i + 1;
    const active = s.step === n;
    const done   = s.step > n;
    const bg     = done ? '#22c55e' : active ? '#4f46e5' : '#e2e8f0';
    const col    = (done || active) ? 'white' : '#94a3b8';
    const sep    = i < 2 ? '<div style="flex:1;height:1px;background:#e2e8f0;min-width:16px;max-width:40px;"></div>' : '';
    return `<div style="display:flex;align-items:center;gap:6px;">
      <div style="width:22px;height:22px;border-radius:50%;background:${bg};color:${col};font-size:10px;font-weight:800;display:flex;align-items:center;justify-content:center;flex-shrink:0;">${done?'✓':n}</div>
      <span style="font-size:12px;font-weight:${active?700:500};color:${active?'#4f46e5':'#64748b'};">${name}</span>
    </div>${sep}`;
  }).join('');

  let body = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;">
      <h3 style="margin:0;font-size:16px;color:#1e293b;">${s.schema.title}</h3>
      <button onclick="_closeDynImport()" style="background:none;border:none;font-size:18px;cursor:pointer;color:#888;line-height:1;">✕</button>
    </div>
    <div style="display:flex;align-items:center;gap:4px;padding:10px 12px;background:#f8fafc;border-radius:8px;margin-bottom:18px;">${stepBar}</div>
  `;
  if (s.step === 1) body += _dynImportHtmlStep1();
  if (s.step === 2) body += _dynImportHtmlStep2();
  if (s.step === 3) body += _dynImportHtmlStep3();
  inner.innerHTML = body;
}

// ── Step 1 : File upload ─────────────────────────────────────────────────────

function _dynImportHtmlStep1() {
  const fields = _DYN_IMPORT.schema.fields;
  const chips  = fields.map(f =>
    `<span style="background:${f.required?'#e0e7ff':'#f1f5f9'};color:${f.required?'#3730a3':'#64748b'};border-radius:10px;padding:2px 9px;font-size:10px;font-weight:600;white-space:nowrap;">${f.required?'✱ ':''}${f.label}</span>`
  ).join('');
  return `
    <div style="background:#f0f4ff;border-radius:8px;padding:11px 13px;margin-bottom:14px;font-size:12px;color:#3730a3;line-height:1.7;">
      <b>Colonnes attendues :</b><br><div style="display:flex;flex-wrap:wrap;gap:5px;margin-top:6px;">${chips}</div>
    </div>
    <div style="margin-bottom:14px;">
      <button onclick="_dynImportDownloadTemplate()" class="btn btn-secondary btn-sm">📄 Télécharger le template CSV</button>
    </div>
    <div style="margin-bottom:12px;">
      <label style="font-size:12px;font-weight:600;color:#374151;display:block;margin-bottom:6px;">Fichier à importer (CSV ou Excel)</label>
      <input type="file" id="dyn-import-file" accept=".csv,.xlsx,.xls"
             style="width:100%;padding:10px;border:2px dashed #c7d2fe;border-radius:8px;font-size:13px;cursor:pointer;background:#f8faff;box-sizing:border-box;"
             onchange="_dynImportOnFileChange(this)">
    </div>
    <!-- Sheet picker — affiché uniquement si le fichier Excel contient plusieurs onglets -->
    <div id="dyn-import-s1-sheet-picker" style="display:none;margin-bottom:12px;"></div>
    <!-- Statut (succès / erreur) -->
    <div id="dyn-import-s1-msg" style="display:none;margin-bottom:12px;"></div>
    <div style="display:flex;justify-content:flex-end;gap:8px;">
      <button onclick="_closeDynImport()" class="btn btn-cancel">Annuler</button>
      <button id="dyn-import-btn-next1" onclick="_dynImportGoStep(2)" class="btn btn-primary" disabled style="opacity:.5;cursor:not-allowed;">Mapper les colonnes →</button>
    </div>`;
}

// ── Step 2 : Column mapping ──────────────────────────────────────────────────

function _dynImportHtmlStep2() {
  const s = _DYN_IMPORT;
  const rows = s.schema.fields.map(f => {
    const idx  = s.mapping[f.key] !== undefined ? s.mapping[f.key] : -1;
    const opts = [
      `<option value="-1"${idx<0?' selected':''}>${f.required ? '(requis — sélectionner)' : '— ignorer —'}</option>`,
      ...s.headers.map((h, i) => `<option value="${i}"${idx===i?' selected':''}>${h || '(Colonne '+(i+1)+')'}</option>`)
    ].join('');
    const mapped = idx >= 0;
    return `<tr style="border-bottom:1px solid #f1f5f9;">
      <td style="padding:8px 10px;font-size:12px;font-weight:600;color:#1e293b;white-space:nowrap;">
        ${_esc(f.label)}${f.required?'<span style="color:#ef4444;margin-left:3px;">✱</span>':''}
      </td>
      <td style="padding:8px 10px;font-size:11px;color:#94a3b8;max-width:110px;overflow:hidden;text-overflow:ellipsis;">${_esc(f.hint||'')}</td>
      <td style="padding:8px 10px;min-width:160px;">
        <select data-field="${f.key}" onchange="_dynImportUpdateMapping(this)"
          style="width:100%;padding:5px 8px;border:1.5px solid ${mapped?'#4f46e5':'#d1d5db'};border-radius:6px;font-size:12px;background:${mapped?'#eef2ff':'white'};color:${mapped?'#4f46e5':'#374151'};box-sizing:border-box;">
          ${opts}
        </select>
      </td>
    </tr>`;
  }).join('');

  const autoMapped = s.schema.fields.filter(f => (s.mapping[f.key]||0) >= 0).length;
  const sheetBadge = s.selectedSheet
    ? `<span style="background:#eef2ff;color:#4f46e5;border:1px solid #c7d2fe;border-radius:6px;padding:2px 8px;font-size:11px;font-weight:600;white-space:nowrap;">📑 ${_esc(s.selectedSheet)}</span>`
    : '';
  const changeSheetLink = (s.sheetNames && s.sheetNames.length > 1)
    ? `<button onclick="_dynImportGoStep(1)" style="background:none;border:none;color:#4f46e5;font-size:11px;cursor:pointer;text-decoration:underline;padding:0;">Changer d'onglet</button>`
    : '';
  return `
    <div style="display:flex;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:12px;padding:8px 12px;background:#f8fafc;border-radius:8px;border:1px solid #e2e8f0;">
      ${sheetBadge}
      <span style="font-size:12px;color:#64748b;"><b>${s.rawRows.length-1}</b> ligne(s) · <b>${s.headers.length}</b> colonne(s)</span>
      <span style="font-size:12px;color:#4f46e5;font-weight:600;">· ${autoMapped} champ(s) auto-mappé(s)</span>
      ${changeSheetLink ? '<span style="color:#e2e8f0;">|</span>' + changeSheetLink : ''}
    </div>
    <div style="overflow-y:auto;max-height:340px;border:1px solid #e2e8f0;border-radius:8px;margin-bottom:14px;">
      <table style="width:100%;border-collapse:collapse;">
        <thead style="position:sticky;top:0;background:#f8fafc;z-index:1;">
          <tr>
            <th style="padding:8px 10px;text-align:left;font-size:11px;color:#64748b;font-weight:700;border-bottom:1px solid #e2e8f0;white-space:nowrap;">Champ cible</th>
            <th style="padding:8px 10px;text-align:left;font-size:11px;color:#64748b;font-weight:700;border-bottom:1px solid #e2e8f0;">Indice / Format</th>
            <th style="padding:8px 10px;text-align:left;font-size:11px;color:#64748b;font-weight:700;border-bottom:1px solid #e2e8f0;">Colonne source</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    <div style="display:flex;justify-content:space-between;gap:8px;">
      <button onclick="_dynImportGoStep(1)" class="btn btn-secondary btn-sm">← Retour</button>
      <div style="display:flex;gap:8px;">
        <button onclick="_closeDynImport()" class="btn btn-cancel">Annuler</button>
        <button onclick="_dynImportCommitMappingAndPreview()" class="btn btn-primary">Aperçu & Confirmer →</button>
      </div>
    </div>`;
}

// ── Step 3 : Preview & confirm ───────────────────────────────────────────────

function _dynImportHtmlStep3() {
  const s = _DYN_IMPORT;
  const { valid, errors } = _dynImportParseRows();
  const existing = _dynImportGetCurrentCount(s.schemaKey);

  const thCells = s.schema.fields.map(f =>
    `<th style="padding:6px 8px;font-size:10px;font-weight:700;color:#64748b;background:#f8fafc;white-space:nowrap;border-bottom:1px solid #e2e8f0;">${_esc(f.label)}</th>`
  ).join('');
  const previewTbody = valid.slice(0, 5).map(r =>
    '<tr>' + s.schema.fields.map(f => {
      const v = r[f.key]; const vs = String(v == null ? '' : v);
      return `<td style="padding:5px 8px;font-size:11px;border-bottom:1px solid #f1f5f9;max-width:130px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${_esc(vs)}">${_esc(vs||'—')}</td>`;
    }).join('') + '</tr>'
  ).join('');

  const errBlock = errors.length
    ? `<div style="background:#fef2f2;border:1px solid #fca5a5;border-radius:6px;padding:10px 12px;margin-bottom:12px;font-size:11px;color:#991b1b;line-height:1.7;">
         ⚠️ <b>${errors.length}</b> ligne(s) ignorée(s) :<br>${errors.slice(0,5).map(e=>_esc(e)).join('<br>')}
         ${errors.length>5?`<br><span style="color:#64748b;">… et ${errors.length-5} autre(s)</span>`:''}
       </div>` : '';

  // Mode selector
  const modeBlock = `
    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:12px 14px;margin-bottom:14px;">
      <div style="font-size:12px;font-weight:700;color:#374151;margin-bottom:10px;">📂 Mode d'import</div>
      <label style="display:flex;align-items:flex-start;gap:10px;padding:8px 10px;border-radius:8px;cursor:pointer;margin-bottom:6px;border:1.5px solid #86efac;background:#f0fdf4;" id="dyn-mode-label-append">
        <input type="radio" name="dyn-import-mode" value="append" checked
               style="margin-top:1px;accent-color:#166534;width:15px;height:15px;flex-shrink:0;"
               onchange="_dynImportModeChange(this)">
        <div>
          <div style="font-size:12px;font-weight:700;color:#166534;">➕ Compléter</div>
          <div style="font-size:11px;color:#64748b;margin-top:1px;">
            Ajouter <b>${valid.length}</b> ligne(s) aux <b>${existing}</b> entrée(s) existantes
            → total : <b>${existing + valid.length}</b>
          </div>
        </div>
      </label>
      <label style="display:flex;align-items:flex-start;gap:10px;padding:8px 10px;border-radius:8px;cursor:pointer;border:1.5px solid #e2e8f0;background:white;" id="dyn-mode-label-replace"
             onmouseover="this.style.borderColor='#fca5a5'" onmouseout="if(!document.querySelector('[name=dyn-import-mode][value=replace]:checked'))this.style.borderColor='#e2e8f0'">
        <input type="radio" name="dyn-import-mode" value="replace"
               style="margin-top:1px;accent-color:#dc2626;width:15px;height:15px;flex-shrink:0;"
               onchange="_dynImportModeChange(this)">
        <div>
          <div style="font-size:12px;font-weight:700;color:#dc2626;">🔄 Remplacer</div>
          <div style="font-size:11px;color:#64748b;margin-top:1px;">
            Supprimer les <b>${existing}</b> entrée(s) existantes et importer uniquement ce fichier
            ${existing > 0 ? '<span style="color:#dc2626;font-weight:600;"> ⚠️ irréversible</span>' : ''}
          </div>
        </div>
      </label>
    </div>`;

  return `
    <div style="display:flex;gap:10px;margin-bottom:14px;">
      <div style="flex:1;background:#f0fdf4;border:1px solid #86efac;border-radius:8px;padding:10px 14px;text-align:center;">
        <div style="font-size:24px;font-weight:800;color:#166534;">${valid.length}</div>
        <div style="font-size:11px;color:#166534;font-weight:600;">Ligne(s) valides</div>
      </div>
      <div style="flex:1;background:#f0f4ff;border:1px solid #c7d2fe;border-radius:8px;padding:10px 14px;text-align:center;">
        <div style="font-size:24px;font-weight:800;color:#4f46e5;">${existing}</div>
        <div style="font-size:11px;color:#4f46e5;font-weight:600;">Entrée(s) existantes</div>
      </div>
      ${errors.length?`<div style="flex:1;background:#fef2f2;border:1px solid #fca5a5;border-radius:8px;padding:10px 14px;text-align:center;">
        <div style="font-size:24px;font-weight:800;color:#991b1b;">${errors.length}</div>
        <div style="font-size:11px;color:#991b1b;font-weight:600;">Ligne(s) ignorées</div>
      </div>`:''}
    </div>
    ${errBlock}
    ${modeBlock}
    ${valid.length > 0
      ? `<div style="font-size:11px;color:#64748b;margin-bottom:6px;font-weight:600;">Aperçu des ${Math.min(5,valid.length)} première(s) ligne(s) :</div>
         <div style="overflow:auto;max-height:200px;border:1px solid #e2e8f0;border-radius:8px;margin-bottom:14px;">
           <table style="width:100%;border-collapse:collapse;min-width:400px;">
             <thead><tr>${thCells}</tr></thead><tbody>${previewTbody}</tbody>
           </table>
         </div>`
      : '<div style="text-align:center;color:#ef4444;padding:20px;font-size:13px;">❌ Aucune ligne valide — vérifiez le mapping.</div>'}
    <div style="display:flex;justify-content:space-between;gap:8px;">
      <button onclick="_dynImportGoStep(2)" class="btn btn-secondary btn-sm">← Modifier mapping</button>
      <div style="display:flex;gap:8px;">
        <button onclick="_closeDynImport()" class="btn btn-cancel">Annuler</button>
        <button id="dyn-import-btn-confirm" onclick="_dynImportConfirm()" class="btn btn-primary"
          ${valid.length===0?'disabled style="opacity:.5;cursor:not-allowed;"':''}>
          📥 Importer ${valid.length} ligne(s)
        </button>
      </div>
    </div>`;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function _dynImportUpdateMapping(sel) {
  const key = sel.dataset.field, idx = parseInt(sel.value);
  _DYN_IMPORT.mapping[key] = idx;
  sel.style.borderColor = idx >= 0 ? '#4f46e5' : '#d1d5db';
  sel.style.background  = idx >= 0 ? '#eef2ff' : 'white';
  sel.style.color       = idx >= 0 ? '#4f46e5' : '#374151';
}

function _dynImportCommitMappingAndPreview() {
  // Sync selects → mapping before going to step 3
  document.querySelectorAll('#dyn-import-inner select[data-field]').forEach(sel => {
    _DYN_IMPORT.mapping[sel.dataset.field] = parseInt(sel.value);
  });
  _dynImportGoStep(3);
}

function _dynImportGoStep(n) {
  _DYN_IMPORT.step = n;
  _dynImportRender();
}

function _dynImportAutoMap() {
  // Attempt automatic header → field mapping using fuzzy string similarity
  const s = _DYN_IMPORT;
  s.schema.fields.forEach(f => { s.mapping[f.key] = -1; });

  const norm = str => String(str||'').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ').trim();

  s.headers.forEach((h, colIdx) => {
    const hn = norm(h);
    if (!hn) return;
    let bestKey = null, bestScore = 0;
    s.schema.fields.forEach(f => {
      if (s.mapping[f.key] >= 0) return; // already claimed
      const candidates = [norm(f.key), norm(f.label)];
      let score = 0;
      candidates.forEach(c => {
        if (!c) return;
        if (c === hn) score = Math.max(score, 100);
        else if (c.includes(hn) || hn.includes(c)) score = Math.max(score, 60);
        else {
          const cw = c.split(' ').filter(w => w.length > 2);
          const hw = hn.split(' ').filter(w => w.length > 2);
          const overlap = cw.filter(w => hw.includes(w)).length;
          if (overlap) score = Math.max(score, 30 * overlap);
        }
      });
      if (score > bestScore) { bestScore = score; bestKey = f.key; }
    });
    if (bestKey && bestScore >= 30) s.mapping[bestKey] = colIdx;
  });
}

function _dynImportOnFileChange(input) {
  const file  = input.files[0];
  const msgEl = document.getElementById('dyn-import-s1-msg');
  const btn   = document.getElementById('dyn-import-btn-next1');
  if (msgEl) { msgEl.style.display='none'; msgEl.innerHTML=''; }
  if (btn)   { btn.disabled=true; btn.style.opacity='.5'; btn.style.cursor='not-allowed'; }
  Object.assign(_DYN_IMPORT, { rawRows:[], headers:[], workbook:null, sheetNames:[], selectedSheet:'' });
  if (!file) return;

  const ext = file.name.split('.').pop().toLowerCase();
  const _err = msg => {
    if (msgEl) { msgEl.innerHTML=`<div style="background:#fef2f2;border:1px solid #fca5a5;border-radius:8px;padding:10px 12px;font-size:12px;color:#991b1b;">${msg}</div>`; msgEl.style.display=''; }
  };

  // Shared: load rows from a sheet name (or null = use rawRows already set)
  const _loadSheet = (wb, sheetName) => {
    const ws = wb.Sheets[sheetName];
    if (!ws) { _err('❌ Onglet introuvable : ' + sheetName); return; }
    const rows = XLSX.utils.sheet_to_json(ws, { header:1, defval:'' });
    if (!rows || rows.length < 2) { _err('❌ Onglet « ' + sheetName + ' » vide ou sans données.'); return; }
    _DYN_IMPORT.rawRows      = rows;
    _DYN_IMPORT.headers      = rows[0].map(h => String(h||'').trim());
    _DYN_IMPORT.selectedSheet= sheetName;
    _dynImportAutoMap();
    _dynImportUpdateStep1Status(rows.length - 1, _DYN_IMPORT.headers.length, sheetName, wb.SheetNames);
  };

  if (ext === 'csv') {
    const reader = new FileReader();
    reader.onload = e => {
      const rows = _dynParseCSV(e.target.result);
      if (!rows || rows.length < 2) { _err('❌ Fichier CSV vide ou sans données.'); return; }
      _DYN_IMPORT.rawRows  = rows;
      _DYN_IMPORT.headers  = rows[0].map(h => String(h||'').trim());
      _dynImportAutoMap();
      _dynImportUpdateStep1Status(rows.length - 1, _DYN_IMPORT.headers.length, null, null);
    };
    reader.readAsText(file, 'UTF-8');

  } else if (ext === 'xlsx' || ext === 'xls') {
    if (typeof XLSX === 'undefined') { _err('⚠️ Librairie SheetJS non disponible. Utilisez le format CSV.'); return; }
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const wb = XLSX.read(new Uint8Array(e.target.result), { type:'array' });
        _DYN_IMPORT.workbook   = wb;
        _DYN_IMPORT.sheetNames = wb.SheetNames;
        _loadSheet(wb, wb.SheetNames[0]); // default: first sheet
      } catch(err) { _err('❌ Erreur lecture Excel : ' + err.message); }
    };
    reader.readAsArrayBuffer(file);
  } else { _err('❌ Format non supporté. CSV (.csv) ou Excel (.xlsx) uniquement.'); }
}

// Called from the sheet selector dropdown in step 1
function _dynImportChangeSheet(sheetName) {
  const wb = _DYN_IMPORT.workbook;
  if (!wb) return;
  const ws = wb.Sheets[sheetName];
  const msgEl = document.getElementById('dyn-import-s1-msg');
  const btn   = document.getElementById('dyn-import-btn-next1');

  if (!ws) {
    if (msgEl) { msgEl.innerHTML=`<div style="background:#fef2f2;border:1px solid #fca5a5;border-radius:8px;padding:10px 12px;font-size:12px;color:#991b1b;">❌ Onglet introuvable : ${_esc(sheetName)}</div>`; msgEl.style.display=''; }
    if (btn) { btn.disabled=true; btn.style.opacity='.5'; btn.style.cursor='not-allowed'; }
    return;
  }

  const rows = XLSX.utils.sheet_to_json(ws, { header:1, defval:'' });
  if (!rows || rows.length < 2) {
    if (msgEl) { msgEl.innerHTML=`<div style="background:#fef2f2;border:1px solid #fca5a5;border-radius:8px;padding:10px 12px;font-size:12px;color:#991b1b;">❌ Onglet « ${_esc(sheetName)} » vide ou sans données.</div>`; msgEl.style.display=''; }
    if (btn) { btn.disabled=true; btn.style.opacity='.5'; btn.style.cursor='not-allowed'; }
    return;
  }

  // Update state
  _DYN_IMPORT.rawRows       = rows;
  _DYN_IMPORT.headers       = rows[0].map(h => String(h||'').trim());
  _DYN_IMPORT.selectedSheet = sheetName;
  _DYN_IMPORT.mapping       = {};   // reset mapping — new headers, start fresh
  _dynImportAutoMap();

  const nbRows = rows.length - 1;
  const nbCols = _DYN_IMPORT.headers.length;

  // Update info span in place (don't rebuild the picker → avoids dropdown reset)
  const infoSpan = document.getElementById('dyn-import-sheet-info');
  if (infoSpan) infoSpan.textContent = nbRows + ' ligne(s) · ' + nbCols + ' colonne(s)';

  // Update the success message
  if (msgEl) {
    msgEl.innerHTML = `<div style="background:#f0fdf4;border:1px solid #86efac;border-radius:8px;padding:10px 12px;font-size:12px;color:#166534;">
      ✅ Onglet <b>${_esc(sheetName)}</b> chargé · <b>${nbRows}</b> ligne(s) · <b>${nbCols}</b> colonne(s)
    </div>`;
    msgEl.style.display = '';
  }
  if (btn) { btn.disabled=false; btn.style.opacity='1'; btn.style.cursor='pointer'; }
}

// Update step-1 status: sheet picker (separate div) + success message
function _dynImportUpdateStep1Status(nbRows, nbCols, sheetName, allSheets) {
  const pickerEl = document.getElementById('dyn-import-s1-sheet-picker');
  const msgEl    = document.getElementById('dyn-import-s1-msg');
  const btn      = document.getElementById('dyn-import-btn-next1');

  // ── Sheet picker (own div, separate from status message) ──────────────────
  if (pickerEl) {
    if (allSheets && allSheets.length > 1) {
      const opts = allSheets.map(n =>
        `<option value="${_esc(n)}"${n === sheetName ? ' selected' : ''}>${_esc(n)}</option>`
      ).join('');
      pickerEl.innerHTML = `
        <div style="background:#f0f4ff;border:1.5px solid #c7d2fe;border-radius:10px;padding:12px 14px;">
          <div style="font-size:12px;font-weight:700;color:#4f46e5;margin-bottom:8px;">
            📑 Sélectionner l'onglet à importer
            <span style="font-weight:400;color:#94a3b8;font-size:11px;margin-left:6px;">${allSheets.length} onglet(s) détecté(s)</span>
          </div>
          <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
            <select id="dyn-import-sheet-select" onchange="_dynImportChangeSheet(this.value)"
              style="flex:1;min-width:180px;padding:7px 10px;border:1.5px solid #4f46e5;border-radius:7px;
                     font-size:13px;font-weight:600;background:#eef2ff;color:#4f46e5;cursor:pointer;box-sizing:border-box;">
              ${opts}
            </select>
            <span id="dyn-import-sheet-info"
              style="font-size:11px;color:#64748b;white-space:nowrap;">
              ${nbRows} ligne(s) · ${nbCols} colonne(s)
            </span>
          </div>
        </div>`;
      pickerEl.style.display = '';
    } else {
      pickerEl.style.display = 'none';
      pickerEl.innerHTML = '';
    }
  }

  // ── Success / file info message ──────────────────────────────────────────
  if (msgEl) {
    msgEl.innerHTML = `
      <div style="background:#f0fdf4;border:1px solid #86efac;border-radius:8px;padding:10px 12px;font-size:12px;color:#166534;">
        ✅ Fichier chargé${sheetName ? ' · Onglet : <b>' + _esc(sheetName) + '</b>' : ''} · <b>${nbRows}</b> ligne(s) · <b>${nbCols}</b> colonne(s)
      </div>`;
    msgEl.style.display = '';
  }

  if (btn) { btn.disabled = false; btn.style.opacity = '1'; btn.style.cursor = 'pointer'; }
}

function _dynParseCSV(text) {
  const lines = text.replace(/\r\n/g,'\n').replace(/\r/g,'\n').split('\n').filter(l => l.trim());
  return lines.map(line => {
    const res=[]; let inQ=false, cur='';
    for (let i=0; i<line.length; i++) {
      const c=line[i];
      if (c==='"') { if(inQ&&line[i+1]==='"'){cur+='"';i++;}else inQ=!inQ; }
      else if ((c===','||c===';')&&!inQ) { res.push(cur.trim()); cur=''; }
      else cur+=c;
    }
    res.push(cur.trim()); return res;
  });
}

function _dynImportParseRows() {
  const s = _DYN_IMPORT;
  const valid = [], errors = [];
  for (let ri = 1; ri < s.rawRows.length; ri++) {
    const row = s.rawRows[ri];
    if (!row || row.every(c => String(c).trim() === '')) continue;
    const get = key => { const idx=s.mapping[key]; return (idx!=null&&idx>=0) ? String(row[idx]||'').trim() : ''; };
    const missing = s.schema.fields.filter(f => f.required && !get(f.key));
    if (missing.length) { errors.push('Ligne '+(ri+1)+' : champ requis manquant : '+missing.map(f=>f.label).join(', ')); continue; }
    const obj = {};
    s.schema.fields.forEach(f => {
      let v = get(f.key);
      if (!v && f.default != null) v = String(f.default);
      if (f.type === 'int') v = Math.min(f.max||99, Math.max(f.min||0, parseInt(v)||parseInt(f.default)||0));
      obj[f.key] = v;
    });
    valid.push(obj);
  }
  return { valid, errors };
}

// Returns count of existing items for a given schema key
function _dynImportGetCurrentCount(schemaKey) {
  if (schemaKey === 'risques')    return (state.risks||[]).length;
  if (schemaKey === 'actions')    return (state.customActions||[]).length;
  if (schemaKey === 'arbitrages') return (state.customArbitrages||[]).length;
  if (schemaKey === 'gaps')       return (state.customGaps||[]).length;
  return 0;
}

// Visual feedback when switching mode (highlight the selected card)
function _dynImportModeChange(radio) {
  const isReplace = radio.value === 'replace';
  const appendLbl  = document.getElementById('dyn-mode-label-append');
  const replaceLbl = document.getElementById('dyn-mode-label-replace');
  if (appendLbl)  { appendLbl.style.borderColor  = isReplace ? '#e2e8f0' : '#86efac';  appendLbl.style.background  = isReplace ? 'white'   : '#f0fdf4'; }
  if (replaceLbl) { replaceLbl.style.borderColor = isReplace ? '#fca5a5' : '#e2e8f0'; replaceLbl.style.background = isReplace ? '#fef2f2' : 'white'; }
  // Update confirm button label
  const btn = document.getElementById('dyn-import-btn-confirm');
  const { valid } = _dynImportParseRows();
  if (btn && valid.length > 0) {
    btn.textContent = isReplace
      ? '🔄 Remplacer par ' + valid.length + ' ligne(s)'
      : '📥 Importer ' + valid.length + ' ligne(s)';
  }
}

function _dynImportConfirm() {
  const { valid } = _dynImportParseRows();
  if (!valid.length) return;

  // Read chosen mode
  const modeEl    = document.querySelector('#dyn-import-inner input[name="dyn-import-mode"]:checked');
  const isReplace = modeEl && modeEl.value === 'replace';
  const key       = _DYN_IMPORT.schemaKey;

  if (isReplace) {
    const existing = _dynImportGetCurrentCount(key);
    if (existing > 0) {
      const label = _DYN_IMPORT.schema.title.replace('📥 Importer des ','').replace('📥 Importer ','');
      if (!confirm(`⚠️ Remplacer les ${existing} entrée(s) existantes (${label}) par les ${valid.length} ligne(s) importées ?\n\nCette action est irréversible.`)) return;
    }
    // Vider les données existantes de cette section
    if (key === 'risques') {
      state.risks = [];
    } else if (key === 'actions') {
      (state.customActions||[]).forEach(a => { if (state.actions) delete state.actions[a.id]; });
      state.customActions = [];
    } else if (key === 'arbitrages') {
      (state.customArbitrages||[]).forEach(a => { if (state.arbitrages) delete state.arbitrages[a.id]; });
      state.customArbitrages = [];
    } else if (key === 'gaps') {
      state.customGaps = [];
    }
  }

  // Exécuter l'import + fermer la modal (dans tous les cas, même si une erreur survient)
  let importedCount = 0;
  try {
    _DYN_IMPORT.schema.onImport(valid);
    importedCount = valid.length;
  } catch(err) {
    console.error('[import] Erreur lors de onImport :', err);
    showToast('⚠️ Import partiel — vérifiez la console.', 4000);
  }
  _closeDynImport();

  // Synchronisation projet + re-render après fermeture du modal
  if (importedCount > 0) {
    try { _saveCurrentProjectData(); } catch(e) {}
    try { saveState('Import confirmé', importedCount + ' ligne(s)'); } catch(e) {}
    try {
      if (key === 'risques')    { renderRisques(); renderDashboard(); }
      else if (key === 'actions')    { renderActions(); renderDashboard(); }
      else if (key === 'arbitrages') { renderArbitrages(); renderDashboard(); }
      else if (key === 'gaps')       { renderGaps(); renderDashboard(); }
    } catch(e) { console.warn('[import] re-render:', e.message); }
    const labels = { risques:'risque(s)', actions:'action(s)', arbitrages:'arbitrage(s)', gaps:'GAP(s)' };
    showToast('✅ ' + importedCount + ' ' + (labels[key]||'élément(s)') + ' importé(s)', 3000);
  }
}

function _dynImportDownloadTemplate() {
  const schema = _DYN_IMPORT.schema;
  if (!schema) return;
  _dynDownloadTemplateFor(_DYN_IMPORT.schemaKey);
}

// Standalone template download — can be called without an open modal
function _dynDownloadTemplateFor(schemaKey) {
  const schema = _IMPORT_SCHEMAS[schemaKey];
  if (!schema) return;
  const header  = schema.fields.map(f => f.label);
  const example = schema.fields.map(f => {
    if (f.type === 'enum') return f.options ? f.options[0] : (f.default || '');
    if (f.type === 'int')  return String(f.default || f.min || 1);
    if (f.type === 'date') return '2025-12-31';
    if (f.hint)            return f.hint.replace(/^Ex[: ]+/i,'').split(/[,|\/]/)[0].trim();
    return '';
  });
  const csv = [header, example].map(row => row.map(v => '"'+String(v||'').replace(/"/g,'""')+'"').join(',')).join('\n');
  const blob = new Blob(['\uFEFF'+csv], { type:'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href=url; a.download='template_import_'+schemaKey+'.csv';
  document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
}

// Legacy shim: old calls redirect to generic engine
function _openRiskImportModal() { _openDynImport('risques'); }

// ════════════════════════════════════════════════════════════════════════════
// MODULE IMPACTS & SUIVI
// Trace les événements qui affectent le planning, le budget ou le périmètre
// ════════════════════════════════════════════════════════════════════════════

let _impactEditId = null;

const _IMPACT_TYPES = {
  planning:  { label: 'Planning',   color: '#1565C0', bg: '#E3F0FF', icon: '📅' },
  budget:    { label: 'Budget',     color: '#2E7D52', bg: '#E8F5ED', icon: '💰' },
  perimetre: { label: 'Périmètre',  color: '#7B1FA2', bg: '#F3E5F5', icon: '🗂️' },
  ressource: { label: 'Ressource',  color: '#E8702A', bg: '#FEF3E2', icon: '👤' },
  technique: { label: 'Technique',  color: '#0277BD', bg: '#E1F5FE', icon: '🔧' },
  autre:     { label: 'Autre',      color: '#546E7A', bg: '#ECEFF1', icon: '📌' },
};

const _IMPACT_STATUTS = {
  ouvert:    { label: 'Ouvert',      color: '#E63329', bg: '#FDEEEC' },
  en_cours:  { label: 'En cours',    color: '#E8702A', bg: '#FEF3E2' },
  resolu:    { label: 'Résolu',      color: '#2E7D52', bg: '#E8F5ED' },
  accepte:   { label: 'Accepté',     color: '#546E7A', bg: '#ECEFF1' },
};

function renderImpacts() {
  const list = state.impacts || [];
  const fType   = (document.getElementById('impact-filter-type')?.value   || '');
  const fStatut = (document.getElementById('impact-filter-statut')?.value || '');
  const fSearch = (document.getElementById('impact-filter-search')?.value || '').toLowerCase().trim();

  const filtered = list.filter(imp => {
    if (fType   && imp.type   !== fType)   return false;
    if (fStatut && imp.statut !== fStatut) return false;
    if (fSearch && !(
      (imp.titre||'').toLowerCase().includes(fSearch) ||
      (imp.cause||'').toLowerCase().includes(fSearch) ||
      (imp.description||'').toLowerCase().includes(fSearch)
    )) return false;
    return true;
  });

  const totalPlanning = list.reduce((s, i) => s + (parseFloat(i.impact_planning) || 0), 0);
  const totalBudget   = list.reduce((s, i) => s + (parseFloat(i.impact_budget)   || 0), 0);
  const nbOuverts     = list.filter(i => i.statut === 'ouvert' || i.statut === 'en_cours').length;
  const nbTotal       = list.length;

  const kpiEl = document.getElementById('impacts-kpi');
  if (kpiEl) {
    const planColor = totalPlanning > 0 ? '#E63329' : totalPlanning < 0 ? '#2E7D52' : '#546E7A';
    const budgColor = totalBudget   > 0 ? '#E63329' : totalBudget   < 0 ? '#2E7D52' : '#546E7A';
    kpiEl.innerHTML = `
      <div class="impact-kpi-card">
        <div class="impact-kpi-icon">📅</div>
        <div class="impact-kpi-body">
          <div class="impact-kpi-val" style="color:${planColor}">${totalPlanning >= 0 ? '+' : ''}${totalPlanning}j</div>
          <div class="impact-kpi-lbl">Dérive planning cumulée</div>
        </div>
      </div>
      <div class="impact-kpi-card">
        <div class="impact-kpi-icon">💰</div>
        <div class="impact-kpi-body">
          <div class="impact-kpi-val" style="color:${budgColor}">${totalBudget >= 0 ? '+' : ''}${totalBudget}j</div>
          <div class="impact-kpi-lbl">Dérive budget cumulée</div>
        </div>
      </div>
      <div class="impact-kpi-card">
        <div class="impact-kpi-icon">🔴</div>
        <div class="impact-kpi-body">
          <div class="impact-kpi-val" style="color:${nbOuverts > 0 ? '#E63329' : '#2E7D52'}">${nbOuverts}</div>
          <div class="impact-kpi-lbl">Impact(s) ouverts / en cours</div>
        </div>
      </div>
      <div class="impact-kpi-card">
        <div class="impact-kpi-icon">📋</div>
        <div class="impact-kpi-body">
          <div class="impact-kpi-val" style="color:#1565C0">${nbTotal}</div>
          <div class="impact-kpi-lbl">Total enregistrés</div>
        </div>
      </div>`;
  }

  const badge = document.getElementById('tab-impacts-badge');
  if (badge) badge.textContent = nbOuverts > 0 ? nbOuverts : '';

  const tbody   = document.getElementById('impacts-tbody');
  const emptyEl = document.getElementById('impacts-empty');
  if (!tbody) return;

  if (filtered.length === 0) {
    tbody.innerHTML = '';
    if (emptyEl) emptyEl.style.display = 'block';
    return;
  }
  if (emptyEl) emptyEl.style.display = 'none';

  const sorted = [...filtered].sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  tbody.innerHTML = sorted.map((imp, i) => {
    const realIdx = list.indexOf(imp);
    const t = _IMPACT_TYPES[imp.type]    || _IMPACT_TYPES.autre;
    const s = _IMPACT_STATUTS[imp.statut] || _IMPACT_STATUTS.ouvert;
    const dp = parseFloat(imp.impact_planning) || 0;
    const db = parseFloat(imp.impact_budget)   || 0;
    const planHtml = dp === 0 ? '<span style="color:#bbb;">—</span>'
      : `<span style="font-weight:700;color:${dp > 0 ? '#E63329' : '#2E7D52'}">${dp > 0 ? '+' : ''}${dp}j</span>`;
    const budgHtml = db === 0 ? '<span style="color:#bbb;">—</span>'
      : `<span style="font-weight:700;color:${db > 0 ? '#E63329' : '#2E7D52'}">${db > 0 ? '+' : ''}${db}j</span>`;
    const rowBg = i % 2 === 0 ? '#fff' : '#fafbff';
    const dateStr = imp.date ? new Date(imp.date + 'T00:00:00').toLocaleDateString('fr-FR', { day:'2-digit', month:'2-digit', year:'numeric' }) : '—';
    const canE = typeof canEdit === 'function' ? canEdit() : true;
    const editBtn = canE ? `<button onclick="openEditImpact(${realIdx})" style="background:none;border:1px solid #1565C0;color:#1565C0;border-radius:4px;padding:2px 8px;cursor:pointer;font-size:11px;">✏️</button>` : '';
    const delBtn  = canE ? `<button onclick="deleteImpact(${realIdx})" style="background:none;border:1px solid #E63329;color:#E63329;border-radius:4px;padding:2px 8px;cursor:pointer;font-size:11px;">🗑️</button>` : '';
    return `<tr style="background:${rowBg};border-bottom:1px solid #f0f2f7;">
      <td style="padding:8px 10px;white-space:nowrap;color:#666;font-size:11px;">${escHtml(dateStr)}</td>
      <td style="padding:8px 10px;font-weight:600;color:#1a2640;font-size:12px;max-width:220px;">${escHtml(imp.titre||'—')}</td>
      <td style="padding:8px 10px;white-space:nowrap;">
        <span style="background:${t.bg};color:${t.color};border-radius:10px;padding:2px 8px;font-size:10px;font-weight:700;">${t.icon} ${t.label}</span>
      </td>
      <td style="padding:8px 10px;color:#555;font-size:11px;max-width:200px;">${escHtml((imp.cause||'').substring(0,80))}</td>
      <td style="padding:8px 10px;text-align:center;">${planHtml}</td>
      <td style="padding:8px 10px;text-align:center;">${budgHtml}</td>
      <td style="padding:8px 10px;white-space:nowrap;">
        <span style="background:${s.bg};color:${s.color};border-radius:10px;padding:2px 8px;font-size:10px;font-weight:700;">${s.label}</span>
      </td>
      <td style="padding:8px 10px;color:#555;font-size:11px;white-space:nowrap;">${escHtml(imp.responsable||'—')}</td>
      <td style="padding:8px 10px;color:#555;font-size:11px;max-width:160px;">${escHtml((imp.actions_correctives||'').substring(0,60))}</td>
      <td style="padding:8px 10px;white-space:nowrap;display:flex;gap:4px;">${editBtn}${delBtn}</td>
    </tr>`;
  }).join('');
}

function openAddImpact() {
  _impactEditId = null;
  document.getElementById('impact-modal-title').textContent = '📌 Nouvel Impact';
  document.getElementById('impact-date').value        = new Date().toISOString().slice(0,10);
  document.getElementById('impact-titre').value       = '';
  document.getElementById('impact-type').value        = 'planning';
  document.getElementById('impact-cause').value       = '';
  document.getElementById('impact-description').value = '';
  document.getElementById('impact-planning').value    = '0';
  document.getElementById('impact-budget').value      = '0';
  document.getElementById('impact-statut').value      = 'ouvert';
  document.getElementById('impact-responsable').value = '';
  document.getElementById('impact-actions').value     = '';
  document.getElementById('impact-tache').value       = '';
  document.getElementById('impact-modal').style.display = 'flex';
}

function openEditImpact(idx) {
  _impactEditId = idx;
  const imp = (state.impacts||[])[idx];
  if (!imp) return;
  document.getElementById('impact-modal-title').textContent = '✏️ Modifier Impact';
  document.getElementById('impact-date').value        = imp.date        || '';
  document.getElementById('impact-titre').value       = imp.titre       || '';
  document.getElementById('impact-type').value        = imp.type        || 'planning';
  document.getElementById('impact-cause').value       = imp.cause       || '';
  document.getElementById('impact-description').value = imp.description || '';
  document.getElementById('impact-planning').value    = imp.impact_planning != null ? imp.impact_planning : '0';
  document.getElementById('impact-budget').value      = imp.impact_budget   != null ? imp.impact_budget   : '0';
  document.getElementById('impact-statut').value      = imp.statut      || 'ouvert';
  document.getElementById('impact-responsable').value = imp.responsable  || '';
  document.getElementById('impact-actions').value     = imp.actions_correctives || '';
  document.getElementById('impact-tache').value       = imp.tache_liee  || '';
  document.getElementById('impact-modal').style.display = 'flex';
}

function closeImpactModal() {
  document.getElementById('impact-modal').style.display = 'none';
}

function saveImpact() {
  const titre = (document.getElementById('impact-titre').value||'').trim();
  if (!titre) { alert('Veuillez saisir un titre pour cet impact.'); return; }
  const dp = parseFloat(document.getElementById('impact-planning').value) || 0;
  const db = parseFloat(document.getElementById('impact-budget').value)   || 0;
  const imp = {
    date:               document.getElementById('impact-date').value,
    titre,
    type:               document.getElementById('impact-type').value,
    cause:              document.getElementById('impact-cause').value.trim(),
    description:        document.getElementById('impact-description').value.trim(),
    impact_planning:    dp,
    impact_budget:      db,
    statut:             document.getElementById('impact-statut').value,
    responsable:        document.getElementById('impact-responsable').value.trim(),
    actions_correctives:document.getElementById('impact-actions').value.trim(),
    tache_liee:         document.getElementById('impact-tache').value.trim(),
    createdAt:          _impactEditId !== null
                          ? ((state.impacts||[])[_impactEditId]?.createdAt || new Date().toISOString())
                          : new Date().toISOString(),
  };
  if (!state.impacts) state.impacts = [];
  if (_impactEditId !== null) state.impacts[_impactEditId] = imp;
  else state.impacts.push(imp);
  const action = _impactEditId !== null ? 'Impact modifié' : 'Impact créé';
  saveState(action, titre.substring(0, 80));
  closeImpactModal();
  if (typeof _impactFromProjectModal !== 'undefined' && _impactFromProjectModal) {
    _impactFromProjectModal = false;
    if (typeof _epRenderImpacts === 'function') _epRenderImpacts();
  }
  renderImpacts();
}

function deleteImpact(idx) {
  if (!canEdit()) return;
  if (!confirm('Supprimer cet impact ?')) return;
  const del = (state.impacts||[])[idx];
  (state.impacts||[]).splice(idx, 1);
  saveState('Impact supprimé', del ? (del.titre||'').substring(0,80) : '');
  renderImpacts();
}

function exportImpactsCSV() {
  const list = state.impacts || [];
  if (!list.length) { alert('Aucun impact à exporter.'); return; }
  const headers = ['Date','Titre','Type','Cause','Description','Impact planning (j)','Impact budget (j)','Statut','Responsable','Actions correctives','Tâche liée'];
  const rows = list.map(imp => [
    imp.date||'', imp.titre||'', (_IMPACT_TYPES[imp.type]||{}).label||imp.type||'',
    imp.cause||'', imp.description||'',
    imp.impact_planning != null ? imp.impact_planning : '',
    imp.impact_budget   != null ? imp.impact_budget   : '',
    (_IMPACT_STATUTS[imp.statut]||{}).label||imp.statut||'',
    imp.responsable||'', imp.actions_correctives||'', imp.tache_liee||''
  ].map(v => '"' + String(v).replace(/"/g,'""') + '"').join(';'));
  const csv  = '﻿' + headers.join(';') + '\n' + rows.join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = 'impacts_projet_' + new Date().toISOString().slice(0,10) + '.csv';
  a.click();
  URL.revokeObjectURL(url);
}



// ═══════════════════════════════════════════════════════════════════════════
// PLANNING MASTER + SOUS-PHASES
// ═══════════════════════════════════════════════════════════════════════════

var _ganttViewMode = 'detail'; // 'detail' | 'master'

function toggleGanttView(mode) {
  _ganttViewMode = mode || 'detail';
  const btnMaster = document.getElementById('btn-gantt-master');
  const btnDetail = document.getElementById('btn-gantt-detail');
  if (btnMaster) btnMaster.classList.toggle('active', _ganttViewMode === 'master');
  if (btnDetail) btnDetail.classList.toggle('active', _ganttViewMode === 'detail');
  renderGantt();
}

function renderGanttMaster() {
  // ── Préserver la position de scroll avant le re-render ─────────────────
  const _prevScrollM = (() => {
    const sc = document.querySelector('.gantt-table-scroll');
    return sc ? { top: sc.scrollTop, left: sc.scrollLeft } : null;
  })();
  _refreshGanttRange();
  const todayPct = ganttPct(TODAY.toISOString().split('T')[0]);
  const curZoom = state.ganttZoom || 'month';
  const cols = buildGanttCols(curZoom);
  const hiddenSet = new Set(state.ganttHidden || []);
  // Même filtre CBS que renderGantt : si le projet n'utilise pas CBS, ignorer les tâches statiques
  const _masterBase = _projUsesCBS() ? [...ganttTasks, ...(state.ganttCustom || [])] : [...(state.ganttCustom || [])];
  const allPhases = _masterBase.filter(function(t) { return t.type === 'phase' && !hiddenSet.has(t.id); });
  const customAfter = {};
  const _mStaticIds  = _projUsesCBS() ? new Set() : new Set(ganttTasks.map(function(t){ return t.id; }));
  const _mCustomIds  = new Set((state.ganttCustom || []).map(function(t){ return t.id; }));
  const _mAllKnownIds = new Set([...ganttTasks.map(function(t){ return t.id; }), ..._mCustomIds]);
  const _mOrphan = [];
  (state.ganttCustom || []).forEach(function(ct) {
    const anchor = ct.insertAfterId || null;
    if (anchor && !_mStaticIds.has(anchor) && _mAllKnownIds.has(anchor)) {
      if (!customAfter[anchor]) customAfter[anchor] = [];
      customAfter[anchor].push(ct);
    } else { _mOrphan.push(ct); }
  });
  const _flatAll2 = [];
  const _flatSeen2 = new Set();
  function _pf2(task) {
    if (_flatSeen2.has(task.id)) return;
    _flatSeen2.add(task.id);
    _flatAll2.push(task);
    (customAfter[task.id]||[]).forEach(_pf2);
  }
  if (_projUsesCBS()) ganttTasks.forEach(_pf2);
  _mOrphan.forEach(function(ct){
    if (!_flatSeen2.has(ct.id)) _pf2(ct);
  });
  const _allTasksByPhase = {};
  let _lastPh = null;
  _flatAll2.forEach(function(t) {
    if (t.type === 'phase') { _lastPh = t.id; }
    else if (_lastPh && t.type !== 'subphase') {
      if (!_allTasksByPhase[_lastPh]) _allTasksByPhase[_lastPh] = [];
      _allTasksByPhase[_lastPh].push(t);
    }
  });
  let rows = '';
  allPhases.forEach(function(phase, idx) {
    const ov = state.gantt[phase.id] || {};
    const dispLabel = ov._label || phase.label || phase.id;
    let minS = null, maxE = null;
    (_allTasksByPhase[phase.id]||[]).forEach(function(t) {
      const td = getTaskDates(t);
      if (td.start && (!minS || td.start < minS)) minS = td.start;
      if (td.end   && (!maxE || td.end   > maxE)) maxE = td.end;
    });
    const start = minS || getTaskDates(phase).start || '';
    const end   = maxE || getTaskDates(phase).end   || start;
    const durMs = start && end ? new Date(end) - new Date(start) : 0;
    const dur   = Math.max(0, Math.round(durMs / 86400000));
    const left  = start ? (isNaN(ganttPct(start)) ? 0 : ganttPct(start)) : 0;
    const width = start ? Math.max(0.5, isNaN(ganttWidthPct(start,end)) ? 0 : ganttWidthPct(start,end)) : 0;
    const nbTasks = (_allTasksByPhase[phase.id]||[]).filter(function(t){return t.type!=='jalon';}).length;
    const nbDone  = (_allTasksByPhase[phase.id]||[]).filter(function(t){
      if (t.type==='jalon') return false;
      const ov2 = state.gantt[t.id]||{};
      const pct = ov2._pct!=null ? ov2._pct : Math.round((t.pct||0)*100);
      return pct >= 100;
    }).length;
    const phPct = nbTasks > 0 ? Math.round(nbDone / nbTasks * 100) : 0;
    const barHtml = start
      ? '<div class="gantt-bar ph-' + (phase.phase||'p'+idx) + '" style="left:' + left.toFixed(1) + '%;width:' + width.toFixed(1) + '%;" title="' + escHtml(dispLabel) + ': ' + start + ' \u2192 ' + end + ' (' + dur + 'j)">'
        + '<span class="g-bar-label">' + (width>1.5 ? escHtml(dispLabel.substring(0,32)) : '') + '</span></div>'
      : '<span style="font-size:10px;color:#94a3b8;font-style:italic;">Aucune t\u00e2che dat\u00e9e</span>';
    const _mBtnStyle = 'background:none;border:none;cursor:pointer;border-radius:4px;padding:2px 4px;';
    const _masterEditBtns = canAddDelete()
      ? '<button onclick="openAddSubphase(\'' + phase.id + '\')'  + '" style="' + _mBtnStyle + 'font-size:11px;color:#7c3aed;opacity:.75;" title="Ajouter une sous-phase" onmouseover="this.style.background=\'#ede9fe\';this.style.opacity=1" onmouseout="this.style.background=\'none\';this.style.opacity=.75">\u229e</button>'
        + '<button onclick="openConvertToSubphase(\'' + phase.id + '\')'  + '" style="' + _mBtnStyle + 'font-size:11px;color:#059669;opacity:.75;" title="Convertir en sous-phase" onmouseover="this.style.background=\'#d1fae5\';this.style.opacity=1" onmouseout="this.style.background=\'none\';this.style.opacity=.75">&#x21a5;</button>'
      : '';
    rows += '<tr class="gantt-phase-row" style="height:38px;">'
      + '<td style="text-align:center;font-size:11px;font-weight:700;color:#64748b;">' + (idx+1) + '</td>'
      + '<td style="font-weight:700;color:#1a2e55;padding:0 10px;font-size:13px;">' + escHtml(dispLabel) + (_masterEditBtns ? '<span style="margin-left:6px;">' + _masterEditBtns + '</span>' : '') + '</td>'
      + '<td style="text-align:center;font-size:11px;color:#334155;font-weight:600;">' + (start||'\u2014') + '</td>'
      + '<td style="text-align:center;font-size:11px;color:#334155;font-weight:600;">' + (end||'\u2014') + '</td>'
      + '<td style="text-align:center;font-size:11px;color:#64748b;">' + (dur?dur+'j':'\u2014') + '</td>'
      + '<td style="text-align:center;"><div style="display:flex;align-items:center;gap:5px;">'
      + '<div style="flex:1;height:8px;background:#e2e8f0;border-radius:4px;overflow:hidden;min-width:48px;">'
      + '<div style="height:100%;width:' + phPct + '%;background:' + (phPct>=100?'#22c55e':phPct>=60?'#3b82f6':'#f59e0b') + ';border-radius:4px;"></div></div>'
      + '<span style="font-size:11px;font-weight:700;color:' + (phPct>=100?'#16a34a':phPct>0?'#2563eb':'#94a3b8') + ';">' + phPct + '%</span></div></td>'
      + '<td style="text-align:center;font-size:10px;color:#64748b;">' + nbTasks + ' t\u00e2che' + (nbTasks!==1?'s':'') + '</td>'
      + '<td style="padding:0;position:relative;"><div class="gantt-bar-cell" style="min-width:' + cols.minWidth + ';">'
      + '<div class="gantt-months-bg">' + cols.bgHtml + '</div>'
      + '<div class="today-line" style="left:' + todayPct.toFixed(1) + '%"></div>'
      + barHtml + '</div></td></tr>';

    // \u2500\u2500 Sous-phases de cette phase \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
    const _phaseSubs = (state.ganttSubphases || []).filter(function(sp){ return sp.phaseId === phase.id; });
    _phaseSubs.forEach(function(sp, spIdx) {
      // T\u00e2ches de cette sous-phase
      const _spTasks = (_allTasksByPhase[phase.id]||[]).filter(function(t){
        const spId2 = (state.gantt[t.id] && state.gantt[t.id]._subphaseId) || t.subphaseId || null;
        return spId2 === sp.id;
      });
      // Si aucune t\u00e2che sp\u00e9cifique \u00e0 cette sous-phase, prendre toutes les t\u00e2ches de la phase (fallback)
      const _spTasksForBar = _spTasks.length > 0 ? _spTasks : (_allTasksByPhase[phase.id]||[]);
      let spMinS = null, spMaxE = null;
      _spTasksForBar.forEach(function(t) {
        const td = getTaskDates(t);
        if (td.start && (!spMinS || td.start < spMinS)) spMinS = td.start;
        if (td.end   && (!spMaxE || td.end   > spMaxE)) spMaxE = td.end;
      });
      const spStart = spMinS || '';
      const spEnd   = spMaxE || spStart;
      const spDurMs = spStart && spEnd ? new Date(spEnd) - new Date(spStart) : 0;
      const spDur   = Math.max(0, Math.round(spDurMs / 86400000));
      const spLeft  = spStart ? (isNaN(ganttPct(spStart)) ? 0 : ganttPct(spStart)) : 0;
      const spWidth = spStart ? Math.max(0.5, isNaN(ganttWidthPct(spStart,spEnd)) ? 0 : ganttWidthPct(spStart,spEnd)) : 0;
      const spNbT   = _spTasks.filter(function(t){return t.type!=='jalon';}).length;
      const spNbD   = _spTasks.filter(function(t){
        if (t.type==='jalon') return false;
        const ov2 = state.gantt[t.id]||{};
        const pct = ov2._pct!=null ? ov2._pct : Math.round((t.pct||0)*100);
        return pct >= 100;
      }).length;
      const spPct = spNbT > 0 ? Math.round(spNbD / spNbT * 100) : 0;
      const spBarHtml = spStart
        ? '<div class="gantt-bar" style="left:' + spLeft.toFixed(1) + '%;width:' + spWidth.toFixed(1) + '%;background:linear-gradient(90deg,#059669,#10b981);border-radius:4px;height:10px;top:50%;transform:translateY(-50%);position:absolute;" title="' + escHtml(sp.label||sp.id) + ': ' + spStart + ' \u2192 ' + spEnd + ' (' + spDur + 'j)"></div>'
        : '<span style="font-size:10px;color:#94a3b8;font-style:italic;">Non dat\u00e9e</span>';
      rows += '<tr style="height:30px;background:#f0fdf4;border-left:3px solid #10b981;">'
        + '<td style="text-align:center;font-size:10px;color:#059669;padding-left:12px;">' + (idx+1) + '.' + (spIdx+1) + '</td>'
        + '<td style="padding:0 10px 0 22px;font-size:12px;color:#065f46;font-style:italic;">'
        + '<span style="color:#10b981;margin-right:4px;">&#x2514;</span>' + escHtml(sp.label||sp.id)
        + '</td>'
        + '<td style="text-align:center;font-size:10px;color:#065f46;">' + (spStart||'\u2014') + '</td>'
        + '<td style="text-align:center;font-size:10px;color:#065f46;">' + (spEnd||'\u2014') + '</td>'
        + '<td style="text-align:center;font-size:10px;color:#065f46;">' + (spDur?spDur+'j':'\u2014') + '</td>'
        + '<td style="text-align:center;"><div style="display:flex;align-items:center;gap:4px;">'
        + '<div style="flex:1;height:6px;background:#bbf7d0;border-radius:3px;overflow:hidden;min-width:36px;">'
        + '<div style="height:100%;width:' + spPct + '%;background:#059669;border-radius:3px;"></div></div>'
        + '<span style="font-size:10px;font-weight:600;color:#059669;">' + spPct + '%</span></div></td>'
        + '<td style="text-align:center;font-size:10px;color:#065f46;">' + spNbT + ' t\u00e2che' + (spNbT!==1?'s':'') + '</td>'
        + '<td style="padding:0;position:relative;"><div class="gantt-bar-cell" style="min-width:' + cols.minWidth + ';position:relative;height:30px;">'
        + '<div class="gantt-months-bg">' + cols.bgHtml + '</div>'
        + '<div class="today-line" style="left:' + todayPct.toFixed(1) + '%"></div>'
        + spBarHtml + '</div></td></tr>';
    });
  });
  const todayLineHtml = (todayPct >= 0 && todayPct <= 100)
    ? '<div style="position:absolute;top:0;bottom:0;left:' + todayPct.toFixed(1) + '%;width:2px;background:#ef4444;z-index:5;pointer-events:none;">'
      + '<span style="position:absolute;top:50%;left:4px;transform:translateY(-50%);background:#ef4444;color:#fff;font-size:8px;font-weight:800;padding:2px 6px;border-radius:4px;white-space:nowrap;">\u25bc Aujourd\u2019hui</span>'
      + '</div>'
    : '';
  const header = '<table class="gantt-table"><thead><tr>'
    + '<th style="width:36px;text-align:center;">N\u00b0</th>'
    + '<th class="col-name">Phase</th>'
    + '<th style="width:100px;text-align:center;">D\u00e9but</th>'
    + '<th style="width:100px;text-align:center;">Fin</th>'
    + '<th style="width:60px;text-align:center;">Dur\u00e9e</th>'
    + '<th style="width:120px;text-align:center;">Avancement</th>'
    + '<th style="width:80px;text-align:center;">T\u00e2ches</th>'
    + '<th class="col-bar" style="padding:0;overflow:visible;position:relative;">'
    + '<div style="position:relative;display:flex;height:28px;min-width:' + cols.minWidth + ';">'
    + cols.headerHtml + todayLineHtml
    + '</div></th></tr></thead>';
  const ganttRender = document.getElementById('gantt-render');
  ganttRender.innerHTML = '<div class="gantt-table-scroll" style="overflow:auto;border-radius:0;background:#fff;">'
    + header + '<tbody>' + rows + '</tbody></table></div>';
  // ── Restaurer la position de scroll après le re-render ────────────────────
  if (_prevScrollM) {
    const _newScM = ganttRender.querySelector('.gantt-table-scroll');
    if (_newScM) { _newScM.scrollTop = _prevScrollM.top; _newScM.scrollLeft = _prevScrollM.left; }
  }
  ganttRender.querySelectorAll('thead th').forEach(function(th) {
    th.style.position = 'sticky'; th.style.top = '0'; th.style.zIndex = '4';
    th.style.background = '#f5f6f8'; th.style.boxShadow = 'inset 0 -1px 0 #d1d5db';
  });
}

function toggleSubphaseCollapse(subphaseId) {
  if (!state.ganttSubphasesCollapsed) state.ganttSubphasesCollapsed = {};
  state.ganttSubphasesCollapsed[subphaseId] = !state.ganttSubphasesCollapsed[subphaseId];
  saveState(); renderGantt();
}

var _editSubphaseId = null;

function openAddSubphase(phaseId) {
  _editSubphaseId = null;
  document.getElementById('subphase-modal-title').textContent = '\u229e Ajouter une sous-phase';
  document.getElementById('subphase-label').value = '';
  document.getElementById('subphase-phase-id').value = phaseId || '';
  var allP = [...ganttTasks, ...(state.ganttCustom||[])];
  var ph = allP.find(function(t){return t.id === phaseId;});
  document.getElementById('subphase-phase-label').textContent = ph ? (ph.label||phaseId) : (phaseId||'\u2014');
  document.getElementById('subphase-modal').style.display = 'flex';
  setTimeout(function(){var el=document.getElementById('subphase-label');if(el)el.focus();},100);
}

function openEditSubphase(subphaseId) {
  var sp = (state.ganttSubphases||[]).find(function(s){return s.id===subphaseId;});
  if (!sp) return;
  _editSubphaseId = subphaseId;
  document.getElementById('subphase-modal-title').textContent = '\u270f\ufe0f Modifier la sous-phase';
  document.getElementById('subphase-label').value = sp.label || '';
  document.getElementById('subphase-phase-id').value = sp.phaseId || '';
  var allP = [...ganttTasks, ...(state.ganttCustom||[])];
  var ph = allP.find(function(t){return t.id === sp.phaseId;});
  document.getElementById('subphase-phase-label').textContent = ph ? (ph.label||sp.phaseId) : (sp.phaseId||'\u2014');
  document.getElementById('subphase-modal').style.display = 'flex';
}

function closeSubphaseModal() {
  document.getElementById('subphase-modal').style.display = 'none';
  _editSubphaseId = null;
}

function saveSubphase() {
  var label = (document.getElementById('subphase-label').value||'').trim();
  var phaseId = (document.getElementById('subphase-phase-id').value||'').trim();
  if (!label) { showToast('\u26a0\ufe0f Veuillez renseigner le libell\u00e9.', 2000); return; }
  if (!state.ganttSubphases) state.ganttSubphases = [];
  if (_editSubphaseId) {
    var sp = state.ganttSubphases.find(function(s){return s.id===_editSubphaseId;});
    if (sp) { sp.label = label; sp.phaseId = phaseId; }
  } else {
    state.ganttSubphases.push({ id: 'sp_' + Date.now(), label: label, phaseId: phaseId, type: 'subphase' });
  }
  saveState(); closeSubphaseModal(); renderGantt();
  showToast('\u2705 Sous-phase enregistr\u00e9e', 1800);
}

function deleteSubphase(subphaseId) {
  if (!confirm('Supprimer cette sous-phase ? Les t\u00e2ches rattach\u00e9es perdront leur rattachement.')) return;
  if (!state.ganttSubphases) return;
  state.ganttSubphases = state.ganttSubphases.filter(function(s){return s.id !== subphaseId;});
  (state.ganttCustom||[]).forEach(function(t){ if (t.subphaseId === subphaseId) t.subphaseId = null; });
  Object.keys(state.gantt||{}).forEach(function(tid){
    if (state.gantt[tid] && state.gantt[tid]._subphaseId === subphaseId) state.gantt[tid]._subphaseId = null;
  });
  if (state.ganttSubphasesCollapsed) delete state.ganttSubphasesCollapsed[subphaseId];
  saveState(); renderGantt();
  showToast('\U0001f5d1\ufe0f Sous-phase supprim\u00e9e', 1800);
}

function _populateSubphaseSelect(phaseId, selectedId) {
  var sel = document.getElementById('new-task-subphase');
  if (!sel) return;
  sel.innerHTML = '<option value="">\u2014 Aucune sous-phase \u2014</option>';
  var hasSubphases = false;
  if (phaseId) {
    (state.ganttSubphases||[]).filter(function(sp){return sp.phaseId === phaseId;}).forEach(function(sp) {
      var opt = document.createElement('option');
      opt.value = sp.id; opt.textContent = sp.label;
      if (sp.id === selectedId) opt.selected = true;
      sel.appendChild(opt); hasSubphases = true;
    });
  }
  var wrapper = document.getElementById('new-task-subphase-row');
  if (wrapper) wrapper.style.display = hasSubphases ? '' : 'none';
}

function _onGanttPhaseChange() {
  var _phSel = document.getElementById('new-task-phase');
  var _phOpt = _phSel ? _phSel.options[_phSel.selectedIndex] : null;
  var _phaseId = (_phOpt && _phOpt.dataset.phaseId) ? _phOpt.dataset.phaseId : null;
  _populateSubphaseSelect(_phaseId, null);
}

// === CONVERT PHASE -> SOUS-PHASE ===
var _convertPhaseId = null;

function openConvertToSubphase(phaseId) {
  _convertPhaseId = phaseId;
  var allT = [...ganttTasks, ...(state.ganttCustom||[])];
  var ph = allT.find(function(t){ return t.id === phaseId; });
  document.getElementById("convert-phase-id").value = phaseId;
  document.getElementById("convert-phase-label").textContent = ph ? (ph.label || phaseId) : phaseId;
  var sel = document.getElementById("convert-master-select");
  while (sel.options.length > 0) sel.remove(0);
  var plOpt = document.createElement("option");
  plOpt.value = ""; plOpt.textContent = "-- Selectionner une phase maitre --"; sel.appendChild(plOpt);
  var phases = allT.filter(function(t){ return t.type === "phase" && t.id !== phaseId; });
  phases.forEach(function(p) {
    var opt = document.createElement("option");
    opt.value = p.id; opt.textContent = p.label || p.id; sel.appendChild(opt);
  });
  var cOpt = document.createElement("option");
  cOpt.value = "__new__"; cOpt.textContent = "+ Creer une nouvelle phase maitre…"; sel.appendChild(cOpt);
  sel.value = "";
  document.getElementById("convert-new-master-wrap").style.display = "none";
  document.getElementById("convert-new-master-label").value = "";
  document.getElementById("convert-phase-modal").style.display = "flex";
}

function closeConvertPhaseModal() {
  document.getElementById("convert-phase-modal").style.display = "none";
  _convertPhaseId = null;
}

function _onConvertMasterChange() {
  var v = document.getElementById("convert-master-select").value;
  document.getElementById("convert-new-master-wrap").style.display = (v === "__new__") ? "" : "none";
}

function executeConvertPhaseToSubphase() {
  var phaseId   = document.getElementById("convert-phase-id").value;
  var masterSel = document.getElementById("convert-master-select").value;
  if (!masterSel) { alert("Selectionner ou creer une phase maitre."); return; }
  var allT = [...ganttTasks, ...(state.ganttCustom||[])];
  var ph   = allT.find(function(t){ return t.id === phaseId; });
  if (!ph) { closeConvertPhaseModal(); return; }
  var masterPhaseId;
  if (masterSel === "__new__") {
    var masterLabel = (document.getElementById("convert-new-master-label").value || "").trim();
    if (!masterLabel) { alert("Entrer un nom pour la phase maitre."); return; }
    var hs = new Set(state.ganttHidden || []);
    // CBS=false : les tâches statiques ne sont pas rendues → ancrer uniquement sur des custom tasks
    var _renderBase = _projUsesCBS() ? allT : (state.ganttCustom || []);
    var vis = _renderBase.filter(function(t){ return !hs.has(t.id); });
    var pi = vis.findIndex(function(t){ return t.id === phaseId; });
    var prevId = (pi > 0) ? vis[pi - 1].id : null;
    masterPhaseId = "ph_" + Date.now();
    if (!state.ganttCustom) state.ganttCustom = [];
    state.ganttCustom.push({ id: masterPhaseId, type: "phase", label: masterLabel,
      phase: ph.phase || "p0", insertAfterId: prevId || null, _custom: true });
  } else {
    masterPhaseId = masterSel;
  }
  var spId = "sp_" + Date.now();
  if (!state.ganttSubphases) state.ganttSubphases = [];
  state.ganttSubphases.push({ id: spId, label: ph.label || phaseId, phaseId: masterPhaseId, type: 'subphase' });
  var hs2 = new Set(state.ganttHidden || []);
  var _taskBase2 = _projUsesCBS() ? allT : (state.ganttCustom || []);
  var inPhase = false;
  var toConvert = [];
  _taskBase2.forEach(function(t) {
    if (hs2.has(t.id)) return;
    if (t.type === "phase") { inPhase = (t.id === phaseId); }
    else if (inPhase && t.type !== "subphase") { toConvert.push(t.id); }
  });
  toConvert.forEach(function(tid) {
    if (!state.gantt[tid]) state.gantt[tid] = {};
    state.gantt[tid]._subphaseId = spId;
    var ct = (state.ganttCustom || []).find(function(t){ return t.id === tid; });
    if (ct) ct.subphaseId = spId;
  });
  if (ph._custom) {
    state.ganttCustom = (state.ganttCustom || []).filter(function(t){ return t.id !== phaseId; });
  } else {
    if (!state.ganttHidden) state.ganttHidden = [];
    if (!state.ganttHidden.includes(phaseId)) state.ganttHidden.push(phaseId);
  }
  saveState(); closeConvertPhaseModal(); renderGantt();
}


// === REGROUPER PLUSIEURS PHASES EN SOUS-PHASES ===

function _ensureGroupPhasesModal() {
  if (document.getElementById('group-phases-modal')) return;
  var div = document.createElement('div');
  div.id = 'group-phases-modal';
  div.className = 'modal-overlay';
  div.style.cssText = 'display:none;position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:3200;align-items:center;justify-content:center;';
  div.innerHTML = '<div class="modal-box" style="max-width:560px;width:95%;border-radius:12px;box-shadow:0 20px 60px rgba(0,0,0,.35);max-height:90vh;display:flex;flex-direction:column;">'
    + '<div style="display:flex;align-items:center;justify-content:space-between;padding:16px 20px;background:linear-gradient(135deg,#059669,#10b981);border-radius:12px 12px 0 0;flex-shrink:0;">'
    + '<span style="font-size:15px;font-weight:700;color:#fff;">⊕ Regrouper des phases</span>'
    + '<button onclick="closeGroupPhasesModal()" style="background:none;border:none;color:rgba(255,255,255,.8);font-size:18px;cursor:pointer;padding:2px 6px;border-radius:4px;">×</button></div>'
    + '<div style="padding:20px;display:flex;flex-direction:column;gap:16px;overflow-y:auto;">'
    + '<div><label style="font-size:12px;font-weight:700;color:#374151;display:block;margin-bottom:6px;">1· Phase maître *</label>'
    + '<select id="gp-master-select" onchange="_onGpMasterChange()" style="width:100%;padding:8px 10px;border:1px solid #d1d5db;border-radius:8px;font-size:13px;background:#fff;"><option value="">-- Sélectionner ou créer --</option></select>'
    + '<div id="gp-new-master-wrap" style="display:none;margin-top:8px;background:#f0fdf4;border:1px dashed #6ee7b7;border-radius:8px;padding:12px;">'
    + '<label style="font-size:12px;font-weight:600;color:#374151;display:block;margin-bottom:4px;">Nom de la nouvelle phase maître *</label>'
    + '<input id="gp-new-master-label" type="text" placeholder="Ex : Bloc A" style="width:100%;padding:8px 10px;border:1px solid #d1d5db;border-radius:8px;font-size:13px;box-sizing:border-box;"/></div></div>'
    + '<div><label style="font-size:12px;font-weight:700;color:#374151;display:block;margin-bottom:6px;">2· Phases à convertir en sous-phases *</label>'
    + '<div id="gp-phases-list" style="border:1px solid #e5e7eb;border-radius:8px;max-height:260px;overflow-y:auto;background:#fafafa;"></div>'
    + '<div style="margin-top:6px;display:flex;gap:8px;">'
    + '<button onclick="_gpSelectAll(true)" style="font-size:11px;color:#059669;background:none;border:none;cursor:pointer;padding:2px 6px;">☑ Tout sélectionner</button>'
    + '<button onclick="_gpSelectAll(false)" style="font-size:11px;color:#6b7280;background:none;border:none;cursor:pointer;padding:2px 6px;">☐ Tout désélectionner</button>'
    + '</div></div></div>'
    + '<div style="padding:12px 20px;display:flex;justify-content:flex-end;gap:8px;border-top:1px solid #f3f4f6;flex-shrink:0;">'
    + '<button onclick="closeGroupPhasesModal()" style="padding:8px 18px;border:1px solid #d1d5db;border-radius:8px;background:#fff;font-size:13px;cursor:pointer;font-weight:500;">Annuler</button>'
    + '<button onclick="executeGroupPhases()" style="padding:8px 22px;border:none;border-radius:8px;background:#059669;color:#fff;font-size:13px;font-weight:700;cursor:pointer;">⊕ Regrouper</button>'
    + '</div></div>';
  document.body.appendChild(div);
}

function openGroupPhasesModal() {
  console.log('[REGROUPER] openGroupPhasesModal appelé');
  _ensureGroupPhasesModal();
  var allT = [...ganttTasks, ...(state.ganttCustom||[])];
  var hs   = new Set(state.ganttHidden || []);
  var phases = allT.filter(function(t){ return t.type === 'phase' && !hs.has(t.id); });

  // Peupler le dropdown phase maitre
  var sel = document.getElementById('gp-master-select');
  while (sel.options.length > 0) sel.remove(0);
  var pl = document.createElement('option'); pl.value = ''; pl.textContent = '-- Selectionner ou creer --'; sel.appendChild(pl);
  phases.forEach(function(p) {
    var o = document.createElement('option'); o.value = p.id; o.textContent = p.label || p.id; sel.appendChild(o);
  });
  var co = document.createElement('option'); co.value = '__new__'; co.textContent = '+ Creer une nouvelle phase maitre...'; sel.appendChild(co);
  sel.value = '';
  document.getElementById('gp-new-master-wrap').style.display = 'none';
  document.getElementById('gp-new-master-label').value = '';

  // Peupler la liste des phases a regrouper
  var list = document.getElementById('gp-phases-list');
  list.innerHTML = '';
  if (phases.length === 0) {
    list.innerHTML = '<div style="padding:14px;font-size:12px;color:#94a3b8;text-align:center;">Aucune phase disponible</div>';
  } else {
    phases.forEach(function(p) {
      var row = document.createElement('label');
      row.style.cssText = 'display:flex;align-items:center;gap:10px;padding:9px 14px;border-bottom:1px solid #f3f4f6;cursor:pointer;';
      row.onmouseover = function(){ row.style.background = '#f0fdf4'; };
      row.onmouseout  = function(){ row.style.background = ''; };
      var cb = document.createElement('input');
      cb.type = 'checkbox'; cb.value = p.id; cb.dataset.label = p.label || p.id;
      cb.style.cssText = 'width:15px;height:15px;cursor:pointer;accent-color:#059669;';
      var lbl = document.createElement('span');
      lbl.style.cssText = 'font-size:13px;font-weight:600;color:#1a2e55;flex:1;';
      lbl.textContent = p.label || p.id;
      row.appendChild(cb); row.appendChild(lbl);
      list.appendChild(row);
    });
  }

  document.getElementById('group-phases-modal').style.display = 'flex';
}

function closeGroupPhasesModal() {
  document.getElementById('group-phases-modal').style.display = 'none';
}

function _onGpMasterChange() {
  var v = document.getElementById('gp-master-select').value;
  document.getElementById('gp-new-master-wrap').style.display = (v === '__new__') ? '' : 'none';
}

function _gpSelectAll(checked) {
  document.querySelectorAll('#gp-phases-list input[type=checkbox]').forEach(function(cb){ cb.checked = checked; });
}

function executeGroupPhases() {
  var masterSel = document.getElementById('gp-master-select').value;
  if (!masterSel) { alert('Selectionnez ou creez une phase maitre.'); return; }

  // Phases cochees
  var checkedIds = [];
  document.querySelectorAll('#gp-phases-list input[type=checkbox]:checked').forEach(function(cb){ checkedIds.push(cb.value); });
  if (checkedIds.length === 0) { alert('Cochez au moins une phase a regrouper.'); return; }

  // Exclure la phase maitre existante des phases a convertir
  if (masterSel !== '__new__') checkedIds = checkedIds.filter(function(id){ return id !== masterSel; });
  if (checkedIds.length === 0) { alert('Les phases selectionnees ne peuvent pas inclure uniquement la phase maitre.'); return; }

  var allT = [...ganttTasks, ...(state.ganttCustom||[])];
  var hs   = new Set(state.ganttHidden || []);

  // Creer la phase maitre si besoin
  var masterPhaseId;
  if (masterSel === '__new__') {
    var masterLabel = (document.getElementById('gp-new-master-label').value || '').trim();
    if (!masterLabel) { alert('Entrez un nom pour la nouvelle phase maitre.'); return; }

    // Ancrer la phase maitre avant la PREMIERE phase cochee (dans l'ordre rendu)
    // CBS=false : ignorer les tâches statiques qui ne sont pas rendues
    var _renderBase2 = _projUsesCBS() ? allT : (state.ganttCustom || []);
    var vis = _renderBase2.filter(function(t){ return !hs.has(t.id); });
    var firstIdx = Infinity;
    checkedIds.forEach(function(id) {
      var idx = vis.findIndex(function(t){ return t.id === id; });
      if (idx >= 0 && idx < firstIdx) firstIdx = idx;
    });
    var prevId = (firstIdx > 0) ? vis[firstIdx - 1].id : null;

    masterPhaseId = 'ph_' + Date.now();
    if (!state.ganttCustom) state.ganttCustom = [];
    var _newMasterTask = { id: masterPhaseId, type: 'phase', label: masterLabel, phase: 'p0', _custom: true };
    if (_projUsesCBS()) {
      // CBS=true : insertAfterId pour positionner via la chaîne d'ancres
      _newMasterTask.insertAfterId = prevId || null;
      state.ganttCustom.push(_newMasterTask);
    } else {
      // CBS=false : positionner en splicant à l'index de la 1ère phase cochée dans le tableau
      var _spliceIdx = state.ganttCustom.length;
      for (var _si = 0; _si < state.ganttCustom.length; _si++) {
        if (checkedIds.indexOf(state.ganttCustom[_si].id) >= 0) { _spliceIdx = _si; break; }
      }
      state.ganttCustom.splice(_spliceIdx, 0, _newMasterTask);
    }
  } else {
    masterPhaseId = masterSel;
  }

  if (!state.ganttSubphases) state.ganttSubphases = [];

  // Convertir chaque phase cochee en sous-phase
  checkedIds.forEach(function(phaseId, i) {
    var ph = allT.find(function(t){ return t.id === phaseId; });
    if (!ph) return;

    var spId = 'sp_' + (Date.now() + i);
    state.ganttSubphases.push({ id: spId, label: ph.label || phaseId, phaseId: masterPhaseId, type: 'subphase' });

    // Assigner _subphaseId a toutes les taches de cette phase
    // CBS=false : utiliser uniquement les custom tasks pour la traversée positionnelle
    var hs2 = new Set(state.ganttHidden || []);
    var _taskBase = _projUsesCBS() ? allT : (state.ganttCustom || []);
    var inPhase = false;
    _taskBase.forEach(function(t) {
      if (hs2.has(t.id)) return;
      if (t.type === 'phase') { inPhase = (t.id === phaseId); }
      else if (inPhase && t.type !== 'subphase') {
        if (!state.gantt[t.id]) state.gantt[t.id] = {};
        state.gantt[t.id]._subphaseId = spId;
        var ct = (state.ganttCustom || []).find(function(c){ return c.id === t.id; });
        if (ct) ct.subphaseId = spId;
      }
    });

    // Masquer / supprimer l'ancienne ligne de phase
    if (ph._custom) {
      state.ganttCustom = (state.ganttCustom || []).filter(function(t){ return t.id !== phaseId; });
    } else {
      if (!state.ganttHidden) state.ganttHidden = [];
      if (!state.ganttHidden.includes(phaseId)) state.ganttHidden.push(phaseId);
    }
  });

  saveState();
  closeGroupPhasesModal();
  renderGantt();
  showToast('✅ Regroupement créé — ' + checkedIds.length + ' phase(s) → sous-phases. Sauvegardé.', 3000);
}

// ═══════════════════════════════════════════════════════════════════
// DISSOLVE SUBPHASE — Détacher une sous-phase → phase indépendante
// ═══════════════════════════════════════════════════════════════════
function dissolveSubphase(subphaseId) {
  var sp = (state.ganttSubphases || []).find(function(s){ return s.id === subphaseId; });
  if (!sp) return;
  if (!confirm('Détacher "' + (sp.label || subphaseId) + '" du groupement ?\nElle redeviendra une phase indépendante avec ses tâches.')) return;

  if (!state.ganttCustom) state.ganttCustom = [];

  // ── 1. Trouver la position de la 1ère tâche de cette sous-phase dans ganttCustom ──
  var _firstTaskIdx = state.ganttCustom.length;
  state.ganttCustom.forEach(function(t, i) {
    var spId = t.subphaseId || (state.gantt[t.id] && state.gantt[t.id]._subphaseId) || null;
    if (spId === subphaseId && i < _firstTaskIdx) _firstTaskIdx = i;
  });

  // ── 2. Créer la nouvelle phase indépendante ──────────────────────
  var newPhaseId = 'ph_' + Date.now();
  var newPhase = { id: newPhaseId, type: 'phase', label: sp.label || subphaseId, phase: 'p0', _custom: true };
  // Insérer juste avant la 1ère tâche de la sous-phase (ou à la fin)
  state.ganttCustom.splice(_firstTaskIdx, 0, newPhase);

  // ── 3. Dissocier les tâches de la sous-phase ─────────────────────
  // state.gantt (dates/overrides)
  Object.keys(state.gantt || {}).forEach(function(tid) {
    if (state.gantt[tid] && state.gantt[tid]._subphaseId === subphaseId) {
      state.gantt[tid]._subphaseId = null;
    }
  });
  // state.ganttCustom (custom tasks)
  state.ganttCustom.forEach(function(t) {
    if (t.subphaseId === subphaseId) {
      t.subphaseId = null;
      // En CBS=false, ancrer sur la nouvelle phase si pas encore ancré
      if (!_projUsesCBS() && (!t.insertAfterId || !new Set((state.ganttCustom||[]).map(function(x){return x.id;})).has(t.insertAfterId))) {
        t.insertAfterId = null; // orphelin → sera rendu après la phase dans l'ordre du tableau
      }
    }
  });

  // ── 4. Supprimer la sous-phase de la liste ───────────────────────
  state.ganttSubphases = (state.ganttSubphases || []).filter(function(s){ return s.id !== subphaseId; });
  if (state.ganttSubphasesCollapsed) delete state.ganttSubphasesCollapsed[subphaseId];

  // ── 5. Si la phase maître n'a plus de sous-phases, la proposer à détacher aussi ──
  var remainingSubs = (state.ganttSubphases || []).filter(function(s){ return s.phaseId === sp.phaseId; });
  if (remainingSubs.length === 0) {
    // Phase maître vide → la garder mais ne rien faire (l'utilisateur peut la supprimer manuellement)
  }

  saveState();
  renderGantt();
  showToast('✅ "' + (sp.label||subphaseId) + '" détachée — phase indépendante créée.', 2500);
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORT GANTT PLANNING — Format identique au template d'import (.xlsx)
// Permet de ré-importer l'export dans un autre projet.
// Règle sous-phases : phase avec colonne "phase" non vide = sous-phase.
// ═══════════════════════════════════════════════════════════════════════════
async function exportGanttPlanning() {
  // ── 1. Construire la liste ordonnée ───────────────────────────────────────
  // On exporte UNIQUEMENT state.ganttCustom (les données saisies par l'utilisateur),
  // jamais les ganttTasks statiques CBS (template codé en dur non pertinent pour le projet).
  var orderedTasks = [];
  var hiddenSet = new Set(state.ganttHidden || []);

  (state.ganttCustom || []).forEach(function(t) {
    if (!hiddenSet.has(t.id)) orderedTasks.push(t);
  });

  if (!orderedTasks.length) {
    showToast('⚠️ Aucune tâche à exporter.', 2000);
    return;
  }

  // ── 1b. Réorganiser : sous-phases intercalées avec leurs tâches ──────────
  // Même algorithme que renderGantt step 1d (pas une simple injection en bloc)
  var _spList = state.ganttSubphases || [];
  if (_spList.length > 0) {
    // Pré-calculer : subphaseId → [tâches] (dans l'ordre de ganttCustom)
    var _tasksBySubphase = {};
    var _placedBySubphase = new Set();
    orderedTasks.forEach(function(t) {
      if (t.type === 'phase') return;
      var spId = t.subphaseId
        || (state.gantt && state.gantt[t.id] && state.gantt[t.id]._subphaseId)
        || null;
      if (spId) {
        if (!_tasksBySubphase[spId]) _tasksBySubphase[spId] = [];
        _tasksBySubphase[spId].push(t);
        _placedBySubphase.add(t.id);
      }
    });

    // Reconstruire la liste : phase → [sous-phase → ses tâches] → tâches sans sous-phase
    var _withSP = [];
    orderedTasks.forEach(function(t) {
      if (_placedBySubphase.has(t.id)) return; // sera placé sous sa sous-phase
      _withSP.push(t);
      if (t.type === 'phase') {
        // Injecter chaque sous-phase + ses tâches immédiatement après
        _spList.filter(function(sp){ return sp.phaseId === t.id; }).forEach(function(sp) {
          _withSP.push({ _isSubphaseRow: true, id: sp.id, label: sp.label, phaseId: sp.phaseId });
          (_tasksBySubphase[sp.id] || []).forEach(function(task) { _withSP.push(task); });
        });
      }
    });
    orderedTasks = _withSP;
  }

  // ── 2. Helpers ────────────────────────────────────────────────────────────
  function _expDates(t) {
    var ov = (state.gantt || {})[t.id] || {};
    return { start: ov.start || t.start || '', end: ov.end || t.end || '' };
  }
  function _expDurDays(start, end) {
    if (!start || !end) return 0;
    var ms = new Date(end) - new Date(start);
    return Math.max(0, Math.round(ms / 86400000));
  }

  // ── 3. Construire les lignes ────────────────────────────────────────────── ──────────────────────────────────────────────
  var rows = [];
  var currentMasterPhaseId = null;  // ID de la phase maître courante
  var currentSubphaseId    = null;  // ID de la sous-phase courante (null = pas de sous-phase active)

  orderedTasks.forEach(function(t) {
    // ── Ligne sous-phase injectée ──────────────────────────────────────────
    if (t._isSubphaseRow) {
      currentSubphaseId = t.id;
      rows.push({
        id:           t.id,
        type:         'phase',
        libelle:      t.label || '',
        phase:        t.phaseId,        // ← colonne "phase" = ID de la phase maître
        debut:        '',
        fin:          '',
        duree_j:      0,
        responsable:  '',
        participants: '',
        rag:          '',
        commentaire:  '',
        avancement:   0,
        predecesseurs:'',
        domaine:      '',
        entite:       ''
      });
      return;
    }

    var isPhaseRow = (t.type === 'phase');
    if (isPhaseRow) {
      currentMasterPhaseId = t.id;
      currentSubphaseId    = null; // reset quand on change de phase maître
    }

    var ov     = (state.gantt || {})[t.id] || {};
    var dates  = _expDates(t);
    var rawPct = ov.pct !== undefined ? ov.pct : (t.pct || 0);
    var pct    = Math.round(rawPct * 100);
    var resp   = ov.resp  || t.resp  || '';
    var parts  = Array.isArray(t.participants) ? t.participants.join(', ') : (t.participants || '');
    var rag    = ov.rag   || t.rag   || '';
    var comm   = ov.commentaire || t.commentaire || '';
    var pred   = Array.isArray(t.pred) ? t.pred.join(', ') : (t.pred || '');
    var dom    = (t.domains && t.domains[0]) || t.domain || t.domaine || '';
    var side   = t.side   || ov.side || '';

    // Colonne "phase" :
    // - phases maîtres → vide
    // - tâches/jalons → sub-phase réelle de la tâche (si elle appartient à une sous-phase),
    //   sinon sous-phase courante (positionnelle), sinon phase maître courante
    var _taskRealSpId = t.subphaseId
      || (state.gantt && state.gantt[t.id] && state.gantt[t.id]._subphaseId)
      || null;
    var phaseColValue = isPhaseRow ? '' : (_taskRealSpId || currentSubphaseId || currentMasterPhaseId || '');

    rows.push({
      id:           t.id,
      type:         t.type === 'jalon' ? 'jalon' : (isPhaseRow ? 'phase' : 'tâche'),
      libelle:      t.label || '',
      phase:        phaseColValue,
      debut:        dates.start,
      fin:          dates.end,
      duree_j:      _expDurDays(dates.start, dates.end),
      responsable:  resp,
      participants: parts,
      rag:          rag,
      commentaire:  comm,
      avancement:   pct,
      predecesseurs:pred,
      domaine:      dom,
      entite:       side
    });

    // Sous-tâches liées à cette tâche
    var subs = ((state.ganttSubtasks || {})[t.id]) || [];
    subs.forEach(function(st) {
      rows.push({
        id:           st.id || '',
        type:         'sous-tâche',
        libelle:      st.label || '',
        phase:        _taskRealSpId || currentSubphaseId || currentMasterPhaseId || '',
        debut:        st.start || '',
        fin:          st.end   || '',
        duree_j:      _expDurDays(st.start, st.end),
        responsable:  st.owner || '',
        participants: '',
        rag:          '',
        commentaire:  st.commentaire || '',
        avancement:   st.pct || 0,
        predecesseurs:'',
        domaine:      '',
        entite:       ''
      });
    });
  });

  // ── 4. Préparer les données pour le format "Export CBS" ──────────────────
  // Convertir avancement en "50%" et capitaliser les types
  var _TYPE_LABEL = { phase: 'Phase', tâche: 'Tâche', jalon: 'Jalon', 'sous-tâche': 'Sous-tâche' };
  var exportRows = rows.map(function(r) {
    return {
      'ID':             r.id,
      'Type':           _TYPE_LABEL[r.type] || r.type,
      'Libellé':        r.libelle,
      'Phase':          r.phase,
      'Début':          r.debut,
      'Fin':            r.fin,
      'Durée (j)':      r.duree_j || '',
      'Resp.':          r.responsable,
      '% Avancement':  (r.avancement != null ? r.avancement : 0) + '%',
      'Prédécesseurs':  r.predecesseurs,
      // Colonnes extra — préservées pour le re-import
      'Participants':   r.participants,
      'RAG':            r.rag,
      'Commentaire':    r.commentaire,
      'Domaine':        r.domaine,
      'Entité':         r.entite
    };
  });

  // ── 5. Générer le classeur ExcelJS ────────────────────────────────────────
  var wb = new ExcelJS.Workbook();
  wb.creator = 'BOA Programme Pilotage';
  wb.created = new Date();

  var ws = wb.addWorksheet('Export CBS');

  // ── Bannière (3 lignes + 1 vide) — même structure que le fichier d'import ──
  var proj = ((state.programme.projects || []).find(function(p){ return p.id === state.currentProjectId; }) || {});
  var pname = proj.name || 'BOA';
  var pnameFile = pname.replace(/[^a-zA-Z0-9_\-]/g, '_');
  var exportDate = new Date().toLocaleDateString('fr-FR', { day:'numeric', month:'long', year:'numeric' });
  var ts   = new Date().toISOString().slice(0, 10);

  var _CBSblue  = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F3864' } };
  var _navyFont = { bold: true, color: { argb: 'FFFFFFFF' }, name: 'Arial', size: 12 };

  // Ligne 1 : CBS — Capital Banking Solutions
  ws.addRow(['CBS  —  Capital Banking Solutions']);
  ws.mergeCells('A1:O1');
  var r1 = ws.getRow(1); r1.height = 22;
  r1.getCell(1).fill = _CBSblue; r1.getCell(1).font = _navyFont;
  r1.getCell(1).alignment = { vertical: 'middle', horizontal: 'center' };

  // Ligne 2 : Nom du projet
  ws.addRow([pname + '  —  Pilotage Programme']);
  ws.mergeCells('A2:O2');
  var r2 = ws.getRow(2); r2.height = 20;
  r2.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2E4A7A' } };
  r2.getCell(1).font = { bold: true, color: { argb: 'FFFFFFFF' }, name: 'Arial', size: 11 };
  r2.getCell(1).alignment = { vertical: 'middle', horizontal: 'center' };

  // Ligne 3 : Retroplanning Gantt | date | confidentiel
  ws.addRow(['Retroplanning Gantt — ' + pname + '     |     Exporté le : ' + exportDate + '     |     Document Confidentiel']);
  ws.mergeCells('A3:O3');
  var r3 = ws.getRow(3); r3.height = 16;
  r3.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF3A5C9C' } };
  r3.getCell(1).font = { color: { argb: 'FFD0DCF0' }, name: 'Arial', size: 9, italic: true };
  r3.getCell(1).alignment = { vertical: 'middle', horizontal: 'center' };

  // Ligne 4 : vide
  ws.addRow([]);
  ws.getRow(4).height = 6;

  // ── En-têtes des colonnes (ligne 5) ────────────────────────────────────────
  ws.columns = [
    { key: 'ID',            width: 20 },
    { key: 'Type',          width: 12 },
    { key: 'Libellé',       width: 44 },
    { key: 'Phase',         width: 20 },
    { key: 'Début',         width: 14 },
    { key: 'Fin',           width: 14 },
    { key: 'Durée (j)',     width: 10 },
    { key: 'Resp.',         width: 24 },
    { key: '% Avancement',  width: 14 },
    { key: 'Prédécesseurs', width: 22 },
    { key: 'Participants',  width: 28 },
    { key: 'RAG',           width: 7  },
    { key: 'Commentaire',   width: 30 },
    { key: 'Domaine',       width: 16 },
    { key: 'Entité',        width: 16 }
  ];
  var hdrRow = ws.addRow(['ID','Type','Libellé','Phase','Début','Fin','Durée (j)','Resp.','% Avancement','Prédécesseurs','Participants','RAG','Commentaire','Domaine','Entité']);
  hdrRow.height    = 22;
  hdrRow.font      = { bold: true, color: { argb: 'FFFFFFFF' }, name: 'Arial', size: 11 };
  hdrRow.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F3864' } };
  hdrRow.alignment = { vertical: 'middle', horizontal: 'center' };

  // Gel : lignes 1-5 (bannière + en-tête)
  ws.views = [{ state: 'frozen', ySplit: 5 }];

  // ── Lignes de données (à partir de la ligne 6) ─────────────────────────────
  var _FILL_PHASE  = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1565C0' } };
  var _FILL_SUBPH  = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFBBDEFB' } };
  var _FILL_JALON  = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF9C4' } };
  var _FILL_ALT    = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F9FF' } };
  var _FILL_SUBST  = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F0FF' } };

  var dataCount = 0;
  exportRows.forEach(function(r, i) {
    var rowArr = [r['ID'], r['Type'], r['Libellé'], r['Phase'], r['Début'], r['Fin'],
                  r['Durée (j)'], r['Resp.'], r['% Avancement'], r['Prédécesseurs'],
                  r['Participants'], r['RAG'], r['Commentaire'], r['Domaine'], r['Entité']];
    var row = ws.addRow(rowArr);
    row.alignment = { vertical: 'middle' };
    dataCount++;

    var type = (r['Type'] || '').toLowerCase();
    if (type === 'phase') {
      // Sous-phase (a une Phase parente non vide) vs Phase maître
      var hasParent = !!(r['Phase'] && r['Phase'].trim());
      row.fill = hasParent ? _FILL_SUBPH : _FILL_PHASE;
      row.font = hasParent
        ? { bold: true, color: { argb: 'FF0D3B6E' }, name: 'Arial', size: 10 }
        : { bold: true, color: { argb: 'FFFFFFFF' }, name: 'Arial', size: 10 };
      row.height = 20;
    } else if (type === 'jalon') {
      row.fill = _FILL_JALON;
      row.font = { bold: true, name: 'Arial', size: 10 };
    } else if (type === 'sous-tâche') {
      if (i % 2 === 1) row.fill = _FILL_SUBST;
      row.font = { italic: true, color: { argb: 'FF3949AB' }, name: 'Arial', size: 10 };
      row.getCell(3).alignment = { indent: 2 };
    } else {
      if (i % 2 === 1) row.fill = _FILL_ALT;
      row.font = { name: 'Arial', size: 10 };
    }
  });

  // ── Ligne footer ────────────────────────────────────────────────────────────
  var footerText = dataCount + ' enregistrements  —  Retroplanning Gantt — ' + pname;
  var footerRow = ws.addRow([footerText]);
  ws.mergeCells('A' + (5 + dataCount + 1) + ':O' + (5 + dataCount + 1));
  footerRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
  footerRow.getCell(1).font = { italic: true, color: { argb: 'FF64748B' }, name: 'Arial', size: 9 };
  footerRow.getCell(1).alignment = { vertical: 'middle', horizontal: 'center' };
  footerRow.height = 14;

  // ── Validations ────────────────────────────────────────────────────────────
  ws.dataValidations.add('B6:B2000', {
    type: 'list', allowBlank: true,
    formulae: ['"Phase,Tâche,Sous-tâche,Jalon"'],
    showErrorMessage: true, errorTitle: 'Type invalide',
    error: 'Valeurs acceptées : Phase, Tâche, Sous-tâche, Jalon'
  });
  ws.dataValidations.add('L6:L2000', {
    type: 'list', allowBlank: true, formulae: ['"R,O,G"'],
    showErrorMessage: true, errorTitle: 'RAG invalide', error: 'R, O ou G'
  });
  ws.dataValidations.add('O6:O2000', {
    type: 'list', allowBlank: true,
    formulae: ['"BOA,CBS,CBS + BOA,Externe"'],
    showErrorMessage: true, errorTitle: 'Entité invalide',
    error: 'BOA, CBS, CBS + BOA ou Externe'
  });

  // ── 6. Téléchargement ──────────────────────────────────────────────────────
  try {
    var buf  = await wb.xlsx.writeBuffer();
    var blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    var url  = URL.createObjectURL(blob);
    var a    = document.createElement('a');
    a.href     = url;
    a.download = pnameFile + '_gantt_' + ts + '.xlsx';
    document.body.appendChild(a);
    a.click();
    setTimeout(function(){ URL.revokeObjectURL(url); a.remove(); }, 1500);
    showToast('✅ Planning exporté — ' + dataCount + ' lignes. Re-importable via 📥 Importer.', 3000);
  } catch(e) {
    console.error('[exportGanttPlanning]', e);
    showToast('❌ Erreur export : ' + e.message, 3500);
  }
}
