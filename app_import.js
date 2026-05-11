// ═══════════════════════════════════════════════════════════════════════════
// BOA Programme Pilotage — Modal d'import de données
// Dépendances : state, DB (définis dans app_main.js et db_layer_v2.js)
// ═══════════════════════════════════════════════════════════════════════════

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTES PROGRAMME
// ─────────────────────────────────────────────────────────────────────────────
const PROJECT_COLORS = [
  '#1565C0','#2E7D52','#E8702A','#6B21A8',
  '#E63329','#0891B2','#D97706','#15803D',
  '#7B3F00','#374151',
];

let _progProjectFilter = 'active'; // 'active' | 'archived' | 'all'
let _progGanttExpanded = {};       // { projectId: boolean } — lignes Gantt dépliées

// ─────────────────────────────────────────────────────────────────────────────
// MODULES & TEMPLATES PROJETS
// ─────────────────────────────────────────────────────────────────────────────
const _PROJ_MODULES = [
  { id:'dashboard',   tab:'dashboard',        icon:'📊', label:'Dashboard',     desc:'Vue synthétique', always:true  },
  { id:'gantt',       tab:'gantt',            icon:'📅', label:'Planning',      desc:'Gantt & jalons', always:false },
  { id:'actions',     tab:'actions',          icon:'✅', label:'Actions',       desc:'Plan d\'Actions', always:false },
  { id:'risques',     tab:'risques',          icon:'⚠️', label:'Risques',       desc:'Registre',       always:false },
  { id:'impacts',     tab:'impacts',          icon:'💥', label:'Impacts',       desc:'Dérive planning & budget', always:false },
  { id:'arbitrages',  tab:'arbitrages',       icon:'⚖️', label:'Arbitrages',    desc:'Décisions',      always:false },
  { id:'gaps',        tab:'gaps',             icon:'🔍', label:'GAPs CBS',      desc:'Écarts CBS',     always:false },
  { id:'perimetre',   tab:'perimetremodules', icon:'🗂️', label:'Périmètre',     desc:'Modules CBS',    always:false },
  { id:'technique',   tab:'technique',        icon:'🔧', label:'Technique',     desc:'Architecture',   always:false },
  { id:'analyse',     tab:'analyse',          icon:'📈', label:'Analyse TCD',   desc:'Tableaux croisés', always:false },
];

const _PROJ_TEMPLATES = [
  { id:'cbs_full', icon:'🏛', label:'CBS Complet',  color:'#1565C0',
    desc:'Tous les modules CBS activés',
    modules:['dashboard','gantt','actions','risques','impacts','arbitrages','gaps','perimetre','technique','analyse'] },
  { id:'generic',  icon:'📋', label:'Générique',    color:'#2E7D52',
    desc:'Gestion de projet standard',
    modules:['dashboard','gantt','actions','risques','impacts'] },
  { id:'light',    icon:'⚡', label:'Light',        color:'#E8702A',
    desc:'Dashboard + Actions + Risques',
    modules:['dashboard','actions','risques','impacts'] },
  { id:'custom',   icon:'🎛️', label:'Personnalisé', color:'#6B21A8',
    desc:'Choisissez vos modules',
    modules:[] },
];

// Mapping tab → module (pour appliquer la visibilité)
const _TAB_MODULE_MAP = {};
_PROJ_MODULES.forEach(m => { _TAB_MODULE_MAP[m.tab] = m.id; });

// ─────────────────────────────────────────────────────────────────────────────
// SOURCE DE DONNÉES PROJET (CBS vs Vierge)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Retourne true si le projet utilise les données CBS statiques (actions, gantt, arbitrages, gaps).
 * Les projets existants sans flag dataSource héritent du comportement CBS (rétrocompatibilité).
 * @param {string} [projId] - ID du projet (par défaut : projet courant)
 */
function _projUsesCBS(projId) {
  const id   = projId || state.currentProjectId;
  const proj = (state.programme.projects || []).find(p => p.id === id);
  return !proj || proj.dataSource !== 'blank';
}

/** HTML du bandeau "projet vierge" affiché dans les onglets données */
function _blankProjectBanner(tabLabel) {
  return `<div style="text-align:center;padding:40px 20px;background:#fafbfc;border:2px dashed #e2e8f0;border-radius:12px;margin:16px 0;">
    <div style="font-size:28px;margin-bottom:8px;">🗂️</div>
    <div style="font-size:15px;font-weight:700;color:#334155;margin-bottom:6px;">Projet vierge</div>
    <div style="font-size:13px;color:#64748b;margin-bottom:20px;">Aucun ${tabLabel} configuré pour ce projet.<br>Ajoutez des éléments manuellement ou importez un fichier Excel.</div>
    <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap;">
      <button onclick="_openImportDataModal()"
        style="background:#1565C0;color:white;border:none;border-radius:8px;padding:9px 20px;font-size:13px;font-weight:600;cursor:pointer;box-shadow:0 2px 8px rgba(21,101,192,.25);">
        📥 Importer des données
      </button>
      <button onclick="_downloadImportTemplate()"
        style="background:white;color:#1565C0;border:1.5px solid #1565C0;border-radius:8px;padding:9px 20px;font-size:13px;font-weight:600;cursor:pointer;">
        📄 Télécharger le template Excel
      </button>
    </div>
    <div style="font-size:11px;color:#94a3b8;margin-top:10px;">Téléchargez d'abord le template, remplissez-le, puis importez-le dans votre projet.</div>
  </div>`;
}

/** Bascule la source de données du projet courant (cbs ↔ blank) */
function _switchProjDataSource(src) {
  const proj = (state.programme.projects || []).find(p => p.id === state.currentProjectId);
  if (!proj) { showToast('⚠️ Aucun projet actif.', 2000); return; }
  if (!confirm(src === 'cbs'
    ? 'Activer les données CBS dans ce projet ?\nLes données CBS (actions, arbitrages, GAPs, Gantt) seront visibles dans ce projet.'
    : 'Passer en mode vierge ?\nLes données CBS seront masquées (vos données personnalisées sont conservées).'
  )) return;
  proj.dataSource = src;
  _saveProgrammeData('Source données projet', src);
  if (typeof renderActions     === 'function') renderActions();
  if (typeof renderArbitrages  === 'function') renderArbitrages();
  if (typeof renderGaps        === 'function') renderGaps();
  if (typeof renderPerimetre   === 'function') renderPerimetre();
  if (typeof renderGantt       === 'function') renderGantt();
  showToast(src === 'cbs' ? '✅ Données CBS activées.' : '🗑️ Projet basculé en mode vierge.', 2500);
}

// ─────────────────────────────────────────────────────────────────────────────
// IMPORT DONNÉES PROJET (Excel / CSV)
// ─────────────────────────────────────────────────────────────────────────────

/** Ouvre la modale d'import de données (ou la réaffiche si déjà créée) */
function _openImportDataModal() {
  const modal = document.getElementById('import-data-modal');
  if (modal) {
    // Réinitialiser la zone de prévisualisation et le bouton Importer
    const preview = modal.querySelector('#import-preview');
    if (preview) { preview.style.display = 'none'; preview.innerHTML = ''; }
    const opts = modal.querySelector('#import-options');
    if (opts) opts.style.display = 'none';
    const confirmBtn = modal.querySelector('#import-confirm-btn');
    if (confirmBtn) { confirmBtn.disabled = true; confirmBtn.style.background = '#94a3b8'; confirmBtn.style.cursor = 'not-allowed'; }
    window._importParsedData = null;
    window._importOwnerResolution = {};
    // Supprimer l'ancien panel de validation owners s'il existe
    const oldPanel = modal.querySelector('#import-owner-validation');
    if (oldPanel) oldPanel.remove();
    modal.style.display = 'flex';
    return;
  }
  // Créer la modale dynamiquement
  const m = document.createElement('div');
  m.id = 'import-data-modal';
  m.style.cssText = 'position:fixed;inset:0;z-index:11000;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;padding:20px;';
  m.onclick = function(e) { if (e.target === m) m.style.display = 'none'; };
  m.innerHTML = `
    <div style="background:white;border-radius:14px;max-width:540px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,.35);overflow:hidden;">
      <div style="background:#1565C0;padding:16px 20px;display:flex;justify-content:space-between;align-items:center;">
        <span style="color:white;font-weight:700;font-size:15px;">📥 Importer des données — ${(state.programme.projects||[]).find(p=>p.id===state.currentProjectId)?.name||'Projet'}</span>
        <button onclick="document.getElementById('import-data-modal').style.display='none'" style="background:none;border:none;color:white;font-size:20px;cursor:pointer;">✕</button>
      </div>
      <div style="padding:24px;">
        <p style="font-size:13px;color:#475569;margin:0 0 16px;">Importez un fichier Excel (.xlsx) contenant vos données de projet.<br>
          <span style="color:#1565C0;cursor:pointer;text-decoration:underline;" onclick="_downloadImportTemplate()">Télécharger le template Excel</span> pour connaître le format attendu.</p>

        <div style="border:2px dashed #c7d2fe;border-radius:10px;padding:24px;text-align:center;cursor:pointer;background:#f0f4ff;margin-bottom:16px;"
          onclick="document.getElementById('import-file-input').click()"
          ondragover="event.preventDefault();this.style.background='#dbeafe';"
          ondragleave="this.style.background='#f0f4ff';"
          ondrop="_onImportFileDrop(event)">
          <div style="font-size:28px;margin-bottom:6px;">📂</div>
          <div style="font-size:13px;font-weight:600;color:#3730a3;">Cliquez pour sélectionner un fichier</div>
          <div style="font-size:11px;color:#6b7280;margin-top:4px;">ou glissez-déposez ici · .xlsx ou .csv acceptés</div>
        </div>
        <input type="file" id="import-file-input" accept=".xlsx,.csv" style="display:none" onchange="_onImportFileSelect(event)">

        <div id="import-preview" style="display:none;font-size:12px;background:#f8fafc;border-radius:8px;padding:12px;margin-bottom:16px;border:1px solid #e2e8f0;"></div>

        <!-- ── Options d'import ───────────────────────────────────── -->
        <div id="import-options" style="display:none;margin-bottom:16px;">

          <!-- Ce qu'on importe -->
          <div style="font-size:12px;font-weight:700;color:#1e293b;margin-bottom:8px;">📋 Données à importer</div>
          <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:14px;">
            <label style="display:flex;align-items:center;gap:6px;font-size:12px;color:#374151;background:#f1f5f9;border:1.5px solid #e2e8f0;border-radius:6px;padding:6px 10px;cursor:pointer;user-select:none;">
              <input type="checkbox" id="imp-chk-planning" checked style="width:14px;height:14px;accent-color:#0891B2;">
              <span>📅 Planning / Gantt</span>
            </label>
            <label style="display:flex;align-items:center;gap:6px;font-size:12px;color:#374151;background:#f1f5f9;border:1.5px solid #e2e8f0;border-radius:6px;padding:6px 10px;cursor:pointer;user-select:none;">
              <input type="checkbox" id="imp-chk-actions" checked style="width:14px;height:14px;accent-color:#1565C0;">
              <span>✅ Actions</span>
            </label>
            <label style="display:flex;align-items:center;gap:6px;font-size:12px;color:#374151;background:#f1f5f9;border:1.5px solid #e2e8f0;border-radius:6px;padding:6px 10px;cursor:pointer;user-select:none;">
              <input type="checkbox" id="imp-chk-arb" checked style="width:14px;height:14px;accent-color:#7B1FA2;">
              <span>⚖️ Arbitrages</span>
            </label>
            <label style="display:flex;align-items:center;gap:6px;font-size:12px;color:#374151;background:#f1f5f9;border:1.5px solid #e2e8f0;border-radius:6px;padding:6px 10px;cursor:pointer;user-select:none;">
              <input type="checkbox" id="imp-chk-gaps" checked style="width:14px;height:14px;accent-color:#B71C1C;">
              <span>🔴 GAPs</span>
            </label>
          </div>

          <!-- Mode : remplacer ou compléter -->
          <div style="font-size:12px;font-weight:700;color:#1e293b;margin-bottom:8px;">🔄 Mode d'import</div>
          <div style="display:flex;gap:8px;">
            <label id="imp-mode-merge-lbl" style="display:flex;align-items:center;gap:7px;font-size:12px;color:#374151;background:#f0fdf4;border:2px solid #16a34a;border-radius:6px;padding:8px 12px;cursor:pointer;user-select:none;flex:1;">
              <input type="radio" name="imp-mode" value="merge" id="imp-mode-merge" checked style="width:14px;height:14px;accent-color:#16a34a;">
              <div>
                <div style="font-weight:700;color:#15803d;">➕ Compléter</div>
                <div style="color:#4b5563;font-size:11px;margin-top:1px;">Ajoute les nouvelles lignes sans toucher à l'existant</div>
              </div>
            </label>
            <label id="imp-mode-replace-lbl" style="display:flex;align-items:center;gap:7px;font-size:12px;color:#374151;background:#f8fafc;border:2px solid #e2e8f0;border-radius:6px;padding:8px 12px;cursor:pointer;user-select:none;flex:1;">
              <input type="radio" name="imp-mode" value="replace" id="imp-mode-replace" style="width:14px;height:14px;accent-color:#dc2626;">
              <div>
                <div style="font-weight:700;color:#b91c1c;">🗑️ Remplacer</div>
                <div style="color:#4b5563;font-size:11px;margin-top:1px;">Supprime les données existantes avant d'importer</div>
              </div>
            </label>
          </div>
        </div>

        <div style="display:flex;gap:10px;justify-content:flex-end;">
          <button onclick="document.getElementById('import-data-modal').style.display='none'"
            style="padding:9px 18px;border:1.5px solid #cbd5e1;border-radius:7px;background:white;font-size:13px;font-weight:600;cursor:pointer;color:#475569;">Annuler</button>
          <button id="import-confirm-btn" onclick="_confirmImportData()" disabled
            style="padding:9px 20px;border:none;border-radius:7px;background:#94a3b8;color:white;font-size:13px;font-weight:600;cursor:not-allowed;">
            ✅ Importer
          </button>
        </div>
      </div>
    </div>`;
  document.body.appendChild(m);
}

/** Drag-and-drop handler */
function _onImportFileDrop(event) {
  event.preventDefault();
  event.currentTarget.style.background = '#f0f4ff';
  const file = event.dataTransfer.files[0];
  if (file) {
    const opts = document.getElementById('import-options');
    if (opts) opts.style.display = 'none';
    _processImportFile(file);
  }
}

/** File input change handler */
function _onImportFileSelect(event) {
  const file = event.target.files[0];
  if (file) {
    // Masquer les options et le preview pendant la lecture
    const opts = document.getElementById('import-options');
    if (opts) opts.style.display = 'none';
    _processImportFile(file);
  }
}

// Stockage temporaire des données parsées en attente de confirmation
window._importParsedData = null;

/** Lit et parse le fichier sélectionné */
/** Extrait une valeur lisible depuis n'importe quelle cellule ExcelJS (richText, formule, date, nombre…) */
function _excelCellToStr(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return String(v);
  if (v instanceof Date) return v.toISOString().split('T')[0];
  if (Array.isArray(v)) return v.map(i => (i && i.text) ? i.text : '').join('');
  if (typeof v === 'object') {
    if (v.richText) return v.richText.map(i => (i && i.text) ? i.text : '').join('');
    if (v.result !== undefined) return String(v.result);
    if (v.text !== undefined) return String(v.text);
    if (v.error) return '';
  }
  return String(v);
}

