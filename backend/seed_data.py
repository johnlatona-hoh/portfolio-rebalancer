"""Seed list of common index/ETF tickers → (asset_class, tax_efficiency, name).

Kept as plain data so it can be imported by both the async seeder and any test.
asset_class ∈ constants.ASSET_CLASSES; tax_efficiency ∈ constants.TAX_EFFICIENCIES.
"""

# ticker: (asset_class, tax_efficiency, name)
SEED_TICKERS: dict[str, tuple[str, str, str]] = {
    # --- US Stock (broad, tax-efficient) ---
    "VTI":  ("US Stock", "efficient", "Vanguard Total Stock Market ETF"),
    "ITOT": ("US Stock", "efficient", "iShares Core S&P Total US Stock ETF"),
    "VOO":  ("US Stock", "efficient", "Vanguard S&P 500 ETF"),
    "IVV":  ("US Stock", "efficient", "iShares Core S&P 500 ETF"),
    "SPY":  ("US Stock", "efficient", "SPDR S&P 500 ETF"),
    "VTSAX": ("US Stock", "efficient", "Vanguard Total Stock Market Index"),
    "FZROX": ("US Stock", "efficient", "Fidelity ZERO Total Market Index"),
    "FSKAX": ("US Stock", "efficient", "Fidelity Total Market Index"),
    "VUG":  ("US Stock", "efficient", "Vanguard Growth ETF"),
    "VTV":  ("US Stock", "efficient", "Vanguard Value ETF"),
    "VB":   ("US Stock", "efficient", "Vanguard Small-Cap ETF"),
    "AVUV": ("US Stock", "efficient", "Avantis US Small Cap Value ETF"),
    "QQQ":  ("US Stock", "efficient", "Invesco QQQ (Nasdaq-100)"),

    # --- International ---
    "VXUS": ("International", "efficient", "Vanguard Total International Stock ETF"),
    "VEU":  ("International", "efficient", "Vanguard FTSE All-World ex-US ETF"),
    "IXUS": ("International", "efficient", "iShares Core MSCI Total Intl Stock ETF"),
    "VEA":  ("International", "efficient", "Vanguard FTSE Developed Markets ETF"),
    "VWO":  ("International", "efficient", "Vanguard FTSE Emerging Markets ETF"),
    "IEMG": ("International", "efficient", "iShares Core MSCI Emerging Markets ETF"),
    "VTIAX": ("International", "efficient", "Vanguard Total Intl Stock Index"),
    "FTIHX": ("International", "efficient", "Fidelity Total International Index"),

    # --- Bond (tax-inefficient: ordinary-income interest) ---
    "BND":  ("Bond", "inefficient", "Vanguard Total Bond Market ETF"),
    "AGG":  ("Bond", "inefficient", "iShares Core US Aggregate Bond ETF"),
    "BNDX": ("Bond", "inefficient", "Vanguard Total International Bond ETF"),
    "VBTLX": ("Bond", "inefficient", "Vanguard Total Bond Market Index"),
    "FXNAX": ("Bond", "inefficient", "Fidelity US Bond Index"),
    "VTEB": ("Bond", "efficient", "Vanguard Tax-Exempt Bond ETF (munis)"),
    "MUB":  ("Bond", "efficient", "iShares National Muni Bond ETF"),
    "VWIUX": ("Bond", "efficient", "Vanguard Interm-Term Tax-Exempt (munis)"),
    "TLT":  ("Bond", "inefficient", "iShares 20+ Year Treasury Bond ETF"),
    "VTIP": ("Bond", "inefficient", "Vanguard Short-Term Inflation-Protected ETF"),

    # --- REITs (tax-inefficient: ordinary-income distributions) ---
    "VNQ":  ("REITs", "inefficient", "Vanguard Real Estate ETF"),
    "VNQI": ("REITs", "inefficient", "Vanguard Global ex-US Real Estate ETF"),
    "SCHH": ("REITs", "inefficient", "Schwab US REIT ETF"),
    "VGSLX": ("REITs", "inefficient", "Vanguard Real Estate Index"),
    "IYR":  ("REITs", "inefficient", "iShares US Real Estate ETF"),

    # --- Cash / money market (neutral) ---
    "VMFXX": ("Cash", "neutral", "Vanguard Federal Money Market Fund"),
    "SPAXX": ("Cash", "neutral", "Fidelity Government Money Market"),
    "SWVXX": ("Cash", "neutral", "Schwab Value Advantage Money Fund"),
    "VUSXX": ("Cash", "neutral", "Vanguard Treasury Money Market Fund"),
    "BIL":   ("Cash", "neutral", "SPDR 1-3 Month T-Bill ETF"),

    # --- Alternatives ---
    "GLD":  ("Alternatives", "inefficient", "SPDR Gold Shares"),
    "IAU":  ("Alternatives", "inefficient", "iShares Gold Trust"),
    "DBMF": ("Alternatives", "inefficient", "iMGP DBi Managed Futures ETF"),
    "BTAL": ("Alternatives", "inefficient", "AGFiQ US Market Neutral Anti-Beta ETF"),
}
