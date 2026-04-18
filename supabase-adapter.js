// ═══════════════════════════════════════════════════════════════════════════
// BOA Programme Pilotage — Adaptateur Supabase
// ═══════════════════════════════════════════════════════════════════════════
//
// Encapsule le SDK @supabase/supabase-js derrière une interface générique.
// Tout accès à Supabase passe par cet adaptateur — jamais directement.
//
// Interface exposée (identique à RestAdapter) :
//   SupabaseAdapter.init(url, anonKey) → Boolean
//   SupabaseAdapter.from(table)        → Supabase QueryBuilder
//   SupabaseAdapter.rpc(name, args)    → Promise<{data, error}>
//   SupabaseAdapter.isReady()          → Boolean
// ═══════════════════════════════════════════════════════════════════════════

const SupabaseAdapter = (() => {

  let _client = null;

  // ── Initialisation ─────────────────────────────────────────────────────
  function init(url, anonKey) {
    if (!url || url === 'YOUR_SUPABASE_URL') {
      console.warn('[SupabaseAdapter] URL non configurée — vérifiez config.js');
      return false;
    }
    if (!window.supabase || typeof window.supabase.createClient !== 'function') {
      console.warn('[SupabaseAdapter] SDK Supabase introuvable (CDN non chargé ?)');
      return false;
    }
    try {
      _client = window.supabase.createClient(url, anonKey);
      console.log('[SupabaseAdapter] Initialisé →', url.replace(/https?:\/\//, '').split('.')[0] + '.supabase.co');
      return true;
    } catch (e) {
      console.warn('[SupabaseAdapter] Échec init:', e.message);
      _client = null;
      return false;
    }
  }

  // ── Accès table (query builder Supabase) ───────────────────────────────
  function from(table) {
    if (!_client) {
      console.warn('[SupabaseAdapter] from() appelé sans client — init() non exécuté ?');
      return null;
    }
    return _client.from(table);
  }

  // ── Appel RPC (fonction PostgreSQL Supabase) ────────────────────────────
  function rpc(name, args) {
    if (!_client) {
      return Promise.resolve({
        data:  null,
        error: { message: '[SupabaseAdapter] Non initialisé' }
      });
    }
    return _client.rpc(name, args || {});
  }

  // ── État ────────────────────────────────────────────────────────────────
  function isReady() {
    return !!_client;
  }

  // ── Accès au client brut (usage exceptionnel uniquement) ────────────────
  function getClient() {
    return _client;
  }

  return { init, from, rpc, isReady, getClient };

})();