async function _processImportFile(file) {
  const preview = document.getElementById('import-preview');
  const btn = document.getElementById('import-confirm-btn');
  if (preview) { preview.style.display = 'block'; preview.innerHTML = '⏳ Lecture du fichier…'; }

  try {
    if (file.name.endsWith('.csv')) {
      // ── CSV simple ─────────────────────────────────────────────────────
      const text = await file.text();
      const lines = text.split('\n').filter(l => l.trim());
      const headers = lines[0].split(';').map(h => h.trim().replace(/^"|"$/g,''));
      const rows = lines.slice(1).map(l => {
        const vals = l.split(';').map(v => v.trim().replace(/^"|"$/g,''));
        const obj = {};
        headers.forEach((h, i) => { obj[h] = vals[i] || ''; });
        return obj;
      });
      window._importParsedData = { type: 'csv', rows, headers, fileName: file.name };
      _showImportPreview(rows, headers, file.name);
    } else {
      // ── Excel avec ExcelJS ─────────────────────────────────────────────
      if (typeof ExcelJS === 'undefined') {
        if (preview) preview.innerHTML = '⚠️ Librairie Excel non disponible. Utilisez un fichier CSV.';
        return;
      }
      const buf = await file.arrayBuffer();
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(buf);
      const allSheets = {};
      wb.eachSheet(ws => {
        const headers = [];
        const rows = [];
        ws.eachRow((row, ri) => {
          if (ri === 1) { row.values.slice(1).forEach(v => headers.push(_excelCellToStr(v).trim())); }
          else {
            const obj = {};
            // _excelCellToStr gère richText, formules, dates, nombres — pas de String() brut
            headers.forEach((h, i) => {
              const raw = row.values[i+1];
              // Pour les dates ExcelJS (cellules de type date), conserver l'objet Date JS
              obj[h] = (raw instanceof Date) ? raw : _excelCellToStr(raw);
            });
            if (Object.values(obj).some(v => v instanceof Date || String(v).trim())) rows.push(obj);
          }
        });
        allSheets[ws.name] = { headers, rows };
      });
      window._importParsedData = { type: 'xlsx', sheets: allSheets, fileName: file.name };
      // Prévisualiser le premier sheet non vide
      const firstSheet = Object.values(allSheets).find(s => s.rows.length > 0);
      const sheetName = Object.keys(allSheets).find(k => allSheets[k].rows.length > 0) || '';
      if (firstSheet) _showImportPreview(firstSheet.rows, firstSheet.headers, file.name, sheetName, Object.keys(allSheets));
      else { if (preview) preview.innerHTML = '⚠️ Fichier vide ou format non reconnu.'; return; }
    }
    // Validation des responsables/participants du planning — active le bouton si tout est OK
    _validateImportOwners();
  } catch(e) {
    if (preview) preview.innerHTML = '❌ Erreur de lecture : ' + e.message;
    window._importParsedData = null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// RESPONSABLES PROVISOIRES — import Gantt + mapping post-import
// ─────────────────────────────────────────────────────────────────────────────

/** Active le bouton Importer */
function _enableImportBtn() {
  const btn = document.getElementById('import-confirm-btn');
  if (btn) { btn.disabled = false; btn.style.background = '#1565C0'; btn.style.cursor = 'pointer'; }
}

/**
 * Scanne les noms (responsable + participants) du planning parsé.
 * Règles :
 *  – responsable inconnu → remplacé par le Chef de Projet du projet courant (si défini)
 *  – participant inconnu → créé comme responsable provisoire (_placeholder:true)
 * L'import n'est JAMAIS bloqué.
 */
function _validateImportOwners() {
  window._importOwnerResolution = {};

  const d = window._importParsedData;
  if (!d) { _enableImportBtn(); return; }

  // Nettoyer l'ancien panel
  const old = document.getElementById('import-owner-validation');
  if (old) old.remove();

  // Récupérer les lignes de la feuille Planning
  let planRows = [];
  if (d.sheets) {
    const planKey = Object.keys(d.sheets).find(k =>
      k.toLowerCase().includes('plan') || k.toLowerCase().includes('gantt')
    );
    if (planKey) planRows = d.sheets[planKey].rows || [];
  } else if (d.rows) {
    planRows = d.rows;
  }

  if (!planRows.length) { _enableImportBtn(); return; }

  // Chef de Projet du projet courant
  const currentProj = (state.programme?.projects || []).find(p => p.id === state.currentProjectId);
  const cpName      = (currentProj?.chefDeProjet || '').trim();

  // Référentiel owners courant
  const knownOwners = typeof getOwnersList    === 'function' ? getOwnersList()    : [];
  const ownerRecs   = typeof getOwnerRecords  === 'function' ? getOwnerRecords()  : [];
  const knownLower  = new Set(knownOwners.map(n => n.toLowerCase()));

  // Collecter responsables et participants séparément
  const unknownResps  = new Set(); // colonne "responsable"
  const unknownParts  = new Set(); // colonne "participants"

  planRows.forEach(r => {
    const resp = String(r['responsable'] || r['Responsable'] || r['resp'] || r['Resp'] || '').trim();
    if (resp && !knownLower.has(resp.toLowerCase())) unknownResps.add(resp);
    const parts = String(r['participants'] || r['Participants'] || '').trim();
    if (parts) parts.split(/[,;]+/).forEach(p => {
      const t = p.trim();
      if (t && !knownLower.has(t.toLowerCase())) unknownParts.add(t);
    });
  });

  if (!unknownResps.size && !unknownParts.size) { _enableImportBtn(); return; }

  // ── Règle 1 : responsables inconnus → Chef de Projet ────────────────────
  let cpMapped = 0;
  if (cpName) {
    unknownResps.forEach(name => {
      window._importOwnerResolution[name] = { action: 'map', mappedTo: cpName };
      cpMapped++;
    });
    // S'assurer que le CP existe dans le référentiel
    if (!knownLower.has(cpName.toLowerCase())) {
      if (!ownerRecs.find(o => o.name.toLowerCase() === cpName.toLowerCase())) {
        ownerRecs.push({ name: cpName, side: '', interventionType: '', domain: '', email: '' });
        if (typeof _setOwnerRecords === 'function') _setOwnerRecords(ownerRecs);
        knownLower.add(cpName.toLowerCase()); // màj locale pour la suite
      }
    }
  }
  // Sans CP défini → les responsables inconnus sont créés comme provisoires aussi
  if (!cpName) {
    unknownResps.forEach(name => { unknownParts.add(name); });
  }

  // ── Règle 2 : participants inconnus → responsables provisoires ───────────
  const created = [];
  // Recharger les recs en cas de màj CP ci-dessus
  const ownerRecsNow = typeof getOwnerRecords === 'function' ? getOwnerRecords() : ownerRecs;
  unknownParts.forEach(name => {
    // Ne pas créer si déjà dans le référentiel (ou si c'est le CP qu'on vient d'ajouter)
    if (!ownerRecsNow.find(o => o.name.toLowerCase() === name.toLowerCase())) {
      ownerRecsNow.push({ name, side: '', interventionType: '', domain: '', email: '', _placeholder: true });
      created.push(name);
    }
  });
  if (created.length && typeof _setOwnerRecords === 'function') {
    _setOwnerRecords(ownerRecsNow);
  }

  // ── Notice informative (non bloquante) ───────────────────────────────────
  _renderOwnerImportNotice(cpMapped, cpName, created);
  _enableImportBtn();
}

/**
 * Notice informative (non bloquante) résumant les décisions prises sur les noms inconnus.
 * @param {number}   cpMapped  - Nombre de responsables redirigés vers le CP
 * @param {string}   cpName    - Nom du Chef de Projet ('' si non défini)
 * @param {string[]} created   - Noms des participants créés comme provisoires
 */
function _renderOwnerImportNotice(cpMapped, cpName, created) {
  if (!cpMapped && !created.length) return; // rien à signaler

  const modal = document.getElementById('import-data-modal');
  if (!modal) return;
  const btnBar = modal.querySelector('[style*="justify-content:flex-end"]');
  if (!btnBar) return;

  const lines = [];
  if (cpMapped && cpName) {
    lines.push(`<span>👤 <b>${cpMapped} responsable(s) inconnu(s)</b> redirigé(s) vers le Chef de Projet : <b>${escHtml(cpName)}</b>.</span>`);
  } else if (cpMapped && !cpName) {
    lines.push(`<span>⚠️ <b>${cpMapped} responsable(s) inconnu(s)</b> — <span style="color:#dc2626;">aucun Chef de Projet défini</span>, créés comme provisoires.</span>`);
  }
  if (created.length) {
    lines.push(`<span>🔖 <b>${created.length} participant(s) inconnu(s)</b> créés comme responsables provisoires (0 droits).</span>`);
  }

  const configurerBtn = created.length
    ? `<button type="button" class="btn btn-sm" style="background:#d97706;color:#fff;border:none;flex-shrink:0;"
         onclick="document.getElementById('import-data-modal').style.display='none';setTimeout(_openOwnerMappingModal,250)">
         ⚙️ Configurer les provisoires
       </button>`
    : '';

  const notice = document.createElement('div');
  notice.id = 'import-owner-validation';
  notice.style.cssText = 'margin-bottom:12px;padding:9px 12px;background:#fffbeb;border:1px solid #fcd34d;border-radius:7px;font-size:12px;color:#92400e;display:flex;flex-direction:column;gap:4px;';
  notice.innerHTML = lines.join('') + (configurerBtn
    ? `<div style="display:flex;justify-content:flex-end;margin-top:4px;">${configurerBtn}</div>`
    : '');
  btnBar.parentNode.insertBefore(notice, btnBar);
}

// ── ANCIENNE IMPLÉMENTATION (panel bloquant) — REMPLACÉE par le flux auto-create ──
// Conservé temporairement pour éviter les erreurs si référencé ailleurs
function _renderOwnerValidationPanel(unknowns, knownList) {
  // Supprimer l'ancien panel si présent
  const old = document.getElementById('import-owner-validation');
  if (old) old.remove();

  // Trouver le conteneur : juste avant les boutons Annuler / Importer
  const modal = document.getElementById('import-data-modal');
  if (!modal) return;
  const btnBar = modal.querySelector('[style*="justify-content:flex-end"]') ||
                 modal.querySelector('div:last-of-type');
  if (!btnBar) return;

  const isAdmin  = document.body.classList.contains('admin-mode');
  const canWrite = isAdmin || document.body.classList.contains('editor-mode');
  const emptyRef = !knownList || knownList.length === 0; // référentiel vide

  if (!unknowns.length) {
    // Tous connus → afficher un badge succès discret
    const ok = document.createElement('div');
    ok.id = 'import-owner-validation';
    ok.style.cssText = 'margin-bottom:12px;padding:8px 12px;background:#f0fdf4;border:1px solid #86efac;border-radius:6px;font-size:12px;color:#15803d;display:flex;align-items:center;gap:6px;';
    ok.innerHTML = '✅ <b>Responsables / participants</b> : tous les noms reconnus dans le référentiel.';
    btnBar.parentNode.insertBefore(ok, btnBar);
    return;
  }

  // Bandeau d'avertissement si référentiel vide
  const emptyRefNotice = emptyRef
    ? `<div style="margin:6px 8px 2px;padding:7px 10px;background:#fff7ed;border:1px solid #fed7aa;border-radius:5px;font-size:11px;color:#92400e;">
         ℹ️ <b>Référentiel responsables vide.</b>
         Utilisez <b>+ Créer</b> pour ajouter chaque nom, <b>Créer tous</b> pour tout créer en un clic, ou <b>Ignorer tous</b> pour importer sans responsables.
       </div>`
    : '';

  const rows = unknowns.map((name, i) => {
    // Select "Mapper" — masqué si liste vide, visible sinon
    const opts = (knownList || []).map(o =>
      `<option value="${escHtml(o)}">${escHtml(o)}</option>`
    ).join('');
    const selectHtml = emptyRef
      ? `<span id="owner-map-sel-${i}" style="font-size:11px;color:#94a3b8;font-style:italic;flex:1;max-width:200px;">
           (référentiel vide)
         </span>
         <input type="hidden" id="owner-map-${i}" data-name="${escHtml(name)}" value="">`
      : `<label style="font-size:11px;color:#475569;white-space:nowrap;">Mapper vers :</label>
         <select id="owner-map-${i}" data-name="${escHtml(name)}"
           style="font-size:11px;padding:3px 6px;border:1px solid #cbd5e1;border-radius:4px;flex:1;max-width:200px;"
           onchange="_ownerPanelSelectChange(${i})">
           <option value="">— Choisir —</option>
           ${opts}
         </select>`;
    const createBtn = canWrite
      ? `<button type="button" class="btn btn-sm" style="background:#5B21B6;color:#fff;border:none;flex-shrink:0;"
           onclick="_ownerPanelCreate('${escHtml(name)}', ${i})" title="Créer ce responsable dans le référentiel">+ Créer</button>`
      : '';
    return `
      <div id="owner-row-${i}" style="display:flex;align-items:center;gap:8px;padding:7px 10px;background:${i%2?'#f8fafc':'#fff'};border-radius:4px;flex-wrap:wrap;">
        <span style="flex:1;min-width:160px;font-size:12px;font-weight:600;color:#dc2626;">⚠ ${escHtml(name)}</span>
        ${selectHtml}
        ${createBtn}
        <button type="button" class="btn btn-sm btn-ghost" style="flex-shrink:0;"
          onclick="_ownerPanelIgnore('${escHtml(name)}', ${i})" title="Ignorer ce nom (ne sera pas importé)">Ignorer</button>
        <span id="owner-status-${i}" style="font-size:11px;color:#64748b;min-width:55px;text-align:right;"></span>
      </div>`;
  }).join('');

  // Bouton "Créer tous" (si canWrite)
  const createAllBtn = canWrite
    ? `<button type="button" class="btn btn-sm" style="background:#5B21B6;color:#fff;border:none;"
         onclick="_ownerPanelCreateAll()" title="Créer tous les noms inconnus dans le référentiel">✨ Créer tous</button>`
    : '';

  const panel = document.createElement('div');
  panel.id = 'import-owner-validation';
  panel.style.cssText = 'margin-bottom:14px;border:1.5px solid #fca5a5;border-radius:8px;overflow:hidden;';
  panel.innerHTML = `
    <div style="background:#fef2f2;padding:9px 12px;font-size:12px;font-weight:700;color:#b91c1c;border-bottom:1px solid #fca5a5;display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
      ⚠️ <span>${unknowns.length} nom(s) non reconnu(s) dans le référentiel responsables</span>
      <span style="margin-left:auto;font-size:11px;font-weight:400;color:#64748b;">
        ${canWrite ? 'Créez, mappez' : 'Mappez'} ou ignorez chaque nom avant d'importer.
      </span>
    </div>
    ${emptyRefNotice}
    <div style="padding:6px 8px;display:flex;flex-direction:column;gap:3px;">${rows}</div>
    <div style="padding:8px 12px;background:#fef2f2;border-top:1px solid #fca5a5;display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;">
      <span id="owner-panel-status" style="font-size:11px;color:#64748b;flex:1;">
        Résolvez tous les noms pour activer le bouton Importer.
      </span>
      <div style="display:flex;gap:6px;">
        ${createAllBtn}
        <button type="button" class="btn btn-sm btn-ghost" onclick="_ownerPanelIgnoreAll()">Ignorer tous</button>
      </div>
    </div>`;
  btnBar.parentNode.insertBefore(panel, btnBar);
}

/** Appelé quand l'utilisateur sélectionne un owner existant dans le select */
function _ownerPanelSelectChange(i) {
  const sel  = document.getElementById(`owner-map-${i}`);
  const name = sel ? sel.dataset.name : '';
  const val  = sel ? sel.value : '';
  if (val) {
    window._importOwnerResolution[name] = { action: 'map', mappedTo: val };
    const st = document.getElementById(`owner-status-${i}`);
    if (st) { st.textContent = '✅ Mappé'; st.style.color = '#16a34a'; }
  } else {
    delete window._importOwnerResolution[name];
    const st = document.getElementById(`owner-status-${i}`);
    if (st) { st.textContent = ''; }
  }
  _checkOwnerPanelComplete();
}

/** Ignorer un nom inconnu */
function _ownerPanelIgnore(name, i) {
  window._importOwnerResolution[name] = { action: 'ignore' };
  const row = document.getElementById(`owner-row-${i}`);
  if (row) row.style.opacity = '0.45';
  const st = document.getElementById(`owner-status-${i}`);
  if (st) { st.textContent = '↩ Ignoré'; st.style.color = '#94a3b8'; }
  _checkOwnerPanelComplete();
}

/**
 * Crée TOUS les noms inconnus dans le référentiel en un seul clic.
 * Pratique quand le référentiel est vide et qu'on veut tout importer tel quel.
 */
function _ownerPanelCreateAll() {
  const panel = document.getElementById('import-owner-validation');
  if (!panel) return;
  // Tous les champs data-name (select ou input hidden)
  panel.querySelectorAll('[id^="owner-map-"]').forEach(el => {
    const name = el.dataset.name;
    if (!name || window._importOwnerResolution[name]) return;
    const i = el.id.replace('owner-map-', '');
    _ownerPanelCreate(name, i);
  });
}

/** Ignorer tous les noms non résolus */
function _ownerPanelIgnoreAll() {
  const panel = document.getElementById('import-owner-validation');
  if (!panel) return;
  // Couvre à la fois les <select> et les <input hidden>
  panel.querySelectorAll('[id^="owner-map-"]').forEach(el => {
    const name = el.dataset.name;
    const i    = el.id.replace('owner-map-', '');
    if (!window._importOwnerResolution[name]) {
      window._importOwnerResolution[name] = { action: 'ignore' };
      const row = document.getElementById(`owner-row-${i}`);
      if (row) row.style.opacity = '0.45';
      const st = document.getElementById(`owner-status-${i}`);
      if (st) { st.textContent = '↩ Ignoré'; st.style.color = '#94a3b8'; }
    }
  });
  _checkOwnerPanelComplete();
}

/**
 * Crée un nouveau responsable dans le référentiel puis marque le nom comme résolu.
 * Accessible admin + éditeur.
 */
function _ownerPanelCreate(name, i) {
  if (!name) return;
  const canWrite = document.body.classList.contains('admin-mode') ||
                   document.body.classList.contains('editor-mode');
  if (!canWrite) { showToast('⛔ Droits insuffisants pour créer un responsable.', 2500); return; }

  // Vérifier si déjà dans le référentiel
  const existing = typeof getOwnerRecord === 'function' ? getOwnerRecord(name) : null;
  if (existing) {
    showToast(`ℹ️ "${name}" existe déjà dans le référentiel.`, 2500);
    window._importOwnerResolution[name] = { action: 'create', mappedTo: name };
    const st = document.getElementById(`owner-status-${i}`);
    if (st) { st.textContent = '✅ Existant'; st.style.color = '#16a34a'; }
    _checkOwnerPanelComplete();
    return;
  }

  // Ajouter au référentiel minimal
  const owners = typeof getOwnerRecords === 'function' ? getOwnerRecords() : [];
  owners.push({ name, side: '', interventionType: '', domain: '', email: '' });
  if (typeof _setOwnerRecords === 'function') {
    _setOwnerRecords(owners);
    if (typeof saveState === 'function') saveState('Ajout responsable import', name);
  }

  window._importOwnerResolution[name] = { action: 'create', mappedTo: name };
  const st = document.getElementById(`owner-status-${i}`);
  if (st) { st.textContent = '✅ Créé'; st.style.color = '#16a34a'; }

  // Marquer la ligne créée visuellement
  const createdRow = document.getElementById(`owner-row-${i}`);
  if (createdRow) createdRow.style.opacity = '0.6';

  // Pour les lignes NON encore résolues :
  // – Si c'était un input[hidden] (référentiel était vide), remplacer le span "vide" par un vrai select
  // – Sinon, ajouter simplement l'option dans le select existant
  document.querySelectorAll('#import-owner-validation [id^="owner-map-"]').forEach(el => {
    const elName = el.dataset.name;
    if (!elName || window._importOwnerResolution[elName]) return; // déjà résolu → skip
    if (el.tagName === 'INPUT') {
      // Référentiel était vide → remplacer par un vrai <select>
      const rowEl = el.closest('[id^="owner-row-"]');
      const spanVide = rowEl ? rowEl.querySelector('[id^="owner-map-sel-"]') : null;
      const elI = el.id.replace('owner-map-', '');
      const newSel = document.createElement('select');
      newSel.id = `owner-map-${elI}`;
      newSel.dataset.name = elName;
      newSel.style.cssText = 'font-size:11px;padding:3px 6px;border:1px solid #cbd5e1;border-radius:4px;flex:1;max-width:200px;';
      newSel.setAttribute('onchange', `_ownerPanelSelectChange(${elI})`);
      newSel.innerHTML = `<option value="">— Choisir —</option><option value="${name}">${name}</option>`;
      el.parentNode.replaceChild(newSel, el);
      if (spanVide) {
        const lbl = document.createElement('label');
        lbl.style.cssText = 'font-size:11px;color:#475569;white-space:nowrap;';
        lbl.textContent = 'Mapper vers :';
        spanVide.parentNode.replaceChild(lbl, spanVide);
      }
    } else if (el.tagName === 'SELECT') {
      if (!el.querySelector(`option[value="${name}"]`)) {
        const opt = document.createElement('option');
        opt.value = name; opt.textContent = name;
        el.appendChild(opt);
      }
    }
  });

  showToast(`✅ Responsable "${name}" ajouté au référentiel.`, 2500);
  _checkOwnerPanelComplete();
}

/** @deprecated — conservé pour rétrocompatibilité */
function _checkOwnerPanelComplete() { _enableImportBtn(); }

// ─────────────────────────────────────────────────────────────────────────────
// MAPPING POST-IMPORT DES RESPONSABLES PROVISOIRES
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Ouvre le modal de configuration des responsables provisoires (_placeholder:true).
 * Accessible depuis : toast post-import, badge sur le bouton Responsables.
 */
function _openOwnerMappingModal() {
  document.getElementById('owner-mapping-modal')?.remove();

  const owners       = typeof getOwnerRecords === 'function' ? getOwnerRecords() : [];
  const placeholders = owners.filter(o => o._placeholder);

  if (!placeholders.length) {
    showToast('✅ Aucun responsable provisoire à configurer.', 2500);
    return;
  }

  // Domaines existants (depuis tâches + actions)
  const domainSet = new Set(['Finance','Paramétrage','Tests','Infrastructure','Développements','Gouvernance','RH','Technique']);
  (state.ganttCustom || []).forEach(t => (t.domains || []).forEach(d => d && domainSet.add(d)));
  (state.customActions || []).forEach(a => a.domaine && domainSet.add(a.domaine));
  const domainOpts = [...domainSet].sort().map(d => `<option value="${escHtml(d)}">`).join('');

  // Owners réels (non-placeholder) pour l'option "Fusionner avec"
  const realOwners = owners.filter(o => !o._placeholder);

  const tbody = placeholders.map((o, i) => {
    const mergeOpts = realOwners.length
      ? realOwners.map(r => `<option value="${escHtml(r.name)}">${escHtml(r.name)}</option>`).join('')
      : '';
    const mergeCell = realOwners.length
      ? `<select id="omap-merge-${i}"
           style="font-size:11px;padding:3px 6px;border:1px solid #cbd5e1;border-radius:4px;width:100%;min-width:120px;">
           <option value="">— Garder tel quel —</option>${mergeOpts}
         </select>`
      : `<span style="font-size:11px;color:#94a3b8;font-style:italic;">Aucun owner existant</span>`;
    return `
      <tr id="omap-row-${i}" style="border-bottom:1px solid #f1f5f9;">
        <td style="padding:9px 10px;font-size:12px;font-weight:600;color:#1e293b;white-space:nowrap;max-width:180px;overflow:hidden;text-overflow:ellipsis;" title="${escHtml(o.name)}">
          ${escHtml(o.name)}
          <span style="display:block;font-size:10px;font-weight:400;color:#94a3b8;">provisoire</span>
        </td>
        <td style="padding:9px 6px;">
          <select id="omap-side-${i}"
            style="font-size:11px;padding:3px 6px;border:1px solid #cbd5e1;border-radius:4px;width:100%;">
            <option value="">—</option>
            <option value="CBS"${o.side==='CBS'?' selected':''}>CBS</option>
            <option value="BOA"${o.side==='BOA'?' selected':''}>BOA</option>
            <option value="Autre"${o.side==='Autre'?' selected':''}>Autre</option>
          </select>
        </td>
        <td style="padding:9px 6px;">
          <input id="omap-domain-${i}" list="omap-domain-datalist"
            placeholder="ex: Finance" value="${escHtml(o.domain || '')}"
            style="font-size:11px;padding:3px 6px;border:1px solid #cbd5e1;border-radius:4px;width:100%;min-width:110px;">
        </td>
        <td style="padding:9px 6px;">${mergeCell}</td>
        <td style="padding:9px 6px;text-align:center;">
          <input type="checkbox" id="omap-inherit-${i}" checked
            style="width:14px;height:14px;accent-color:#1F3864;"
            title="Propager ce domaine aux tâches sans domaine où ce responsable intervient">
        </td>
      </tr>`;
  }).join('');

  const m = document.createElement('div');
  m.id = 'owner-mapping-modal';
  m.style.cssText = 'position:fixed;inset:0;z-index:12000;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;padding:20px;';
  m.onclick = e => { if (e.target === m) m.remove(); };
  m.innerHTML = `
    <div style="background:#fff;border-radius:14px;max-width:860px;width:100%;max-height:90vh;display:flex;flex-direction:column;box-shadow:0 20px 60px rgba(0,0,0,.35);overflow:hidden;">

      <div style="background:#1F3864;padding:15px 20px;display:flex;justify-content:space-between;align-items:center;flex-shrink:0;">
        <div>
          <div style="color:#fff;font-weight:700;font-size:15px;">⚙️ Configuration des responsables provisoires</div>
          <div style="color:#b8caeb;font-size:11px;margin-top:2px;">
            ${placeholders.length} responsable(s) importé(s) sans droits — définissez leur domaine et côté CBS/BOA
          </div>
        </div>
        <button onclick="document.getElementById('owner-mapping-modal').remove()"
          style="background:none;border:none;color:#fff;font-size:20px;cursor:pointer;padding:4px 8px;line-height:1;">✕</button>
      </div>

      <div style="padding:14px 20px 0;flex-shrink:0;background:#fffbeb;border-bottom:1px solid #fde68a;">
        <div style="font-size:11px;color:#92400e;padding-bottom:12px;">
          💡 <b>Héritage domaine</b> : si la case est cochée, le domaine choisi sera appliqué aux tâches Gantt de ce responsable qui n'ont pas encore de domaine.<br>
          &nbsp;&nbsp;&nbsp;<b>Fusionner avec</b> : si vous sélectionnez un owner existant, toutes les références dans les tâches seront remplacées par cet owner et le provisoire sera supprimé.
        </div>
      </div>

      <div style="padding:0 20px;overflow-y:auto;flex:1;">
        <datalist id="omap-domain-datalist">${domainOpts}</datalist>
        <table style="width:100%;border-collapse:collapse;font-size:12px;">
          <thead style="position:sticky;top:0;background:#f8fafc;z-index:1;">
            <tr style="border-bottom:2px solid #e2e8f0;">
              <th style="padding:10px 10px 10px;text-align:left;font-size:11px;color:#475569;font-weight:600;">Nom importé</th>
              <th style="padding:10px 6px;text-align:left;font-size:11px;color:#475569;font-weight:600;width:80px;">Côté</th>
              <th style="padding:10px 6px;text-align:left;font-size:11px;color:#475569;font-weight:600;width:140px;">Domaine</th>
              <th style="padding:10px 6px;text-align:left;font-size:11px;color:#475569;font-weight:600;">Fusionner avec owner existant</th>
              <th style="padding:10px 6px;text-align:center;font-size:11px;color:#475569;font-weight:600;white-space:nowrap;width:80px;">Hériter domaine ↓</th>
            </tr>
          </thead>
          <tbody>${tbody}</tbody>
        </table>
      </div>

      <div style="padding:14px 20px;background:#f8fafc;border-top:1px solid #e2e8f0;display:flex;justify-content:space-between;align-items:center;flex-shrink:0;gap:10px;flex-wrap:wrap;">
        <span style="font-size:11px;color:#64748b;flex:1;">
          Les responsables sans domaine ni côté resteront provisoires. Gérez leurs droits via <b>👥 Responsables → Gestion utilisateurs</b>.
        </span>
        <div style="display:flex;gap:8px;flex-shrink:0;">
          <button onclick="document.getElementById('owner-mapping-modal').remove()" class="btn btn-ghost">Fermer</button>
          <button onclick="_applyOwnerMapping()" class="btn btn-primary">✅ Appliquer la configuration</button>
        </div>
      </div>
    </div>`;
  document.body.appendChild(m);
}

/**
 * Applique la configuration saisie dans le modal :
 * – met à jour les champs (side, domain) des placeholders
 * – fusionne les owners si demandé
 * – propage les domaines aux tâches Gantt
 */
function _applyOwnerMapping() {
  const owners       = typeof getOwnerRecords === 'function' ? getOwnerRecords() : [];
  const placeholders = owners.filter(o => o._placeholder);
  const renames      = {}; // { oldName: newName } pour les fusions
  let updatedCount   = 0;
  let domainCount    = 0;

  placeholders.forEach((o, i) => {
    const side    = (document.getElementById(`omap-side-${i}`)?.value   || '').trim();
    const domain  = (document.getElementById(`omap-domain-${i}`)?.value || '').trim();
    const mergeEl = document.getElementById(`omap-merge-${i}`);
    const mergeTo = mergeEl ? (mergeEl.value || '').trim() : '';
    const inherit = document.getElementById(`omap-inherit-${i}`)?.checked !== false;

    if (mergeTo) {
      // Fusion : toutes les références au nom provisoire seront remplacées
      renames[o.name] = mergeTo;
      const idx = owners.indexOf(o);
      if (idx > -1) owners.splice(idx, 1); // supprimer le placeholder
    } else {
      // Mise à jour du placeholder → owner réel
      o.side           = side;
      o.domain         = domain;
      o._placeholder   = false;
      updatedCount++;
    }

    // Propagation domaine → tâches Gantt
    if (inherit && domain) {
      domainCount += _propagateOwnerDomain(mergeTo || o.name, domain);
    }
  });

  // Appliquer les fusions dans toutes les tâches
  if (Object.keys(renames).length) {
    (state.ganttCustom || []).forEach(t => {
      if (renames[t.owner]) t.owner = renames[t.owner];
      if (renames[t.resp])  t.resp  = renames[t.resp];
      if (t.participants)   t.participants = t.participants.map(p => renames[p] || p);
    });
    Object.values(state.ganttSubtasks || {}).forEach(subs =>
      subs.forEach(s => { if (renames[s.owner]) s.owner = renames[s.owner]; })
    );
    (state.customActions || []).forEach(a => { if (renames[a.resp]) a.resp = renames[a.resp]; });
  }

  if (typeof _setOwnerRecords === 'function') _setOwnerRecords(owners);
  if (typeof saveState === 'function') {
    saveState('Mapping responsables provisoires',
      `${updatedCount} configuré(s), ${Object.keys(renames).length} fusion(s), ${domainCount} tâche(s) mises à jour`);
  }
  if (typeof renderGantt === 'function') renderGantt();

  document.getElementById('owner-mapping-modal')?.remove();
  _refreshOwnerBadge();

  const parts = [];
  if (updatedCount)                  parts.push(`${updatedCount} responsable(s) configuré(s)`);
  if (Object.keys(renames).length)   parts.push(`${Object.keys(renames).length} fusion(s)`);
  if (domainCount)                   parts.push(`${domainCount} tâche(s) mises à jour`);
  showToast('✅ ' + (parts.join(', ') || 'Aucune modification'), 3500);
}

/**
 * Propage le domaine d'un owner aux tâches Gantt qui le mentionnent
 * (comme responsable ou participant) et qui n'ont pas encore de domaine défini.
 * @returns {number} Nombre de tâches mises à jour
 */
function _propagateOwnerDomain(ownerName, domain) {
  if (!ownerName || !domain) return 0;
  const nameLower = ownerName.toLowerCase();
  let count = 0;
  (state.ganttCustom || []).forEach(t => {
    const isOwner = t.owner && t.owner.toLowerCase() === nameLower;
    const isParticipant = (t.participants || []).some(p => p.toLowerCase() === nameLower);
    if ((isOwner || isParticipant) && (!t.domains || !t.domains.length || t.domains[0] === '')) {
      t.domains = [domain];
      count++;
    }
  });
  return count;
}

/**
 * Met à jour (ou supprime) le badge rouge sur le bouton Responsables.
 * Appelé après chaque import et après chaque application de mapping.
 */
function _refreshOwnerBadge() {
  const owners      = typeof getOwnerRecords === 'function' ? getOwnerRecords() : [];
  const pending     = owners.filter(o => o._placeholder).length;
  let   badge       = document.getElementById('owner-pending-badge');

  if (!pending) {
    badge?.remove();
    return;
  }

  if (!badge) {
    const btn = document.querySelector('[onclick*="openOwnersModal"]');
    if (!btn) return;
    badge = document.createElement('span');
    badge.id            = 'owner-pending-badge';
    badge.style.cssText = 'display:inline-flex;align-items:center;justify-content:center;'
      + 'background:#dc2626;color:#fff;font-size:9px;font-weight:700;border-radius:999px;'
      + 'padding:1px 5px;margin-left:4px;vertical-align:middle;cursor:pointer;line-height:1.2;';
    badge.onclick = e => { e.stopPropagation(); _openOwnerMappingModal(); };
    btn.appendChild(badge);
  }
  badge.textContent = pending;
  badge.title       = `${pending} responsable(s) provisoire(s) — cliquez pour configurer`;
}

/** Affiche un aperçu des données parsées */
function _showImportPreview(rows, headers, fileName, sheetName, allSheets) {
  const preview = document.getElementById('import-preview');
  if (!preview) return;
  const sheetsInfo = allSheets && allSheets.length > 1
    ? `<div style="margin-bottom:6px;font-size:11px;color:#64748b;">📋 ${allSheets.length} feuilles détectées : ${allSheets.join(', ')}</div>`
    : '';
  const sheetLabel = sheetName ? ` (feuille : ${sheetName})` : '';
  preview.style.display = 'block';
  preview.innerHTML = sheetsInfo +
    `<div style="font-weight:700;color:#1e293b;margin-bottom:6px;">✅ ${rows.length} ligne(s) détectée(s)${sheetLabel} — <span style="color:#64748b;font-weight:400;">${fileName}</span></div>` +
    `<div style="font-size:10px;color:#475569;margin-bottom:4px;">Colonnes : ${headers.slice(0,8).join(', ')}${headers.length>8?'…':''}</div>` +
    `<div style="font-size:10px;color:#64748b;">Exemple (1ère ligne) : ${headers.slice(0,4).map(h=>'<b>'+h+'</b>='+escHtml(_excelCellToStr((rows[0]||{})[h]||''))).join(' · ')}</div>`;

  // Afficher les options et cocher automatiquement les types détectés
  const opts = document.getElementById('import-options');
  if (opts) {
    opts.style.display = 'block';
    // Auto-détection des feuilles présentes pour pré-cocher
    const d = window._importParsedData;
    if (d && d.sheets) {
      const sheetNames = Object.keys(d.sheets).map(s => s.toLowerCase());
      const hasPlanning = sheetNames.some(s => s.includes('plan') || s.includes('gantt'));
      const hasActions  = sheetNames.some(s => s.includes('action'));
      const hasArb      = sheetNames.some(s => s.includes('arb'));
      const hasGaps     = sheetNames.some(s => s.includes('gap'));
      // Si le fichier a des feuilles nommées, pré-cocher seulement celles présentes
      const anyNamed = hasPlanning || hasActions || hasArb || hasGaps;
      if (anyNamed) {
        const c = id => document.getElementById(id);
        if (c('imp-chk-planning')) c('imp-chk-planning').checked = hasPlanning;
        if (c('imp-chk-actions'))  c('imp-chk-actions').checked  = hasActions;
        if (c('imp-chk-arb'))      c('imp-chk-arb').checked      = hasArb;
        if (c('imp-chk-gaps'))     c('imp-chk-gaps').checked     = hasGaps;
      }
    }
    // Feedback visuel sur les boutons radio mode
    const radios = opts.querySelectorAll('input[name="imp-mode"]');
    radios.forEach(r => r.addEventListener('change', _updateImportModeStyle));
    _updateImportModeStyle();
  }
}

function _updateImportModeStyle() {
  const mergeEl   = document.getElementById('imp-mode-merge');
  const replaceEl = document.getElementById('imp-mode-replace');
  const mergeLbl   = document.getElementById('imp-mode-merge-lbl');
  const replaceLbl = document.getElementById('imp-mode-replace-lbl');
  if (!mergeEl || !replaceEl) return;
  if (mergeEl.checked) {
    if (mergeLbl)   { mergeLbl.style.background   = '#f0fdf4'; mergeLbl.style.borderColor   = '#16a34a'; }
    if (replaceLbl) { replaceLbl.style.background = '#f8fafc'; replaceLbl.style.borderColor = '#e2e8f0'; }
  } else {
    if (replaceLbl) { replaceLbl.style.background = '#fff5f5'; replaceLbl.style.borderColor = '#dc2626'; }
    if (mergeLbl)   { mergeLbl.style.background   = '#f8fafc'; mergeLbl.style.borderColor   = '#e2e8f0'; }
  }
}

/** Importe effectivement les données parsées dans le state du projet courant */
function _confirmImportData() {
  const d = window._importParsedData;
  if (!d) return;
  const projId = state.currentProjectId;
  if (!projId) { showToast('⚠️ Aucun projet actif.', 2000); return; }

  // ── Lire les options d'import (cases à cocher + mode) ──────────────────────
  const _chk = id => { const el = document.getElementById(id); return !el || el.checked; }; // si absent → true (tout importer)
  const impPlanning = _chk('imp-chk-planning');
  const impActions  = _chk('imp-chk-actions');
  const impArb      = _chk('imp-chk-arb');
  const impGaps     = _chk('imp-chk-gaps');
  const modeEl      = document.querySelector('input[name="imp-mode"]:checked');
  const replaceMode = modeEl && modeEl.value === 'replace';

  // ── Mode "remplacer" : vider les données concernées ────────────────────────
  if (replaceMode) {
    if (impPlanning) state.ganttCustom = [];
    if (impActions)  state.customActions = [];
    if (impArb)      state.customArbitrages = [];
    if (impGaps)     state.customGaps = [];
  }

  let importedActions = 0, importedArbs = 0, importedGaps = 0, importedGantt = 0;

  /** Extrait une valeur texte depuis n'importe quel type de cellule ExcelJS
   *  (richText, formule, date, nombre, string brut) */
  function _cellStr(v) {
    if (v === null || v === undefined) return '';
    if (typeof v === 'string') return v;
    if (typeof v === 'number') return String(v);
    if (v instanceof Date) return v.toISOString().split('T')[0];
    if (Array.isArray(v)) return v.map(i => (i && i.text) ? i.text : '').join('');
    if (typeof v === 'object') {
      if (v.richText) return v.richText.map(i => (i && i.text) ? i.text : '').join('');
      if (v.result !== undefined) return String(v.result);
      if (v.text !== undefined) return String(v.text);
      if (v.error) return '';
    }
    return String(v);
  }

  /** Normalise une date lue depuis Excel (peut être un Date JS, un objet richText, un string, ou un serial number) */
  function _normDate(v) {
    if (!v) return '';
    // Gérer d'abord les objets ExcelJS avant String()
    if (v instanceof Date) return v.toISOString().split('T')[0];
    if (typeof v === 'object') {
      // richText, formula result, etc.
      const extracted = _cellStr(v);
      return _normDate(extracted); // relancer avec la valeur extraite
    }
    const s = String(v).trim();
    if (!s || s === 'undefined' || s === 'null') return '';
    // Déjà au bon format
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
    // Format JJ/MM/AAAA
    const m = s.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})$/);
    if (m) return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;
    // Numéro série Excel
    const n = parseFloat(s);
    if (!isNaN(n) && n > 40000) {
      const d = new Date((n - 25569) * 86400 * 1000);
      return d.toISOString().split('T')[0];
    }
    return s;
  }

  /** Mapper une feuille/rows selon le type */
  function _mapSheet(sheetNameHints, rows) {
    if (!rows || rows.length === 0) return;
    const h = rows[0] ? Object.keys(rows[0]).map(k => k.toLowerCase().trim()) : [];
    const hint = (sheetNameHints||'').toLowerCase();

    // ── Planning / Gantt ────────────────────────────────────────────────────
    const hasPlanCols = h.some(k => k.includes('libelle') || k.includes('début') || k.includes('debut'))
                     && h.some(k => k.includes('fin') || k.includes('end'));
    if ((hint.includes('planning') || hint.includes('gantt') || hint.includes('plan') || hasPlanCols) && impPlanning) {
      if (!state.ganttCustom) state.ganttCustom = [];
      const existingIds = new Set(state.ganttCustom.map(t => t.id));
      // ── Passe 1 : lire toutes les lignes et construire les objets ──────────
      const importedTasks = [];
      rows.forEach(r => {
        const label = _cellStr(r['libelle']||r['Libellé']||r['label']||r['Label']||r['nom']||r['Nom']||r['Tâche']||r['tâche']||r['tache']||'');
        if (!label) return;
        const rawType = _cellStr(r['type']||r['Type']||'tâche').toLowerCase().trim();
        const type = (rawType.startsWith('pha') || rawType.startsWith('cha')) ? 'phase'
                   : rawType.startsWith('jal') ? 'jalon'
                   : (rawType.includes('sous') || rawType.includes('sub') || rawType.includes('st')) ? 'subtask'
                   : 'task';
        const start = _normDate(r['debut']||r['Début']||r['début']||r['start']||r['Start']||r['Date début']||'');
        const end   = _normDate(r['fin']||r['Fin']||r['end']||r['End']||r['Date fin']||'');
        const dur   = parseInt(_cellStr(r['duree_j']||r['Durée']||r['duree']||r['durée']||r['Durée (j)']||'0')) || 0;
        const phaseRef = _cellStr(r['phase']||r['Phase']||'').trim(); // ID ou libellé de la phase parente
        const resp  = _cellStr(r['responsable']||r['Responsable']||r['resp']||r['Resp']||'').trim();
        const participantsRaw = _cellStr(r['participants']||r['Participants']||'').trim();
        const participantsArr = participantsRaw ? participantsRaw.split(/[,;]+/).map(s => s.trim()).filter(Boolean) : [];
        const rag = (_cellStr(r['rag']||r['RAG']||r['Rag']||'')).trim().toUpperCase();
        const commentaire = _cellStr(r['commentaire']||r['Commentaire']||r['comment']||'').trim();
        const rawPct = parseInt(_cellStr(r['avancement']||r['Avancement']||r['%']||'0')) || 0;
        const pct   = Math.min(100, Math.max(0, rawPct)) / 100;
        const predRaw = _cellStr(r['predecesseurs']||r['Prédécesseurs']||r['predecesseurs']||r['pred']||'').trim();
        const pred  = predRaw ? predRaw.split(/[,;]+/).map(s => s.trim()).filter(Boolean) : [];
        const domaine = _cellStr(r['domaine']||r['Domaine']||'').trim();
        // Entité : BOA / CBS / CBS + BOA / Externe — colonne "entite" dans le template
        const side = _cellStr(r['entite']||r['Entité']||r['Entite']||r['side']||r['Side']||r['Entite/Side']||'').trim();
        let endCalc = end;
        if (!endCalc && start && dur > 0) {
          const d = new Date(start); d.setDate(d.getDate() + dur);
          endCalc = d.toISOString().split('T')[0];
        }
        const id = _cellStr(r['id']||r['ID']||'').trim() || ('gi_' + Date.now() + '_' + Math.random().toString(36).slice(2,5));
        if (existingIds.has(id)) return;
        existingIds.add(id);
        importedTasks.push({ id, type, label, phaseRef, start: start||null, end: endCalc||null,
          dur: dur||null, resp, participants: participantsArr, rag: rag||null, commentaire, pct, pred, domaine, side });
      });

      // ── Passe 2 : construire la map phaseId → clé CSS (p0–p5) ──────────────
      const CSS_PHASE_KEYS = ['p0','p1','p2','p3','p4','p5'];
      let cssKeyIdx = 0;
      const phaseIdToCssKey = {}; // ex: { 'PH_01': 'p0', 'PH_02': 'p1' }
      // D'abord les phases maîtres (phaseRef vide)
      importedTasks.filter(t => t.type === 'phase' && !t.phaseRef).forEach(t => {
        const key = CSS_PHASE_KEYS[cssKeyIdx % CSS_PHASE_KEYS.length];
        phaseIdToCssKey[t.id] = key;
        phaseIdToCssKey[t.label.toLowerCase()] = key;
        cssKeyIdx++;
      });
      // Puis les sous-phases (phaseRef non vide) : héritent la clé CSS de leur maître
      importedTasks.filter(t => t.type === 'phase' && t.phaseRef).forEach(t => {
        const masterKey = phaseIdToCssKey[t.phaseRef]
          || phaseIdToCssKey[t.phaseRef.toLowerCase()]
          || 'p1';
        phaseIdToCssKey[t.id] = masterKey;
        phaseIdToCssKey[t.label.toLowerCase()] = masterKey;
      });

      // ── Passe 3 : insérer dans ganttCustom (phases/tâches/jalons)
      //             et dans ganttSubtasks (sous-tâches) ─────────────────────────

      // Résolution des noms (applique les décisions du panel de validation)
      const _ownerRes = window._importOwnerResolution || {};
      function _resolveOwnerName(name) {
        if (!name) return '';
        const r = _ownerRes[name];
        if (!r) return name;                    // nom connu → conserver tel quel
        if (r.action === 'map')    return r.mappedTo || name;
        if (r.action === 'ignore') return '';
        return name; // 'create' → nom tel quel (l'owner a été créé avant l'import)
      }

      let prevId = null;
      if (state.ganttCustom && state.ganttCustom.length > 0) {
        prevId = state.ganttCustom[state.ganttCustom.length - 1].id;
      }
      let lastTaskId       = null; // dernière tâche (parent des sous-tâches suivantes)
      let currentSubphaseId = null; // sous-phase active (null = pas de sous-phase)

      // Ensemble des IDs de sous-phases déclarées dans ce fichier
      const _importedSubphaseIds = new Set(
        importedTasks.filter(t => t.type === 'phase' && t.phaseRef).map(t => t.id)
      );
      // Ensemble des IDs de phases maîtres (phaseRef vide) — pour éviter héritage incorrect
      const _importedMasterPhaseIds = new Set(
        importedTasks.filter(t => t.type === 'phase' && !t.phaseRef).map(t => t.id)
      );

      importedTasks.forEach(t => {
        const resolvedResp  = _resolveOwnerName(t.resp);
        const resolvedParts = (t.participants || []).map(_resolveOwnerName).filter(Boolean);

        // ── Sous-tâche : va dans ganttSubtasks[lastTaskId] ──────────────────
        if (t.type === 'subtask') {
          if (!lastTaskId) return;
          if (!state.ganttSubtasks) state.ganttSubtasks = {};
          if (!state.ganttSubtasks[lastTaskId]) state.ganttSubtasks[lastTaskId] = [];
          state.ganttSubtasks[lastTaskId].push({
            id:           t.id || ('st_' + Date.now() + '_' + Math.random().toString(36).slice(2,5)),
            label:        t.label,
            owner:        resolvedResp,
            participants: resolvedParts,
            rag:          t.rag  || null,
            commentaire:  t.commentaire || '',
            start: t.start,
            end:   t.end,
            pct:   Math.round(t.pct * 100)
          });
          importedGantt++;
          return;
        }

        // ── Sous-phase déclaration : phase avec colonne "phase" non vide ────
        // → crée une entrée dans ganttSubphases (groupe de tâches)
        // → ne va PAS dans ganttCustom en tant que ligne de phase
        if (t.type === 'phase' && t.phaseRef) {
          if (!state.ganttSubphases) state.ganttSubphases = [];
          // Éviter les doublons si l'ID existe déjà
          if (!state.ganttSubphases.find(s => s.id === t.id)) {
            state.ganttSubphases.push({ id: t.id, label: t.label, phaseId: t.phaseRef, type: 'subphase' });
          }
          currentSubphaseId = t.id; // les tâches suivantes appartiennent à cette sous-phase
          importedGantt++;
          return; // pas de ligne ganttCustom pour les sous-phases
        }

        // ── Phase maître (phaseRef vide) : réinitialise la sous-phase active ─
        if (t.type === 'phase' && !t.phaseRef) {
          currentSubphaseId = null;
        }

        // ── Tâche / Phase maître / Jalon : va dans ganttCustom ───────────────
        let phaseCssKey = null;
        if (t.type === 'phase') {
          phaseCssKey = phaseIdToCssKey[t.id] || 'p0';
        } else if (t.phaseRef) {
          // phaseRef peut pointer sur une sous-phase ou une phase maître
          phaseCssKey = phaseIdToCssKey[t.phaseRef]
            || phaseIdToCssKey[t.phaseRef.toLowerCase()]
            || null;
          if (!phaseCssKey) {
            const matchKey = Object.keys(phaseIdToCssKey).find(k => t.phaseRef.toLowerCase().includes(k));
            if (matchKey) phaseCssKey = phaseIdToCssKey[matchKey];
          }
        }

        // Détecter la sous-phase effective pour cette tâche :
        // 1. Si sa phaseRef est une sous-phase déclarée → utiliser cette sous-phase
        // 2. Si sa phaseRef pointe sur une phase maître → pas de sous-phase (null)
        // 3. Sinon → hériter de currentSubphaseId (héritage positionnel)
        const _phaseRefIsSubphase = t.phaseRef && _importedSubphaseIds.has(t.phaseRef);
        const _phaseRefIsMaster   = t.phaseRef && _importedMasterPhaseIds.has(t.phaseRef);
        const effectiveSubphaseId = _phaseRefIsSubphase
          ? t.phaseRef
          : _phaseRefIsMaster
            ? null  // rattaché directement à une phase maître → aucune sous-phase
            : (currentSubphaseId || null);

        const ganttEntry = {
          id: t.id, type: t.type, label: t.label,
          phase: phaseCssKey || 'p1',
          start: t.start, end: t.end, dur: t.dur,
          owner:        resolvedResp,
          resp:         resolvedResp,
          side:         t.side || '',
          participants: resolvedParts,
          rag:          t.rag  || null,
          commentaire:  t.commentaire || '',
          pct: t.pct, pred: t.pred,
          domains: t.domaine ? [t.domaine] : [],
          insertAfterId: prevId,
          _custom: true
        };

        // Assigner subphaseId si la tâche appartient à une sous-phase
        if (effectiveSubphaseId && t.type !== 'phase') {
          ganttEntry.subphaseId = effectiveSubphaseId;
        }

        state.ganttCustom.push(ganttEntry);
        importedGantt++;
        prevId = t.id;
        if (t.type === 'task' || t.type === 'jalon') lastTaskId = t.id;
      });
      return;
    }

    // ── Actions ─────────────────────────────────────────────────────────────
    const hasAction = h.some(k => k.includes('action') || k.includes('tâche') || k.includes('tache'));
    const hasArb    = h.some(k => k.includes('arbitrage') || k.includes('label') || k.includes('décision'));
    const hasGap    = h.some(k => k.includes('gap') || k.includes('écart') || k.includes('ecart') || k.includes('ref'));

    if ((hint.includes('action') || hasAction) && impActions) {
      rows.forEach(r => {
        const id = r.id || r.ID || ('ACT_' + Date.now() + '_' + Math.random().toString(36).slice(2,6));
        const item = { id, action: r.action||r['Action']||r['Tâche']||'', resp: r.resp||r['Responsable']||r['Resp']||'',
          domaine: r.domaine||r['Domaine']||'', urgence: r.urgence||r['Urgence']||'', rag: r.rag||r['RAG']||'',
          deadline: r.deadline||r['Échéance']||'', commentaire: r.commentaire||r['Commentaire']||'' };
        if (!item.action) return;
        state.customActions = state.customActions || [];
        if (!state.customActions.find(a => a.id === id)) { state.customActions.push(item); importedActions++; }
      });
    } else if ((hint.includes('arbitrage') || hint.includes('arb') || hasArb) && impArb) {
      rows.forEach(r => {
        const id = r.id || r.ID || ('ARB_' + Date.now() + '_' + Math.random().toString(36).slice(2,6));
        const item = { id, label: r.label||r['Label']||r['Arbitrage']||'', resp: r.resp||r['Responsable']||'',
          domain: r.domaine||r['Domaine']||r['domain']||'', prio: r.prio||r['Priorité']||'P3',
          statut: r.statut||r['Statut']||'', decision: r.decision||r['Décision']||'en_cours',
          commentaire: r.commentaire||r['Commentaire']||'' };
        if (!item.label) return;
        state.customArbitrages = state.customArbitrages || [];
        if (!state.customArbitrages.find(a => a.id === id)) { state.customArbitrages.push(item); importedArbs++; }
      });
    } else if ((hint.includes('gap') || hasGap) && impGaps) {
      rows.forEach(r => {
        const ref = r.ref||r['Ref']||r['REF']||r['GAP']||('GAP_' + Date.now() + '_' + Math.random().toString(36).slice(2,6));
        const item = { ref, desc: r.desc||r['Description']||r['Desc']||r['GAP']||'',
          domain: r.domaine||r['Domaine']||'', prio: r.prio||r['Priorité']||'P3',
          statut: r.statut||r['Statut']||'En cours', proprietaire: r.proprietaire||r['Propriétaire']||'',
          commentaire: r.commentaire||r['Commentaire']||'' };
        if (!item.desc) return;
        state.customGaps = state.customGaps || [];
        if (!state.customGaps.find(g => g.ref === ref)) { state.customGaps.push(item); importedGaps++; }
      });
    }
  }

  if (d.type === 'csv') {
    _mapSheet('', d.rows);
  } else {
    // Excel multi-feuilles — traiter Planning en premier pour priorité
    const entries = Object.entries(d.sheets || {});
    const planFirst = [...entries.filter(([n]) => n.toLowerCase().includes('plan') || n.toLowerCase().includes('gantt')),
                       ...entries.filter(([n]) => !n.toLowerCase().includes('plan') && !n.toLowerCase().includes('gantt'))];
    planFirst.forEach(([name, sheet]) => _mapSheet(name, sheet.rows));
  }

  // Sauvegarder et re-render
  saveState('Import données', `Actions:${importedActions} Arb:${importedArbs} GAPs:${importedGaps} Gantt:${importedGantt}`);
  document.getElementById('import-data-modal').style.display = 'none';
  window._importParsedData = null;
  if (importedGantt > 0 && typeof renderGantt === 'function') renderGantt();
  if (typeof renderActions     === 'function') renderActions();
  if (typeof renderArbitrages  === 'function') renderArbitrages();
  if (typeof renderGaps        === 'function') renderGaps();
  if (typeof renderDashboard   === 'function') renderDashboard();

  // Mettre à jour le badge responsables provisoires
  _refreshOwnerBadge();

  const total = importedActions + importedArbs + importedGaps + importedGantt;
  const parts = [];
  if (importedGantt   > 0) parts.push(`${importedGantt} tâche(s) Gantt`);
  if (importedActions > 0) parts.push(`${importedActions} action(s)`);
  if (importedArbs    > 0) parts.push(`${importedArbs} arbitrage(s)`);
  if (importedGaps    > 0) parts.push(`${importedGaps} GAP(s)`);
  const modeLabel = replaceMode ? ' (remplacement)' : ' (ajout)';

  // Vérifier s'il y a des provisoires à configurer
  const pendingOwners = (typeof getOwnerRecords === 'function' ? getOwnerRecords() : []).filter(o => o._placeholder).length;
  const pendingNote   = pendingOwners > 0
    ? ` — <span style="color:#fbbf24;cursor:pointer;text-decoration:underline;" onclick="_openOwnerMappingModal()">⚙️ ${pendingOwners} responsable(s) provisoires à configurer</span>`
    : '';

  if (total > 0) {
    // Toast persistant si des provisoires sont en attente
    const toastDur = pendingOwners > 0 ? 6000 : 3500;
    showToast(`✅ Import terminé${modeLabel} : ${parts.join(', ')}.${pendingNote}`, toastDur);
  } else {
    showToast('⚠️ Aucune donnée importée. Vérifiez le format du fichier (utilisez le template).', 4000);
  }
}

