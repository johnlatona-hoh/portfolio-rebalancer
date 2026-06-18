import { createContext, useContext, useState, ReactNode } from "react";
import type { Holding } from "../api/client";

/**
 * In-browser portfolio working state, shared across pages. Nothing here is persisted
 * server-side except via an explicit, PIN-keyed snapshot. Refreshing the tab clears it.
 */
interface PortfolioState {
  holdings: Holding[];
  targets: Record<string, number>;
  setHoldings: (h: Holding[]) => void;
  setTargets: (t: Record<string, number>) => void;
  reset: () => void;
  loaded: boolean;
}

const Ctx = createContext<PortfolioState | null>(null);

export function PortfolioProvider({ children }: { children: ReactNode }) {
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [targets, setTargets] = useState<Record<string, number>>({});

  const reset = () => {
    setHoldings([]);
    setTargets({});
  };

  return (
    <Ctx.Provider
      value={{ holdings, targets, setHoldings, setTargets, reset, loaded: holdings.length > 0 }}
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
