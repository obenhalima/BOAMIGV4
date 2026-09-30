// ═══════════════════════════════════════════════════════════════════════════
// BOA Programme Pilotage — Configuration (TEMPLATE)
// ═══════════════════════════════════════════════════════════════════════════
//
// INSTRUCTIONS :
//   1. Copier ce fichier et le renommer en "config.js"
//   2. Créer un projet Supabase gratuit sur https://supabase.com
//   3. Aller dans : Project Settings → API
//   4. Copier l'URL et la clé "anon" ci-dessous
//   5. Exécuter INSTALL_SUPABASE_FRESH.sql dans Supabase → SQL Editor
//
// ⚠️ Ne jamais committer config.js avec de vraies clés dans un repo public.
//    Ajouter "config.js" dans .gitignore si vous poussez vers GitHub.
// ═══════════════════════════════════════════════════════════════════════════

const CONFIG = {

  // ── Type de backend ─────────────────────────────────────────────────────
  backendType: 'supabase',

  // ── Supabase ─────────────────────────────────────────────────────────────
  supabase: {
    url:     'https://VOTRE_PROJECT_ID.supabase.co',   // ← remplacer ici
    anonKey: 'VOTRE_CLE_ANON'                          // ← remplacer ici
  },

  // ── REST API (futur on-premise) ──────────────────────────────────────────
  rest: {
    baseUrl: 'http://localhost:3000/api'
  },

  // ── Assistant AI (Pilot) ─────────────────────────────────────────────────
  // La clé Groq est stockée dans Supabase Edge Function (secrets).
  // Rien à renseigner ici.
  gemini: {
    model:    'llama-3.3-70b-versatile',
    provider: 'groq'
  }

};

// Rétrocompatibilité
const SUPABASE_URL      = CONFIG.supabase.url;
const SUPABASE_ANON_KEY = CONFIG.supabase.anonKey;