/**
 * Ouvre le modal d'import ciblé sur la feuille Planning (Gantt).
 * Active le mode Gantt avant d'ouvrir le modal, quel que soit l'état de ce dernier.
 */
function _openGanttImportModal() {
  if (!canEdit()) { showToast('⛔ Droits insuffisants pour importer.', 2500); return; }
  window._ganttImportMode = true;  // ← toujours activé avant d'ouvrir le modal
  _openImportDataModal();
  // Adapter le titre et le message d'aide dans le modal
  const modal = document.getElementById('import-data-modal');
  if (!modal) return;
  const hintEl = modal.querySelector('p');
  if (hintEl) hintEl.innerHTML = 'Importez un fichier <strong>.xlsx</strong> contenant une feuille <strong>"Planning"</strong>.<br>'
    + 'Colonnes : <code>libelle</code>*, <code>debut</code>*, <code>fin</code>*, <code>type</code>, <code>responsable</code>, <code>participants</code>, <code>rag</code>, <code>commentaire</code>, <code>avancement</code>, <code>predecesseurs</code>. <small>(*obligatoires)</small><br>'
    + '<span style="color:#1565C0;cursor:pointer;text-decoration:underline;" onclick="_downloadImportTemplate()">📄 Télécharger le template Excel</span>';
}

