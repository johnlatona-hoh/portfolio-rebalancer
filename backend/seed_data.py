"""Seed list of common index/ETF tickers -> (asset_class, tax_efficiency, name).

Kept as plain data so it can be imported by both the async seeder and any test.
asset_class in constants.ASSET_CLASSES; tax_efficiency in constants.TAX_EFFICIENCIES.
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

    # --- Taxable Bond (tax-inefficient: ordinary-income interest) ---
    "BND":  ("Taxable Bond", "inefficient", "Vanguard Total Bond Market ETF"),
    "AGG":  ("Taxable Bond", "inefficient", "iShares Core US Aggregate Bond ETF"),
    "BNDX": ("Taxable Bond", "inefficient", "Vanguard Total International Bond ETF"),
    "VBTLX": ("Taxable Bond", "inefficient", "Vanguard Total Bond Market Index"),
    "FXNAX": ("Taxable Bond", "inefficient", "Fidelity US Bond Index"),
    "TLT":  ("Taxable Bond", "inefficient", "iShares 20+ Year Treasury Bond ETF"),
    "VTIP": ("Taxable Bond", "inefficient", "Vanguard Short-Term Inflation-Protected ETF"),

    # --- Muni Bond (federally tax-exempt: keep in taxable) ---
    "VTEB": ("Muni Bond", "efficient", "Vanguard Tax-Exempt Bond ETF (munis)"),
    "MUB":  ("Muni Bond", "efficient", "iShares National Muni Bond ETF"),
    "VWIUX": ("Muni Bond", "efficient", "Vanguard Interm-Term Tax-Exempt (munis)"),

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

    # --- Alternatives: Gold & Commodities / Crypto / Other ---
    "GLD":  ("Gold & Commodities", "inefficient", "SPDR Gold Shares"),
    "IAU":  ("Gold & Commodities", "inefficient", "iShares Gold Trust"),
    "GDMN": ("Gold & Commodities", "inefficient", "WisdomTree Efficient Gold Plus Gold Miners ETF"),
    "IBIT": ("Crypto", "inefficient", "iShares Bitcoin Trust ETF"),
    "DBMF": ("Other Alternatives", "inefficient", "iMGP DBi Managed Futures ETF"),
    "BTAL": ("Other Alternatives", "inefficient", "AGFiQ US Market Neutral Anti-Beta ETF"),

    # --- Cash placeholder for broker 'Cash & Cash Investments' rows ---
    "CASH": ("Cash", "neutral", "Cash & Cash Investments"),

    # --- Fundamental / factor / Schwab-lineup tickers (from real holdings) ---
    "FNDA": ("US Stock", "efficient", "Schwab Fundamental US Small Company ETF"),
    "FNDX": ("US Stock", "efficient", "Schwab Fundamental US Large Company ETF"),
    "FNDC": ("International", "efficient", "Schwab Fundamental Intl Small Equity ETF"),
    "FNDE": ("International", "efficient", "Schwab Fundamental Emerging Markets ETF"),
    "FNDF": ("International", "efficient", "Schwab Fundamental Intl Large Equity ETF"),
    "PRF":  ("US Stock", "efficient", "Invesco RAFI US 1000 ETF"),
    "PRFZ": ("US Stock", "efficient", "Invesco RAFI US 1500 Small-Mid ETF"),
    "SCHA": ("US Stock", "efficient", "Schwab US Small-Cap ETF"),
    "SCHC": ("International", "efficient", "Schwab International Small-Cap Equity ETF"),
    "SCHE": ("International", "efficient", "Schwab Emerging Markets Equity ETF"),
    "SCHF": ("International", "efficient", "Schwab International Equity ETF"),
    "SCHG": ("US Stock", "efficient", "Schwab US Large-Cap Growth ETF"),
    "SCHX": ("US Stock", "efficient", "Schwab US Large-Cap ETF"),
    "AVES": ("International", "efficient", "Avantis Emerging Markets Value ETF"),
    "EFV":  ("International", "efficient", "iShares MSCI EAFE Value ETF"),
    "IAGG": ("Taxable Bond", "inefficient", "iShares Core International Aggregate Bond ETF"),
    "SCHP": ("Taxable Bond", "inefficient", "Schwab US TIPS ETF"),
    "SCHZ": ("Taxable Bond", "inefficient", "Schwab US Aggregate Bond ETF"),
}
