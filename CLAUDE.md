# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A personal, tax-aware portfolio **rebalancing** tool. Upload holdings via CSV (native Schwab position
exports auto-detected, or a simple template), see current-vs-target allocation across nine tax-aware
sub-classes, get a concrete **tax-aware**, execution-ready buy/sell plan (asset-location aware,
cash-neutral per account), project the portfolio forward (Monte Carlo), and get optional AI
tax-location advice. Built to reuse the same stack/patterns as the MusicCollection app.

## Commands

**Backend** (run from `backend/`, Python 3.13 — NOT 3.14, which lacks asyncpg/pydantic-core wheels):
```bash
py -3.13 -m venv venv
./venv/Scripts/python.exe -m pip install -r requirements.txt
./venv/Scripts/python.exe -m uvicorn main:app --reload   # dev server at http://localhost:8000
./venv/Scripts/python.exe -m pytest tests/ -q            # engine unit tests
./venv/Scripts/python.exe seed_tickers.py                # seed common ticker tags (idempotent)
```

**Frontend** (run from `frontend/`):
```bash
npm install
npm run dev          # dev server at http://localhost:5173 (proxies /api/* → :8000)
npm run build        # tsc + vite build
npx tsc --noEmit     # fast type-check (pre-commit gate)
```

There is no frontend test suite. De-facto checks before committing:
- backend: `pytest tests/` and `python -c "import ast; ast.parse(open(f).read())"` parse-checks
- frontend: `npx tsc --noEmit`

These same gates run in CI (`.github/workflows/ci.yml`: backend pytest on Python 3.13 + frontend tsc/build on Node 20).

**Deploying** (from repo root): use `deploy.ps1` — do **not** rely on auto-deploy alone (see "Deploy" below):
```bash
pwsh ./deploy.ps1 -Message "commit message"   # gates → push → deploy → poll both live services
pwsh ./deploy.ps1 -Message "..." -SkipTests    # skip backend pytest (faster)
pwsh ./deploy.ps1 -VerifyOnly                   # just report what's live now
```

Copy `backend/.env.example` → `backend/.env`. Generate a snapshot key with:
`python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"`

## Required Environment Variables

All in `backend/.env` (mirror in the Render dashboard for prod):

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | PostgreSQL async (Supabase): `postgresql+asyncpg://...` |
| `GEMINI_API_KEY` | Optional — AI advisor + ticker-tag suggestions. No-ops when absent |
| `SNAPSHOT_ENCRYPTION_KEY` | Fernet key; required to save/load snapshots |
| `CORS_ORIGINS` | Comma-separated allowed origins |

Frontend (Vercel): `VITE_API_URL` = Render backend URL.

## Architecture

**Stack:** FastAPI (Python 3.13) + Supabase PostgreSQL (async SQLAlchemy + asyncpg) + React 18 + Vite
+ TailwindCSS. Backend on Render, frontend on Vercel. Mirrors the MusicCollection project's structure so
deploy/config knowledge transfers.

### Deploy — read before shipping (see `DEPLOY.md`)
Both services live on the `main` branch, but auto-deploy is **not** trustworthy here — `deploy.ps1` is the
source of truth:
- **Vercel (frontend):** git-connected with **Root Directory = `frontend`**, so a plain `git push` to
  `main` builds and deploys. (It was originally created via CLI and was *not* git-connected — that bug is
  fixed; keep the Root Directory set.)
- **Render (backend):** git auto-deploy is unreliable. `deploy.ps1` **always** POSTs the
  `RENDER_DEPLOY_HOOK` env var to force a fresh build, then polls `/openapi.json` for a schema marker.
- The marker check **cannot detect logic-only changes** (no new schema field), so for those, do a
  **behavioral spot-check** against the live backend after deploy — the script can falsely report success
  while Render still serves old code. When a phase adds a schema field, bump `$BACKEND_MARKER_PROP` in
  `deploy.ps1` so the verify is meaningful.

**Privacy model:** Portfolio working data lives in the browser (`state/portfolio.tsx`). The only data
persisted server-side is the **ticker tag map** and **PIN-keyed encrypted snapshots** (tickers,
quantities, account *types* only — no names/account numbers; payload encrypted via Fernet).