/** Génère et télécharge un fichier Excel template pour l'import */
async function _downloadImportTemplate() {
  if (typeof ExcelJS === 'undefined') {
    alert('Librairie Excel non disponible. Téléchargez le template CSV à la place.');
    // Fallback CSV
    const csv = 'Feuille;Actions\nid;action;resp;domaine;urgence;rag;deadline;commentaire\nACT_001;Ma première action;Jean Dupont;Finance;Critique;R;2026-06-30;Commentaire exemple\n';
    const a = document.createElement('a');
    a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
    a.download = 'template_import_projet.csv';
    a.click();
    return;
  }
  const wb = new ExcelJS.Workbook();
  wb.creator = 'BOA Programme Pilotage';

  // ── Feuille Actions ──────────────────────────────────────────────────────
  const wsA = wb.addWorksheet('Actions');
  wsA.columns = [
    { header: 'id',          key: 'id',          width: 16 },
    { header: 'action',      key: 'action',      width: 45 },
    { header: 'resp',        key: 'resp',        width: 20 },
    { header: 'domaine',     key: 'domaine',     width: 22 },
    { header: 'urgence',     key: 'urgence',     width: 14 },
    { header: 'rag',         key: 'rag',         width: 8  },
    { header: 'deadline',    key: 'deadline',    width: 14 },
    { header: 'commentaire', key: 'commentaire', width: 40 },
  ];
  wsA.addRow({ id:'ACT_001', action:'Exemple : Paramétrage module X', resp:'Jean Dupont', domaine:'Finance', urgence:'Critique', rag:'R', deadline:'2026-06-30', commentaire:'Action exemple' });
  wsA.addRow({ id:'ACT_002', action:'Exemple : Formation utilisateurs', resp:'Marie Martin', domaine:'RH', urgence:'Haute', rag:'O', deadline:'2026-09-01', commentaire:'' });
  wsA.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  wsA.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1565C0' } };

  // ── Feuille Arbitrages ───────────────────────────────────────────────────
  const wsArb = wb.addWorksheet('Arbitrages');
  wsArb.columns = [
    { header: 'id',          key: 'id',          width: 16 },
    { header: 'label',       key: 'label',       width: 50 },
    { header: 'resp',        key: 'resp',        width: 20 },
    { header: 'domaine',     key: 'domaine',     width: 22 },
    { header: 'prio',        key: 'prio',        width: 8  },
    { header: 'statut',      key: 'statut',      width: 16 },
    { header: 'decision',    key: 'decision',    width: 18 },
    { header: 'commentaire', key: 'commentaire', width: 40 },
  ];
  wsArb.addRow({ id:'ARB_001', label:'Exemple : Maintien du module Y en V2 ?', resp:'Direction IT', domaine:'Finance', prio:'P1', statut:'En cours', decision:'en_cours', commentaire:'Arbitrage exemple' });
  wsArb.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  wsArb.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF7B1FA2' } };

  // ── Feuille GAPs ─────────────────────────────────────────────────────────
  const wsG = wb.addWorksheet('GAPs');
  wsG.columns = [
    { header: 'ref',          key: 'ref',          width: 16 },
    { header: 'desc',         key: 'desc',         width: 55 },
    { header: 'domaine',      key: 'domaine',      width: 22 },
    { header: 'prio',         key: 'prio',         width: 8  },
    { header: 'statut',       key: 'statut',       width: 20 },
    { header: 'proprietaire', key: 'proprietaire', width: 20 },
    { header: 'commentaire',  key: 'commentaire',  width: 40 },
  ];
  wsG.addRow({ ref:'GAP_001', desc:'Exemple : Fonctionnalité A non disponible en V4', domaine:'Finance', prio:'P1', statut:'En cours', proprietaire:'Jean Dupont', commentaire:'GAP exemple' });
  wsG.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  wsG.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFB71C1C' } };

  // ── Feuille Planning (Gantt) ─────────────────────────────────────────────
  const wsPlan = wb.addWorksheet('Planning');
  wsPlan.columns = [
    { header: 'id',            key: 'id',            width: 18 },
    { header: 'type',          key: 'type',          width: 12 },
    { header: 'libelle',       key: 'libelle',       width: 45 },
    { header: 'phase',         key: 'phase',         width: 18 },
    { header: 'debut',         key: 'debut',         width: 14 },
    { header: 'fin',           key: 'fin',           width: 14 },
    { header: 'duree_j',       key: 'duree_j',       width: 10 },
    { header: 'responsable',   key: 'responsable',   width: 22 },
    { header: 'participants',  key: 'participants',  width: 30 },
    { header: 'rag',           key: 'rag',           width: 8  },
    { header: 'commentaire',   key: 'commentaire',   width: 35 },
    { header: 'avancement',    key: 'avancement',    width: 12 },
    { header: 'predecesseurs', key: 'predecesseurs', width: 22 },
    { header: 'domaine',       key: 'domaine',       width: 22 },
    { header: 'entite',        key: 'entite',         width: 16 },
  ];
  // Gel de la première ligne (en-tête)
  wsPlan.views = [{ state: 'frozen', ySplit: 1 }];
  // Listes déroulantes : colonne B = type, colonne J = rag
  wsPlan.dataValidations.add('B2:B500', {
    type: 'list', allowBlank: true,
    formulae: ['"phase,tâche,sous-tâche,jalon"'],
    showErrorMessage: true,
    errorTitle: 'Type invalide',
    error: 'Valeurs acceptées : phase, tâche, sous-tâche, jalon'
  });
  wsPlan.dataValidations.add('J2:J500', {
    type: 'list', allowBlank: true,
    formulae: ['"R,O,G"'],
    showErrorMessage: true,
    errorTitle: 'RAG invalide',
    error: 'Valeurs acceptées : R (Rouge), O (Orange), G (Vert)'
  });
  // Validation liste déroulante pour la colonne "entite" (colonne O = 15e)
  wsPlan.dataValidations.add('O2:O500', {
    type: 'list', allowBlank: true,
    formulae: ['"BOA,CBS,CBS + BOA,Externe"'],
    showErrorMessage: true,
    errorTitle: 'Entité invalide',
    error: 'Valeurs acceptées : BOA, CBS, CBS + BOA, Externe'
  });
  // Exemple : phases, tâches, sous-tâches, jalons (avec colonne entite)
  wsPlan.addRow({ id:'PH_01', type:'phase',      libelle:'Phase 1 — Analyse',        phase:'',      debut:'2026-01-10', fin:'2026-02-28', duree_j:49, responsable:'Chef de projet', participants:'',                      rag:'G', commentaire:'',                     avancement:0,   predecesseurs:'',      domaine:'',         entite:''           });
  wsPlan.addRow({ id:'T_01',  type:'tâche',      libelle:'Atelier cadrage',           phase:'PH_01', debut:'2026-01-10', fin:'2026-01-17', duree_j:7,  responsable:'Equipe BOA',     participants:'Jean Dupont, M. Martin', rag:'G', commentaire:'',                     avancement:0,   predecesseurs:'',      domaine:'Finance',  entite:'BOA'        });
  wsPlan.addRow({ id:'ST_01', type:'sous-tâche', libelle:'Préparer support atelier', phase:'PH_01', debut:'2026-01-10', fin:'2026-01-12', duree_j:2,  responsable:'Consultant',     participants:'',                      rag:'O', commentaire:'En attente validation', avancement:100, predecesseurs:'',      domaine:'Finance',  entite:'Externe'    });
  wsPlan.addRow({ id:'ST_02', type:'sous-tâche', libelle:'Animer atelier',           phase:'PH_01', debut:'2026-01-13', fin:'2026-01-17', duree_j:5,  responsable:'Chef de projet', participants:'Equipe BOA',            rag:'G', commentaire:'',                     avancement:0,   predecesseurs:'ST_01', domaine:'Finance',  entite:'BOA'        });
  wsPlan.addRow({ id:'T_02',  type:'tâche',      libelle:'Analyse des écarts',        phase:'PH_01', debut:'2026-01-18', fin:'2026-02-07', duree_j:20, responsable:'Equipe BOA',     participants:'',                      rag:'O', commentaire:'Délai à surveiller',   avancement:0,   predecesseurs:'T_01',  domaine:'Finance',  entite:'BOA'        });
  wsPlan.addRow({ id:'J_01',  type:'jalon',      libelle:'Fin Phase 1',               phase:'PH_01', debut:'2026-02-28', fin:'2026-02-28', duree_j:0,  responsable:'Chef de projet', participants:'',                      rag:'G', commentaire:'',                     avancement:0,   predecesseurs:'T_02',  domaine:'',         entite:''           });
  wsPlan.addRow({ id:'PH_02', type:'phase',      libelle:'Phase 2 — Réalisation',     phase:'',      debut:'2026-03-01', fin:'2026-05-31', duree_j:91, responsable:'Chef de projet', participants:'',                      rag:'G', commentaire:'',                     avancement:0,   predecesseurs:'J_01',  domaine:'',         entite:''           });
  wsPlan.addRow({ id:'T_03',  type:'tâche',      libelle:'Paramétrage système',       phase:'PH_02', debut:'2026-03-01', fin:'2026-04-15', duree_j:45, responsable:'Equipe CBS',     participants:'Consultant, Equipe BOA',rag:'R', commentaire:'Retard identifié',     avancement:0,   predecesseurs:'J_01',  domaine:'Technique',entite:'CBS'        });
  // Style en-tête navy
  wsPlan.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  wsPlan.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F3864' } };
  // Coloration alternée + style spécifique sous-tâches
  [2,3,4,5,6,7,8,9].forEach((r, i) => {
    const row     = wsPlan.getRow(r);
    const libCell = row.getCell(3); // colonne libelle
    if (i % 2 === 1) row.fill = { type:'pattern', pattern:'solid', fgColor:{ argb:'FFF0F9FF' } };
    if (wsPlan.getRow(r).getCell(2).value === 'sous-tâche') {
      libCell.font      = { italic: true, color: { argb: 'FF3949AB' } };
      libCell.alignment = { indent: 2 };
    }
  });

  // ── Feuille Instructions ─────────────────────────────────────────────────
  const wsInfo = wb.addWorksheet('Instructions');
  wsInfo.getCell('A1').value = 'Template import BOA Programme Pilotage';
  wsInfo.getCell('A1').font = { bold: true, size: 14 };
  [
    ['A3',  '📅 Feuille "Planning" :',    'Importez votre planning Gantt. Obligatoires : libelle, debut, fin. Recommandées : responsable, participants, rag.'],
    ['A4',  '📋 Feuille "Actions" :',    'Listez vos actions de projet. Colonnes obligatoires : action, resp.'],
    ['A5',  '⚖️ Feuille "Arbitrages" :', 'Listez vos arbitrages. Colonnes obligatoires : label, resp.'],
    ['A6',  '📊 Feuille "GAPs" :',       'Listez vos gaps fonctionnels. Colonnes obligatoires : ref, desc.'],
    ['A8',  '⚠️ Valeurs type :',         'phase  |  tâche  |  sous-tâche  |  jalon  (liste déroulante disponible dans le template)'],
    ['A9',  '⚠️ Dates :',                'Format ISO YYYY-MM-DD  (ex: 2026-06-15)'],
    ['A10', '⚠️ Avancement :',           'Nombre entier 0–100 (sans le signe %)'],
    ['A11', '⚠️ Prédécesseurs :',        'ID(s) séparés par des virgules  (ex: T_01, T_02)'],
    ['A12', '⚠️ Durée :',               'En jours ouvrés — optionnel si debut + fin sont renseignés'],
    ['A13', '⚠️ Participants :',         'Noms séparés par des virgules (ex: Jean Dupont, M. Martin) — doivent correspondre à des responsables connus'],
    ['A14', '⚠️ Valeurs RAG :',          'R = Rouge (retard critique)  |  O = Orange (attention)  |  G = Vert (ok)  |  vide = Non défini  (liste déroulante disponible)'],
    ['A15', '⚠️ Valeurs Priorité :',     'P1 (Critique), P2 (Haute), P3 (Moyenne), P4 (Faible)'],
    ['A16', '⚠️ Valeurs Décision :',     'en_cours, maintien, integration, abandon'],
    ['A17', '⚠️ Validation import :',    'Lors de l\'import, les noms non reconnus (responsable/participants) devront être associés à un responsable existant ou ignorés.'],
  ].forEach(([cell, label, val]) => {
    wsInfo.getCell(cell).value = label;
    wsInfo.getCell(cell).font = { bold: true };
    if (val) { wsInfo.getCell(cell.replace('A','B')).value = val; }
  });
  wsInfo.getColumn('A').width = 32;
  wsInfo.getColumn('B').width = 65;

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'template_import_projet_BOA.xlsx';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  showToast('📄 Template téléchargé.', 2000);
}

