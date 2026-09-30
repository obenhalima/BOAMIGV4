$srcDir  = Split-Path -Parent $MyInvocation.MyCommand.Path
$outDir  = Join-Path $srcDir "..\BOA_Deploy_Package"
$zipName = "BOA_Programme_Pilotage_v$(Get-Date -Format 'yyyyMMdd').zip"
$zipPath = Join-Path $srcDir "..\$zipName"

Write-Host "BOA Programme Pilotage - Creation du package de deploiement" -ForegroundColor Cyan
Write-Host ""

if (Test-Path $outDir) { Remove-Item $outDir -Recurse -Force }
New-Item -ItemType Directory -Path $outDir | Out-Null
Write-Host "[1/6] Dossier cree : $outDir" -ForegroundColor Green

$files = @(
  "BOA_Programme_Pilotage_Online.html",
  "boa_styles.css",
  "app_main.js",
  "app_import.js",
  "app_pwa.js",
  "api.js",
  "db_layer_v2.js",
  "supabase-adapter.js",
  "rest-adapter.js",
  "sw.js",
  "manifest.json",
  "favicon.ico",
  "config.template.js",
  "vercel.json",
  "netlify.toml",
  "INSTALL_SUPABASE_FRESH.sql",
  "sql_create_project_templates.sql"
)

Write-Host "[2/6] Copie des fichiers..." -ForegroundColor Green
foreach ($f in $files) {
  $src  = Join-Path $srcDir $f
  $dest = Join-Path $outDir $f
  if (Test-Path $src) {
    $destFolder = Split-Path $dest -Parent
    if (-not (Test-Path $destFolder)) { New-Item -ItemType Directory -Path $destFolder | Out-Null }
    Copy-Item $src $dest
    Write-Host "  OK $f"
  } else {
    Write-Host "  MANQUANT $f" -ForegroundColor Yellow
  }
}

Write-Host "[3/6] Copie des dossiers..." -ForegroundColor Green
$iconsSrc = Join-Path $srcDir "icons"
if (Test-Path $iconsSrc) { Copy-Item $iconsSrc (Join-Path $outDir "icons") -Recurse; Write-Host "  OK icons\" }

$sbFuncSrc = Join-Path $srcDir "supabase\functions"
if (Test-Path $sbFuncSrc) { New-Item -ItemType Directory -Path (Join-Path $outDir "supabase") -Force | Out-Null; Copy-Item $sbFuncSrc (Join-Path $outDir "supabase\functions") -Recurse; Write-Host "  OK supabase\functions\" }

$sqlSrc = Join-Path $srcDir "divers\sql"
if (Test-Path $sqlSrc) { Copy-Item $sqlSrc (Join-Path $outDir "sql") -Recurse; Write-Host "  OK sql\ (scripts migration)" }

Write-Host "[4/6] Creation README..." -ForegroundColor Green
$readmePath = Join-Path $outDir "README_DEPLOY.txt"
$lines = @(
  "BOA PROGRAMME PILOTAGE - GUIDE DE DEPLOIEMENT",
  "==============================================",
  "",
  "PREREQUIS",
  "  - Compte Supabase gratuit : https://supabase.com",
  "  - Hebergement statique : Vercel, Netlify, GitHub Pages, ou local",
  "  - Aucun serveur requis (app 100% frontend)",
  "",
  "ETAPE 1 - BASE DE DONNEES SUPABASE",
  "  1. Creer un projet sur https://supabase.com",
  "  2. Aller dans : Database -> SQL Editor -> New Query",
  "  3. Coller le contenu de INSTALL_SUPABASE_FRESH.sql -> Run",
  "  4. Verifier : message 'Installation terminee' affiche",
  "",
  "  Compte cree par defaut :",
  "    Identifiant : editeur",
  "    Mot de passe : Editeur@BOA2026",
  "    --> Changez ce mot de passe a la premiere connexion !",
  "",
  "ETAPE 2 - CONFIGURER L'APPLICATION",
  "  1. Renommer config.template.js -> config.js",
  "  2. Dans Supabase : Project Settings -> API",
  "  3. Copier 'Project URL' et 'anon public key'",
  "  4. Les coller dans config.js :",
  "       supabase: {",
  "         url:     'https://VOTRE_ID.supabase.co',",
  "         anonKey: 'VOTRE_CLE_ANON'",
  "       }",
  "",
  "ETAPE 3 - DEPLOYER",
  "",
  "  OPTION A - Vercel (recommande, gratuit)",
  "    1. Compte sur https://vercel.com",
  "    2. Add New Project -> Deploy folder -> glisser ce dossier",
  "    3. Framework: Other",
  "",
  "  OPTION B - Netlify (gratuit)",
  "    1. https://netlify.com -> Add new site -> Deploy manually",
  "    2. Glisser-deposer ce dossier",
  "",
  "  OPTION C - En local (sans hebergement)",
  "    Ouvrir BOA_Programme_Pilotage_Online.html dans Chrome/Edge",
  "",
  "  OPTION D - GitHub Pages",
  "    ATTENTION : ne jamais committer config.js avec les vraies cles !",
  "    Ajouter 'config.js' dans .gitignore",
  "",
  "PERSONNALISATION",
  "  - Les donnees CBS (gaps, actions, arbitrages) sont dans app_main.js",
  "  - Adapter les tableaux 'gaps', 'actions', 'arbitrages', 'ganttTasks'",
  "    en debut de fichier app_main.js selon votre referentiel",
  "",
  "MISES A JOUR",
  "  Repo source : https://github.com/obenhalima/BOAMIGV4",
  "  Remplacer app_main.js, app_import.js, boa_styles.css",
  "  Ne pas ecraser config.js (vos identifiants y sont)",
  ""
)
$lines | Out-File -FilePath $readmePath -Encoding UTF8
Write-Host "  OK README_DEPLOY.txt"

Write-Host "[5/6] Creation du ZIP..." -ForegroundColor Green
if (Test-Path $zipPath) { Remove-Item $zipPath -Force }
Compress-Archive -Path "$outDir\*" -DestinationPath $zipPath
$zipSize = [math]::Round((Get-Item $zipPath).Length / 1MB, 2)
Write-Host "  OK $zipName ($zipSize MB)" -ForegroundColor Green

Write-Host "[6/6] Nettoyage..." -ForegroundColor Green
Remove-Item $outDir -Recurse -Force

Write-Host ""
Write-Host "Package pret : $zipName" -ForegroundColor Cyan
Write-Host "Emplacement  : $(Split-Path $zipPath -Parent)" -ForegroundColor Cyan
Write-Host ""
Write-Host "Pour deployer : extraire le ZIP, suivre README_DEPLOY.txt" -ForegroundColor White
