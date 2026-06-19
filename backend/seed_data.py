"""Seed list of common index/ETF tickers -> (asset_class, tax_efficiency, name, expense_ratio).

Kept as plain data so it can be imported by both the async seeder and any test.
asset_class in constants.ASSET_CLASSES; tax_efficiency in constants.TAX_EFFICIENCIES.
expense_ratio is the annual decimal (e.g. 0.0003 = 0.03%); approximate published values.
"""

# ticker: (asset_class, tax_efficiency, name, expense_ratio)
SEED_TICKERS: dict[str, tuple[str, str, str, float]] = {
    # --- US Stock (broad, tax-efficient) ---
    "VTI":  ("US Stock", "efficient", "Vanguard Total Stock Market ETF", 0.0003),
    "ITOT": ("US Stock", "efficient", "iShares Core S&P Total US Stock ETF", 0.0003),
    "VOO":  ("US Stock", "efficient", "Vanguard S&P 500 ETF", 0.0003),
    "IVV":  ("US Stock", "efficient", "iShares Core S&P 500 ETF", 0.0003),
    "SPY":  ("US Stock", "efficient", "SPDR S&P 500 ETF", 0.0009),
    "VTSAX": ("US Stock", "efficient", "Vanguard Total Stock Market Index", 0.0004),
    "FZROX": ("US Stock", "efficient", "Fidelity ZERO Total Market Index", 0.0000),
    "FSKAX": ("US Stock", "efficient", "Fidelity Total Market Index", 0.0015),
    "VUG":  ("US Stock", "efficient", "Vanguard Growth ETF", 0.0004),
    "VTV":  ("US Stock", "efficient", "Vanguard Value ETF", 0.0004),
    "VB":   ("US Stock", "efficient", "Vanguard Small-Cap ETF", 0.0005),
    "AVUV": ("US Stock", "efficient", "Avantis US Small Cap Value ETF", 0.0025),
    "QQQ":  ("US Stock", "efficient", "Invesco QQQ (Nasdaq-100)", 0.0020),

    # --- International ---
    "VXUS": ("International", "efficient", "Vanguard Total International Stock ETF", 0.0005),
    "VEU":  ("International", "efficient", "Vanguard FTSE All-World ex-US ETF", 0.0007),
    "IXUS": ("International", "efficient", "iShares Core MSCI Total Intl Stock ETF", 0.0007),
    "VEA":  ("International", "efficient", "Vanguard FTSE Developed Markets ETF", 0.0003),
    "VWO":  ("International", "efficient", "Vanguard FTSE Emerging Markets ETF", 0.0007),
    "IEMG": ("International", "efficient", "iShares Core MSCI Emerging Markets ETF", 0.0009),
    "VTIAX": ("International", "efficient", "Vanguard Total Intl Stock Index", 0.0009),
    "FTIHX": ("International", "efficient", "Fidelity Total International Index", 0.0006),

    # --- Taxable Bond (tax-inefficient: ordinary-income interest) ---
    "BND":  ("Taxable Bond", "inefficient", "Vanguard Total Bond Market ETF", 0.0003),
    "AGG":  ("Taxable Bond", "inefficient", "iShares Core US Aggregate Bond ETF", 0.0003),
    "BNDX": ("Taxable Bond", "inefficient", "Vanguard Total International Bond ETF", 0.0007),
    "VBTLX": ("Taxable Bond", "inefficient", "Vanguard Total Bond Market Index", 0.0005),
    "FXNAX": ("Taxable Bond", "inefficient", "Fidelity US Bond Index", 0.0002),
    "TLT":  ("Taxable Bond", "inefficient", "iShares 20+ Year Treasury Bond ETF", 0.0015),
    "VTIP": ("Taxable Bond", "inefficient", "Vanguard Short-Term Inflation-Protected ETF", 0.0003),

    # --- Muni Bond (federally tax-exempt: keep in taxable) ---
    "VTEB": ("Muni Bond", "efficient", "Vanguard Tax-Exempt Bond ETF (munis)", 0.0005),
    "MUB":  ("Muni Bond", "efficient", "iShares National Muni Bond ETF", 0.0005),
    "VWIUX": ("Muni Bond", "efficient", "Vanguard Interm-Term Tax-Exempt (munis)", 0.0009),

    # --- REITs (tax-inefficient: ordinary-income distributions) ---
    "VNQ":  ("REITs", "inefficient", "Vanguard Real Estate ETF", 0.0013),
    "VNQI": ("REITs", "inefficient", "Vanguard Global ex-US Real Estate ETF", 0.0012),
    "SCHH": ("REITs", "inefficient", "Schwab US REIT ETF", 0.0007),
    "VGSLX": ("REITs", "inefficient", "Vanguard Real Estate Index", 0.0013),
    "IYR":  ("REITs", "inefficient", "iShares US Real Estate ETF", 0.0039),

    # --- Cash / money market (neutral) ---
    "VMFXX": ("Cash", "neutral", "Vanguard Federal Money Market Fund", 0.0011),
    "SPAXX": ("Cash", "neutral", "Fidelity Government Money Market", 0.0042),
    "SWVXX": ("Cash", "neutral", "Schwab Value Advantage Money Fund", 0.0034),
    "VUSXX": ("Cash", "neutral", "Vanguard Treasury Money Market Fund", 0.0009),
    "BIL":   ("Cash", "neutral", "SPDR 1-3 Month T-Bill ETF", 0.0014),

    # --- Alternatives: Gold & Commodities / Crypto / Other ---
    "GLD":  ("Gold & Commodities", "inefficient", "SPDR Gold Shares", 0.0040),
    "IAU":  ("Gold & Commodities", "inefficient", "iShares Gold Trust", 0.0025),
    "GDMN": ("Gold & Commodities", "inefficient", "WisdomTree Efficient Gold Plus Gold Miners ETF", 0.0049),
    "IBIT": ("Crypto", "inefficient", "iShares Bitcoin Trust ETF", 0.0025),
    "DBMF": ("Other Alternatives", "inefficient", "iMGP DBi Managed Futures ETF", 0.0085),
    "BTAL": ("Other Alternatives", "inefficient", "AGFiQ US Market Neutral Anti-Beta ETF", 0.0143),

    # --- Cash placeholder for broker 'Cash & Cash Investments' rows ---
    "CASH": ("Cash", "neutral", "Cash & Cash Investments", 0.0000),

    # --- Fundamental / factor / Schwab-lineup tickers (from real holdings) ---
    "FNDA": ("US Stock", "efficient", "Schwab Fundamental US Small Company ETF", 0.0025),
    "FNDX": ("US Stock", "efficient", "Schwab Fundamental US Large Company ETF", 0.0025),
    "FNDC": ("International", "efficient", "Schwab Fundamental Intl Small Equity ETF", 0.0039),
    "FNDE": ("International", "efficient", "Schwab Fundamental Emerging Markets ETF", 0.0039),
    "FNDF": ("International", "efficient", "Schwab Fundamental Intl Large Equity ETF", 0.0025),
    "PRF":  ("US Stock", "efficient", "Invesco RAFI US 1000 ETF", 0.0039),
    "PRFZ": ("US Stock", "efficient", "Invesco RAFI US 1500 Small-Mid ETF", 0.0039),
    "SCHA": ("US Stock", "efficient", "Schwab US Small-Cap ETF", 0.0004),
    "SCHC": ("International", "efficient", "Schwab International Small-Cap Equity ETF", 0.0011),
    "SCHE": ("International", "efficient", "Schwab Emerging Markets Equity ETF", 0.0011),
    "SCHF": ("International", "efficient", "Schwab International Equity ETF", 0.0006),
    "SCHG": ("US Stock", "efficient", "Schwab US Large-Cap Growth ETF", 0.0004),
    "SCHX": ("US Stock", "efficient", "Schwab US Large-Cap ETF", 0.0003),
    "AVES": ("International", "efficient", "Avantis Emerging Markets Value ETF", 0.0036),
    "EFV":  ("International", "efficient", "iShares MSCI EAFE Value ETF", 0.0035),
    "IAGG": ("Taxable Bond", "inefficient", "iShares Core International Aggregate Bond ETF", 0.0007),
    "SCHP": ("Taxable Bond", "inefficient", "Schwab US TIPS ETF", 0.0003),
    "SCHZ": ("Taxable Bond", "inefficient", "Schwab US Aggregate Bond ETF", 0.0003),
}