// ─────────────────────────────────────────────────────────────────────────────
// NAVIGATION
// ─────────────────────────────────────────────────────────────────────────────

/** Sauvegarde l'état actuel du projet dans projectData */
function _saveCurrentProjectData() {
  const id = state.currentProjectId;
  if (!id) return;
  if (!state.projectData) state.projectData = {};
  state.projectData[id] = _extractProjectData(state);
}

function _legacyRagToActionStatus(ragOrStatus) {
  const v = String(ragOrStatus || '').toLowerCase();
  if (['todo', 'in_progress', 'blocked', 'done', 'cancelled'].includes(v)) return v;
  const map = { r: 'blocked', o: 'in_progress', g: 'done', x: 'todo' };
  return map[v] || 'todo';
}

function _actionStatusToLegacyRag(status) {
  const map = { blocked: 'R', in_progress: 'O', done: 'G', cancelled: 'X', todo: 'X' };
  return map[status] || 'X';
}

async function _ensureCurrentProjectInDb() {
  if (!state.currentProjectId || typeof DB === 'undefined' || typeof DB.saveProject !== 'function') return false;
  const proj = (state.programme?.projects || []).find(p => p.id === state.currentProjectId);
  if (!proj) return false;
  try {
    return await DB.saveProject(proj);
  } catch (e) {
    console.warn('[projects] save current project:', e.message || e);
    return false;
  }
}

function _mergeDbActionsIntoState(dbActs) {
  if (!Array.isArray(dbActs) || dbActs.length === 0) return 0;
  if (!Array.isArray(state.customActions)) state.customActions = [];
  if (!state.actions) state.actions = {};

  const byId = new Map();
  state.customActions.forEach(a => {
    if (a && a.id) byId.set(a.id, a);
  });

  let mergedCount = 0;
  dbActs.forEach(raw => {
    const id = raw.id || raw.action_code || raw._dbId;
    const label = raw.action || raw.label || '';
    if (!id || !label) return;

    const old = byId.get(id) || {};
    const act = Object.assign({}, old, raw, {
      id,
      _dbProjectId: state.currentProjectId || raw.project_id || old._dbProjectId || '',
      action: label,
      label,
      category: raw.category || old.category || 'metier',
      domain: raw.domain || old.domain || '',
      domains: Array.isArray(raw.domains) ? raw.domains : (old.domains || []),
      resp: raw.resp || old.resp || '',
      side: raw.side || old.side || '',
      dependsOn: Array.isArray(raw.dependsOn) ? raw.dependsOn : (old.dependsOn || []),
      _custom: true,
      _history: old._history || raw._history || []
    });
    byId.set(id, act);

    const saved = state.actions[id] || {};
    state.actions[id] = Object.assign({}, saved, {
      status: saved.status || _legacyRagToActionStatus(raw.status || raw.rag),
      pct: saved.pct != null ? saved.pct : (raw.pct != null ? raw.pct : 0),
      commentaire: saved.commentaire || raw.commentaire || '',
      source: saved.source || raw.source || '',
      echeance: saved.echeance || raw.echeance || raw.deadline || '',
      dateFin: saved.dateFin || raw.dateFin || raw.date_fin || ''
    });
    mergedCount++;
  });

  state.customActions = Array.from(byId.values());
  return mergedCount;
}

function _clearForeignDbActionLinks() {
  if (!Array.isArray(state.customActions) || !state.currentProjectId) return;
  state.customActions.forEach(a => {
    if (a && a._dbId && a._dbProjectId && a._dbProjectId !== state.currentProjectId) {
      delete a._dbId;
      delete a._dbProjectId;
    }
  });
}

async function _loadProjectActionsFromDbIntoState() {
  if (!state.currentProjectId || !sb || typeof DB === 'undefined' || typeof DB.loadActions !== 'function') return 0;
  try {
    const localActs = Array.isArray(state.customActions) ? [...state.customActions] : [];
    const localActionState = state.actions ? JSON.parse(JSON.stringify(state.actions)) : {};
    const dbActs = await DB.loadActions();
    if (Array.isArray(dbActs) && dbActs.length > 0) {
      state.customActions = localActs;
      state.actions = localActionState;
      const count = _mergeDbActionsIntoState(dbActs);
      _saveCurrentProjectData();
      console.log('[actions] ' + count + ' action(s) chargée(s) depuis public.actions pour ' + state.currentProjectId + '.');
      return count;
    }

    if (localActs.length > 0 && typeof DB.saveAction === 'function') {
      state.actions = localActionState;
      let migrated = 0;
      for (const act of localActs) {
        act._dbProjectId = state.currentProjectId || '';
        const dbId = await DB.saveAction(act);
        if (dbId) {
          act._dbId = dbId;
          migrated++;
        }
      }
      state.customActions = localActs;
      _saveCurrentProjectData();
      console.warn('[actions] public.actions vide pour ' + state.currentProjectId + ' ; ' + migrated + ' action(s) locale(s) migrée(s).');
      return migrated;
    }
    console.warn('[actions] aucune ligne public.actions trouvée pour project_id=' + state.currentProjectId + '.');
    return 0;
  } catch (e) {
    console.warn('[actions] chargement public.actions:', e.message || e);
    return 0;
  }
}

/** Applique la visibilité des onglets en fonction des modules activés du projet */
function _applyProjectModules(proj) {
  const modules = proj.enabledModules || null; // null = projet ancien = tout afficher
  // Sélecteurs : onglets desktop, sidebar et mobile
  document.querySelectorAll('.tab-btn[data-tab], .mob-btn[data-tab], .mob-drawer-btn[data-tab]').forEach(btn => {
    const tab = btn.getAttribute('data-tab');
    const modId = _TAB_MODULE_MAP[tab];
    if (!modId) return;
    const modDef = _PROJ_MODULES.find(m => m.id === modId);
    if (!modDef) return;
    if (modDef.always || modules === null) {
      btn.style.display = '';
    } else {
      btn.style.display = modules.includes(modId) ? '' : 'none';
    }
  });
  // ── 2. Sections du dashboard (data-module="moduleid")
  document.querySelectorAll('[data-module]').forEach(el => {
    const modId  = el.getAttribute('data-module');
    const modDef = _PROJ_MODULES.find(m => m.id === modId);
    if (!modDef || modDef.always) return;
    if (modules === null) {
      el.style.display = '';
    } else {
      el.style.display = modules.includes(modId) ? '' : 'none';
    }
  });

  // Si l'onglet actif est masqué, revenir au dashboard
  const activeBtn = document.querySelector('.tab-btn.active');
  if (activeBtn && activeBtn.style.display === 'none') {
    switchTab('dashboard', document.querySelector('.tab-btn[data-tab="dashboard"]'));
  }
}

/** Restaure tous les onglets (lors du retour à la vue Programme) */
function _restoreAllTabs() {
  document.querySelectorAll('.tab-btn[data-tab], .mob-btn[data-tab], .mob-drawer-btn[data-tab]').forEach(btn => {
    btn.style.display = '';
  });
}

/** Entre dans un projet : charge ses données dans state et masque l'écran Programme */
async function enterProject(projectId) {
  const proj = (state.programme.projects || []).find(p => p.id === projectId);
  if (!proj) return;
  // Vérifier l'accès projet (permissions utilisateur)
  if (!hasProjectAccess(projectId)) {
    showToast('⛔ Accès à ce projet non autorisé pour votre compte.', 3000);
    return;
  }

  // Sauvegarder le projet précédent si présent
  _saveCurrentProjectData();

  state.currentProjectId = projectId;


  // Charger les données du nouveau projet
  const pData = (state.projectData || {})[projectId] || _defaultProjectState();
  _PROJECT_STATE_KEYS.forEach(k => { state[k] = pData[k] !== undefined ? pData[k] : _defaultProjectState()[k]; });
  state.owners = state.shared ? state.shared.owners : (state.owners || []);
  _clearForeignDbActionLinks();

  // Mettre à jour le header
  const titleEl = document.getElementById('header-project-title');
  const subText  = document.getElementById('header-project-sub-text');
  const backBtn  = document.getElementById('btn-back-programme');
  const crumb    = document.getElementById('header-programme-breadcrumb');
  const crumbName = document.getElementById('header-project-name-crumb');
  if (titleEl) titleEl.textContent = proj.name;
  if (subText)  subText.style.display = 'none';
  if (backBtn)  backBtn.style.display = '';
  if (crumb)    crumb.style.display = '';
  if (crumbName) crumbName.textContent = proj.name;

  // Basculer les écrans
  document.getElementById('programme-screen').classList.add('hidden');
  document.getElementById('app-content').style.display = '';

  // Appliquer les modules actifs (visibilité des onglets)
  _applyProjectModules(proj);

  // public.actions est la source officielle du plan d'action projet.
  // On le recharge après avoir positionné currentProjectId.
  await _loadProjectActionsFromDbIntoState();

  // Rafraîchir les vues du projet
  countdowns();       // Mettre à jour les badges jalons selon le projet
  renderDashboard();
  renderArbitrages();
  renderActions();
  renderGaps();

  // Persister
  saveState('Entrée projet', proj.name);
}

/** Retour à l'écran Programme */
function exitToProgramme() {
  // Sauvegarder l'état du projet courant
  _saveCurrentProjectData();
  saveState('Retour programme');

  state.currentProjectId = null;

  // Restaurer le header standard
  const titleEl  = document.getElementById('header-project-title');
  const subText   = document.getElementById('header-project-sub-text');
  const backBtn   = document.getElementById('btn-back-programme');
  const crumb     = document.getElementById('header-programme-breadcrumb');
  if (titleEl) titleEl.textContent = state.programme.name || 'Mon Programme';
  if (subText)  subText.style.display = '';
  if (backBtn)  backBtn.style.display = 'none';
  if (crumb)    crumb.style.display   = 'none';

  // Restaurer tous les onglets (avant de montrer le Programme)
  _restoreAllTabs();

  // Basculer les écrans
  document.getElementById('app-content').style.display = 'none';
  document.getElementById('programme-screen').classList.remove('hidden');

  renderProgrammeScreen();
}

// ─────────────────────────────────────────────────────────────────────────────
// RENDU DE L'ÉCRAN PROGRAMME
// ─────────────────────────────────────────────────────────────────────────────

/** Filtre projets */
function setProgrammeProjectFilter(filter) {
  _progProjectFilter = filter;
  ['active','all','archived'].forEach(f => {
    const btn = document.getElementById('prog-filter-' + f);
    if (!btn) return;
    btn.style.background = f === filter ? '#1565C0' : '#e2e8f0';
    btn.style.color       = f === filter ? 'white'   : '#475569';
  });
  _renderProgrammeProjectCards();
}

/** Rendu principal de l'écran Programme */
function renderProgrammeScreen() {
  // Titre
  const tEl = document.getElementById('prog-screen-title');
  const dEl = document.getElementById('prog-screen-desc');
  if (tEl) tEl.textContent = '🏛 ' + (state.programme.name || 'Programme');
  if (dEl) dEl.textContent = state.programme.description || '';

  // Bouton Nouveau Projet (admin uniquement)
  const newBtn = document.getElementById('btn-new-project');
  if (newBtn) {
    const isAdmin = !currentSession || currentSession.role === 'admin';
    newBtn.style.display = isAdmin ? '' : 'none';
  }
  const settBtn = document.getElementById('btn-prog-settings');
  if (settBtn) {
    const isAdmin = !currentSession || currentSession.role === 'admin';
    settBtn.style.display = isAdmin ? '' : 'none';
  }

  renderProgrammeKPIs();
  _renderProgrammeProjectCards();
  renderProgrammeGantt();
  renderProgrammeRiskHeatmap();
  renderProgrammeAlerts();
}

/** KPIs consolidés */
function renderProgrammeKPIs() {
  const grid = document.getElementById('prog-kpis-grid');
  if (!grid) return;

  const projects = (state.programme.projects || []).filter(p => p.status !== 'archived');
  let greenActions = 0, redActions = 0, amberActions = 0,
      totalRisks = 0, criticalRisks = 0, totalActionsCount = 0,
      pendingArbitrages = 0, totalArbitragesCount = 0;

  projects.forEach(proj => {
    const pd = (state.projectData || {})[proj.id] || {};

    // ── Projet standard ─────────────────────────────────────────────────
    // Eviter de masquer le tableau global `actions` (statique) → renommer en actStatuses
    const actStatuses = pd.actions || {};
    const customActs  = pd.customActions || [];
    // Total = actions statiques (chargées globalement) + custom du projet
    const projectTotal = Math.max(actions.length + customActs.length,
                                  Object.keys(actStatuses).length);
    totalActionsCount += projectTotal;
    Object.values(actStatuses).forEach(a => {
      if (a.rag === 'G') greenActions++;
      else if (a.rag === 'R') redActions++;
      else if (a.rag === 'A') amberActions++;
    });

    // Risques
    const risks = pd.risks || [];
    totalRisks += risks.length;
    criticalRisks += risks.filter(r => {
      const sev = (r.prob || r.probability || 1) * (r.impact || 1);
      return sev >= 12;
    }).length;

    // Arbitrages — statuses stockés dans pd.arbitrages {id:{decision,...}}
    const arbStatuses  = pd.arbitrages || {};
    const custArbs     = pd.customArbitrages || [];
    const allArbs      = [...arbitrages, ...custArbs];
    totalArbitragesCount += allArbs.length;
    pendingArbitrages += allArbs.filter(a => {
      const dec = (arbStatuses[a.id] || {}).decision || 'en_cours';
      return dec === 'en_cours';
    }).length;
  });

  const avgProgress = totalActionsCount > 0
    ? Math.round((greenActions / totalActionsCount) * 100) : 0;

  const kpis = [
    { icon:'📁', label:'Projets actifs',        value: projects.length,                              color:'#1565C0', bg:'#e3f2fd',  border:'#93c5fd', bar:null },
    { icon:'✅', label:'Actions terminées',      value: greenActions + ' / ' + totalActionsCount,    color:'#2E7D52', bg:'#e8f5e9',  border:'#86efac', bar: totalActionsCount>0?Math.round(greenActions/totalActionsCount*100):0 },
    { icon:'🔴', label:'Actions en retard',      value: redActions,                                   color:'#C62828', bg:'#ffebee',  border:'#fca5a5', bar:null, alert: redActions > 0 },
    { icon:'⚠️', label:'Risques critiques',      value: criticalRisks + ' / ' + totalRisks,          color:'#E65100', bg:'#fff3e0',  border:'#fdba74', bar:null, alert: criticalRisks > 0 },
    { icon:'⚖️', label:'Arbitrages en attente',  value: pendingArbitrages + ' / ' + totalArbitragesCount, color:'#6B21A8', bg:'#f3e8ff', border:'#d8b4fe', bar:null, alert: pendingArbitrages > 0 },
    { icon:'📈', label:'Avancement global',      value: avgProgress + '%',                            color: avgProgress>=70?'#2E7D52':avgProgress>=40?'#D97706':'#C62828', bg:'#f8fafc', border:'#e2e8f0', bar: avgProgress },
  ];

  grid.innerHTML = kpis.map(k => `
    <div style="background:${k.bg};border-radius:12px;padding:16px 18px;display:flex;flex-direction:column;gap:6px;
        border:1.5px solid ${k.border};position:relative;overflow:hidden;">
      ${k.alert ? '<div style="position:absolute;top:10px;right:10px;width:8px;height:8px;border-radius:50%;background:currentColor;animation:pulse 1.5s infinite;"></div>' : ''}
      <div style="font-size:26px;line-height:1;">${k.icon}</div>
      <div style="font-size:24px;font-weight:800;color:${k.color};line-height:1;">${k.value}</div>
      <div style="font-size:11px;color:#64748b;font-weight:600;">${k.label}</div>
      ${k.bar !== null ? `<div style="background:rgba(0,0,0,.08);border-radius:3px;height:4px;overflow:hidden;margin-top:2px;">
        <div style="background:${k.color};height:100%;width:${k.bar}%;transition:width .5s;border-radius:3px;"></div>
      </div>` : ''}
    </div>
  `).join('');
}

