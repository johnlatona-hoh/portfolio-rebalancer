"""Canonical CSV schema for portfolio upload + a parser/validator.

The frontend parses the CSV client-side (Zero-PII — data need not leave the browser
to be read), but this module is the single source of truth for the column contract and
is reused by any server-side validation. One row = one holding.
"""

import csv
import io

COLUMNS = ["account_name", "account_type", "ticker", "quantity", "cost_basis", "current_value"]
ACCOUNT_TYPES = {"taxable", "tax_deferred", "tax_free"}

TEMPLATE_CSV = (
    "account_name,account_type,ticker,quantity,cost_basis,current_value\n"
    "Brokerage,taxable,VTI,100,18000,28000\n"
    "Rollover IRA,tax_deferred,BND,200,16000,15500\n"
    "Roth IRA,tax_free,VXUS,150,7500,9000\n"
    "HSA,tax_free,VTI,20,4000,5600\n"
)


class CSVValidationError(Exception):
    def __init__(self, errors: list[str]):
        self.errors = errors
        super().__init__("; ".join(errors))


def parse_csv(text: str) -> list[dict]:
    """Parse and validate CSV text into a list of holding dicts.

    Raises CSVValidationError with per-row messages on any problem.
    """
    errors: list[str] = []
    holdings: list[dict] = []

    reader = csv.DictReader(io.StringIO(text))
    if reader.fieldnames is None:
        raise CSVValidationError(["CSV is empty."])

    missing = [c for c in COLUMNS if c not in reader.fieldnames]
    if missing:
        raise CSVValidationError([f"Missing required column(s): {', '.join(missing)}"])

    for i, row in enumerate(reader, start=2):  # row 1 is the header
        acct_type = (row.get("account_type") or "").strip()
        ticker = (row.get("ticker") or "").strip().upper()
        if not ticker:
            errors.append(f"Row {i}: missing ticker.")
            continue
        if acct_type not in ACCOUNT_TYPES:
            errors.append(
                f"Row {i} ({ticker}): account_type '{acct_type}' must be one of "
                f"{', '.join(sorted(ACCOUNT_TYPES))}."
            )
            continue
        try:
            quantity = float(row.get("quantity") or 0)
            cost_basis = float(row.get("cost_basis") or 0)
            current_value = float(row["current_value"])
        except (ValueError, KeyError):
            errors.append(f"Row {i} ({ticker}): quantity/cost_basis/current_value must be numbers.")
            continue
        if current_value < 0:
            errors.append(f"Row {i} ({ticker}): current_value cannot be negative.")
            continue

        holdings.append({
            "account_name": (row.get("account_name") or "").strip() or "Unnamed",
            "account_type": acct_type,
            "ticker": ticker,
            "quantity": quantity,
            "cost_basis": cost_basis,
            "current_value": current_value,
        })

    if errors:
        raise CSVValidationError(errors)
    if not holdings:
        raise CSVValidationError(["No holdings found in CSV."])
    return holdings
