// ═══════════════════════════════════════════════════════════════════════════
// BOA Programme Pilotage — Configuration multi-environnement
// ═══════════════════════════════════════════════════════════════════════════
//
// ⚠️  CE FICHIER EST LE SEUL À MODIFIER lors d'un changement d'environnement.
//     Ne jamais committer ce fichier avec de vraies clés dans un repo public.
//
// Environnements supportés :
//   'supabase' → Supabase cloud (supabase.com) ou auto-hébergé (on-premise)
//   'rest'     → API REST générique (Express / Java / .NET — futur on-premise)
// ═══════════════════════════════════════════════════════════════════════════

const CONFIG = {

  // ── Type de backend actif ───────────────────────────────────────────────
  // Valeurs : 'supabase' | 'rest'
  backendType: 'supabase',

  // ── Supabase (cloud ou auto-hébergé) ───────────────────────────────────
  supabase: {
    url:     'https://mvjyolfsheoxhojzbjdc.supabase.co',
    anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im12anlvbGZzaGVveGhvanpiamRjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIyMzY5MjcsImV4cCI6MjA4NzgxMjkyN30.VYq6j_UPRwX10kQ8wjS0dprOtWLVZO-vuSl2LK1DjHU'
  },

  // ── REST API (déploiement on-premise futur) ─────────────────────────────
  rest: {
    baseUrl: 'http://localhost:3000/api'
  },

  // ── Assistant AI ────────────────────────────────────────────────────────
  // La clé API Groq est stockée côté serveur (Supabase Edge Function secret).
  // Aucune clé à renseigner ici — le proxy /functions/v1/chat-proxy gère tout.
  gemini: {
    model:    'llama-3.3-70b-versatile',
    provider: 'groq'     // 'groq' | 'gemini'
  }

};

// ── Rétrocompatibilité ───────────────────────────────────────────────────────
// Les scripts existants utilisent ces constantes directement.
// Elles sont dérivées de CONFIG pour éviter toute duplication.
const SUPABASE_URL      = CONFIG.supabase.url;
const SUPABASE_ANON_KEY = CONFIG.supabase.anonKey;