/** Cartes projets */
function _renderProgrammeProjectCards() {
  const container = document.getElementById('prog-projects-grid');
  const countEl   = document.getElementById('prog-projects-count');
  if (!container) return;

  const allProjects = state.programme.projects || [];
  const filtered = allProjects.filter(p => {
    // Filtre statut
    if (_progProjectFilter === 'active')   { if (p.status === 'archived') return false; }
    else if (_progProjectFilter === 'archived') { if (p.status !== 'archived') return false; }
    // Filtre accès projet (permissions utilisateur)
    if (!hasProjectAccess(p.id)) return false;
    return true;
  });

  if (countEl) countEl.textContent = filtered.length;

  if (filtered.length === 0) {
    container.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:40px;color:#94a3b8;font-size:14px;">
      ${_progProjectFilter === 'archived' ? '📦 Aucun projet archivé.' : '📂 Aucun projet actif. Créez votre premier projet !'}
    </div>`;
    return;
  }

  container.innerHTML = filtered.map(proj => {
    const pd = (state.projectData || {})[proj.id] || {};

    // Eviter le shadowing du tableau global `actions` → renommer en actStatuses
    const actStatuses = pd.actions || {};
    const customActs  = pd.customActions || [];
    const actVals = Object.values(actStatuses);
    const green   = actVals.filter(a => a.rag === 'G').length;
    const red     = actVals.filter(a => a.rag === 'R').length;
    const amber   = actVals.filter(a => a.rag === 'A').length;
    // Total réel = actions statiques (globales) + custom du projet
    const total   = Math.max(actions.length + customActs.length, actVals.length);
    const pct     = total > 0 ? Math.round((green / total) * 100) : 0;
    const risks   = pd.risks || [];
    const critRisks = risks.filter(r => (r.prob||r.probability||1)*(r.impact||1) >= 12).length;

    // Arbitrages en attente de décision
    const arbStatuses = pd.arbitrages || {};
    const custArbs    = pd.customArbitrages || [];
    const allProjArbs = [...arbitrages, ...custArbs];
    const pendingArbs = allProjArbs.filter(a => {
      const dec = (arbStatuses[a.id] || {}).decision || 'en_cours';
      return dec === 'en_cours';
    }).length;

    const archived = proj.status === 'archived';
    const isAdmin  = !currentSession || currentSession.role === 'admin';

    const barColor = pct >= 70 ? '#2E7D52' : pct >= 40 ? '#E8702A' : '#E63329';

    return `<div style="background:white;border-radius:12px;box-shadow:0 2px 10px rgba(0,0,0,.07);
        overflow:hidden;border-top:4px solid ${proj.color || '#1565C0'};
        transition:box-shadow .15s;cursor:${archived ? 'default' : 'pointer'};
        opacity:${archived ? '.6' : '1'};"
      ${archived ? '' : 'onclick="enterProject(\'' + proj.id + '\')"'}
      onmouseover="if(!${archived})this.style.boxShadow='0 4px 20px rgba(0,0,0,.13)'"
      onmouseout="this.style.boxShadow='0 2px 10px rgba(0,0,0,.07)'">

      <div style="padding:16px 18px 12px;">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:8px;">
          <div>
            <div style="font-size:16px;font-weight:700;color:#1e293b;line-height:1.3;">${_esc(proj.name)}</div>
            ${proj.description ? `<div style="font-size:11px;color:#94a3b8;margin-top:2px;">${_esc(proj.description)}</div>` : ''}
          </div>
          ${archived ? '<span style="background:#f1f5f9;color:#94a3b8;border-radius:6px;padding:2px 8px;font-size:10px;font-weight:700;">ARCHIVÉ</span>' : ''}
          ${isAdmin && !archived ? `<div onclick="event.stopPropagation()" style="position:relative;">
            <button onclick="toggleProjectMenu('${proj.id}')" style="background:#f1f5f9;border:none;border-radius:6px;width:28px;height:28px;cursor:pointer;font-size:14px;color:#64748b;">⋯</button>
            <div id="pmenu-${proj.id}" style="display:none;position:absolute;right:0;top:32px;background:white;border:1px solid #e2e8f0;border-radius:8px;box-shadow:0 4px 20px rgba(0,0,0,.12);min-width:150px;z-index:100;">
              <button onclick="openEditProjectModal('${proj.id}')" style="display:block;width:100%;text-align:left;padding:9px 14px;border:none;background:none;cursor:pointer;font-size:12px;color:#1565C0;"
                onmouseover="this.style.background='#e3f2fd'" onmouseout="this.style.background='none'">⚙️ Modifier</button>
              <button onclick="openRenameProject('${proj.id}')" style="display:block;width:100%;text-align:left;padding:9px 14px;border:none;background:none;cursor:pointer;font-size:12px;color:#374151;"
                onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background='none'">✏️ Renommer</button>
              <button onclick="archiveProject('${proj.id}')" style="display:block;width:100%;text-align:left;padding:9px 14px;border:none;background:none;cursor:pointer;font-size:12px;color:#E65100;"
                onmouseover="this.style.background='#fff7ed'" onmouseout="this.style.background='none'">📦 Archiver</button>
            </div>
          </div>` : ''}
          ${isAdmin && archived ? `<div onclick="event.stopPropagation()" style="position:relative;">
            <button onclick="toggleProjectMenu('${proj.id}')" style="background:#f1f5f9;border:none;border-radius:6px;width:28px;height:28px;cursor:pointer;font-size:14px;color:#64748b;">⋯</button>
            <div id="pmenu-${proj.id}" style="display:none;position:absolute;right:0;top:32px;background:white;border:1px solid #e2e8f0;border-radius:8px;box-shadow:0 4px 20px rgba(0,0,0,.12);min-width:170px;z-index:100;">
              <button onclick="reactivateProject('${proj.id}')" style="display:block;width:100%;text-align:left;padding:9px 14px;border:none;background:none;cursor:pointer;font-size:12px;color:#166534;"
                onmouseover="this.style.background='#f0fdf4'" onmouseout="this.style.background='none'">↩ Réactiver</button>
              <div style="height:1px;background:#f1f5f9;margin:2px 0;"></div>
              <button onclick="deleteProjectPermanently('${proj.id}')" style="display:block;width:100%;text-align:left;padding:9px 14px;border:none;background:none;cursor:pointer;font-size:12px;color:#dc2626;"
                onmouseover="this.style.background='#fef2f2'" onmouseout="this.style.background='none'">🗑️ Supprimer définitivement</button>
            </div>
          </div>` : ''}
        </div>

        <!-- Avancement -->
        <div style="margin-bottom:12px;">
          <div style="display:flex;justify-content:space-between;margin-bottom:5px;">
            <span style="font-size:11px;color:#64748b;font-weight:600;">Avancement actions</span>
            <span style="font-size:11px;font-weight:700;color:${barColor};">${pct}%</span>
          </div>
          <div style="background:#f1f5f9;border-radius:4px;height:6px;overflow:hidden;">
            <div style="background:${barColor};height:100%;width:${pct}%;transition:width .4s;"></div>
          </div>
        </div>

        <!-- Stats rapides -->
        <div style="display:flex;gap:6px;flex-wrap:wrap;">
          ${total > 0 ? `
          <span style="background:#e8f5e9;color:#2E7D52;border-radius:6px;padding:3px 8px;font-size:11px;font-weight:600;">✅ ${green}/${total}</span>
          ${amber > 0 ? `<span style="background:#fff3cd;color:#B45309;border-radius:6px;padding:3px 8px;font-size:11px;font-weight:600;">⏳ ${amber}</span>` : ''}
          ${red > 0 ? `<span style="background:#ffebee;color:#C62828;border-radius:6px;padding:3px 8px;font-size:11px;font-weight:600;">🔴 ${red}</span>` : ''}
          ` : '<span style="color:#94a3b8;font-size:11px;">Actions non configurées</span>'}
          ${critRisks > 0 ? `<span style="background:#ffebee;color:#C62828;border-radius:6px;padding:3px 8px;font-size:11px;font-weight:600;">⚠️ ${critRisks} risque${critRisks>1?'s':''} critique${critRisks>1?'s':''}</span>` : ''}
          ${pendingArbs > 0 ? `<span style="background:#f3e8ff;color:#6B21A8;border-radius:6px;padding:3px 8px;font-size:11px;font-weight:600;">⚖️ ${pendingArbs} arb. en attente</span>` : ''}
          ${risks.length === 0 && actVals.length === 0 ? '<span style="color:#94a3b8;font-size:11px;font-style:italic;">Aucun suivi actif</span>' : ''}
        </div>
      </div>

      ${!archived
        ? `<div style="padding:10px 18px;background:#f8fafc;border-top:1px solid #f1f5f9;display:flex;align-items:center;justify-content:space-between;">
             <span style="font-size:11px;color:#94a3b8;">Créé le ${proj.createdAt ? new Date(proj.createdAt).toLocaleDateString('fr-FR') : '—'}</span>
             <span style="font-size:12px;font-weight:700;color:${proj.color || '#1565C0'};">Ouvrir →</span>
           </div>`
        : isAdmin
          ? `<div style="padding:10px 18px;background:#fafafa;border-top:1px solid #f1f5f9;display:flex;align-items:center;justify-content:space-between;gap:8px;" onclick="event.stopPropagation()">
               <span style="font-size:11px;color:#94a3b8;">Archivé · Créé le ${proj.createdAt ? new Date(proj.createdAt).toLocaleDateString('fr-FR') : '—'}</span>
               <div style="display:flex;gap:6px;">
                 <button onclick="reactivateProject('${proj.id}')"
                   style="padding:4px 10px;background:#f0fdf4;border:1.5px solid #86efac;border-radius:6px;color:#166534;font-size:11px;font-weight:700;cursor:pointer;white-space:nowrap;"
                   onmouseover="this.style.background='#dcfce7'" onmouseout="this.style.background='#f0fdf4'">↩ Réactiver</button>
                 <button onclick="deleteProjectPermanently('${proj.id}')"
                   style="padding:4px 10px;background:#fef2f2;border:1.5px solid #fca5a5;border-radius:6px;color:#dc2626;font-size:11px;font-weight:700;cursor:pointer;white-space:nowrap;"
                   onmouseover="this.style.background='#fee2e2'" onmouseout="this.style.background='#fef2f2'">🗑️ Supprimer</button>
               </div>
             </div>`
          : ''
      }
    </div>`;
  }).join('');
}

function toggleProjectMenu(projectId) {
  const menu = document.getElementById('pmenu-' + projectId);
  if (!menu) return;
  const isVisible = menu.style.display !== 'none';
  // Fermer tous les menus
  document.querySelectorAll('[id^="pmenu-"]').forEach(m => m.style.display = 'none');
  menu.style.display = isVisible ? 'none' : 'block';
  // Fermer au clic extérieur
  if (!isVisible) {
    setTimeout(() => {
      const closer = (e) => { menu.style.display = 'none'; document.removeEventListener('click', closer); };
      document.addEventListener('click', closer);
    }, 0);
  }
}

function openRenameProject(projectId) {
  const proj = (state.programme.projects || []).find(p => p.id === projectId);
  if (!proj) return;
  const newName = prompt('Nouveau nom du projet :', proj.name);
  if (!newName || !newName.trim()) return;
  proj.name = newName.trim();
  _saveProgrammeData('Renommage projet', proj.name);
  renderProgrammeScreen();
}

function archiveProject(projectId) {
  if (!confirm('Archiver ce projet ? Il ne sera plus visible dans la liste des projets actifs.')) return;
  const proj = (state.programme.projects || []).find(p => p.id === projectId);
  if (!proj) return;
  proj.status = 'archived';
  _saveProgrammeData('Archivage projet', proj.name);
  renderProgrammeScreen();
}

function reactivateProject(projectId) {
  const proj = (state.programme.projects || []).find(p => p.id === projectId);
  if (!proj) return;
  proj.status = 'active';
  _saveProgrammeData('Réactivation projet', proj.name);
  // Basculer le filtre sur "Actifs" pour que le projet soit visible
  setProgrammeProjectFilter('active');
  renderProgrammeScreen();
  showToast('✅ Projet « ' + proj.name + ' » réactivé.', 3000);
}

function deleteProjectPermanently(projectId) {
  const proj = (state.programme.projects || []).find(p => p.id === projectId);
  if (!proj) return;
  const name = proj.name || projectId;
  if (!confirm(
    '⚠️ Supprimer définitivement le projet « ' + name + ' » ?\n\n' +
    'Toutes les données associées (actions, risques, GAPs, arbitrages…) seront perdues.\n\n' +
    'Cette action est IRRÉVERSIBLE.'
  )) return;
  // Double confirmation pour éviter les suppressions accidentelles
  const typed = prompt('Tapez le nom du projet pour confirmer la suppression :\n"' + name + '"');
  if (!typed || typed.trim() !== name.trim()) {
    if (typed !== null) alert('Nom incorrect — suppression annulée.');
    return;
  }
  // Retirer de la liste des projets
  const idx = (state.programme.projects || []).findIndex(p => p.id === projectId);
  if (idx >= 0) state.programme.projects.splice(idx, 1);
  // Supprimer les données du projet
  if (state.projectData && state.projectData[projectId]) {
    delete state.projectData[projectId];
  }
  // Si c'était le projet courant, revenir à l'écran programme
  if (state.currentProjectId === projectId) {
    state.currentProjectId = null;
  }
  _saveProgrammeData('Suppression projet', name);
  renderProgrammeScreen();
  showToast('🗑️ Projet « ' + name + ' » supprimé définitivement.', 4000);
}

// ─────────────────────────────────────────────────────────────────────────────
// ÉDITION DE PROJET EXISTANT
// ─────────────────────────────────────────────────────────────────────────────
let _epProjectId = null; // ID du projet en cours d'édition

function openEditProjectModal(projectId) {
  const isAdmin = !currentSession || currentSession.role === 'admin';
  if (!isAdmin) { showToast('⛔ Seul un administrateur peut modifier un projet.', 3000); return; }

  const resolvedId = projectId || state.currentProjectId;
  const proj = (state.programme.projects || []).find(p => p.id === resolvedId);
  if (!proj) return;
  _epProjectId = resolvedId;

  // Pré-remplir les champs
  document.getElementById('ep-name').value  = proj.name         || '';
  document.getElementById('ep-color').value = proj.color        || '#1565C0';
  document.getElementById('ep-start').value = proj.startDate    || '';
  document.getElementById('ep-end').value   = proj.endDate      || '';
  const epChef = document.getElementById('ep-chef');
  if (epChef) epChef.value = proj.chefDeProjet || '';
  // Peupler la datalist avec les owners connus
  const epChefList = document.getElementById('ep-chef-datalist');
  if (epChefList) {
    epChefList.innerHTML = (typeof getOwnersList === 'function' ? getOwnersList() : [])
      .map(n => `<option value="${n.replace(/"/g,'&quot;')}">`)
      .join('');
  }

  // Pastilles couleur
  const colorsDiv = document.getElementById('ep-colors');
  if (colorsDiv) {
    colorsDiv.innerHTML = PROJECT_COLORS.map(c =>
      `<div onclick="selectEpColor('${c}')" id="epc-${c.replace('#','')}"
        style="width:24px;height:24px;border-radius:50%;background:${c};cursor:pointer;
          border:3px solid ${c===proj.color?'white':'transparent'};
          box-shadow:${c===proj.color?'0 0 0 2px '+c:'none'};transition:all .15s;"></div>`
    ).join('');
  }

  // Source de données
  const ds = proj.dataSource || 'cbs';
  const rCbs   = document.getElementById('ep-ds-cbs');
  const rBlank = document.getElementById('ep-ds-blank');
  if (rCbs)   rCbs.checked   = ds === 'cbs';
  if (rBlank) rBlank.checked = ds === 'blank';
  _epUpdateDsStyle();

  // Modules
  _epRenderModules(proj.enabledModules || null);

  // Impacts
  _epRenderImpacts();

  document.getElementById('edit-project-modal').classList.remove('hidden');
  setTimeout(() => document.getElementById('ep-name').focus(), 100);
}

function selectEpColor(c) {
  document.getElementById('ep-color').value = c;
  document.querySelectorAll('[id^="epc-"]').forEach(el => {
    el.style.border     = el.id === 'epc-' + c.replace('#','') ? '3px solid white' : '3px solid transparent';
    el.style.boxShadow  = el.id === 'epc-' + c.replace('#','') ? '0 0 0 2px ' + c  : 'none';
  });
}

function _epUpdateDsStyle() {
  const val = (document.querySelector('input[name="ep-datasource"]:checked') || {}).value || 'cbs';
  const lblCbs   = document.getElementById('ep-ds-label-cbs');
  const lblBlank = document.getElementById('ep-ds-label-blank');
  if (lblCbs)   { lblCbs.style.border   = val === 'cbs'   ? '2px solid #1565C0' : '2px solid #e2e8f0'; lblCbs.style.background   = val === 'cbs'   ? '#e3f2fd' : 'white'; }
  if (lblBlank) { lblBlank.style.border = val === 'blank' ? '2px solid #374151' : '2px solid #e2e8f0'; lblBlank.style.background = val === 'blank' ? '#f1f5f9' : 'white'; }
}

function _epRenderModules(enabledModules) {
  const div = document.getElementById('ep-modules');
  if (!div) return;
  div.innerHTML = _PROJ_MODULES.map(m => {
    const active = m.always
      ? true
      : (enabledModules === null || (Array.isArray(enabledModules) && enabledModules.includes(m.id)));
    return `<label style="display:flex;align-items:center;gap:8px;border:1.5px solid ${active?'#1565C0':'#e2e8f0'};
        border-radius:8px;padding:8px 10px;cursor:pointer;transition:all .15s;
        background:${active?'#e3f2fd':'white'};"
        onclick="this.style.border='1.5px solid '+(document.getElementById('epmcb-${m.id}').checked?'#e2e8f0':'#1565C0');
          this.style.background=document.getElementById('epmcb-${m.id}').checked?'white':'#e3f2fd';">
      <input type="checkbox" id="epmcb-${m.id}" ${m.always ? 'disabled checked' : (active ? 'checked' : '')}
        style="cursor:pointer;">
      <div>
        <div style="font-size:12px;font-weight:700;color:#334155;">${m.icon} ${m.label}</div>
        <div style="font-size:10px;color:#94a3b8;">${m.desc}</div>
      </div>
    </label>`;
  }).join('');
}

// ── Mini-liste Impacts dans la modale projet ────────────────────────────────
function _epGetImpacts() {
  if (_epProjectId === state.currentProjectId) return state.impacts || [];
  return (state.projectData && state.projectData[_epProjectId] && state.projectData[_epProjectId].impacts) || [];
}

function _epRenderImpacts() {
  const container = document.getElementById('ep-impacts-list');
  if (!container) return;
  const list = _epGetImpacts();

  const _IT = {
    planning:  { label:'Planning',  color:'#1565C0', bg:'#E3F0FF', icon:'📅' },
    budget:    { label:'Budget',    color:'#2E7D52', bg:'#E8F5ED', icon:'💰' },
    perimetre: { label:'Périmètre', color:'#7B1FA2', bg:'#F3E5F5', icon:'🗂️' },
    ressource: { label:'Ressource', color:'#E8702A', bg:'#FEF3E2', icon:'👤' },
    technique: { label:'Technique', color:'#0277BD', bg:'#E1F5FE', icon:'🔧' },
    autre:     { label:'Autre',     color:'#546E7A', bg:'#ECEFF1', icon:'📌' },
  };
  const _IS = {
    ouvert:   { label:'Ouvert',   color:'#E63329' },
    en_cours: { label:'En cours', color:'#E8702A' },
    resolu:   { label:'Résolu',   color:'#2E7D52' },
    accepte:  { label:'Accepté',  color:'#546E7A' },
  };

  const dp = list.reduce((s, i) => s + (parseFloat(i.impact_planning) || 0), 0);
  const db = list.reduce((s, i) => s + (parseFloat(i.impact_budget)   || 0), 0);
  const nbOpen = list.filter(i => i.statut === 'ouvert' || i.statut === 'en_cours').length;
  const planColor = dp > 0 ? '#E63329' : dp < 0 ? '#2E7D52' : '#888';
  const budgColor = db > 0 ? '#E63329' : db < 0 ? '#2E7D52' : '#888';

  const sorted = [...list].sort((a, b) => (b.date || '').localeCompare(a.date || '')).slice(0, 5);

  const rows = sorted.length === 0
    ? `<div style="text-align:center;padding:18px;color:#bbb;font-size:12px;">Aucun impact enregistré pour ce projet</div>`
    : sorted.map((imp, i) => {
        const realIdx = list.indexOf(imp);
        const t = _IT[imp.type] || _IT.autre;
        const s = _IS[imp.statut] || _IS.ouvert;
        const dPlan = parseFloat(imp.impact_planning) || 0;
        const dBudg = parseFloat(imp.impact_budget)   || 0;
        const planHtml = dPlan === 0 ? '<span style="color:#ccc">—</span>'
          : `<span style="font-weight:700;color:${dPlan>0?'#E63329':'#2E7D52'}">${dPlan>0?'+':''}${dPlan}j</span>`;
        const budgHtml = dBudg === 0 ? '<span style="color:#ccc">—</span>'
          : `<span style="font-weight:700;color:${dBudg>0?'#E63329':'#2E7D52'}">${dBudg>0?'+':''}${dBudg}j</span>`;
        const bg = i % 2 === 0 ? '#fff' : '#fafbff';
        const isCurrentProj = _epProjectId === state.currentProjectId;
        const editBtn = isCurrentProj
          ? `<button onclick="openEditImpactFromProject(${realIdx})" title="Modifier" style="background:none;border:none;color:#1565C0;cursor:pointer;font-size:13px;padding:0 4px;">✏️</button>`
          : '';
        const delBtn = isCurrentProj
          ? `<button onclick="deleteImpactFromProject(${realIdx})" title="Supprimer" style="background:none;border:none;color:#E63329;cursor:pointer;font-size:13px;padding:0 4px;">🗑️</button>`
          : '';
        return `<tr style="background:${bg};border-bottom:1px solid #f0f2f7;">
          <td style="padding:6px 8px;font-size:11px;white-space:nowrap;">
            <span style="background:${t.bg};color:${t.color};border-radius:8px;padding:1px 6px;font-size:10px;font-weight:700;">${t.icon} ${t.label}</span>
          </td>
          <td style="padding:6px 8px;font-size:12px;font-weight:600;color:#1a2640;max-width:180px;">${escHtml(imp.titre||'—')}</td>
          <td style="padding:6px 8px;font-size:11px;color:#555;max-width:140px;">${escHtml((imp.cause||'').substring(0,50))}</td>
          <td style="padding:6px 8px;text-align:center;">${planHtml}</td>
          <td style="padding:6px 8px;text-align:center;">${budgHtml}</td>
          <td style="padding:6px 8px;white-space:nowrap;">
            <span style="color:${s.color};font-size:10px;font-weight:700;">${s.label}</span>
          </td>
          <td style="padding:6px 8px;white-space:nowrap;">${editBtn}${delBtn}</td>
        </tr>`;
      }).join('');

  const moreLink = list.length > 5
    ? `<div style="text-align:center;padding:6px;font-size:11px;color:#1565C0;cursor:pointer;"
        onclick="switchTab('impacts',null);document.getElementById('edit-project-modal').classList.add('hidden')">
        Voir tous les impacts (${list.length}) →
       </div>`
    : '';

  container.innerHTML = `
    <div style="display:flex;gap:12px;margin-bottom:10px;flex-wrap:wrap;">
      <div style="background:#fff;border:1px solid #e2e8f0;border-radius:8px;padding:8px 14px;display:flex;align-items:center;gap:8px;flex:1;min-width:110px;">
        <span style="font-size:18px;">📅</span>
        <div><div style="font-size:18px;font-weight:800;color:${planColor}">${dp>=0?'+':''}${dp}j</div><div style="font-size:9px;color:#888;">Δ Planning</div></div>
      </div>
      <div style="background:#fff;border:1px solid #e2e8f0;border-radius:8px;padding:8px 14px;display:flex;align-items:center;gap:8px;flex:1;min-width:110px;">
        <span style="font-size:18px;">💰</span>
        <div><div style="font-size:18px;font-weight:800;color:${budgColor}">${db>=0?'+':''}${db}j</div><div style="font-size:9px;color:#888;">Δ Budget</div></div>
      </div>
      <div style="background:#fff;border:1px solid #e2e8f0;border-radius:8px;padding:8px 14px;display:flex;align-items:center;gap:8px;flex:1;min-width:110px;">
        <span style="font-size:18px;">${nbOpen > 0 ? '🔴' : '🟢'}</span>
        <div><div style="font-size:18px;font-weight:800;color:${nbOpen>0?'#E63329':'#2E7D52'}">${nbOpen}</div><div style="font-size:9px;color:#888;">Ouverts</div></div>
      </div>
    </div>
    <div style="overflow-x:auto;">
      <table style="width:100%;border-collapse:collapse;font-size:12px;">
        <thead>
          <tr style="background:#f0f2f5;">
            <th style="padding:6px 8px;font-size:10px;font-weight:700;color:#64748b;text-align:left;border-bottom:1.5px solid #1565C0;">Type</th>
            <th style="padding:6px 8px;font-size:10px;font-weight:700;color:#64748b;text-align:left;border-bottom:1.5px solid #1565C0;">Titre</th>
            <th style="padding:6px 8px;font-size:10px;font-weight:700;color:#64748b;text-align:left;border-bottom:1.5px solid #1565C0;">Cause</th>
            <th style="padding:6px 8px;font-size:10px;font-weight:700;color:#64748b;text-align:center;border-bottom:1.5px solid #1565C0;">Δ Plan.</th>
            <th style="padding:6px 8px;font-size:10px;font-weight:700;color:#64748b;text-align:center;border-bottom:1.5px solid #1565C0;">Δ Budg.</th>
            <th style="padding:6px 8px;font-size:10px;font-weight:700;color:#64748b;text-align:left;border-bottom:1.5px solid #1565C0;">Statut</th>
            <th style="padding:6px 8px;border-bottom:1.5px solid #1565C0;"></th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    ${moreLink}`;
}

