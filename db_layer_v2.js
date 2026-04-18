// ===========================================================================
// BOA Programme Pilotage - Couche acces aux donnees v2
// Derniere mise a jour synchronisee depuis le HTML le 2026-04-17
// Dependances : sb (Supabase client), state (definis dans app_main.js)
// ===========================================================================

// ═══════════════════════════════════════════════════════════════════════════════
// BOA Programme Pilotage — Couche d'accès aux données v2
// Remplace saveState() par des opérations ciblées sur les tables Supabase
// ═══════════════════════════════════════════════════════════════════════════════

const DB = (() => {
  // ── Config ──────────────────────────────────────────────────────────────────
  const PROJECT_ID = () => state.currentProjectId || 'proj_boa_ci';
  const USER       = () => {
    if (state.loginLogs && state.loginLogs.length > 0) {
      const l = state.loginLogs[state.loginLogs.length - 1];
      return l.user || l.email || 'Utilisateur';
    }
    return 'Utilisateur';
  };

  // ── Utilitaire : log d'audit en base ───────────────────────────────────────
  async function _logHistory(entityType, entityId, entityRef, actionType, changes) {
    if (!API) return;
    try {
      await API.from('history').insert({
        entity_type: entityType,
        entity_id:   entityId,
        entity_ref:  entityRef || null,
        project_id:  PROJECT_ID(),
        changed_by:  USER(),
        action_type: actionType,
        changes:     changes || []
      });
    } catch(e) { console.warn('[history] insert:', e.message); }
  }

  // ── Utilitaire : diff entre deux objets ────────────────────────────────
  function _diff(oldObj, newObj, fieldLabels) {
    const changes = [];
    Object.entries(fieldLabels).forEach(([field, label]) => {
      const oldVal = String(oldObj[field] || '');
      const newVal = String(newObj[field] || '');
      if (oldVal !== newVal) changes.push({ field, label, old: oldVal, new: newVal });
    });
    return changes;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // GAPS
  // ═══════════════════════════════════════════════════════════════════════════
  const GAP_FIELDS = {
    ref:'Référence', description:'Description', domain:'Domaine',
    priority:'Priorité', phase:'Phase', resp:'Responsable',
    decision:'Décision', note:'Note', bm:'BM'
  };

  async function saveGap(gap) {
    if (!API) return false;
    const row = {
      project_id:  PROJECT_ID(),
      ref:         gap.ref,
      domain:      gap.domain || '',
      domains:     gap.domains || [],
      processus:   gap.processus || '',
      description: gap.desc || gap.description || '',
      priority:    gap.prio || gap.priority || 'P2',
      phase:       gap.phase || 'I',
      bm:          gap.bm || '',
      resp:        gap.resp || '',
      decision:    gap.decision || 'En attente',
      note:        gap.note || '',
      is_custom:   gap._custom || gap.is_custom || false,
      updated_at:  new Date().toISOString()
    };
    const { data, error } = await API.from('gaps')
      .upsert(row, { onConflict: 'project_id,ref' })
      .select('id').single();
    if (error) { console.warn('[gaps] save:', error.message); return false; }
    return data.id;
  }

  async function updateGapDecision(ref, decision, note) {
    if (!API) return false;
    const { error } = await API.from('gaps')
      .update({ decision, note: note || '', updated_at: new Date().toISOString() })
      .eq('project_id', PROJECT_ID()).eq('ref', ref);
    if (error) { console.warn('[gaps] updateDecision:', error.message); return false; }
    await _logHistory('gap', null, ref, 'updated', [
      { field:'decision', label:'Décision', old:'', new: decision }
    ]);
    return true;
  }

  async function deleteGap(ref) {
    if (!API) return false;
    const { error } = await API.from('gaps')
      .delete().eq('project_id', PROJECT_ID()).eq('ref', ref);
    if (error) { console.warn('[gaps] delete:', error.message); return false; }
    await _logHistory('gap', null, ref, 'deleted', []);
    return true;
  }

  async function loadGaps() {
    if (!API) return [];
    const { data, error } = await API.from('gaps')
      .select('*').eq('project_id', PROJECT_ID())
      .order('sort_order').order('created_at');
    if (error) { console.warn('[gaps] load:', error.message); return []; }
    return data.map(r => ({
      id: r.id, ref: r.ref, domain: r.domain, domains: r.domains,
      processus: r.processus, desc: r.description, description: r.description,
      prio: r.priority, priority: r.priority, phase: r.phase, bm: r.bm,
      resp: r.resp, decision: r.decision, note: r.note,
      _custom: r.is_custom, is_custom: r.is_custom
    }));
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ARBITRAGES
  // ═══════════════════════════════════════════════════════════════════════════
  const ARB_FIELDS = {
    label:'Libellé', domain:'Domaine', priority:'Priorité',
    resp:'Responsable', deadline:'Échéance', decision:'Décision', commentaire:'Commentaire'
  };

  async function saveArbitrage(arb, oldArb) {
    if (!API) return false;
    const isNew = !arb.id || arb.id.startsWith('arb_');
    const row = {
      project_id:  PROJECT_ID(),
      label:       arb.label,
      domain:      arb.domain || '',
      priority:    arb.prio || arb.priority || 'P2',
      resp:        arb.resp || '',
      deadline:    arb.deadline || null,
      decision:    arb.decision || 'en_cours',
      commentaire: arb.commentaire || '',
      is_custom:   arb._custom || arb.is_custom || false,
      updated_at:  new Date().toISOString()
    };
    if (!isNew) row.id = arb.id;

    const { data, error } = await API.from('arbitrages')
      .upsert(row, { onConflict: 'id' })
      .select('id').single();
    if (error) { console.warn('[arbitrages] save:', error.message); return false; }

    const changes = oldArb ? _diff(oldArb, row, ARB_FIELDS) : [];
    await _logHistory('arbitrage', data.id, arb.label?.substring(0,40),
      isNew ? 'created' : 'updated', changes);
    return data.id;
  }

  async function deleteArbitrage(id) {
    if (!API) return false;
    const { error } = await API.from('arbitrages')
      .delete().eq('id', id).eq('project_id', PROJECT_ID());
    if (error) { console.warn('[arbitrages] delete:', error.message); return false; }
    await _logHistory('arbitrage', id, null, 'deleted', []);
    return true;
  }

  async function loadArbitrages() {
    if (!API) return [];
    const { data, error } = await API.from('arbitrages')
      .select('*').eq('project_id', PROJECT_ID())
      .order('sort_order').order('created_at');
    if (error) { console.warn('[arbitrages] load:', error.message); return []; }
    return data.map(r => ({
      id: r.id, label: r.label, domain: r.domain,
      prio: r.priority, priority: r.priority,
      resp: r.resp, deadline: r.deadline,
      decision: r.decision, commentaire: r.commentaire,
      _custom: r.is_custom
    }));
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ACTIONS
  // ═══════════════════════════════════════════════════════════════════════════
  const ACT_FIELDS = {
    label:'Libellé', domain:'Domaine', resp:'Responsable',
    deadline:'Échéance', urgency:'Urgence', rag:'Statut RAG',
    pct:'Avancement', source:'Source'
  };

  async function saveAction(act, oldAct) {
    if (!API) return false;
    const targetProjectId = act._dbProjectId || PROJECT_ID();
    if (!targetProjectId) {
      console.warn('[actions] save annulé: project_id manquant', act);
      return false;
    }
    // Tenter de s'assurer que le projet existe en base (non bloquant)
    const ensured = await _ensureCurrentProjectInDb();
    if (!ensured) {
      console.warn('[actions] _ensureCurrentProjectInDb a échoué — sauvegarde action tentée quand même');
    }
    const isNew = !act.id || typeof act.id === 'string' && !act._dbId;
    const saved = act.id && state.actions ? (state.actions[act.id] || {}) : {};
    const status = saved.status || act.status || '';
    const actionCode = act.id || act.action_code || '';
    let dbId = act._dbId || null;
    if (!dbId && actionCode) {
      const { data: existing, error: findError } = await API.from('actions')
        .select('id')
        .eq('project_id', targetProjectId)
        .eq('action_code', actionCode)
        .order('updated_at', { ascending: false })
        .limit(1);
      if (!findError && Array.isArray(existing) && existing[0] && existing[0].id) dbId = existing[0].id;
      if (findError) console.warn('[actions] recherche existante:', findError.message);
    }
    const row = {
      project_id:  targetProjectId,
      action_code: actionCode,
      label:       act.action || act.label || '',
      domain:      act.domain || '',
      domains:     act.domains || [],
      resp:        act.resp || '',
      deadline:    saved.echeance || act.echeance || act.deadline || null,
      urgency:     act.urgence || act.urgency || 'Normale',
      rag:         act.rag || _actionStatusToLegacyRag(status),
      pct:         saved.pct != null ? saved.pct : (act.pct || 0),
      commentaire: saved.commentaire || act.commentaire || '',
      source:      saved.source || act.source || '',
      email:       act.email || '',
      date_fin:    saved.dateFin || act.dateFin || act.date_fin || null,
      is_custom:   act._custom || act.is_custom || false,
      updated_at:  new Date().toISOString()
    };

    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(row.deadline || ''))) row.deadline = null;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(row.date_fin || ''))) row.date_fin = null;

    if (dbId) row.id = dbId;
    console.log('[actions] save public.actions', {
      project_id: row.project_id,
      action_code: row.action_code,
      db_id: row.id || null
    });

    if (typeof _appStateRpcArgs === 'function') {
      const rpcArgs = _appStateRpcArgs();
      const { data: rpcId, error: rpcError } = await API.rpc('app_action_save', {
        ...rpcArgs,
        p_action: row
      });
      if (!rpcError && rpcId) {
        await _logHistory('action', rpcId, act.action_code || act.id,
          isNew ? 'created' : 'updated', oldAct ? _diff(oldAct, row, ACT_FIELDS) : []);
        return rpcId;
      }
      if (rpcError && !String(rpcError.message || '').includes('Could not find the function')) {
        console.warn('[actions] save rpc:', rpcError.message);
        showToast('⚠️ Sauvegarde action refusée : ' + rpcError.message, 4500);
        return false;
      }
      if (rpcError) console.warn('[actions] RPC app_action_save indisponible, tentative directe:', rpcError.message);
    }

    const { data, error } = await API.from('actions')
      .upsert(row, { onConflict: 'id' })
      .select('id').single();
    if (error) {
      console.warn('[actions] save:', error.message);
      showToast('⚠️ Sauvegarde action refusée : ' + error.message, 4500);
      return false;
    }

    const changes = oldAct ? _diff(oldAct, row, ACT_FIELDS) : [];
    await _logHistory('action', data.id, act.action_code || act.id,
      isNew ? 'created' : 'updated', changes);
    return data.id;
  }

  async function updateActionStatus(dbId, rag, pct, commentaire) {
    if (!API) return false;
    const { error } = await API.from('actions')
      .update({ rag, pct, commentaire, updated_at: new Date().toISOString() })
      .eq('id', dbId).eq('project_id', PROJECT_ID());
    if (error) { console.warn('[actions] updateStatus:', error.message); return false; }
    await _logHistory('action', dbId, null, 'updated', [
      { field:'rag', label:'Statut', old:'', new: rag },
      { field:'pct', label:'Avancement', old:'', new: String(pct)+'%' }
    ]);
    return true;
  }

  async function loadActions() {
    if (!API) return [];
    const { data, error } = await API.from('actions')
      .select('*').eq('project_id', PROJECT_ID())
      .order('sort_order').order('created_at');
    if (error) { console.warn('[actions] load:', error.message); return []; }
    return data.map(r => ({
      _dbId: r.id, id: r.action_code || r.id, action: r.label, label: r.label,
      _dbProjectId: r.project_id,
      domain: r.domain, domains: r.domains, resp: r.resp,
      echeance: r.deadline, urgence: r.urgency,
      rag: r.rag, pct: r.pct, commentaire: r.commentaire,
      source: r.source, email: r.email, dateFin: r.date_fin,
      _custom: r.is_custom
    }));
  }

  async function deleteAction(act) {
    if (!sb || !act) return false;
    let q = API.from('actions').delete().eq('project_id', act._dbProjectId || PROJECT_ID());
    if (act._dbId) q = q.eq('id', act._dbId);
    else q = q.eq('action_code', act.id || act.action_code || '');
    const { error } = await q;
    if (error) { console.warn('[actions] delete:', error.message); return false; }
    await _logHistory('action', act._dbId || null, act.id || act.action_code || null, 'deleted', []);
    return true;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // INTERFACES
  // ═══════════════════════════════════════════════════════════════════════════
  async function saveInterface(iface, oldIface) {
    if (!API) return false;
    const isNew = !iface._dbId;
    const row = {
      project_id:  PROJECT_ID(),
      name:        iface.name || '',
      status:      iface.status || 'pending_boa',
      impact:      iface.impact || 'tbd',
      comments:    iface.comments || [],
      resp:        iface.resp || '',
      target_date: iface.targetDate || null,
      actions:     iface.actions || [],
      updated_at:  new Date().toISOString()
    };
    if (iface._dbId) row.id = iface._dbId;

    const { data, error } = await API.from('interfaces')
      .upsert(row, { onConflict: 'id' })
      .select('id').single();
    if (error) { console.warn('[interfaces] save:', error.message); return false; }

    if (!isNew && oldIface) {
      const changes = _diff(oldIface, row, {
        name:'Nom', status:'Statut', impact:'Impact', resp:'Responsable'
      });
      if (changes.length > 0)
        await _logHistory('interface', data.id, iface.name, 'updated', changes);
    } else if (isNew) {
      await _logHistory('interface', data.id, iface.name, 'created', []);
    }
    return data.id;
  }

  async function loadInterfaces() {
    if (!API) return [];
    const { data, error } = await API.from('interfaces')
      .select('*').eq('project_id', PROJECT_ID())
      .order('sort_order').order('created_at');
    if (error) { console.warn('[interfaces] load:', error.message); return []; }
    return data.map(r => ({
      _dbId: r.id, id: r.id, name: r.name, status: r.status,
      impact: r.impact, comments: r.comments || [],
      resp: r.resp, targetDate: r.target_date, actions: r.actions || []
    }));
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // RISQUES
  // ═══════════════════════════════════════════════════════════════════════════
  async function saveRisk(risk) {
    if (!API) return false;
    const row = {
      project_id:  PROJECT_ID(),
      description: risk.description || '',
      probability: risk.probability || 'Moyen',
      impact:      risk.impact || 'Moyen',
      mitigation:  risk.mitigation || '',
      status:      risk.status || 'Ouvert',
      owner:       risk.owner || '',
      category:    risk.category || '',
      updated_at:  new Date().toISOString()
    };
    if (risk._dbId) row.id = risk._dbId;

    const { data, error } = await API.from('risks')
      .upsert(row, { onConflict: 'id' })
      .select('id').single();
    if (error) { console.warn('[risks] save:', error.message); return false; }
    return data.id;
  }

  async function loadRisks() {
    if (!API) return [];
    const { data, error } = await API.from('risks')
      .select('*').eq('project_id', PROJECT_ID())
      .order('sort_order').order('created_at');
    if (error) { console.warn('[risks] load:', error.message); return []; }
    return data;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // HISTORIQUE — lecture
  // ═══════════════════════════════════════════════════════════════════════════
  async function loadHistory(entityType, entityId) {
    if (!API) return [];
    let q = API.from('history').select('*')
      .eq('project_id', PROJECT_ID())
      .order('changed_at', { ascending: false })
      .limit(200);
    if (entityType) q = q.eq('entity_type', entityType);
    if (entityId)   q = q.eq('entity_id', entityId);
    const { data, error } = await q;
    if (error) { console.warn('[history] load:', error.message); return []; }
    return data;
  }

  async function showEntityHistory(entityType, entityId, title) {
    const hist = await loadHistory(entityType, entityId);
    showItemHistory(hist.map(h => ({
      ts:      h.changed_at,
      user:    h.changed_by,
      action:  h.action_type,
      changes: h.changes || []
    })), title);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PROGRAMME & PROJETS
  // ═══════════════════════════════════════════════════════════════════════════
  async function saveProgramme(prog) {
    if (!API) return false;
    const { error } = await API.from('programmes')
      .upsert({ id: 'prog_main', name: prog.name, description: prog.description || '' },
               { onConflict: 'id' });
    if (error) { console.warn('[programmes] save:', error.message); return false; }
    return true;
  }

  async function saveProject(proj) {
    if (!API) return false;
    const { error } = await API.from('projects').upsert({
      id:              proj.id,
      programme_id:    'prog_main',
      name:            proj.name,
      color:           proj.color || '#1565C0',
      status:          proj.status || 'active',
      description:     proj.description || '',
      data_source:     proj.dataSource || 'blank',
      enabled_modules: proj.enabledModules || [],
      updated_at:      new Date().toISOString()
    }, { onConflict: 'id' });
    if (error) { console.warn('[projects] save:', error.message); return false; }
    return true;
  }

  async function loadProjects() {
    if (!API) return [];
    const { data, error } = await API.from('projects')
      .select('*').eq('programme_id', 'prog_main')
      .order('sort_order').order('created_at');
    if (error) { console.warn('[projects] load:', error.message); return []; }
    return data.map(r => ({
      id: r.id, name: r.name, color: r.color, status: r.status,
      description: r.description, dataSource: r.data_source,
      enabledModules: r.enabled_modules || [], createdAt: r.created_at
    }));
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ABONNEMENTS REALTIME
  // ═══════════════════════════════════════════════════════════════════════════
  function subscribeAll() {
    if (!API) return;
    // Realtime est une fonctionnalité spécifique Supabase — non disponible en mode REST
    const realtimeClient = (typeof SupabaseAdapter !== 'undefined' && SupabaseAdapter.isReady())
      ? SupabaseAdapter.getClient()
      : null;
    if (!realtimeClient) {
      console.log('[DB] Realtime non disponible (REST adapter ou Supabase non initialisé)');
      return;
    }
    const tables = ['gaps','arbitrages','actions','interfaces','risks'];
    tables.forEach(table => {
      realtimeClient.channel('rt_' + table)
        .on('postgres_changes',
            { event: '*', schema: 'public', table },
            payload => { handleRealtimeChange(table, payload); })
        .subscribe();
    });
  }

  function handleRealtimeChange(table, payload) {
    // Realtime : re-render après un délai pour laisser le state se stabiliser
    console.log('[realtime]', table, payload.eventType);
    setTimeout(function() {
      if (table === 'gaps')        renderGaps();
      if (table === 'arbitrages')  renderArbitrages();
      if (table === 'actions')     renderActions();
      if (table === 'interfaces')  renderInterfaces();
      if (table === 'risks')       renderRisques();
      renderDashboard();
    }, 300);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // INITIALISATION — chargement complet
  // ═══════════════════════════════════════════════════════════════════════════
  async function loadAll() {
    // Chargement depuis les tables relationnelles — state reste la source de vérité
    // Les données chargées alimentent state.customGaps, customArbitrages, customActions
    // et state.technique.interfaces si les tables contiennent des données
    const [dbGaps, dbArbs, dbActs, dbIfaces, dbRisks] = await Promise.all([
      loadGaps(), loadArbitrages(), loadActions(), loadInterfaces(), loadRisks()
    ]);

    // Merge gaps : ajouter les items DB qui ne sont pas déjà dans state
    if (dbGaps.length > 0) {
      const existingRefs = new Set((state.customGaps||[]).map(function(g){ return g.ref; }));
      const newGaps = dbGaps.filter(function(g){ return !existingRefs.has(g.ref); });
      if (newGaps.length > 0) state.customGaps = (state.customGaps||[]).concat(newGaps);
    }
    // Merge arbitrages
    if (dbArbs.length > 0) {
      const existingIds = new Set((state.customArbitrages||[]).map(function(a){ return String(a.id); }));
      const newArbs = dbArbs.filter(function(a){ return !existingIds.has(String(a.id)); });
      if (newArbs.length > 0) state.customArbitrages = (state.customArbitrages||[]).concat(newArbs);
    }
    // Merge actions
    if (dbActs.length > 0) {
      _mergeDbActionsIntoState(dbActs);
    }
    // Interfaces : si state vide, utiliser les données DB
    if (dbIfaces.length > 0 && (!state.technique || !state.technique.interfaces || state.technique.interfaces.length === 0)) {
      if (!state.technique) state.technique = { interfaces: [], archi: [] };
      state.technique.interfaces = dbIfaces;
    }
    // Risks : merge dans state.risks
    if (dbRisks.length > 0 && (!state.risks || state.risks.length === 0)) {
      state.risks = dbRisks;
    }

    console.log('[DB v2] merged —', dbGaps.length, 'gaps,', dbArbs.length, 'arb,',
      dbActs.length, 'actions,', dbIfaces.length, 'interfaces,', dbRisks.length, 'risques');
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ÉTAT PROJET (app_state)
  // ═══════════════════════════════════════════════════════════════════════════

  async function loadProjectState(username, passwordHash) {
    if (!API) return { data: null, error: { message: 'API non initialisée' } };
    return API.rpc('app_state_get', { p_username: username, p_password_hash: passwordHash });
  }

  async function saveProjectState(username, passwordHash, stateData) {
    if (!API) return false;
    const { error } = await API.rpc('app_state_save', {
      p_username:      username,
      p_password_hash: passwordHash,
      p_state:         stateData
    });
    if (error) { console.warn('[DB] saveProjectState:', error.message); return false; }
    return true;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // RÉFÉRENTIELS PAR DÉFAUT (app_defaults)
  // ═══════════════════════════════════════════════════════════════════════════

  async function loadDefault(key) {
    if (!API) return { data: null, error: { message: 'API non initialisée' } };
    return API.from('app_defaults').select('data').eq('key', key).single();
  }

  async function saveDefault(key, data, username, passwordHash) {
    if (!API) return false;
    const { error } = await API.rpc('app_default_save', {
      p_username:      username,
      p_password_hash: passwordHash,
      p_key:           key,
      p_data:          data
    });
    if (error) { console.warn('[DB] saveDefault(' + key + '):', error.message); return false; }
    return true;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // AUTHENTIFICATION
  // ═══════════════════════════════════════════════════════════════════════════

  async function authLogin(username, passwordHash) {
    if (!API) return { data: null, error: { message: 'API non initialisée' } };
    return API.rpc('auth_login', { p_username: username, p_password_hash: passwordHash });
  }

  async function authGetUserStatus(username, passwordHash) {
    if (!API) return { data: null, error: { message: 'API non initialisée' } };
    return API.rpc('app_user_status_get', { p_username: username, p_password_hash: passwordHash });
  }

  async function authChangePassword(username, oldHash, newHash) {
    if (!API) return { data: null, error: { message: 'API non initialisée' } };
    return API.rpc('auth_change_password', {
      p_username:      username,
      p_old_hash:      oldHash,
      p_new_hash:      newHash
    });
  }

  async function authListUsers(adminHash) {
    if (!API) return { data: null, error: { message: 'API non initialisée' } };
    return API.rpc('auth_list_users', { p_admin_hash: adminHash });
  }

  async function authAdminListUserStatus(adminHash) {
    if (!API) return { data: null, error: { message: 'API non initialisée' } };
    return API.rpc('app_admin_list_user_status', { p_admin_hash: adminHash });
  }

  async function authAdminSetUsersActive(adminHash, usernames, isActive) {
    if (!API) return { data: null, error: { message: 'API non initialisée' } };
    return API.rpc('app_admin_set_users_active', {
      p_admin_hash: adminHash,
      p_usernames:  usernames,
      p_is_active:  isActive
    });
  }

  async function authUpdatePermissions(adminHash, username, permissions) {
    if (!API) return { data: null, error: { message: 'API non initialisée' } };
    return API.rpc('auth_update_permissions', {
      p_admin_hash:  adminHash,
      p_username:    username,
      p_permissions: permissions
    });
  }

  async function authAdminReset(adminHash, username, newHash) {
    if (!API) return { data: null, error: { message: 'API non initialisée' } };
    return API.rpc('auth_admin_reset', {
      p_admin_hash: adminHash,
      p_username:   username,
      p_new_hash:   newHash
    });
  }

  async function authUpdateRole(adminHash, username, newRole) {
    if (!API) return { data: null, error: { message: 'API non initialisée' } };
    return API.rpc('auth_update_role', {
      p_admin_hash: adminHash,
      p_username:   username,
      p_new_role:   newRole
    });
  }

  async function authDeleteUser(adminHash, username) {
    if (!API) return { data: null, error: { message: 'API non initialisée' } };
    return API.rpc('auth_delete_user', {
      p_admin_hash: adminHash,
      p_username:   username
    });
  }

  async function authCreateUser(adminHash, username, displayName, role, passwordHash) {
    if (!API) return { data: null, error: { message: 'API non initialisée' } };
    return API.rpc('auth_create_user', {
      p_admin_hash:    adminHash,
      p_new_username:  username,
      p_display_name:  displayName,
      p_role:          role,
      p_password_hash: passwordHash
    });
  }

  // API publique
  return {
    // Données métier
    saveGap, updateGapDecision, deleteGap, loadGaps,
    saveArbitrage, deleteArbitrage, loadArbitrages,
    saveAction, updateActionStatus, loadActions, deleteAction,
    saveInterface, loadInterfaces,
    saveRisk, loadRisks,
    loadHistory, showEntityHistory,
    saveProgramme, saveProject, loadProjects,
    subscribeAll, loadAll,
    // État projet
    loadProjectState, saveProjectState,
    // Référentiels par défaut
    loadDefault, saveDefault,
    // Authentification & administration
    authLogin, authGetUserStatus, authChangePassword,
    authListUsers, authAdminListUserStatus, authAdminSetUsersActive,
    authUpdatePermissions, authAdminReset, authUpdateRole,
    authDeleteUser, authCreateUser
  };
})();
