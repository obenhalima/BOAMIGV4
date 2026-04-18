// ═══════════════════════════════════════════════════════════════════════════
// BOA Programme Pilotage — Service Worker & bannière d'installation PWA
// ═══════════════════════════════════════════════════════════════════════════

// ── Service Worker registration ───────────────────────────────────────────────
const _IS_FILE_PROTOCOL = location.protocol === 'file:';
if (!_IS_FILE_PROTOCOL && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js')
      .then(reg => {
        console.log('[PWA] Service Worker enregistré:', reg.scope);
        // Notifier l'utilisateur si une nouvelle version est disponible
        reg.addEventListener('updatefound', () => {
          const nw = reg.installing;
          nw.addEventListener('statechange', () => {
            if (nw.state === 'installed' && navigator.serviceWorker.controller) {
              showToast('Nouvelle version disponible — rechargez la page pour mettre à jour.', 5000);
            }
          });
        });
      })
      .catch(err => console.warn('[PWA] SW non enregistré:', err));
  });
}

// ── PWA Install prompt ────────────────────────────────────────────────────────
let _pwaInstallEvent = null;
window.addEventListener('beforeinstallprompt', e => {
  if (_IS_FILE_PROTOCOL) return;
  e.preventDefault();
  _pwaInstallEvent = e;
  // Affiche la bannière après 3 secondes si l'app n'est pas déjà installée
  setTimeout(() => {
    const banner = document.getElementById('pwa-install-banner');
    if (banner) banner.style.display = 'flex';
  }, 3000);
});
document.addEventListener('DOMContentLoaded', () => {
  if (_IS_FILE_PROTOCOL) {
    document.getElementById('mobile-bottom-nav')?.remove();
    document.getElementById('mobile-drawer')?.remove();
    document.getElementById('mobile-drawer-overlay')?.remove();
    document.getElementById('pwa-install-banner')?.remove();
  }
  const btn = document.getElementById('pwa-install-btn');
  if (btn) {
    btn.addEventListener('click', () => {
      if (!_pwaInstallEvent) return;
      _pwaInstallEvent.prompt();
      _pwaInstallEvent.userChoice.then(r => {
        if (r.outcome === 'accepted') {
          document.getElementById('pwa-install-banner').style.display = 'none';
          showToast('✅ BOA Pilotage installé sur votre écran d\'accueil !');
        }
        _pwaInstallEvent = null;
      });
    });
  }
});
window.addEventListener('appinstalled', () => {
  document.getElementById('pwa-install-banner').style.display = 'none';
  showToast('✅ Application installée avec succès !');
});

// ── Mobile drawer ─────────────────────────────────────────────────────────────
function toggleMobileMenu() {
  const drawer  = document.getElementById('mobile-drawer');
  const overlay = document.getElementById('mobile-drawer-overlay');
  const isOpen  = drawer.classList.toggle('open');
  overlay.style.display = isOpen ? 'block' : 'none';
  document.body.style.overflow = isOpen ? 'hidden' : '';
}

// ── Sync mobile nav active state ──────────────────────────────────────────────
// Patch switchTab to also update mobile bottom nav + drawer
(function() {
  const _orig = window.switchTab;
  window.switchTab = function(name, btn) {
    _orig(name, btn);
    // Bottom nav
    document.querySelectorAll('.mob-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.mob-btn[data-tab="'+name+'"]').forEach(b => b.classList.add('active'));
    // Drawer
    document.querySelectorAll('.mob-drawer-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.mob-drawer-btn[data-tab="'+name+'"]').forEach(b => b.classList.add('active'));
    // Close drawer if open
    const drawer = document.getElementById('mobile-drawer');
    if (drawer && drawer.classList.contains('open')) toggleMobileMenu();
  };
})();

// ── Sync mobile badges ────────────────────────────────────────────────────────
(function() {
  const _origArb = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'textContent');
  // Simple MutationObserver on tab-arb-badge to mirror to mob-arb-badge
  document.addEventListener('DOMContentLoaded', () => {
    ['tab-arb-badge', 'tab-risk-badge'].forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      const mirrorId = id === 'tab-arb-badge' ? 'mob-arb-badge' : 'mob-risk-badge';
      new MutationObserver(() => {
        const m = document.getElementById(mirrorId);
        if (m) { m.textContent = el.textContent; m.style.display = el.textContent ? '' : 'none'; }
      }).observe(el, { childList: true, characterData: true, subtree: true });
    });
  });
})();
