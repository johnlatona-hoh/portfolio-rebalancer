# Deployment

Two services, one repo (`main` branch):

| Part | Host | Source dir | URL |
|------|------|-----------|-----|
| Backend (FastAPI) | Render | `backend/` | https://portfolio-rebalancer-tc4h.onrender.com |
| Frontend (Vite/React) | Vercel | `frontend/` | https://frontend-sooty-three-ybjekuhhod.vercel.app |

## The reliable way to deploy

Run the verified deploy script. It gates (type-check + tests), pushes, deploys the
frontend explicitly, and **polls both live services until they actually serve the new
code** — it does not trust auto-deploy blindly.

```powershell
pwsh ./deploy.ps1 -Message "what changed"
pwsh ./deploy.ps1 -VerifyOnly        # just check what's live right now
```

If you ship a backend **schema** change, bump `$BACKEND_MARKER_PROP` in `deploy.ps1`
to a property that only exists in the new code, so the verify step is meaningful.

## Auto-deploy connections

- **Render (backend):** auto-deploys on push to `main` (the live service was created in
  the dashboard, so `render.yaml` is informational; the actual Auto-Deploy toggle lives
  in the Render dashboard → service → Settings). Free-tier builds can take several minutes
  and occasionally stall.
  - **Deploy Hook:** create one in Render → service → Settings → *Deploy Hook*. Export it
    as `RENDER_DEPLOY_HOOK` and `deploy.ps1` will POST to it to force a deploy if the push
    didn't trigger one. You can also trigger manually:
    `curl -X POST "$RENDER_DEPLOY_HOOK"`

- **Vercel (frontend):** git is connected (`vercel git connect`). For git-triggered
  builds to succeed, the **Root Directory must be `frontend`** (Vercel dashboard →
  project → Settings → General → Root Directory). Until that's set, deploy with the CLI
  (what `deploy.ps1` does): `cd frontend && npx vercel --prod --yes`.

## Database migrations

- New **columns**: add an `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` line to
  `backend/main.py:run_migrations()` (runs on every startup; self-healing).
- **Type changes**: run a manual `ALTER TABLE ... TYPE ...` against the Supabase DB
  *before* the deploy lands.

## Seeding ticker data (expense ratios, asset classes)

Known-fund expense ratios live in `backend/seed_data.py`. To populate/refresh them in
prod (otherwise known funds show the higher per-class fallback fee), run **after** the
column migration has landed:

```bash
cd backend && python seed_tickers.py        # uses DATABASE_URL from backend/.env
```
