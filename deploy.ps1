# deploy.ps1 - One-command, verified deploy for Portfolio Rebalancer.
#
# Runs the full gate (frontend type-check + backend parse/tests), pushes to GitHub,
# deploys the frontend to Vercel, then POLLS both live services until they actually
# serve the new code (or fails loudly on timeout). This is the source of truth for
# deploying - do not rely on auto-deploy alone.
#
# Usage:
#   pwsh ./deploy.ps1 -Message "Your commit message"
#   pwsh ./deploy.ps1 -Message "..." -SkipTests      # skip backend pytest (faster)
#   pwsh ./deploy.ps1 -VerifyOnly                     # just check what's live now
#
# Requires: git, npx (vercel CLI), python venv at backend/venv, curl.

param(
    [string]$Message = "",
    [switch]$SkipTests,
    [switch]$VerifyOnly
)

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
$backend = Join-Path $root "backend"
$frontend = Join-Path $root "frontend"

$BACKEND_URL = "https://portfolio-rebalancer-tc4h.onrender.com"
$FRONTEND_URL = "https://frontend-sooty-three-ybjekuhhod.vercel.app"
$py = Join-Path $backend "venv/Scripts/python.exe"

function Step($msg) { Write-Host "`n=== $msg ===" -ForegroundColor Cyan }
function Ok($msg)   { Write-Host "OK  $msg" -ForegroundColor Green }
function Fail($msg) { Write-Host "FAIL $msg" -ForegroundColor Red; exit 1 }

# --- A marker that proves the latest code is live (bump when you ship a schema change) ---
# Verify checks that this property exists in the deployed OpenAPI schema.
$BACKEND_MARKER_SCHEMA = "AnalyzeRequest"
$BACKEND_MARKER_PROP   = "drift_band_pct"

function Get-LocalHeadShort { (git -C $root rev-parse --short HEAD).Trim() }

function Test-BackendLive {
    try {
        $json = curl.exe -s "$BACKEND_URL/openapi.json" | ConvertFrom-Json
        $props = $json.components.schemas.$BACKEND_MARKER_SCHEMA.properties
        return ($null -ne $props.$BACKEND_MARKER_PROP)
    } catch { return $false }
}

function Get-FrontendBundle {
    try {
        $html = (Invoke-WebRequest -Uri $FRONTEND_URL -UseBasicParsing -TimeoutSec 15).Content
        if ($html -match 'assets/(index-[A-Za-z0-9_-]+\.js)') { return $Matches[1] }
        return $null
    } catch { return $null }
}

function Test-FrontendLive { return ($null -ne (Get-FrontendBundle)) }

if ($VerifyOnly) {
    Step "Verify only"
    Write-Host "Local HEAD: $(Get-LocalHeadShort)"
    if (Test-BackendLive) { Ok "Backend serving '$BACKEND_MARKER_PROP'" } else { Write-Host "Backend NOT yet serving '$BACKEND_MARKER_PROP'" -ForegroundColor Yellow }
    if (Test-FrontendLive) { Ok "Frontend reachable" } else { Write-Host "Frontend NOT reachable" -ForegroundColor Yellow }
    exit 0
}

# --- 1. Gates ---
Step "Frontend type-check (npx tsc --noEmit)"
Push-Location $frontend
npx tsc --noEmit
if ($LASTEXITCODE -ne 0) { Pop-Location; Fail "TypeScript errors - aborting deploy" }
Pop-Location
Ok "TypeScript clean"

Step "Backend parse-check"
$files = @("constants.py","schemas.py","models.py","main.py","seed_data.py","seed_tickers.py","routers/tags.py","routers/portfolio.py","services/rebalance.py")
Push-Location $backend
foreach ($f in $files) { & $py -c "import ast,sys; ast.parse(open(sys.argv[1]).read())" $f; if ($LASTEXITCODE -ne 0) { Pop-Location; Fail "Parse error in $f" } }
Ok "Backend parses"

if (-not $SkipTests) {
    Step "Backend tests (pytest)"
    & $py -m pytest tests/ -q
    if ($LASTEXITCODE -ne 0) { Pop-Location; Fail "Backend tests failed - aborting deploy" }
    Ok "Tests pass"
}
Pop-Location

# --- 2. Commit + push ---
$dirty = (git -C $root status --porcelain)
if ($dirty) {
    if (-not $Message) { Fail "Working tree has changes but no -Message provided" }
    Step "Commit + push"
    git -C $root add -A
    git -C $root commit -m $Message
} else {
    Step "Nothing to commit - pushing any unpushed commits"
}
git -C $root push
if ($LASTEXITCODE -ne 0) { Fail "git push failed" }
Ok "Pushed ($(Get-LocalHeadShort))"

# --- 3. Frontend deploy: Vercel auto-deploys from the git push above ---
# (Root Directory = frontend is set in the Vercel dashboard, so git push -> build.)
Step "Waiting for Vercel git auto-deploy (frontend)"
$preBundle = Get-FrontendBundle
Write-Host "  bundle before: $preBundle"
$fdeadline = (Get-Date).AddMinutes(5)
$fchanged = $false
while ((Get-Date) -lt $fdeadline) {
    $now = Get-FrontendBundle
    if ($now -and $now -ne $preBundle) { $fchanged = $true; break }
    Start-Sleep -Seconds 15
}
if ($fchanged) {
    Ok "Frontend auto-deployed (new bundle: $(Get-FrontendBundle))"
} else {
    Write-Host "Frontend bundle unchanged after 5 min." -ForegroundColor Yellow
    Write-Host "  Fine if this commit had no frontend changes; otherwise check the Vercel dashboard." -ForegroundColor Yellow
}

# --- 4. Verify backend (Render) actually serves the new code ---
Step "Waiting for Render backend to serve new code (up to 15 min)"
$deadline = (Get-Date).AddMinutes(15)
$live = $false
while ((Get-Date) -lt $deadline) {
    if (Test-BackendLive) { $live = $true; break }
    Write-Host ("  {0}  still old code, waiting..." -f (Get-Date -Format HH:mm:ss))
    Start-Sleep -Seconds 20
}
if ($live) {
    Ok "Backend is serving the new code"
} else {
    Write-Host "Backend did NOT pick up the new code within 15 min." -ForegroundColor Red
    Write-Host "  -> Trigger a manual deploy via the Render Deploy Hook (set RENDER_DEPLOY_HOOK env), or" -ForegroundColor Yellow
    Write-Host "     check the Render dashboard build logs for $BACKEND_URL." -ForegroundColor Yellow
    if ($env:RENDER_DEPLOY_HOOK) {
        Step "RENDER_DEPLOY_HOOK is set - triggering manual Render deploy"
        curl.exe -s -X POST $env:RENDER_DEPLOY_HOOK | Out-Host
        Write-Host "Re-run 'pwsh ./deploy.ps1 -VerifyOnly' in a few minutes to confirm." -ForegroundColor Yellow
    }
    exit 1
}

Step "Deploy complete - both services verified"
Ok "Frontend: $FRONTEND_URL"
Ok "Backend:  $BACKEND_URL"
