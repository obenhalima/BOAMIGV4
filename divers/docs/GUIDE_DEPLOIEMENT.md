# 🚀 Guide de déploiement — BOA CI Pilotage IGOR V4

Temps estimé : **25 minutes** · Coût : **0 €**

---

## Ce que vous obtenez

- Une URL HTTPS accessible depuis n'importe quel navigateur ou téléphone
- Connexion sécurisée (identifiant + mot de passe)
- 3 niveaux d'accès : **Propriétaire**, **Éditeur**, **Lecteur**
- Synchronisation temps réel entre tous les utilisateurs (Supabase)
- **Application mobile installable** sur iOS et Android (PWA)

---

## Fichiers à déployer

Le dossier `Online_Deploy` doit contenir tous ces fichiers :

```
Online_Deploy/
├── BOA_Programme_Pilotage_Online.html   ← Application principale
├── boa_styles.css                       ← Styles
├── manifest.json                        ← Déclaration PWA
├── sw.js                                ← Service Worker (mode hors-ligne)
├── favicon.ico                          ← Favicon
├── _headers                             ← Headers HTTP Netlify (PWA)
├── netlify.toml                         ← Configuration Netlify
├── vercel.json                          ← Configuration Vercel (alternative)
└── icons/
    ├── icon-192.png
    ├── icon-512.png
    ├── apple-touch-icon.png
    ├── favicon-16.png
    └── favicon-32.png
```

> ⚠️ **Ne déployez que ces fichiers.** Les fichiers `.sql`, `.docx`, `.bak` et autres documents ne doivent pas être mis en ligne.

---

## ÉTAPE 1 — Créer votre base Supabase (10 min)

### 1.1 Créer le projet

