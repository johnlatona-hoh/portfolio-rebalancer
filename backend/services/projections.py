"""Portfolio projection: a deterministic compound-growth line plus a Monte Carlo
fan (10th / 50th / 90th percentile). Uses only the standard library (no numpy) so
it runs anywhere the engine tests run.

The model treats each asset class as a lognormal monthly return drawn from its
annualized mean/stdev, summing the classes each month across all simulated paths.
"""

import random

from constants import RETURN_ASSUMPTIONS


def deterministic_fv(pv: float, annual_return: float, years: float) -> float:
    """Future value of a lump sum: FV = PV * (1 + r)^t."""
    return pv * ((1 + annual_return) ** years)


def _percentile(sorted_values, q):
    """Linear-interpolated percentile (q in 0..1) of an already-sorted list."""
    if not sorted_values:
        return 0.0
    if len(sorted_values) == 1:
        return sorted_values[0]
    idx = q * (len(sorted_values) - 1)
    lo = int(idx)
    hi = min(lo + 1, len(sorted_values) - 1)
    frac = idx - lo
    return sorted_values[lo] * (1 - frac) + sorted_values[hi] * frac


def project(value_by_class, horizon_months, n_paths=1000, assumptions=None,
            fee_drag=0.0, monthly_contribution=0.0, seed=None):
    """Project the portfolio forward month-by-month.

    fee_drag: annual expense-ratio decimal subtracted from every class's expected
        return (and the blended deterministic line), so the chart can show growth net
        of fees.
    monthly_contribution: dollars added at the end of each month (negative = a
        withdrawal), distributed across classes pro-rata by current weight.

    Returns {"points": [{month, p10, p50, p90, deterministic}], "starting_value": float}
    with one point per month from 0 through horizon_months inclusive.
    """
    rng = random.Random(seed)
    assumptions = {**RETURN_ASSUMPTIONS, **(assumptions or {})}

    classes = [(c, v) for c, v in value_by_class.items() if v]
    starting_value = sum(value_by_class.values())

    # Precompute monthly mean/stdev per class, with the annual fee subtracted from the mean.
    monthly = {}
    for cls, _ in classes:
        a = assumptions.get(cls, {"mean": 0.05, "stdev": 0.10})
        mean_m = (1 + a["mean"] - fee_drag) ** (1 / 12) - 1
        stdev_m = a["stdev"] / (12 ** 0.5)
        monthly[cls] = (mean_m, stdev_m)

    # Blended deterministic annual return (value-weighted), net of fee, for the reference line.
    blended_annual = 0.0
    if starting_value:
        for cls, v in classes:
            blended_annual += assumptions.get(cls, {"mean": 0.05})["mean"] * (v / starting_value)
    blended_annual -= fee_drag
    blended_m = (1 + blended_annual) ** (1 / 12) - 1

    # Simulate: each path tracks a running value per class.
    paths = [{cls: v for cls, v in classes} for _ in range(n_paths)]

    det_value = starting_value  # iterative deterministic line (grows then takes the flow)

    points = [{
        "month": 0,
        "p10": round(starting_value, 2),
        "p50": round(starting_value, 2),
        "p90": round(starting_value, 2),
        "deterministic": round(starting_value, 2),
    }]

    for m in range(1, horizon_months + 1):
        totals = []
        for path in paths:
            # 1. apply this month's returns
            total = 0.0
            for cls in path:
                mean_m, stdev_m = monthly[cls]
                shock = rng.gauss(mean_m, stdev_m) if stdev_m else mean_m
                path[cls] *= (1 + shock)
                total += path[cls]
            # 2. apply the cash flow at month-end, pro-rata by current weight
            if monthly_contribution and total > 0:
                for cls in path:
                    path[cls] = max(0.0, path[cls] + monthly_contribution * (path[cls] / total))
                total = sum(path.values())
            totals.append(total)
        totals.sort()

        det_value = det_value * (1 + blended_m) + monthly_contribution
        points.append({
            "month": m,
            "p10": round(_percentile(totals, 0.10), 2),
            "p50": round(_percentile(totals, 0.50), 2),
            "p90": round(_percentile(totals, 0.90), 2),
            "deterministic": round(det_value, 2),
        })

    return {"points": points, "starting_value": round(starting_value, 2)}