### Asset taxonomy (sub-classes)
The allocation/target dimension is the **sub-class** — 9 of them in `constants.ASSET_CLASSES`:
US Stock, International, **Muni Bond**, **Taxable Bond**, REITs, Cash, **Gold & Commodities**,
**Crypto**, **Other Alternatives**. Bonds and Alternatives are split by tax treatment so the engine
can keep tax-efficient sleeves (munis) in taxable and route tax-inefficient sleeves to tax-deferred.
Each sub-class maps to a display **parent** (`constants.SUBCLASS`, `parent_of()`, `tax_of()`); parents
are US Stock / International / Bond / REITs / Cash / Alternatives.

### Backend (`backend/`)
- `constants.py` — canonical vocabulary: the 9 sub-class `ASSET_CLASSES`, `SUBCLASS` (parent + default
  tax per sub-class), `parent_of`/`tax_of`, `PARENTS`, `ACCOUNT_TYPES`, `TAX_EFFICIENCIES`, and
  per-sub-class `RETURN_ASSUMPTIONS` (mean/stdev for the projection — edit here to tune).
- `models.py` — `TickerTag` (ticker→asset_class[sub-class]+tax_efficiency+optional `expense_ratio`),
  `Snapshot` (encrypted blob, now user-owned via `user_id`/`label`/`description`), `User` (email + salted
  PIN hash for multi-user snapshots), `PriceCache` (24h last-known price per ticker), `AICache` (Gemini
  output keyed by hash of kind+portfolio summary, TTL enforced in the router).
- `services/rebalance.py` — **pure-Python engine** (no DB/network), the core logic. `roll_up`,
  `compute_deltas`, `target_composition` + `plan_trades` (**per-account, cash-neutral, tax-aware
  placement** via the `PLACEMENT` map), `location_grade`, `_tax_loss_harvest`, `within_band_classes`,
  and `analyze` orchestrator. `analyze` takes `gain_aversion` and `drift_band_pct`. **Rebalance bands**
  are implemented as a per-account *freeze*: `within_band_classes` finds classes within +/-band of
  target, and `target_composition(..., frozen=...)` pins those to their current per-account holdings so
  no trade is generated (NOT a portfolio-level renormalize — that approach was buggy across multiple
  accounts; see the multi-account tests). Heavily unit-tested in `tests/test_rebalance.py`.
- `services/projections.py` — Monte Carlo + deterministic FV, stdlib only (no numpy). `project()` takes
  `fee_drag` (subtracted from class means) and `monthly_contribution`. Tested.