1. Allez sur **[supabase.com](https://supabase.com)** → "Start for free"
2. Connectez-vous avec GitHub ou votre email
3. Cliquez **"New project"**
4. Remplissez :
   - **Name** : `boa-ci-pilotage`
   - **Database Password** : choisissez un mot de passe fort (notez-le !)
   - **Region** : `EU West (Ireland)` ou `EU Central (Frankfurt)`
5. Cliquez **"Create new project"** — attendez ~2 minutes

### 1.2 Exécuter le schéma SQL

1. Dans Supabase → **"SQL Editor"** → **"New query"**
2. Ouvrez `supabase_setup.sql`, copiez tout le contenu et collez-le
3. Cliquez **"Run"** → vous devriez voir "Success. No rows returned"
4. Répétez avec les fichiers dans cet ordre si nécessaire :
   - `migration_gaps_step_A.sql`
   - `migration_perimeter_step_B.sql`
   - `migration_gantt_step_C.sql`
   - `migration_actions_arb_step_D.sql`
   - `migration_permissions.sql`
   - `fix_auth_list_users.sql`
   - `priority1_security_rpc.sql` - cree des backups, durcit `project_state` / `app_defaults` et ne modifie pas les utilisateurs existants

### 1.3 Récupérer vos clés API

1. Menu gauche → **"Project Settings"** → **"API"**
2. Notez :
   - **Project URL** : `https://xxxxxxxxxxxx.supabase.co`
   - **anon public key** : `eyJhbGciOiJIUzI1NiIsInR5c...` (longue chaîne)

---

## ÉTAPE 2 — Configurer le fichier HTML (2 min)

1. Ouvrez `BOA_Programme_Pilotage_Online.html` dans un éditeur de texte (Notepad, VS Code...)
2. Cherchez (Ctrl+F) :

```javascript
const SUPABASE_URL      = 'YOUR_SUPABASE_URL';
const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY';
```

3. Remplacez par vos vraies valeurs :

```javascript
const SUPABASE_URL      = 'https://xxxxxxxxxxxx.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...';
```

4. Sauvegardez le fichier.

---

## ÉTAPE 3 — Déployer sur Netlify (5 min)

Netlify est recommandé car il gère automatiquement le HTTPS (obligatoire pour la PWA).

### Option A — Drag & Drop (le plus simple)

1. Allez sur **[netlify.com](https://netlify.com)** → "Sign up for free"
2. Connectez-vous → **"Add new site"** → **"Deploy manually"**
3. Sélectionnez **uniquement** les fichiers listés dans la section "Fichiers à déployer" ci-dessus (pas les `.sql`, `.docx`, etc.)
4. Glissez-déposez le dossier sélectionné dans la zone de dépôt Netlify
5. Netlify génère une URL comme `random-name-123.netlify.app`
6. Pour personnaliser : **"Site settings"** → **"Change site name"** → ex: `boa-ci-pilotage`

> Votre URL finale sera : `https://boa-ci-pilotage.netlify.app`

### Option B — Via GitHub (mises à jour automatiques recommandée)

1. Créez un **repo GitHub privé** (important : privé !)
2. Uploadez les fichiers du dossier `Online_Deploy` (uniquement les fichiers listés)
3. Dans Netlify : "Add new site" → "Import from Git" → sélectionnez votre repo
4. **Build settings** : laissez tout vide (pas de commande de build)
5. Chaque fois que vous modifiez un fichier sur GitHub → le site se met à jour automatiquement en ~30 secondes

### Option C — Vercel (alternative)

1. Allez sur **[vercel.com](https://vercel.com)** → "Sign up"
2. "New Project" → "Import from Git" ou "Deploy" (drag & drop)
3. Le fichier `vercel.json` configure automatiquement les redirections

---

## ÉTAPE 4 — Configurer Supabase pour votre URL (2 min)

**Obligatoire** sinon la connexion échouera.

1. Supabase → **Authentication** → **URL Configuration**
2. **Site URL** : `https://boa-ci-pilotage.netlify.app` ← votre URL réelle
3. **Redirect URLs** : ajoutez `https://boa-ci-pilotage.netlify.app/**`
4. Cliquez **Save**

---

## ÉTAPE 5 — Premier accès

1. Ouvrez votre URL Netlify dans un navigateur
2. Vous arrivez sur l'écran de connexion
3. Utilisez le bouton de bootstrap (cliquer 5 fois sur "Accès réservé" en bas) pour créer le premier compte admin
4. **Le premier compte devient automatiquement Propriétaire**

---

## 📱 Installer l'application sur mobile

Une fois le site déployé en HTTPS, les utilisateurs peuvent installer l'app comme une vraie application mobile.

### Sur Android (Chrome)

1. Ouvrez l'URL dans **Chrome**
2. Une bannière "Installer BOA Pilotage" apparaît automatiquement en bas
3. Tapez **"Installer"** → l'app s'ajoute à l'écran d'accueil
4. Si la bannière n'apparaît pas : menu **⋮** → **"Ajouter à l'écran d'accueil"**

### Sur iPhone / iPad (Safari)

> Safari ne supporte pas la bannière automatique — procédure manuelle :

1. Ouvrez l'URL dans **Safari** (pas Chrome, pas Firefox)
2. Tapez l'icône **Partage** (carré avec flèche vers le haut) en bas de l'écran
3. Faites défiler → tapez **"Sur l'écran d'accueil"**
4. Confirmez le nom → tapez **"Ajouter"**
5. L'app apparaît sur votre écran d'accueil avec l'icône BOA/CBS

### Résultat

- L'app s'ouvre en **plein écran** (sans barre d'URL)
- Navigation par **barre inférieure** : Dashboard · Planning · Arbitrages · Actions · ☰ Plus
- Fonctionne **hors-ligne** pour consulter les données déjà chargées
- Se synchronise avec Supabase dès que la connexion est rétablie

---

## Mise à jour de l'application

Quand vous modifiez le HTML ou le CSS et redéployez sur Netlify :

1. La prochaine fois qu'un utilisateur ouvre l'app, il voit un toast : **"Nouvelle version disponible — rechargez la page"**
2. Il suffit de fermer et rouvrir l'app (ou actualiser la page)

---

## Gestion des accès

### Inviter un collègue

1. Connectez-vous en tant que Propriétaire
2. Cliquez **"👥 Utilisateurs"** dans le header
3. Créez un compte avec son identifiant et son rôle
4. Envoyez-lui l'URL + ses identifiants

### Rôles

| Rôle | Peut modifier |
|------|---------------|
| **Propriétaire** | Tout + gestion des utilisateurs |
| **Éditeur** | Arbitrages, Gantt, Actions, GAPs, Risques |
| **Lecteur** | Lecture seule |

---

## En cas de problème

| Problème | Solution |
|----------|----------|
| Écran blanc | Ouvrez la console navigateur (F12) — cherchez les erreurs rouges |
| "Invalid credentials" | Vérifiez identifiant/mot de passe. Réinitialisez via l'outil Bootstrap |
| Les données ne se sauvent pas | Vérifiez les clés Supabase dans le HTML |
| Erreur CORS | Ajoutez l'URL Netlify dans Supabase → Authentication → URL Configuration |
| Service Worker bloqué | Vérifiez que le fichier `_headers` est bien déployé avec le reste |
| PWA non installable | Le site doit être en HTTPS. Vérifiez dans Chrome → F12 → Application → Manifest |
| Pas de bannière install sur iOS | Normal — utilisez Safari → Partage → "Sur l'écran d'accueil" |

---

## Vérifier que la PWA fonctionne

Dans Chrome (desktop ou Android) :

1. Ouvrez l'app → appuyez sur **F12** (DevTools)
2. Onglet **"Application"**
3. Vérifiez :
   - **Manifest** → doit afficher le nom, les icônes, le thème rouge
   - **Service Workers** → doit afficher `sw.js` avec statut "activated and running"
   - **Cache Storage** → doit lister les fichiers mis en cache

---

*Application générée par Claude (Anthropic) · Capital Banking Solutions · BOA Afrique · 2026*