let _impactFromProjectModal = false;

function openAddImpactFromProject() {
  _impactFromProjectModal = true;
  if (typeof openAddImpact === 'function') openAddImpact();
}

function openEditImpactFromProject(idx) {
  _impactFromProjectModal = true;
  if (typeof openEditImpact === 'function') openEditImpact(idx);
}

function deleteImpactFromProject(idx) {
  if (typeof deleteImpact === 'function') deleteImpact(idx);
  _epRenderImpacts();
}

function saveEditProject() {
  const proj = (state.programme.projects || []).find(p => p.id === _epProjectId);
  if (!proj) return;

  const newName = (document.getElementById('ep-name').value || '').trim();
  if (!newName) { document.getElementById('ep-name').style.borderColor = '#E63329'; return; }

  proj.name         = newName;
  proj.color        = document.getElementById('ep-color').value;
  proj.startDate    = document.getElementById('ep-start').value || '';
  proj.endDate      = document.getElementById('ep-end').value   || '';
  proj.chefDeProjet = (document.getElementById('ep-chef')?.value || '').trim();

  // Source de données
  const dsEl = document.querySelector('input[name="ep-datasource"]:checked');
  if (dsEl) proj.dataSource = dsEl.value;

  // Modules activés
  proj.enabledModules = _PROJ_MODULES
    .filter(m => m.always || document.getElementById('epmcb-' + m.id)?.checked)
    .map(m => m.id);

  document.getElementById('edit-project-modal').classList.add('hidden');
  _saveProgrammeData('Modification projet', proj.name);
  renderProgrammeScreen();

  // Si on est actuellement dans ce projet, appliquer les modules immédiatement
  if (state.currentProjectId === _epProjectId) {
    _applyProjectModules(proj);
  }
  showToast('✅ Projet "' + proj.name + '" mis à jour.', 2500);
}

/** Sauvegarde les données de niveau programme (bypasse canEdit — admin déjà vérifié) */
function _saveProgrammeData(action, detail) {
  try { localStorage.setItem('boa_v4_state', JSON.stringify(state)); } catch(e) {}
  if (sb && window._sbWriteOK) {
    _saveProjectStateCloud('Programme save');
  }
  const indicator = document.getElementById('save-indicator');
  if (indicator) { indicator.style.display = 'block'; setTimeout(() => indicator.style.display = 'none', 1500); }
}

// ─────────────────────────────────────────────────────────────────────────────
// GANTT MULTI-PROJETS — Vue Macro dépliable par phases
// ─────────────────────────────────────────────────────────────────────────────

/** Bascule l'expansion d'un projet dans le Gantt */
function _progToggleGanttExpand(projectId) {
  _progGanttExpanded[projectId] = !_progGanttExpanded[projectId];
  renderProgrammeGantt();
}



function renderProgrammeGantt() {
  const container = document.getElementById('prog-gantt-container');
  if (!container) return;

  const projects = (state.programme.projects || []).filter(p => p.status !== 'archived');
  if (projects.length === 0) {
    container.innerHTML = '<p style="color:#94a3b8;font-size:13px;text-align:center;padding:20px;">Aucun projet actif.</p>';
    return;
  }

  const ganttStart = new Date('2026-01-01');
  const ganttEnd   = new Date('2026-12-31');
  const totalMs    = ganttEnd - ganttStart;

  function toPct(dateStr) {
    if (!dateStr) return null;
    const d = new Date(dateStr);
    return Math.max(0, Math.min(100, ((d - ganttStart) / totalMs) * 100));
  }
  function addDays(base, n) {
    const d = new Date(base);
    d.setDate(d.getDate() + n);
    return d.toISOString().split('T')[0];
  }
  function pctColor(p) { return p >= 70 ? '#2E7D32' : p >= 40 ? '#E8702A' : '#E63329'; }

  function ganttBar(startDate, endDate, color, pct, height) {
    const sp = startDate ? toPct(startDate) : 5;
    const ep = endDate   ? toPct(endDate)   : 80;
    const spSafe = sp ?? 5, epSafe = ep ?? 80;
    const w = Math.max(2, epSafe - spSafe);
    return `<div style="position:relative;height:${height}px;background:#f1f5f9;border-radius:4px;overflow:hidden;">
      <div style="position:absolute;left:${spSafe}%;width:${w}%;height:100%;background:${color};border-radius:4px;
        opacity:.85;display:flex;align-items:center;justify-content:center;">
        ${w > 8 ? `<span style="font-size:10px;color:white;font-weight:700;white-space:nowrap;">${pct}%</span>` : ''}
      </div>
      <div style="position:absolute;left:${toPct(new Date().toISOString().split('T')[0])}%;top:0;bottom:0;width:2px;background:#E63329;opacity:.7;z-index:2;"></div>
    </div>`;
  }

  const months = ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc'];
  const monthsHtml = months.map((m, i) =>
    `<div style="position:absolute;left:${(i/12)*100}%;font-size:9px;color:#94a3b8;transform:translateX(-50%);white-space:nowrap;">${m}</div>`
  ).join('');

  const rows = projects.map(proj => {
    const pd         = (state.projectData || {})[proj.id] || {};
    const isExpanded = !!_progGanttExpanded[proj.id];
    const projColor  = proj.color || '#1565C0';
    let projPct = 0, projStart = null, projEnd = null;

    // ── Calcul des tâches Gantt consolidées (computed ici, non stocké sur pd) ──
    const _gcCustom = pd.ganttCustom || [];
    const _gcState  = pd.gantt || {};
    const _projCBS  = _projUsesCBS(proj.id);

    let _gcStatic = [];
    if (_projCBS) {
      // Projet CBS : phases depuis ganttTasks (dates par défaut + overrides pd.gantt)
      // On affiche uniquement les phases pour garder le multi-Gantt lisible
      _gcStatic = ganttTasks
        .filter(t => t.type === 'phase')
        .map(t => {
          const ov  = _gcState[t.id] || {};
          const pctV = typeof ov.pct === 'number' ? ov.pct : 0;
          return { id: t.id, _isStatic: true,
            label: ov._label || t.label || t.id,
            start: ov.start || t.start || null,
            end:   ov.end   || t.end   || null,
            pct:   pctV };
        })
        .filter(t => t.start && t.end); // garder seulement les phases avec dates
    } else {
      // Projet vierge : uniquement les tâches avec dates explicites dans pd.gantt
      _gcStatic = Object.entries(_gcState)
        .filter(([, v]) => v.start || v.end)
        .map(([id, v]) => {
          return { id, _isStatic: true, label: id,
            start: v.start || null, end: v.end || null,
            pct: typeof v.pct === 'number' ? v.pct : 0 };
        });
    }
    // Liste unifiée : phases CBS (ou tâches vierges datées) + tâches custom
    const allProjGanttItems = [..._gcStatic, ..._gcCustom];

    // ── Calcul dates + % au niveau projet ───────────────────────────────
    // Fenêtre temporelle depuis les tâches Gantt
    allProjGanttItems.forEach(t => {
      if (t.start && (!projStart || t.start < projStart)) projStart = t.start;
      if (t.end   && (!projEnd   || t.end   > projEnd  )) projEnd   = t.end;
    });
    // Fallback sur les dates de création / fin du projet
    if (!projStart) projStart = proj.startDate || null;
    if (!projEnd)   projEnd   = proj.endDate   || null;

    // Avancement global : actions du projet
    const actStatuses = pd.actions || {};
    const customActs  = pd.customActions || [];
    const tot = Math.max(actions.length + customActs.length, Object.keys(actStatuses).length);
    const grn = Object.values(actStatuses).filter(a => a.rag === 'G').length;
    projPct = tot > 0 ? Math.round((grn / tot) * 100) : 0;

    // ── Le bouton ▶/▼ s'affiche toujours (expand ou message vide) ───────
    const canExpand = true;

    // ── Lignes de phases (si déplié) ─────────────────────────────────────
    let phaseHtml = '';
    if (isExpanded) {
      if (allProjGanttItems.length === 0) {
        // Projet sans tâches Gantt — inviter à en ajouter
        phaseHtml = `<div style="padding-left:24px;font-size:11px;color:#94a3b8;font-style:italic;margin-bottom:4px;padding-top:2px;">
          📅 Aucune tâche Gantt — ouvrez le projet et activez le module Planning pour en ajouter.</div>`;
      } else {
        // Projet standard : tâches Gantt (statiques CBS datées + custom) — max 8 lignes
        const itemsToShow = allProjGanttItems.slice(0, 8);
        const extraCount  = allProjGanttItems.length - itemsToShow.length;
        phaseHtml = itemsToShow.map(t => {
          const tPct = typeof t.pct === 'number' ? t.pct : (t.rag === 'G' ? 100 : t.rag === 'R' ? 0 : 50);
          const icon = t._isStatic ? '📌' : '▸';
          return `<div style="display:grid;grid-template-columns:168px 1fr 46px;align-items:center;gap:8px;margin-bottom:3px;">
            <div style="padding-left:24px;font-size:11px;color:#475569;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;"
              title="${_esc(t.label||t.id)}">${icon} ${_esc(t.label||t.id)}</div>
            ${ganttBar(t.start, t.end, projColor, tPct, 16)}
            <div style="font-size:10px;font-weight:700;color:${pctColor(tPct)};text-align:right;">${tPct}%</div>
          </div>`;
        }).join('');
        if (extraCount > 0) {
          phaseHtml += `<div style="padding-left:24px;font-size:10px;color:#94a3b8;margin-top:2px;">
            + ${extraCount} tâche(s) — ouvrir le projet pour voir l'intégralité du Gantt</div>`;
        }
      }
    }

    // ── Ligne projet (niveau 1) ──────────────────────────────────────────
    return `
    <div style="display:grid;grid-template-columns:168px 1fr 46px;align-items:center;gap:8px;margin-bottom:${isExpanded ? 2 : 7}px;">
      <div style="display:flex;align-items:center;gap:4px;min-width:0;">
        ${canExpand
          ? `<button onclick="_progToggleGanttExpand('${proj.id}')" title="${isExpanded ? 'Replier' : 'Déplier phases'}"
               style="flex-shrink:0;background:${projColor}22;border:1px solid ${projColor}55;border-radius:4px;
                 width:18px;height:18px;cursor:pointer;font-size:9px;color:${projColor};font-weight:900;
                 display:flex;align-items:center;justify-content:center;padding:0;">${isExpanded ? '▼' : '▶'}</button>`
          : '<span style="width:18px;flex-shrink:0;"></span>'}
        <div style="font-size:12px;font-weight:700;color:#1e293b;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;
            cursor:pointer;flex:1;" onclick="enterProject('${proj.id}')" title="${_esc(proj.name)}">${_esc(proj.name)}</div>
      </div>
      ${ganttBar(projStart, projEnd, projColor, projPct, 22)}
      <div style="font-size:11px;font-weight:700;color:${pctColor(projPct)};text-align:right;">${projPct}%</div>
    </div>
    ${phaseHtml}`;
  }).join('');

  container.innerHTML = `
    <div style="margin-bottom:8px;display:flex;align-items:center;justify-content:space-between;">
      <div style="position:relative;height:16px;flex:1;margin-left:176px;">${monthsHtml}</div>
      <button onclick="(function(){const ps=Object.keys(_progGanttExpanded);const anyOpen=ps.some(k=>_progGanttExpanded[k]);(state.programme.projects||[]).forEach(p=>_progGanttExpanded[p.id]=!anyOpen);renderProgrammeGantt();})()"
        style="margin-left:12px;background:#f1f5f9;border:1px solid #e2e8f0;border-radius:6px;padding:3px 10px;font-size:10px;cursor:pointer;color:#475569;font-weight:600;white-space:nowrap;flex-shrink:0;">
        ⊞ Tout déplier
      </button>
    </div>
    ${rows}
    <div style="margin-top:10px;display:flex;align-items:center;gap:6px;">
      <div style="width:16px;height:2px;background:#E63329;border-radius:2px;"></div>
      <span style="font-size:10px;color:#94a3b8;">Aujourd'hui</span>
    </div>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// HEATMAP RISQUES GLOBALE
// ─────────────────────────────────────────────────────────────────────────────
function renderProgrammeRiskHeatmap() {
  const container = document.getElementById('prog-risk-heatmap-container');
  if (!container) return;

  const projects = (state.programme.projects || []).filter(p => p.status !== 'archived');

  // Agréger tous les risques avec leur projet d'origine
  const allRisks = [];
  projects.forEach(proj => {
    const pd = (state.projectData || {})[proj.id] || {};
    (pd.risks || []).forEach(r => {
      allRisks.push({ ...r, _projName: proj.name, _projColor: proj.color || '#1565C0' });
    });
  });

  if (allRisks.length === 0) {
    container.innerHTML = `
      <div style="text-align:center;padding:32px 20px;">
        <div style="font-size:36px;margin-bottom:8px;">🛡️</div>
        <p style="color:#94a3b8;font-size:13px;margin:0;">Aucun risque enregistré dans les projets actifs.</p>
      </div>`;
    return;
  }

  // Matrice 5x5 — FIX : r.prob (et non r.probability)
  const matrix = {};
  for (let p = 1; p <= 5; p++) for (let i = 1; i <= 5; i++) matrix[p + '_' + i] = [];
  allRisks.forEach(r => {
    const p  = Math.min(5, Math.max(1, parseInt(r.prob || r.probability) || 1));
    const im = Math.min(5, Math.max(1, parseInt(r.impact) || 1));
    if (matrix[p + '_' + im]) matrix[p + '_' + im].push(r);
  });

  // Compte par zone de criticité
  const countCrit   = allRisks.filter(r => (parseInt(r.prob||r.probability)||1)*(parseInt(r.impact)||1) >= 15).length;
  const countHigh   = allRisks.filter(r => { const s=(parseInt(r.prob||r.probability)||1)*(parseInt(r.impact)||1); return s>=9&&s<15; }).length;
  const countMed    = allRisks.filter(r => { const s=(parseInt(r.prob||r.probability)||1)*(parseInt(r.impact)||1); return s>=4&&s<9; }).length;
  const countLow    = allRisks.filter(r => (parseInt(r.prob||r.probability)||1)*(parseInt(r.impact)||1) < 4).length;

  // Couleurs de zone
  const cellStyle = (p, i) => {
    const s = p * i;
    if (s >= 15) return { bg:'#fde8e8', border:'#f87171', text:'#991b1b', badge:'#dc2626' };
    if (s >= 9)  return { bg:'#fef3c7', border:'#fbbf24', text:'#92400e', badge:'#d97706' };
    if (s >= 4)  return { bg:'#fefce8', border:'#fde047', text:'#713f12', badge:'#ca8a04' };
    return           { bg:'#f0fdf4', border:'#86efac', text:'#166534', badge:'#16a34a' };
  };

  const labels = ['','Très faible','Faible','Modéré','Élevé','Très élevé'];
  const shortL  = ['','1','2','3','4','5'];

  // ── Barre de synthèse ──
  let html = `
    <div style="display:flex;gap:8px;margin-bottom:14px;flex-wrap:wrap;">
      <div style="display:flex;align-items:center;gap:6px;background:#fde8e8;border:1px solid #fca5a5;border-radius:8px;padding:6px 12px;">
        <span style="width:10px;height:10px;border-radius:50%;background:#dc2626;display:inline-block;"></span>
        <span style="font-size:12px;font-weight:700;color:#991b1b;">${countCrit} Critique${countCrit>1?'s':''}</span>
      </div>
      <div style="display:flex;align-items:center;gap:6px;background:#fef3c7;border:1px solid #fde68a;border-radius:8px;padding:6px 12px;">
        <span style="width:10px;height:10px;border-radius:50%;background:#d97706;display:inline-block;"></span>
        <span style="font-size:12px;font-weight:700;color:#92400e;">${countHigh} Élevé${countHigh>1?'s':''}</span>
      </div>
      <div style="display:flex;align-items:center;gap:6px;background:#fefce8;border:1px solid #fde047;border-radius:8px;padding:6px 12px;">
        <span style="width:10px;height:10px;border-radius:50%;background:#ca8a04;display:inline-block;"></span>
        <span style="font-size:12px;font-weight:700;color:#713f12;">${countMed} Modéré${countMed>1?'s':''}</span>
      </div>
      <div style="display:flex;align-items:center;gap:6px;background:#f0fdf4;border:1px solid #86efac;border-radius:8px;padding:6px 12px;">
        <span style="width:10px;height:10px;border-radius:50%;background:#16a34a;display:inline-block;"></span>
        <span style="font-size:12px;font-weight:700;color:#166534;">${countLow} Faible${countLow>1?'s':''}</span>
      </div>
      <div style="margin-left:auto;display:flex;align-items:center;">
        <span style="font-size:11px;color:#94a3b8;">Total : <strong style="color:#475569;">${allRisks.length}</strong> risque${allRisks.length>1?'s':''}</span>
      </div>
    </div>`;

  // ── Grille heatmap ──
  html += '<div style="overflow-x:auto;">';
  html += '<table style="width:100%;border-collapse:separate;border-spacing:4px;font-size:12px;">';

  // En-tête Impact
  html += `<tr>
    <td colspan="2" style="text-align:center;"></td>
    <td colspan="5" style="text-align:center;padding:4px 0;font-size:11px;font-weight:700;color:#64748b;letter-spacing:.5px;">IMPACT →</td>
  </tr>`;
  html += '<tr><th style="width:22px;"></th><th style="width:72px;font-size:10px;color:#94a3b8;text-align:right;padding:2px 6px 2px 0;font-weight:500;">Prob ↑</th>';
  for (let i = 1; i <= 5; i++) html += `<th style="text-align:center;padding:4px 2px;font-size:10px;color:#475569;font-weight:600;min-width:54px;">${labels[i]}<br><span style="font-size:9px;color:#94a3b8;">(${shortL[i]})</span></th>`;
  html += '</tr>';

  for (let p = 5; p >= 1; p--) {
    // Libellé probabilité — première cellule de la ligne
    const rowLabel = p === 5
      ? `<td rowspan="1" style="writing-mode:horizontal-tb;text-align:right;padding:2px 6px 2px 0;font-size:10px;color:#475569;font-weight:600;white-space:nowrap;vertical-align:middle;">${labels[p]}<br><span style="font-size:9px;color:#94a3b8;">(${p})</span></td>`
      : `<td style="text-align:right;padding:2px 6px 2px 0;font-size:10px;color:#475569;font-weight:600;white-space:nowrap;vertical-align:middle;">${labels[p]}<br><span style="font-size:9px;color:#94a3b8;">(${p})</span></td>`;

    // Flèche PROBABILITÉ sur la première ligne seulement
    const arrowCell = p === 5
      ? `<td rowspan="5" style="writing-mode:vertical-rl;text-align:center;font-size:10px;font-weight:700;color:#64748b;letter-spacing:.5px;padding:0 2px;transform:rotate(180deg);">PROBABILITÉ ↑</td>`
      : '';

    html += `<tr>${arrowCell}${rowLabel}`;
    for (let i = 1; i <= 5; i++) {
      const key    = p + '_' + i;
      const risks  = matrix[key] || [];
      const count  = risks.length;
      const cs     = cellStyle(p, i);
      // Bulle colorée par projet avec tooltip (FIX : r.desc)
      const bubbles = risks.map(r =>
        `<span title="${_esc(r._projName)} ▸ ${_esc(r.desc || r.title || r.description || 'Risque')}"
          style="display:inline-block;width:12px;height:12px;border-radius:50%;
                 background:${r._projColor};border:1.5px solid rgba(0,0,0,.15);
                 margin:1px;cursor:help;flex-shrink:0;"></span>`
      ).join('');
      html += `
        <td style="background:${cs.bg};border:2px solid ${cs.border};border-radius:6px;
            text-align:center;padding:6px 4px;vertical-align:middle;
            min-width:54px;height:48px;transition:filter .15s;
            cursor:${count > 0 ? 'default' : 'default'};"
            title="${count > 0 ? count + ' risque(s) — Prob×Impact=' + (p*i) + '\n' + risks.map(r=>'• '+r._projName+': '+(r.desc||r.title||r.description||'?')).join('\n') : 'Score '+p*i+' — Aucun risque'}">
          ${count > 0
            ? `<div style="display:flex;flex-wrap:wrap;justify-content:center;gap:1px;margin-bottom:3px;">${bubbles}</div>
               <div style="font-size:11px;font-weight:800;color:${cs.badge};line-height:1;">${count}</div>`
            : `<div style="font-size:10px;color:${cs.border};opacity:.5;line-height:1;">${p*i}</div>`
          }
        </td>`;
    }
    html += '</tr>';
  }
  html += '</table></div>';

  // ── Légende projets ──
  if (projects.length > 0) {
    html += '<div style="margin-top:14px;padding-top:12px;border-top:1px solid #f1f5f9;">';
    html += '<div style="font-size:10px;color:#94a3b8;font-weight:600;margin-bottom:6px;text-transform:uppercase;letter-spacing:.5px;">Projets</div>';
    html += '<div style="display:flex;gap:10px;flex-wrap:wrap;">';
    projects.forEach(p => {
      const pd = (state.projectData || {})[p.id] || {};
      const nb = (pd.risks || []).length;
      html += `<div style="display:flex;align-items:center;gap:5px;">
        <span style="display:inline-block;width:12px;height:12px;border-radius:50%;background:${p.color || '#1565C0'};border:1.5px solid rgba(0,0,0,.15);flex-shrink:0;"></span>
        <span style="font-size:11px;color:#475569;font-weight:500;">${_esc(p.name)}</span>
        <span style="font-size:10px;color:#94a3b8;">(${nb})</span>
      </div>`;
    });
    html += '</div></div>';
  }

  container.innerHTML = html;
}

// ─────────────────────────────────────────────────────────────────────────────
// ALERTES & ACTIONS PRIORITAIRES
// ─────────────────────────────────────────────────────────────────────────────
function renderProgrammeAlerts() {
  const container = document.getElementById('prog-alerts-container');
  if (!container) return;

  const projects = (state.programme.projects || []).filter(p => p.status !== 'archived');
  const alerts   = [];

  const _today = new Date(); _today.setHours(0,0,0,0);

  projects.forEach(proj => {
    const pd = (state.projectData || {})[proj.id] || {};

    // ── Risques critiques ────────────────────────────────────────────────
    (pd.risks || []).filter(r => (r.prob||r.probability||1)*(r.impact||1) >= 15).forEach(r => {
      alerts.push({ type:'risk', level:'critical', text: '🚨 Risque critique : ' + (r.desc || r.title || r.description || 'Risque sans libellé'),
        proj: proj.name, color: proj.color || '#1565C0', projId: proj.id });
    });

    // ── Actions en retard (rouge) ────────────────────────────────────────
    const actStatuses = pd.actions || {};
    Object.values(actStatuses).filter(a => a.rag === 'R').forEach(a => {
      alerts.push({ type:'action', level:'red', text: 'Action en retard',
        proj: proj.name, color: proj.color || '#1565C0', projId: proj.id });
    });

    // ── Projet sans aucun suivi ──────────────────────────────────────────
    if (Object.keys(actStatuses).length === 0) {
      alerts.push({ type:'info', level:'info', text: 'Projet sans suivi d\'actions — pensez à alimenter le plan d\'actions',
        proj: proj.name, color: proj.color || '#1565C0', projId: proj.id });
    }

    // ── Arbitrages en retard (deadline dépassée & encore en cours) ───────
    {
      const arbStatuses = pd.arbitrages || {};
      const custArbs    = pd.customArbitrages || [];
      const allArbs     = [...arbitrages, ...custArbs];
      allArbs.forEach(a => {
        const saved    = arbStatuses[a.id] || {};
        const dec      = saved.decision || 'en_cours';
        const deadline = saved.deadline || a.deadline;
        if (dec === 'en_cours' && deadline) {
          const dl = new Date(deadline);
          if (!isNaN(dl.getTime()) && dl < _today) {
            const lbl = saved.label || a.label || a.id || '';
            alerts.push({ type:'arbitrage', level:'amber',
              text: '⚖️ Arbitrage en retard : ' + (lbl.length > 60 ? lbl.substring(0,60) + '…' : lbl),
              proj: proj.name, color: proj.color || '#1565C0', projId: proj.id });
          }
        }
      });
    }

    // ── Interfaces techniques en attente / partielles ────────────────────
    {
      const techInterfaces = (pd.technique && pd.technique.interfaces)
        ? pd.technique.interfaces
        : DEFAULT_INTERFACES;
      const pendingIfaces = techInterfaces.filter(i =>
        i.status === 'pending_boa' || i.status === 'pending_cbs' || i.status === 'partial'
      );
      if (pendingIfaces.length > 0) {
        const sample = pendingIfaces.slice(0, 2).map(i => i.name).join(', ');
        const more   = pendingIfaces.length > 2 ? ` +${pendingIfaces.length - 2}` : '';
        alerts.push({ type:'technique', level:'amber',
          text: '🔧 ' + pendingIfaces.length + ' interface(s) technique en attente : ' + sample + more,
          proj: proj.name, color: proj.color || '#1565C0', projId: proj.id });
      }
    }
  });

  if (alerts.length === 0) {
    container.innerHTML = '<p style="color:#2E7D52;font-size:13px;padding:8px;background:#f0fdf4;border-radius:8px;font-weight:600;">✅ Aucune alerte critique sur le programme.</p>';
    return;
  }

  const iconMap = { critical:'🚨', red:'🔴', amber:'🟡', info:'ℹ️' };
  const bgMap   = { critical:'#ffebee', red:'#fff3f3', amber:'#fffbea', info:'#f0f9ff' };

  container.innerHTML = `<div style="display:flex;flex-direction:column;gap:8px;">
    ${alerts.slice(0, 10).map(a => `
      <div style="background:${bgMap[a.level]||'#f8fafc'};border-radius:8px;padding:10px 14px;
        display:flex;align-items:center;gap:10px;cursor:pointer;"
        onclick="enterProject('${a.projId}')">
        <span style="font-size:16px;">${iconMap[a.level]||'•'}</span>
        <div style="flex:1;">
          <span style="font-size:13px;font-weight:600;color:#1e293b;">${_esc(a.text)}</span>
          <span style="font-size:11px;color:#94a3b8;margin-left:8px;">→ ${_esc(a.proj)}</span>
        </div>
        <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${a.color};flex-shrink:0;"></span>
      </div>
    `).join('')}
    ${alerts.length > 10 ? `<p style="font-size:11px;color:#94a3b8;text-align:center;margin:0;">+ ${alerts.length - 10} alertes supplémentaires</p>` : ''}
  </div>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// CRÉATION DE PROJET
// ─────────────────────────────────────────────────────────────────────────────
// ─── État interne du wizard de création ──────────────────────────────────────
let _npActiveTemplate = 'blank';

function openNewProjectModal() {
  const isAdmin = !currentSession || currentSession.role === 'admin';
  if (!isAdmin) { showToast('⛔ Seul un administrateur peut créer un projet.', 3000); return; }

  // Reset champs
  document.getElementById('np-name').value  = '';
  document.getElementById('np-desc').value  = '';
  document.getElementById('np-color').value = '#1565C0';
  document.getElementById('np-start').value = new Date().toISOString().split('T')[0];
  document.getElementById('np-end').value   = '';
  _npActiveTemplate = 'blank';

  // Pastilles couleur
  const colorsDiv = document.getElementById('np-colors');
  if (colorsDiv) {
    colorsDiv.innerHTML = PROJECT_COLORS.map(c =>
      `<div onclick="selectProjectColor('${c}')" id="npc-${c.replace('#','')}"
        style="width:24px;height:24px;border-radius:50%;background:${c};cursor:pointer;
          border:3px solid ${c==='#1565C0'?'white':'transparent'};
          box-shadow:${c==='#1565C0'?'0 0 0 2px '+c:'none'};transition:all .15s;"></div>`
    ).join('');
  }

  // Templates
  const tplDiv = document.getElementById('np-templates');
  if (tplDiv) {
    tplDiv.innerHTML = _PROJ_TEMPLATES.map(t =>
      `<div id="npt-${t.id}" onclick="_npSelectTemplate('${t.id}')"
        style="border:2px solid ${t.id==='cbs_full'?t.color:'#e2e8f0'};border-radius:10px;
          padding:10px 12px;cursor:pointer;background:${t.id==='cbs_full'?t.color+'11':'white'};
          transition:all .15s;">
        <div style="font-size:18px;margin-bottom:4px;">${t.icon}</div>
        <div style="font-size:12px;font-weight:700;color:#1e293b;">${t.label}</div>
        <div style="font-size:10px;color:#64748b;margin-top:2px;">${t.desc}</div>
      </div>`
    ).join('');
  }

  // Modules (applique le template par défaut)
  _npRenderModules(_PROJ_TEMPLATES[0].modules);

  document.getElementById('new-project-modal').classList.remove('hidden');
  setTimeout(() => document.getElementById('np-name').focus(), 100);
}

