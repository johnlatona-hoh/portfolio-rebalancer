"""Tests for the projection engine (deterministic FV + Monte Carlo)."""

import math

from services import projections


def test_deterministic_fv_compounds_annually():
    fv = projections.deterministic_fv(1000.0, 0.07, 10.0)
    assert math.isclose(fv, 1000.0 * (1.07 ** 10), rel_tol=1e-9)


def test_empty_or_degenerate_input_returns_zero_series():
    # Empty input, and inputs with non-finite / non-positive values, must not throw - they
    # should produce a valid all-zero series so the chart and scenario can't 500/blank.
    for vbc in ({}, {"Cash": 0.0}, {"US Stock": float("nan")}, {"Cash": -100.0}):
        result = projections.project(vbc, horizon_months=6, n_paths=50, seed=3)
        assert len(result["points"]) == 7
        assert result["starting_value"] == 0.0
        last = result["points"][-1]
        assert last["p10"] == 0.0 and last["p50"] == 0.0 and last["p90"] == 0.0
        assert last["deterministic"] == 0.0


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


def test_fee_drag_lowers_deterministic_fv():
    base = projections.project(
        {"US Stock": 1000.0},
        horizon_months=120,
        n_paths=100,
        assumptions={"US Stock": {"mean": 0.07, "stdev": 0.0}},
        seed=3,
    )["points"][-1]["deterministic"]
    netted = projections.project(
        {"US Stock": 1000.0},
        horizon_months=120,
        n_paths=100,
        assumptions={"US Stock": {"mean": 0.07, "stdev": 0.0}},
        fee_drag=0.01,  # 1% annual fee
        seed=3,
    )["points"][-1]["deterministic"]
    # fee drag reduces the effective return from 7% to 6%
    assert netted < base
    # engine rounds to cents, so compare at cent tolerance
    assert math.isclose(netted, 1000.0 * (1.06 ** 10), abs_tol=0.01)


def test_positive_contribution_raises_ending_value():
    no_contrib = projections.project(
        {"US Stock": 1000.0},
        horizon_months=12,
        n_paths=100,
        assumptions={"US Stock": {"mean": 0.07, "stdev": 0.0}},
        seed=5,
    )["points"][-1]["p50"]
    with_contrib = projections.project(
        {"US Stock": 1000.0},
        horizon_months=12,
        n_paths=100,
        assumptions={"US Stock": {"mean": 0.07, "stdev": 0.0}},
        monthly_contribution=100.0,
        seed=5,
    )["points"][-1]["p50"]
    # 12 monthly contributions of 100 add well over 1200 (plus growth)
    assert with_contrib > no_contrib + 1100.0


def test_withdrawal_lowers_ending_value():
    no_flow = projections.project(
        {"US Stock": 100000.0},
        horizon_months=12,
        n_paths=100,
        assumptions={"US Stock": {"mean": 0.07, "stdev": 0.0}},
        seed=9,
    )["points"][-1]["p50"]
    withdrawing = projections.project(
        {"US Stock": 100000.0},
        horizon_months=12,
        n_paths=100,
        assumptions={"US Stock": {"mean": 0.07, "stdev": 0.0}},
        monthly_contribution=-500.0,
        seed=9,
    )["points"][-1]["p50"]
    assert withdrawing < no_flow


def test_zero_vol_contribution_matches_annuity_fv():
    # With no volatility, an annuity-due of monthly contributions plus the lump sum
    # should match the closed-form deterministic future value.
    pv, c, months = 1000.0, 100.0, 12
    annual = 0.07
    r_m = (1 + annual) ** (1 / 12) - 1
    result = projections.project(
        {"US Stock": pv},
        horizon_months=months,
        n_paths=50,
        assumptions={"US Stock": {"mean": annual, "stdev": 0.0}},
        monthly_contribution=c,
        seed=11,
    )
    last = result["points"][-1]["deterministic"]
    # lump-sum FV + ordinary-annuity FV of the contributions
    fv_lump = pv * ((1 + r_m) ** months)
    fv_annuity = c * (((1 + r_m) ** months - 1) / r_m)
    assert math.isclose(last, fv_lump + fv_annuity, rel_tol=1e-6)
