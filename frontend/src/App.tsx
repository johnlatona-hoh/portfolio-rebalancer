import { Routes, Route, NavLink, useNavigate } from "react-router-dom";
import { PortfolioProvider, usePortfolio } from "./state/portfolio";
import { AuthProvider, useAuth } from "./state/auth";
import SetupPage from "./pages/SetupPage";
import DashboardPage from "./pages/DashboardPage";
import SnapshotPage from "./pages/SnapshotPage";
import HistoryPage from "./pages/HistoryPage";
import WarmupBanner from "./components/WarmupBanner";

function Navbar() {
  const nav = useNavigate();
  const { loaded, reset } = usePortfolio();
  const { isLoggedIn } = useAuth();
  const link = ({ isActive }: { isActive: boolean }) =>
    `px-3 py-1.5 rounded-md text-sm ${
      isActive ? "bg-accent text-white" : "text-muted hover:text-gray-100"
    }`;

  function startOver() {
    reset();
    nav("/");
  }

  return (
    <nav className="border-b border-border bg-card">
      <div className="max-w-screen-xl mx-auto px-4 py-3 flex items-center gap-2">
        <span className="font-semibold mr-4">Portfolio Rebalancer</span>
        <NavLink to="/" className={link} end>
          Setup
        </NavLink>
        <NavLink to="/dashboard" className={link}>
          Dashboard
        </NavLink>
        <NavLink to="/snapshots" className={link}>
          My Portfolios
        </NavLink>
        {isLoggedIn && (
          <NavLink to="/history" className={link}>
            History
          </NavLink>
        )}
        {loaded && (
          <button
            onClick={startOver}
            className="ml-auto text-sm px-3 py-1.5 rounded-md border border-border text-muted hover:text-gray-100"
          >
            Start over
          </button>
        )}
      </div>
    </nav>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <PortfolioProvider>
        <div className="min-h-screen bg-surface text-gray-100">
          <WarmupBanner />
          <Navbar />
          <main className="max-w-screen-xl mx-auto px-4 py-6">
            <Routes>
              <Route path="/" element={<SetupPage />} />
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/snapshots" element={<SnapshotPage />} />
              <Route path="/history" element={<HistoryPage />} />
            </Routes>
          </main>
        </div>
      </PortfolioProvider>
    </AuthProvider>
  );
}
