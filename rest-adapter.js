// ═══════════════════════════════════════════════════════════════════════════
// BOA Programme Pilotage — Adaptateur REST (on-premise / autre cloud)
// ═══════════════════════════════════════════════════════════════════════════
//
// Implémente la même interface que SupabaseAdapter via des appels fetch().
// Compatible avec une API PostgREST (format Supabase) ou toute API REST
// respectant les conventions suivantes :
//
//   GET    /api/{table}?select=*&col=eq.val    → liste
//   GET    /api/{table}?col=eq.val             → filtré (header Accept: object)
//   POST   /api/{table}                        → insert  (body JSON)
//   PATCH  /api/{table}?col=eq.val             → update  (body JSON)
//   PUT    /api/{table}                        → upsert  (body JSON)
//   DELETE /api/{table}?col=eq.val             → delete
//   POST   /api/rpc/{name}                     → appel RPC (body JSON)
//
// Pour activer : dans config.js, définir backendType: 'rest' et rest.baseUrl.
//
// Interface exposée (identique à SupabaseAdapter) :
//   RestAdapter.init(baseUrl) → void
//   RestAdapter.from(table)   → QueryBuilder
//   RestAdapter.rpc(name, args) → Promise<{data, error}>
//   RestAdapter.isReady()     → Boolean
// ═══════════════════════════════════════════════════════════════════════════

const RestAdapter = (() => {

  let _baseUrl = null;

  // ── QueryBuilder — reproduit l'API fluente de Supabase ─────────────────
  class QueryBuilder {
    constructor(table) {
      this._table   = table;
      this._method  = 'GET';
      this._filters = [];
      this._select  = '*';
      this._order   = null;
      this._body    = null;
      this._single  = false;
      this._limit   = null;
    }

    // ── Lecture ──────────────────────────────────────────────────────────
    select(cols) {
      this._select = cols || '*';
      return this;
    }
    eq(col, val) {
      this._filters.push({ col, op: 'eq', val });
      return this;
    }
    neq(col, val) {
      this._filters.push({ col, op: 'neq', val });
      return this;
    }
    order(col, opts = {}) {
      this._order = { col, ascending: opts.ascending !== false };
      return this;
    }
    limit(n) {
      this._limit = n;
      return this;
    }
    single() {
      this._single = true;
      return this;
    }

    // ── Écriture ─────────────────────────────────────────────────────────
    insert(data) {
      this._method = 'POST';
      this._body   = data;
      return this;
    }
    upsert(data, opts = {}) {
      this._method = 'PUT';
      this._body   = data;
      this._upsertOpts = opts;
      return this;
    }
    update(data) {
      this._method = 'PATCH';
      this._body   = data;
      return this;
    }
    delete() {
      this._method = 'DELETE';
      return this;
    }

    // ── Exécution (thenable → await fonctionne directement) ──────────────
    then(resolve, reject) {
      return this._execute().then(resolve, reject);
    }
    catch(reject) {
      return this._execute().catch(reject);
    }

    async _execute() {
      if (!_baseUrl) {
        return { data: null, error: { message: '[RestAdapter] baseUrl non configuré — vérifiez config.js' } };
      }

      // ── Construction de l'URL ─────────────────────────────────────────
      let url = `${_baseUrl}/${this._table}`;
      const params = [];

      if (this._method === 'GET' || this._method === 'DELETE') {
        if (this._method === 'GET') params.push(`select=${encodeURIComponent(this._select)}`);
        this._filters.forEach(({ col, op, val }) => {
          params.push(`${encodeURIComponent(col)}=${op}.${encodeURIComponent(val)}`);
        });
        if (this._order) {
          params.push(`order=${encodeURIComponent(this._order.col)}${this._order.ascending ? '' : '.desc'}`);
        }
        if (this._limit !== null) params.push(`limit=${this._limit}`);
      } else {
        // PATCH / DELETE avec filtres dans l'URL
        this._filters.forEach(({ col, op, val }) => {
          params.push(`${encodeURIComponent(col)}=${op}.${encodeURIComponent(val)}`);
        });
      }

      if (params.length) url += '?' + params.join('&');

      // ── Headers ───────────────────────────────────────────────────────
      const headers = {
        'Content-Type':  'application/json',
        'Accept':        this._single
          ? 'application/vnd.pgrst.object+json'
          : 'application/json'
      };

      // Jeton auth si disponible (ex: JWT stocké après login)
      const token = window._apiToken || null;
      if (token) headers['Authorization'] = `Bearer ${token}`;

      // ── Requête ───────────────────────────────────────────────────────
      const opts = { method: this._method, headers };
      if (this._body !== null) opts.body = JSON.stringify(this._body);

      try {
        const res = await fetch(url, opts);

        if (!res.ok) {
          let errBody = {};
          try { errBody = await res.json(); } catch (_) {}
          return {
            data:  null,
            error: { message: errBody.message || errBody.hint || res.statusText, code: String(res.status) }
          };
        }

        // 204 No Content (DELETE, certains INSERT)
        if (res.status === 204) return { data: null, error: null };

        const data = await res.json();
        return { data, error: null };

      } catch (e) {
        return { data: null, error: { message: e.message } };
      }
    }
  }

  // ── Initialisation ──────────────────────────────────────────────────────
  function init(baseUrl) {
    _baseUrl = baseUrl ? baseUrl.replace(/\/$/, '') : null;
    if (_baseUrl) {
      console.log('[RestAdapter] Initialisé →', _baseUrl);
    } else {
      console.warn('[RestAdapter] baseUrl manquant — vérifiez config.js > rest.baseUrl');
    }
  }

  // ── Accès table ─────────────────────────────────────────────────────────
  function from(table) {
    return new QueryBuilder(table);
  }

  // ── Appel RPC ───────────────────────────────────────────────────────────
  async function rpc(name, args) {
    if (!_baseUrl) {
      return { data: null, error: { message: '[RestAdapter] Non initialisé' } };
    }
    const token = window._apiToken || null;
    const headers = { 'Content-Type': 'application/json', 'Accept': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    try {
      const res = await fetch(`${_baseUrl}/rpc/${name}`, {
        method:  'POST',
        headers,
        body: JSON.stringify(args || {})
      });
      if (!res.ok) {
        let errBody = {};
        try { errBody = await res.json(); } catch (_) {}
        return { data: null, error: { message: errBody.message || res.statusText, code: String(res.status) } };
      }
      if (res.status === 204) return { data: null, error: null };
      const data = await res.json();
      return { data, error: null };
    } catch (e) {
      return { data: null, error: { message: e.message } };
    }
  }

  // ── État ────────────────────────────────────────────────────────────────
  function isReady() {
    return !!_baseUrl;
  }

  return { init, from, rpc, isReady };

})();
