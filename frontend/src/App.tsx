import { Routes, Route, NavLink } from "react-router-dom";
import { PortfolioProvider } from "./state/portfolio";
import SetupPage from "./pages/SetupPage";
import DashboardPage from "./pages/DashboardPage";
import SnapshotPage from "./pages/SnapshotPage";

function Navbar() {
  const link = ({ isActive }: { isActive: boolean }) =>
    `px-3 py-1.5 rounded-md text-sm ${
      isActive ? "bg-accent text-white" : "text-muted hover:text-gray-100"
    }`;
  return (
    <nav className="border-b border-border bg-card">
      <div className="max-w-screen-xl mx-auto px-4 py-3 flex items-center gap-2">
        <span className="font-semibold mr-4">Latona Portfolio Rebalancer</span>
        <NavLink to="/" className={link} end>
          Setup
        </NavLink>
        <NavLink to="/dashboard" className={link}>
          Dashboard
        </NavLink>
        <NavLink to="/snapshots" className={link}>
          Snapshots
        </NavLink>
      </div>
    </nav>
  );
}

export default function App() {
  return (
    <PortfolioProvider>
      <div className="min-h-screen bg-surface text-gray-100">
        <Navbar />
        <main className="max-w-screen-xl mx-auto px-4 py-6">
          <Routes>
            <Route path="/" element={<SetupPage />} />
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/snapshots" element={<SnapshotPage />} />
          </Routes>
        </main>
      </div>
    </PortfolioProvider>
  );
}
