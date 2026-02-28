# 🚀 Guide de déploiement — BOA CI Pilotage IGOR V4 (version online)

Temps estimé : **20 minutes** · Coût : **0 € (tiers gratuits)**

---

## Ce que vous allez obtenir

- Une URL publique (ex: `boa-ci-pilotage.netlify.app`) accessible par tous vos collègues
- Un système de connexion sécurisé (email + mot de passe)
- 3 niveaux d'accès : **Propriétaire**, **Éditeur**, **Lecteur**
- Synchronisation en temps réel entre tous les utilisateurs connectés

---

## ÉTAPE 1 — Créer votre base Supabase (10 min)

### 1.1 Créer le projet

1. Allez sur **[supabase.com](https://supabase.com)** → "Start for free"
2. Connectez-vous avec GitHub ou votre email
3. Cliquez **"New project"**
4. Remplissez :
   - **Name** : `boa-ci-pilotage`
   - **Database Password** : choisissez un mot de passe fort (notez-le)
   - **Region** : `EU West (Ireland)` ou `EU Central (Frankfurt)`
5. Cliquez **"Create new project"** — attendez ~2 minutes

### 1.2 Exécuter le schéma SQL

1. Dans Supabase, cliquez **"SQL Editor"** (menu gauche)
2. Cliquez **"New query"**
3. Ouvrez le fichier `supabase_setup.sql` fourni dans ce dossier
4. Copiez tout son contenu et collez-le dans l'éditeur
5. Cliquez **"Run"** → vous devriez voir "Success. No rows returned"

### 1.3 Récupérer vos clés API

1. Menu gauche → **"Project Settings"** → **"API"**
2. Notez :
   - **Project URL** : `https://xxxxxxxxxxxx.supabase.co`
   - **anon public key** : `eyJhbGciOiJIUzI1NiIsInR5c...` (longue chaîne)

### 1.4 Configurer l'email (optionnel mais recommandé)

1. Menu gauche → **"Authentication"** → **"Email Templates"**
2. Vous pouvez personnaliser les emails de confirmation/invitation

---

## ÉTAPE 2 — Configurer le fichier HTML (2 min)

1. Ouvrez `BOA_Programme_Pilotage_Online.html` avec un éditeur de texte (Notepad, VS Code...)
2. Trouvez ces deux lignes (au début du `<script>`) :

```javascript
const SUPABASE_URL      = 'YOUR_SUPABASE_URL';
const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY';
```

3. Remplacez par vos vraies valeurs :

```javascript
const SUPABASE_URL      = 'https://xxxxxxxxxxxx.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...';
```

4. Sauvegardez le fichier

---

## ÉTAPE 3 — Déployer sur Netlify (5 min)

### Option A — Interface web (le plus simple)

1. Allez sur **[netlify.com](https://netlify.com)** → "Sign up for free"
2. Connectez-vous → cliquez **"Add new site"** → **"Deploy manually"**
3. **Glissez-déposez le dossier `Online_Deploy`** dans la zone de dépôt
4. Netlify génère automatiquement une URL comme `random-name-123.netlify.app`
5. Pour personnaliser l'URL : **"Site settings"** → **"Change site name"** → ex: `boa-ci-pilotage`

### Option B — Via GitHub (mises à jour automatiques)

1. Créez un repo GitHub privé
2. Uploadez les fichiers du dossier `Online_Deploy`
3. Dans Netlify : "Add new site" → "Import from Git" → choisissez votre repo
4. Chaque push sur GitHub met à jour le site automatiquement

---

## ÉTAPE 4 — Premier accès (1 min)

1. Ouvrez votre URL Netlify
2. Vous arrivez sur l'écran de connexion
3. Cliquez **"Créer un compte"**
4. **Le premier compte créé devient automatiquement Propriétaire** (owner)
5. Connectez-vous — vous accédez au dashboard avec tous les droits

---

## Gérer les accès collègues

### Inviter un collègue

1. Connectez-vous en tant que Propriétaire
2. Cliquez **"👥 Accès"** dans le header
3. Saisissez l'email du collègue et choisissez son rôle
4. Cliquez **"Inviter"**
5. Envoyez l'URL du site au collègue — il crée son compte avec le même email

### Modifier un rôle

1. Ouvrez **"👥 Accès"**
2. Changez le rôle dans la liste déroulante → sauvegarde instantanée

---

## Récapitulatif des rôles

| Rôle | Accès | Peut modifier |
|------|-------|---------------|
| **Propriétaire** (owner) | Tout | Tout + gestion des accès |
| **Éditeur** (editor) | Tout | Arbitrages, Gantt, Actions, GAPs |
| **Lecteur** (viewer) | Lecture seule | Rien (lecture + navigation) |

---

## En cas de problème

- **"Invalid login credentials"** → email ou mot de passe incorrect
- **Les modifications ne se sauvent pas** → vérifiez vos clés Supabase dans le HTML
- **Écran blanc** → ouvrez la console du navigateur (F12) et cherchez les erreurs
- **Erreur CORS** → vérifiez que l'URL Netlify est autorisée dans Supabase (Authentication → URL Configuration → Site URL)

### Ajouter l'URL Netlify dans Supabase

1. Supabase → **Authentication** → **URL Configuration**
2. **Site URL** : `https://votre-site.netlify.app`
3. **Redirect URLs** : ajoutez `https://votre-site.netlify.app/**`

---

## Support

Pour toute question technique, contactez l'équipe CBS.

---

*Dashboard généré par Claude (Anthropic) · Capital Banking Solutions · 2026*
