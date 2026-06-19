import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { saveSnapshot, loadSnapshot } from "../api/client";
import { usePortfolio } from "../state/portfolio";
import { accountsFromHoldings } from "../utils/schwabParse";

export default function SnapshotPage() {
  const nav = useNavigate();
  const { holdings, targets, setAccounts, setTargets, loaded } = usePortfolio();
  const [savePin, setSavePin] = useState("");
  const [label, setLabel] = useState("");
  const [loadPin, setLoadPin] = useState("");
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const payload = () => ({ holdings, targets, savedAt: new Date().toISOString() });

  async function doSave() {
    setMsg(null);
    try {
      const res = await saveSnapshot(savePin, payload(), label || undefined);
      setMsg({ kind: "ok", text: `Saved snapshot ${res.id.slice(0, 8)}… under your PIN.` });
    } catch (e: any) {
      setMsg({ kind: "err", text: e?.response?.data?.detail ?? "Save failed." });
    }
  }

  function downloadLocal() {
    const blob = new Blob([JSON.stringify(payload(), null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `portfolio_snapshot_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function doLoad() {
    setMsg(null);
    try {
      const res = await loadSnapshot(loadPin);
      if (res.payload?.holdings) setAccounts(accountsFromHoldings(res.payload.holdings));
      if (res.payload?.targets) setTargets(res.payload.targets);
      setMsg({ kind: "ok", text: "Snapshot loaded. Opening dashboard…" });
      setTimeout(() => nav("/dashboard"), 600);
    } catch (e: any) {
      setMsg({ kind: "err", text: e?.response?.data?.detail ?? "No snapshot found for that PIN." });
    }
  }

  return (
    <div className="max-w-xl space-y-8">
      <div>
        <h2 className="text-lg font-semibold mb-1">Snapshots</h2>
        <p className="text-sm text-muted">
          Save a point-in-time copy of your portfolio, encrypted and keyed by a PIN, or download it
          as a local JSON file. Snapshots store tickers, quantities, and account types only — no
          names or account numbers.
        </p>
      </div>

      {msg && (
        <p className={`text-sm ${msg.kind === "ok" ? "text-good" : "text-bad"}`}>{msg.text}</p>
      )}

      <section className="bg-card border border-border rounded-lg p-4 space-y-3">
        <h3 className="font-semibold">Save</h3>
        {!loaded && (
          <p className="text-xs text-warn">Load a portfolio first (Setup) before saving.</p>
        )}
        <input
          placeholder="Label (optional)"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          className="w-full bg-surface border border-border rounded px-3 py-2 text-sm"
        />
        <input
          placeholder="PIN (min 4 chars)"
          value={savePin}
          onChange={(e) => setSavePin(e.target.value)}
          className="w-full bg-surface border border-border rounded px-3 py-2 text-sm"
        />
        <div className="flex gap-2">
          <button
            onClick={doSave}
            disabled={!loaded || savePin.length < 4}
            className="text-sm px-3 py-2 rounded bg-accent hover:bg-accent-hover disabled:opacity-40"
          >
            Save to server
          </button>
          <button
            onClick={downloadLocal}
            disabled={!loaded}
            className="text-sm px-3 py-2 rounded border border-border hover:bg-surface disabled:opacity-40"
          >
            Download JSON
          </button>
        </div>
      </section>

      <section className="bg-card border border-border rounded-lg p-4 space-y-3">
        <h3 className="font-semibold">Load</h3>
        <input
          placeholder="PIN"
          value={loadPin}
          onChange={(e) => setLoadPin(e.target.value)}
          className="w-full bg-surface border border-border rounded px-3 py-2 text-sm"
        />
        <button
          onClick={doLoad}
          disabled={loadPin.length < 4}
          className="text-sm px-3 py-2 rounded bg-accent hover:bg-accent-hover disabled:opacity-40"
        >
          Load most recent
        </button>
      </section>
    </div>
  );
}