function _npSelectTemplate(tplId) {
  _npActiveTemplate = tplId;
  const tpl = _PROJ_TEMPLATES.find(t => t.id === tplId);
  if (!tpl) return;

  // Mettre à jour couleur projet si pas modifiée manuellement
  if (tpl.id !== 'custom') {
    selectProjectColor(tpl.color);
  }

  // Visuels templates
  _PROJ_TEMPLATES.forEach(t => {
    const el = document.getElementById('npt-' + t.id);
    if (!el) return;
    const sel = t.id === tplId;
    el.style.border     = sel ? '2px solid ' + t.color : '2px solid #e2e8f0';
    el.style.background = sel ? t.color + '11' : 'white';
  });

  // Modules
  _npRenderModules(tpl.id === 'custom' ? null : tpl.modules);
}

function _npRenderModules(selectedModules) {
  const div = document.getElementById('np-modules');
  if (!div) return;
  div.innerHTML = _PROJ_MODULES.map(m => {
    const isOn = m.always || (selectedModules === null ? true : (selectedModules || []).includes(m.id));
    return `<label id="npm-${m.id}" onclick="_npToggleModule('${m.id}',${m.always})"
      style="display:flex;align-items:center;gap:8px;border:1.5px solid ${isOn?'#1565C0':'#e2e8f0'};
        border-radius:8px;padding:8px 10px;cursor:${m.always?'default':'pointer'};
        background:${isOn?'#EBF3FF':'white'};transition:all .15s;user-select:none;">
      <input type="checkbox" id="npmcb-${m.id}" ${isOn?'checked':''} ${m.always?'disabled':''}
        onclick="event.stopPropagation()"
        style="accent-color:#1565C0;width:14px;height:14px;flex-shrink:0;">
      <div>
        <div style="font-size:12px;font-weight:700;color:#1e293b;">${m.icon} ${m.label}</div>
        <div style="font-size:10px;color:#64748b;">${m.desc}</div>
      </div>
    </label>`;
  }).join('');
}

function _npToggleModule(moduleId, isAlways) {
  if (isAlways) return;
  const cb = document.getElementById('npmcb-' + moduleId);
  const lbl = document.getElementById('npm-' + moduleId);
  if (!cb || !lbl) return;
  cb.checked = !cb.checked;
  lbl.style.border     = cb.checked ? '1.5px solid #1565C0' : '1.5px solid #e2e8f0';
  lbl.style.background = cb.checked ? '#EBF3FF' : 'white';
  // Passer en mode "custom" si l'utilisateur modifie les cases
  _npActiveTemplate = 'custom';
  _PROJ_TEMPLATES.forEach(t => {
    const el = document.getElementById('npt-' + t.id);
    if (!el) return;
    const sel = t.id === 'custom';
    el.style.border     = sel ? '2px solid #6B21A8' : '2px solid #e2e8f0';
    el.style.background = sel ? '#6B21A811' : 'white';
  });
}

function selectProjectColor(color) {
  document.getElementById('np-color').value = color;
  PROJECT_COLORS.forEach(c => {
    const el = document.getElementById('npc-' + c.replace('#',''));
    if (!el) return;
    el.style.border    = c === color ? '3px solid white' : '3px solid transparent';
    el.style.boxShadow = c === color ? '0 0 0 2px ' + c : 'none';
  });
}

function confirmCreateProject() {
  const name  = (document.getElementById('np-name').value || '').trim();
  const desc  = (document.getElementById('np-desc').value || '').trim();
  const color = document.getElementById('np-color').value || '#1565C0';
  const startDate = document.getElementById('np-start')?.value || '';
  const endDate   = document.getElementById('np-end')?.value   || '';

  if (!name) {
    document.getElementById('np-name').style.borderColor = '#E63329';
    document.getElementById('np-name').focus();
    return;
  }

  // Collecter modules cochés
  const enabledModules = _PROJ_MODULES
    .filter(m => m.always || (document.getElementById('npmcb-' + m.id)?.checked))
    .map(m => m.id);

  const id = 'proj_' + Date.now();
  const newProj = {
    id, name, color, description: desc,
    status:     'active',
    template:   _npActiveTemplate,
    dataSource: 'blank', // Toujours vierge à la création — importer CBS si besoin via le bandeau dans chaque onglet
    enabledModules,
    startDate,
    endDate,
    createdAt: new Date().toISOString(),
  };

  if (!state.programme.projects) state.programme.projects = [];
  state.programme.projects.unshift(newProj); // Insérer en premier

  if (!state.projectData) state.projectData = {};
  state.projectData[id] = _defaultProjectState();

  document.getElementById('new-project-modal').classList.add('hidden');
  _saveProgrammeData('Création projet', name);
  if (typeof DB !== 'undefined' && typeof DB.saveProject === 'function') {
    DB.saveProject(newProj).catch(e => console.warn('[projects] création SQL:', e.message || e));
  }
  renderProgrammeScreen();
  showToast('✅ Projet "' + name + '" créé avec ' + enabledModules.length + ' modules.', 3000);

  setTimeout(() => {
    if (confirm('Projet "' + name + '" créé !\n\nOuvrir le projet maintenant ?')) {
      enterProject(id);
    }
  }, 200);
}

// ─────────────────────────────────────────────────────────────────────────────
// PARAMÈTRES PROGRAMME
// ─────────────────────────────────────────────────────────────────────────────
// ── Helpers streams dans paramètres programme ─────────────────────────────────
function _psRenderStreamsList() {
  const customStreams = (state.shared && state.shared.streams) || [];
  const container = document.getElementById('ps-streams-list');
  if (!container) return;
  if (customStreams.length === 0) {
    container.innerHTML = '<div style="font-size:11px;color:#aaa;font-style:italic;">Aucun domaine personnalisé.</div>';
    return;
  }
  container.innerHTML = customStreams.map((s, i) => `
    <div style="display:flex;align-items:center;gap:8px;background:#f8f9fa;border:1px solid #e8e8e8;border-radius:7px;padding:7px 10px;">
      <span style="width:14px;height:14px;border-radius:50%;background:${s.color};display:inline-block;flex-shrink:0;"></span>
      <span style="flex:1;font-size:12px;font-weight:600;">${_esc(s.name)}</span>
      <span style="font-size:11px;color:#94a3b8;">${s.icon || '🏷'}</span>
      <button onclick="_psDeleteStream(${i})"
        style="background:none;border:none;color:#E63329;cursor:pointer;font-size:14px;padding:0 4px;" title="Supprimer">✕</button>
    </div>`).join('');
}
function _psAddStream() {
  const nameInput  = document.getElementById('ps-new-stream-name');
  const colorInput = document.getElementById('ps-new-stream-color');
  const name = (nameInput.value || '').trim();
  if (!name) { nameInput.focus(); return; }
  if (!state.shared) state.shared = { owners: [], streams: [] };
  if (!state.shared.streams) state.shared.streams = [];
  // Générer un ID unique
  const id = 'stream_custom_' + Date.now();
  state.shared.streams.push({ id, name, color: colorInput.value, icon: '🏷' });
  nameInput.value = '';
  colorInput.value = '#6366f1';
  _psRenderStreamsList();
  _enrichDomainMaps();
  _populateDomainFilterSelects();
}
function _psDeleteStream(idx) {
  if (!state.shared || !state.shared.streams) return;
  const s = state.shared.streams[idx];
  if (s && !confirm('Supprimer le domaine "' + s.name + '" ?')) return;
  state.shared.streams.splice(idx, 1);
  _psRenderStreamsList();
  _populateDomainFilterSelects();
}

function openProgrammeSettings() {
  const isAdmin = !currentSession || currentSession.role === 'admin';
  if (!isAdmin) { alert('Seul un administrateur peut modifier les paramètres du programme.'); return; }
  document.getElementById('ps-name').value = state.programme.name || '';
  document.getElementById('ps-desc').value = state.programme.description || '';
  _psRenderStreamsList();
  document.getElementById('programme-settings-modal').classList.remove('hidden');
}

function saveProgrammeSettings() {
  const name = (document.getElementById('ps-name').value || '').trim();
  const desc = (document.getElementById('ps-desc').value || '').trim();
  if (!name) { alert('Le nom du programme ne peut pas être vide.'); return; }
  state.programme.name        = name;
  state.programme.description = desc;
  // Les domaines ont déjà été mis à jour en temps réel via _psAddStream/_psDeleteStream
  document.getElementById('programme-settings-modal').classList.add('hidden');
  _saveProgrammeData('Paramètres programme', name);
  renderProgrammeScreen();
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPER — Échappement HTML
// ─────────────────────────────────────────────────────────────────────────────
function _esc(str) {
  if (!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ─────────────────────────────────────────────────────────────────────────────
// INITIALISATION — Afficher l'écran Programme au démarrage
// ─────────────────────────────────────────────────────────────────────────────
(function _patchInitAppForProgramme() {
  const _origInitApp = initApp;
  window.initApp = async function(isRetry) {
    try {
      await _origInitApp(isRetry);
    } catch(e) {
      console.error('[Programme] initApp failed, showing programme screen anyway:', e);
      window._boaInitializing = false;
    } finally {
      // Après le chargement de l'état, afficher l'écran Programme.
      const appContent = document.getElementById('app-content');
      const progScreen = document.getElementById('programme-screen');
      if (appContent) appContent.style.display = 'none';
      if (progScreen) progScreen.classList.remove('hidden');
      // Cacher le bouton retour
      const backBtn = document.getElementById('btn-back-programme');
      if (backBtn) backBtn.style.display = 'none';
      const crumb   = document.getElementById('header-programme-breadcrumb');
      if (crumb) crumb.style.display = 'none';
      const subText = document.getElementById('header-project-sub-text');
      if (subText) subText.style.display = '';
      if (typeof renderProgrammeScreen === 'function') renderProgrammeScreen();
    }
  };
})();
