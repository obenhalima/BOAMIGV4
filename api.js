// ═══════════════════════════════════════════════════════════════════════════
// BOA Programme Pilotage — Sélecteur d'adaptateur backend
// ═══════════════════════════════════════════════════════════════════════════
//
// Ce fichier lit CONFIG.backendType (défini dans config.js) et active
// l'adaptateur correspondant.
//
// Pour changer de backend, modifiez UNIQUEMENT config.js :
//   backendType: 'supabase'  → SupabaseAdapter (cloud ou auto-hébergé)
//   backendType: 'rest'      → RestAdapter     (on-premise / autre cloud)
//
// API et sb sont des variables globales accessibles depuis tous les scripts.
//   API  → référence principale (nouvelle architecture)
//   sb   → alias rétrocompatibilité (db_layer_v2.js, app_main.js)
// ═══════════════════════════════════════════════════════════════════════════

/* global CONFIG, SupabaseAdapter, RestAdapter */

// Déclaration globale (var = accessible depuis tous les scripts suivants)
var API = null;
var sb  = null;

(function _initAdapter() {

  if (typeof CONFIG === 'undefined') {
    console.error('[API] config.js non chargé — impossible d\'initialiser l\'adaptateur.');
    return;
  }

  const type = CONFIG.backendType || 'supabase';

  // ── Supabase (cloud ou auto-hébergé) ──────────────────────────────────
  if (type === 'supabase') {
    if (typeof SupabaseAdapter === 'undefined') {
      console.error('[API] supabase-adapter.js non chargé.');
      return;
    }
    const ok = SupabaseAdapter.init(
      CONFIG.supabase.url,
      CONFIG.supabase.anonKey
    );
    if (ok) {
      API = SupabaseAdapter;
      sb  = SupabaseAdapter;   // alias rétrocompatibilité
      console.log('[API] Backend actif : Supabase');
    } else {
      console.warn('[API] SupabaseAdapter.init() a échoué — mode local uniquement.');
    }
    return;
  }

  // ── REST API (on-premise / autre cloud) ───────────────────────────────
  if (type === 'rest') {
    if (typeof RestAdapter === 'undefined') {
      console.error('[API] rest-adapter.js non chargé.');
      return;
    }
    RestAdapter.init(CONFIG.rest.baseUrl);
    API = RestAdapter;
    sb  = RestAdapter;         // alias rétrocompatibilité
    console.log('[API] Backend actif : REST →', CONFIG.rest.baseUrl);
    return;
  }

  console.error('[API] backendType inconnu :', type, '— valeurs acceptées : "supabase", "rest"');

})();