- `services/prices.py` — live price refresh via the **Yahoo Finance v8 chart endpoint** (no API key,
  works from Render's IP; Stooq and Yahoo v7 are dead/blocked). 24h `PriceCache`, graceful per-ticker
  failure.
- `services/classify.py` — **description-based classifier**: maps any ticker to a sub-class +
  tax-efficiency from its broker Description/Asset Type text (no AI). Tested in `tests/test_classify.py`.
- `services/ai.py` — Gemini wrapper (google-genai, `gemini-2.5-flash`), adapted from MusicCollection's
  `claude_ai.py`: `_generate_with_retry` (429 backoff), `UNKNOWN` sentinel, no-op without key.
  `portfolio_insights`, `suggest_ticker_tag`.
- `services/crypto.py` — Fernet encrypt/decrypt of snapshot payloads + salted PIN hash.
- `services/csv_template.py` — canonical CSV column contract + parser/validator (simple template path).
- `seed_data.py` / `seed_tickers.py` — ~66 common index/ETF tickers (sub-class-tagged) + idempotent seeder.

### Routers (`backend/routers/`)
- `portfolio.py` — `POST /portfolio/analyze` (holdings+targets+`gain_aversion`+`drift_band_pct` →
  allocation/trades/grade/tax-loss-harvest candidates), `POST /portfolio/project` (Monte Carlo; takes
  `fee_drag`, `monthly_contribution`, optional `benchmark` class-weight dict → overlays a second
  projection of the same starting dollars, projected with `fee_drag=0` so a fee'd portfolio doesn't drag
  the benchmark line — apples-to-apples).
- `tags.py` — `GET /tags`, `POST /tags` (upsert), `POST /tags/auto` (classify unknowns by
  description, persists), `POST /tags/suggest` (Gemini fallback). `load_tags()` helper builds the
  `{ticker: {...}}` dict the engine consumes.
- `prices.py` — `GET /prices` (refresh quotes via `services/prices.py`).
- `snapshots.py` — save/load encrypted snapshots.
- `users.py` — `POST /users/register`, `POST /users/login` (email + PIN).
- `advisor.py` — `POST /advisor/insights` (Gemini, `AICache`-backed).

### DB migrations — read before changing models
No Alembic. New **tables** auto-create via `create_tables()` (so `PriceCache`/`AICache`/`User` needed no
manual step). `main.py:run_migrations()` runs `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` on every startup
for new **columns** on existing tables (currently: `rebalancer_snapshots.user_id`/`description`,
`rebalancer_ticker_tags.expense_ratio`) — add new columns there so deploys self-heal. Type changes need a
manual Supabase `ALTER TABLE ... TYPE ...` before deploy.

### Frontend (`frontend/src/`)
- `api/client.ts` — all API calls + TS interfaces; **keep in sync with `backend/schemas.py`**.
- `state/portfolio.tsx` — in-browser context. **`accounts` (parsed uploads) is the source of truth;
  `holdings` is derived from it** so `reset()` fully clears the session for repeated use.
- `utils/schwabParse.ts` — **Schwab export parser** (`parseSchwabCsv`): extracts account name from the
  title row, infers account type, cleans `$`/commas/`(parens)`/`N/A`, captures Description/Asset-Type
  meta (for auto-classify), and a synthetic `CASH` holding. Also `accountsFromHoldings` (snapshot load)
  and `holdingsForAccount`.
- Pages: `SetupPage` (multi-file upload, per-account type override, cash flag, auto-classify unknowns,
  targets, Clear all), `DashboardPage` (summary, allocation bars, projection + controls, trade table,
  tax-loss panel, AI advisor, scenario panel), `SnapshotPage` (save/load + local JSON download).
- Components: `AllocationBars` (shows an "on target (within band)" marker for `within_band` classes),
  `TradeTable` (+ Export-CSV and Print buttons), `ProjectionChart` (recharts fan chart + dashed benchmark
  median line), `TaxLossPanel`, `BenchmarkControl` (presets + custom; **`BENCHMARK_PRESETS` lives here in
  the frontend, NOT in backend `constants.py`**), `DriftBandControl`, `StrategySlider` (gain aversion),
  `HorizonControl`, `InflationControls`, `ReturnAssumptions`, `RiskPanel`, `GradeCard`, `HoldingsDetail`,
  `TickerTagEditor`, `ScenarioPanel` (what-if: edit holdings → side-by-side compare), `WarmupBanner`
  (Render cold-start UX), `TipsBox`.
- `DashboardPage` debounces recalc ~1s; the strategy slider and drift-band value are read via **refs**
  (not state) inside the debounced callback to avoid stale-closure capture.
- `utils/assetClass.ts` (9 sub-class constants, `PARENT_OF`, `PARENTS`, colors), `utils/money.ts`
  (`fmtMoney`/`fmtPct`), `utils/download.ts` (shared `downloadText` Blob-download helper used by
  TradeTable + SetupPage), `utils/inflation.ts` (`deflatePoints`).
- `scripts/test_*.ts` — dev harnesses (run with `node --experimental-strip-types`) that exercise the
  parser/analyze/advisor against real Schwab files. Not part of the build (`tsconfig` includes only `src`).

## Key design notes
- **Python 3.13 required** — 3.14 has no prebuilt asyncpg/pydantic-core wheels and source builds fail.
- **Backend source must stay ASCII-only** — on Windows this Python imports `.py` as cp1252, so non-ASCII
  punctuation in user-facing string literals becomes mojibake in API responses. Keep literals ASCII.
- The rebalancing engine is intentionally pure and dict-based so it's trivially testable without
  FastAPI/DB. Add behavior test-first in `tests/`.
- The trade plan rebalances **within each account** (no inter-account transfers): each account's buys
  equal its sells, so trades are execution-ready. Placement is driven by sub-class via `PLACEMENT`.
- **Fees:** per-holding expense ratio comes from `TickerTag.expense_ratio` (seeded for known funds),
  falling back to a per-class default; the weighted portfolio fee feeds the projection's `fee_drag`.
  `cost_basis` is **total position cost** (not per-share); a `cost_basis == 0` upload means *unknown*
  basis — treat as "skip", not a 100% loss (tax-loss harvesting only flags `cost_basis > 0` taxable lots
  trading below basis).
- **Prices** can now be refreshed live from the uploaded CSV's tickers via `GET /prices`
  (`services/prices.py`, Yahoo v8, 24h cache) — the engine still consumes `current_value` and stays
  network-free.
