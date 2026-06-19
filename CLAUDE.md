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
+ TailwindCSS. Backend on Render, frontend on Vercel — both auto-deploy on push to `main`. Mirrors the
MusicCollection project's structure so deploy/config knowledge transfers.

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
- `models.py` — `TickerTag` (ticker→asset_class[sub-class]+tax_efficiency), `Snapshot` (PIN-keyed blob).
- `services/rebalance.py` — **pure-Python engine** (no DB/network), the core logic. `roll_up`,
  `compute_deltas`, `target_composition` + `plan_trades` (**per-account, cash-neutral, tax-aware
  placement** via the `PLACEMENT` map), `location_grade`, and `analyze` orchestrator. Heavily
  unit-tested in `tests/test_rebalance.py`.
- `services/projections.py` — Monte Carlo + deterministic FV, stdlib only (no numpy). Tested.
- `services/classify.py` — **description-based classifier**: maps any ticker to a sub-class +
  tax-efficiency from its broker Description/Asset Type text (no AI). Tested in `tests/test_classify.py`.
- `services/ai.py` — Gemini wrapper (google-genai, `gemini-2.5-flash`), adapted from MusicCollection's
  `claude_ai.py`: `_generate_with_retry` (429 backoff), `UNKNOWN` sentinel, no-op without key.
  `portfolio_insights`, `suggest_ticker_tag`.
- `services/crypto.py` — Fernet encrypt/decrypt of snapshot payloads + salted PIN hash.
- `services/csv_template.py` — canonical CSV column contract + parser/validator (simple template path).
- `seed_data.py` / `seed_tickers.py` — ~66 common index/ETF tickers (sub-class-tagged) + idempotent seeder.

### Routers (`backend/routers/`)
- `portfolio.py` — `POST /portfolio/analyze` (holdings+targets → allocation/trades/grade),
  `POST /portfolio/project` (Monte Carlo).
- `tags.py` — `GET /tags`, `POST /tags` (upsert), `POST /tags/auto` (classify unknowns by
  description, persists), `POST /tags/suggest` (Gemini fallback). `load_tags()` helper builds the
  `{ticker: {...}}` dict the engine consumes.
- `snapshots.py` — `POST /snapshots`, `POST /snapshots/load` (PIN-keyed).
- `advisor.py` — `POST /advisor/insights`.

### DB migrations — read before changing models
No Alembic. `main.py:run_migrations()` runs `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` for a hard-coded
list on every startup (currently empty — `create_tables()` builds the schema fresh). Add new **columns**
there so deploys self-heal. Type changes need a manual Supabase `ALTER TABLE ... TYPE ...` before deploy.

### Frontend (`frontend/src/`)
- `api/client.ts` — all API calls + TS interfaces; **keep in sync with `backend/schemas.py`**.
- `state/portfolio.tsx` — in-browser context. **`accounts` (parsed uploads) is the source of truth;
  `holdings` is derived from it** so `reset()` fully clears the session for repeated use.
- `utils/schwabParse.ts` — **Schwab export parser** (`parseSchwabCsv`): extracts account name from the
  title row, infers account type, cleans `$`/commas/`(parens)`/`N/A`, captures Description/Asset-Type
  meta (for auto-classify), and a synthetic `CASH` holding. Also `accountsFromHoldings` (snapshot load)
  and `holdingsForAccount`.
- Pages: `SetupPage` (multi-file upload, per-account type override, cash flag, auto-classify unknowns,
  targets, Clear all), `DashboardPage` (summary, allocation bars, projection + horizon control, trade
  table, AI advisor, scenario panel), `SnapshotPage` (PIN save/load + local JSON download).
- Components: `AllocationBars`, `TradeTable`, `ProjectionChart` (recharts fan chart), `HorizonControl`,
  `TickerTagEditor`, `ScenarioPanel` (what-if: edit holdings → side-by-side compare).
- `utils/assetClass.ts` (9 sub-class constants, `PARENT_OF`, `PARENTS`, colors), `utils/money.ts`.
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
- No realtime market-price API in v1 — `current_value`/`cost_basis` come from the uploaded CSV. A
  price source can be added later behind the ticker model without touching the engine.
