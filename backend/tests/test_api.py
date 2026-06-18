"""API-level smoke tests: full request/response wiring (routers + schemas + engine)
against an in-memory SQLite DB, so no Postgres is needed."""

import os

import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker

os.environ.setdefault("SNAPSHOT_ENCRYPTION_KEY", "")  # set per-test where needed

import main  # noqa: E402
from database import Base, get_db  # noqa: E402
from models import TickerTag  # noqa: E402


@pytest_asyncio.fixture
async def client():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    Sessionmaker = async_sessionmaker(engine, expire_on_commit=False)

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    # seed a couple of tags
    async with Sessionmaker() as db:
        db.add_all([
            TickerTag(ticker="VTI", asset_class="US Stock", tax_efficiency="efficient"),
            TickerTag(ticker="BND", asset_class="Bond", tax_efficiency="inefficient"),
        ])
        await db.commit()

    async def override_get_db():
        async with Sessionmaker() as session:
            yield session

    main.app.dependency_overrides[get_db] = override_get_db
    transport = ASGITransport(app=main.app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c
    main.app.dependency_overrides.clear()
    await engine.dispose()


@pytest.mark.asyncio
async def test_analyze_endpoint_returns_trades_and_grade(client):
    body = {
        "holdings": [
            {"account_name": "Brokerage", "account_type": "taxable", "ticker": "VTI",
             "quantity": 1, "cost_basis": 80000, "current_value": 80000},
            {"account_name": "IRA", "account_type": "tax_deferred", "ticker": "BND",
             "quantity": 1, "cost_basis": 20000, "current_value": 20000},
        ],
        "targets": {"US Stock": 60, "Bond": 40},
    }
    r = await client.post("/portfolio/analyze", json=body)
    assert r.status_code == 200
    data = r.json()
    assert data["total_value"] == 100000
    assert data["grade"]["grade"] == "A"  # everything well placed
    # overweight US Stock should produce a sell somewhere
    assert any(t["asset_class"] == "US Stock" and t["action"] == "SELL" for t in data["trades"])


@pytest.mark.asyncio
async def test_analyze_reports_unknown_tickers(client):
    body = {
        "holdings": [
            {"account_name": "Brokerage", "account_type": "taxable", "ticker": "ZZZZ",
             "quantity": 1, "cost_basis": 100, "current_value": 100},
        ],
        "targets": {"US Stock": 100},
    }
    r = await client.post("/portfolio/analyze", json=body)
    assert r.status_code == 200
    assert "ZZZZ" in r.json()["unknown_tickers"]


@pytest.mark.asyncio
async def test_project_endpoint_returns_points(client):
    body = {"value_by_class": {"US Stock": 10000}, "horizon_months": 24, "n_paths": 200}
    r = await client.post("/portfolio/project", json=body)
    assert r.status_code == 200
    data = r.json()
    assert data["starting_value"] == 10000
    assert len(data["points"]) == 25


@pytest.mark.asyncio
async def test_advisor_no_ops_without_key(client):
    r = await client.post("/advisor/insights", json={"summary": {"foo": "bar"}})
    assert r.status_code == 200
    assert r.json()["insights"] == []  # no GEMINI_API_KEY -> empty, no crash
