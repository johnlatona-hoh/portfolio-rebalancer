import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  registerUser,
  loginUser,
  saveSnapshot,
  loadSnapshot,
  deleteSnapshot,
  type SnapshotMeta,
  type LoginResponse,
} from "../api/client";
import { useAuth, type AuthUser } from "../state/auth";
import { usePortfolio } from "../state/portfolio";

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-card border border-border rounded-lg p-5 ${className}`}>{children}</div>
  );
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    month: "short", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit",
  });
}

// ---------- Account picker (not logged in) ----------

function AccountPicker({
  recentEmails,
  onLogin,
  onRegister,
}: {
  recentEmails: string[];
  onLogin: (user: AuthUser, pin: string, snaps: SnapshotMeta[]) => void;
  onRegister: () => void;
}) {
  const [email, setEmail] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit() {
    if (!email.trim() || !pin) { setError("Please enter your email and PIN."); return; }
    setLoading(true); setError("");
    try {
      const res: LoginResponse = await loginUser(email.trim(), pin);
      onLogin({ id: res.user.id, email: res.user.email }, pin, res.snapshots);
    } catch (e: any) {
      setError(e?.response?.data?.detail ?? "Email or PIN is incorrect.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-md mx-auto space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Your saved portfolios</h2>
        <p className="text-muted text-sm mt-1">
          Sign in to see and restore your previous saves, or create a new account to get started.
        </p>
      </div>

      {recentEmails.length > 0 && (
        <Card>
          <div className="text-xs uppercase text-muted mb-3">Recently used</div>
          <div className="space-y-1.5">
            {recentEmails.map((e) => (
              <button
                key={e}
                onClick={() => setEmail(e)}
                className="w-full text-left px-3 py-2 rounded hover:bg-surface text-sm"
              >
                {e}
              </button>
            ))}
          </div>
        </Card>
      )}

      <Card>
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-muted mb-1">Email address</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full bg-surface border border-border rounded px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-muted mb-1">PIN (4+ characters)</label>
            <input
              type="password"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              placeholder="••••"
              className="w-full bg-surface border border-border rounded px-3 py-2 text-sm"
              onKeyDown={(e) => e.key === "Enter" && submit()}
            />
          </div>
          {error && <p className="text-bad text-sm">{error}</p>}
          <button
            onClick={submit}
            disabled={loading}
            className="w-full py-2 rounded bg-accent hover:bg-accent-hover disabled:opacity-50 text-sm font-medium"
          >
            {loading ? "Opening…" : "Open my portfolios"}
          </button>
        </div>
      </Card>

      <p className="text-center text-sm text-muted">
        First time here?{" "}
        <button onClick={onRegister} className="text-accent hover:underline">
          Create an account
        </button>
      </p>
    </div>
  );
}

// ---------- Register ----------

function RegisterView({ onLogin, onBack }: {
  onLogin: (user: AuthUser, pin: string, snaps: SnapshotMeta[]) => void;
  onBack: () => void;
}) {
  const [email, setEmail] = useState("");
  const [pin, setPin] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit() {
    if (!email.trim()) { setError("Please enter an email address."); return; }
    if (pin.length < 4) { setError("PIN must be at least 4 characters."); return; }
    if (pin !== confirm) { setError("PINs don't match — please re-enter."); return; }
    setLoading(true); setError("");
    try {
      const res: LoginResponse = await registerUser(email.trim(), pin);
      onLogin({ id: res.user.id, email: res.user.email }, pin, res.snapshots);
    } catch (e: any) {
      setError(e?.response?.data?.detail ?? "Could not create account.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-md mx-auto space-y-6">
      <div>
        <button onClick={onBack} className="text-muted text-sm hover:text-fg mb-2">
          &larr; Back
        </button>
        <h2 className="text-xl font-semibold">Create your account</h2>
        <p className="text-muted text-sm mt-1">
          Your saves are protected by your email and a PIN you choose. The PIN is never stored as-is —
          only a secure hash of it is kept.
        </p>
      </div>
      <Card>
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-muted mb-1">Email address</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-surface border border-border rounded px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-muted mb-1">Choose a PIN (4+ characters)</label>
            <input
              type="password"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              className="w-full bg-surface border border-border rounded px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-muted mb-1">Confirm PIN</label>
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="w-full bg-surface border border-border rounded px-3 py-2 text-sm"
              onKeyDown={(e) => e.key === "Enter" && submit()}
            />
          </div>
          {error && <p className="text-bad text-sm">{error}</p>}
          <button
            onClick={submit}
            disabled={loading}
            className="w-full py-2 rounded bg-accent hover:bg-accent-hover disabled:opacity-50 text-sm font-medium"
          >
            {loading ? "Creating…" : "Create account"}
          </button>
        </div>
      </Card>
    </div>
  );
}

// ---------- Logged-in view ----------

function LoggedInView({
  snapshots: initialSnaps,
  onLogout,
}: {
  snapshots: SnapshotMeta[];
  onLogout: () => void;
}) {
  const navigate = useNavigate();
  const { user, pin, logout } = useAuth();
  const { holdings, targets, loaded, loadPortfolio } = usePortfolio();
  const [snapshots, setSnapshots] = useState<SnapshotMeta[]>(initialSnaps);
  const [label, setLabel] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [restoreError, setRestoreError] = useState("");

  async function doSave() {
    if (!label.trim()) { setSaveError("Please give this save a title."); return; }
    if (!user) return;
    setSaving(true); setSaveError("");
    try {
      const payload = { holdings, targets };
      const res = await saveSnapshot(user.email, pin, payload, label.trim(), description.trim());
      const newMeta: SnapshotMeta = {
        id: res.id,
        label: label.trim(),
        description: description.trim() || null,
        created_at: res.created_at,
      };
      setSnapshots([newMeta, ...snapshots]);
      setLabel(""); setDescription("");
    } catch (e: any) {
      setSaveError(e?.response?.data?.detail ?? "Save failed.");
    } finally {
      setSaving(false);
    }
  }

  async function doRestore(snap: SnapshotMeta) {
    if (!user) return;
    setRestoreError("");
    try {
      const res = await loadSnapshot(user.email, pin, snap.id);
      const p = res.payload as Record<string, unknown>;
      loadPortfolio(p.holdings as any, p.targets as Record<string, number>);
      navigate("/dashboard");
    } catch {
      setRestoreError("Could not load that save. Try again.");
    }
  }

  async function doDelete(id: string) {
    if (!user) return;
    setDeletingId(id);
    try {
      await deleteSnapshot(user.email, pin, id);
      setSnapshots((prev) => prev.filter((s) => s.id !== id));
    } catch {
      setRestoreError("Could not delete that save. Try again.");
    } finally {
      setDeletingId(null);
      setConfirmDeleteId(null);
    }
  }

  function handleLogout() {
    logout();
    onLogout();
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">My portfolios</h2>
          <p className="text-muted text-sm">{user?.email}</p>
        </div>
        <button onClick={handleLogout} className="text-sm text-muted hover:text-fg">
          Sign out
        </button>
      </div>

      {loaded && (
        <Card>
          <h3 className="font-medium mb-3">Save current portfolio</h3>
          <div className="space-y-2">
            <div>
              <label className="block text-xs text-muted mb-1">Title (required)</label>
              <input
                type="text"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="e.g. Q1 2026 review"
                className="w-full bg-surface border border-border rounded px-3 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-muted mb-1">Notes (optional)</label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="e.g. Before annual rebalance"
                className="w-full bg-surface border border-border rounded px-3 py-1.5 text-sm"
              />
            </div>
            {saveError && <p className="text-bad text-xs">{saveError}</p>}
            <button
              onClick={doSave}
              disabled={saving}
              className="px-4 py-1.5 rounded bg-accent hover:bg-accent-hover disabled:opacity-50 text-sm"
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </Card>
      )}

      <div>
        <h3 className="font-medium mb-3">Saved portfolios</h3>
        {restoreError && <p className="text-bad text-sm mb-2">{restoreError}</p>}
        {snapshots.length === 0 ? (
          <Card>
            <p className="text-muted text-sm">
              No saved portfolios yet. Upload a CSV on the Setup page and then come back here to save it.
            </p>
          </Card>
        ) : (
          <div className="space-y-2">
            {snapshots.map((snap) => (
              <Card key={snap.id} className="flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm truncate">{snap.label ?? "Untitled"}</div>
                  {snap.description && (
                    <div className="text-muted text-xs mt-0.5 truncate">{snap.description}</div>
                  )}
                  <div className="text-muted text-xs mt-0.5">{fmtDate(snap.created_at)}</div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => doRestore(snap)}
                    className="text-sm px-3 py-1 rounded bg-surface hover:bg-surface/80 border border-border"
                  >
                    Restore
                  </button>
                  {confirmDeleteId === snap.id ? (
                    <span className="flex items-center gap-1.5 text-sm">
                      <span className="text-muted">Delete?</span>
                      <button
                        onClick={() => doDelete(snap.id)}
                        disabled={deletingId === snap.id}
                        className="text-bad hover:underline"
                      >
                        {deletingId === snap.id ? "Deleting…" : "Yes, delete"}
                      </button>
                      <button
                        onClick={() => setConfirmDeleteId(null)}
                        className="text-muted hover:underline"
                      >
                        Cancel
                      </button>
                    </span>
                  ) : (
                    <button
                      onClick={() => setConfirmDeleteId(snap.id)}
                      className="text-muted hover:text-bad text-sm"
                    >
                      Delete
                    </button>
                  )}
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------- Main page ----------

type View = "picker" | "register" | "loggedIn";

export default function SnapshotPage() {
  const auth = useAuth();
  const [view, setView] = useState<View>(auth.isLoggedIn ? "loggedIn" : "picker");
  const [snaps, setSnaps] = useState<SnapshotMeta[]>([]);

  function handleLogin(user: AuthUser, pin: string, snapshots: SnapshotMeta[]) {
    auth.login(user, pin);
    setSnaps(snapshots);
    setView("loggedIn");
  }

  function handleLogout() {
    setView("picker");
    setSnaps([]);
  }

  if (view === "register") {
    return <RegisterView onLogin={handleLogin} onBack={() => setView("picker")} />;
  }

  if (view === "loggedIn" && auth.isLoggedIn) {
    return <LoggedInView snapshots={snaps} onLogout={handleLogout} />;
  }

  return (
    <AccountPicker
      recentEmails={auth.recentEmails}
      onLogin={handleLogin}
      onRegister={() => setView("register")}
    />
  );
}
