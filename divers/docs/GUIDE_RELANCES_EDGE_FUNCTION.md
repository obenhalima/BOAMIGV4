# Guide - Relances email via Supabase Edge Function

Ce guide configure une fonction Supabase Edge nommee `send-action-reminder` pour envoyer les relances email via Resend.

## Fichiers ajoutes

```text
supabase/config.toml
supabase/functions/.env.example
supabase/functions/send-action-reminder/index.ts
migration_action_reminders_step_E.sql
```

## 1. Preparer la base

Dans Supabase SQL Editor, execute :

```sql
-- fichier a executer
migration_action_reminders_step_E.sql
```

Cette migration cree `public.action_reminders`, qui journalise :

- le projet
- l'action
- le destinataire
- l'objet
- le contenu
- le statut d'envoi
- l'erreur eventuelle

## 2. Installer et connecter la CLI Supabase

Si la CLI n'est pas encore installee :

```bash
npm install -g supabase
```

Puis :

```bash
supabase login
supabase link --project-ref mvjyolfsheoxhojzbjdc
```

## 3. Declarer les secrets

Les variables attendues sont listees dans :

```text
supabase/functions/.env.example
```

Configure au minimum :

```bash
supabase secrets set RESEND_API_KEY=re_xxxxx
supabase secrets set REMINDER_FROM_EMAIL=noreply@votre-domaine.com
supabase secrets set REMINDER_FROM_NAME="BOA Pilotage Programme"
```

## 4. Deployer la fonction

Le projet est deja prepare avec :

```toml
[functions.send-action-reminder]
verify_jwt = false
```

Commande de deployement :

```bash
supabase functions deploy send-action-reminder --no-verify-jwt
```

## 5. Tester l'envoi

Exemple de test :

```bash
curl -i --request POST "https://mvjyolfsheoxhojzbjdc.supabase.co/functions/v1/send-action-reminder" ^
  --header "Content-Type: application/json" ^
  --data "{\"admin_username\":\"<admin_username>\",\"admin_hash\":\"<sha256_password_hash>\",\"project_id\":\"<project_id>\",\"action_id\":\"A001\",\"to\":\"prenom.nom@boa.ci\",\"cc\":\"chef.projet@boa.ci\",\"subject\":\"[IGOR V4] Relance action A001\",\"body\":\"Bonjour,\\n\\nMerci de nous faire un retour sur cette action.\\n\"}"
```

Reponse attendue si tout va bien :

```json
{
  "ok": true,
  "provider": "resend",
  "id": "..."
}
```

## 6. Ce que fait la fonction

La fonction :

1. verifie l'utilisateur applicatif dans `public.app_users`
2. refuse si le role n'est ni `admin` ni `editor`
3. envoie l'email via l'API Resend
4. ecrit le resultat dans `public.action_reminders`

## 7. Comment l'app devra l'appeler

Le front devra envoyer :

```json
{
  "admin_username": "admin",
  "admin_hash": "<sha256_password_hash>",
  "project_id": "boa_ci_v4",
  "action_id": "A001",
  "action_db_id": "uuid-optionnel",
  "to": "prenom.nom@boa.ci",
  "cc": "chef.projet@boa.ci",
  "subject": "[IGOR V4] Relance action A001",
  "body": "Bonjour..."
}
```

## 8. Conseil pratique

Pour la phase 1, branche seulement le bouton `Relancer` unitaire sur cette fonction.

Ensuite, on pourra ajouter tranquillement :

- relance en masse
- modele d'email par defaut
- cron quotidien pour les actions en retard
- suivi "derniere relance / nb de relances" sur les actions
