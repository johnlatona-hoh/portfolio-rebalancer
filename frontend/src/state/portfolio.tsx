import { createContext, useContext, useState, useMemo, ReactNode } from "react";
import type { Holding } from "../api/client";
import { holdingsForAccount, type ParsedAccount } from "../utils/schwabParse";

/**
 * In-browser portfolio working state, shared across pages. Nothing here is persisted
 * server-side except via an explicit, PIN-keyed snapshot. Clearing or refreshing wipes it.
 *
 * `accounts` is the source of truth (parsed uploads); `holdings` is derived from it so a
 * single `reset()` fully clears the session for repeated use.
 */
interface PortfolioState {
  accounts: ParsedAccount[];
  setAccounts: (a: ParsedAccount[]) => void;
  holdings: Holding[];
  targets: Record<string, number>;
  setTargets: (t: Record<string, number>) => void;
  reset: () => void;
  loaded: boolean;
  /** Restore a snapshot directly from raw holdings + targets (bypasses CSV parsing). */
  loadPortfolio: (holdings: Holding[], targets: Record<string, number>) => void;
}

const Ctx = createContext<PortfolioState | null>(null);

export function PortfolioProvider({ children }: { children: ReactNode }) {
  const [accounts, setAccounts] = useState<ParsedAccount[]>([]);
  const [targets, setTargets] = useState<Record<string, number>>({});
  const [holdingsOverride, setHoldingsOverride] = useState<Holding[] | null>(null);

  const derivedHoldings = useMemo(() => accounts.flatMap(holdingsForAccount), [accounts]);
  const holdings = holdingsOverride ?? derivedHoldings;

  const reset = () => {
    setAccounts([]);
    setTargets({});
    setHoldingsOverride(null);
  };

  const loadPortfolio = (rawHoldings: Holding[], rawTargets: Record<string, number>) => {
    setHoldingsOverride(rawHoldings);
    setTargets(rawTargets);
    setAccounts([]); // clear parsed accounts — holdings override takes precedence
  };

  return (
    <Ctx.Provider
      value={{
        accounts,
        setAccounts,
        holdings,
        targets,
        setTargets,
        reset,
        loaded: holdings.length > 0,
        loadPortfolio,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function usePortfolio(): PortfolioState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("usePortfolio must be used within PortfolioProvider");
  return ctx;
}

// re-export so consumers can build holdings from a snapshot if needed
export { holdingsForAccount };
export type { ParsedAccount };
