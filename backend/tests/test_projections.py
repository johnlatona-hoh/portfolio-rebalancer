"""Tests for the projection engine (deterministic FV + Monte Carlo)."""

import math

from services import projections


def test_deterministic_fv_compounds_annually():
    fv = projections.deterministic_fv(1000.0, 0.07, 10.0)
    assert math.isclose(fv, 1000.0 * (1.07 ** 10), rel_tol=1e-9)


def test_monte_carlo_returns_point_per_month_plus_start():
    result = projections.project(
        {"US Stock": 1000.0},
        horizon_months=12,
        n_paths=200,
        assumptions={"US Stock": {"mean": 0.07, "stdev": 0.0}},
        seed=42,
    )
    # month 0 through month 12 inclusive
    assert len(result["points"]) == 13
    assert result["points"][0]["month"] == 0
    assert result["points"][-1]["month"] == 12
    assert result["starting_value"] == 1000.0


def test_zero_volatility_collapses_percentiles_to_deterministic():
    result = projections.project(
        {"US Stock": 1000.0},
        horizon_months=12,
        n_paths=200,
        assumptions={"US Stock": {"mean": 0.07, "stdev": 0.0}},
        seed=1,
    )
    last = result["points"][-1]
    # with no volatility, all paths are identical and equal the deterministic line
    assert math.isclose(last["p10"], last["p50"], rel_tol=1e-6)
    assert math.isclose(last["p50"], last["p90"], rel_tol=1e-6)
    assert math.isclose(last["p50"], last["deterministic"], rel_tol=1e-6)
    assert math.isclose(last["deterministic"], 1000.0 * 1.07, rel_tol=1e-6)


def test_percentiles_are_ordered_with_volatility():
    result = projections.project(
        {"US Stock": 10000.0},
        horizon_months=120,
        n_paths=2000,
        assumptions={"US Stock": {"mean": 0.07, "stdev": 0.16}},
        seed=7,
    )
    last = result["points"][-1]
    assert last["p10"] < last["p50"] < last["p90"]
