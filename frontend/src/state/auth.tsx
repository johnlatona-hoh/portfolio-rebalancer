import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

const RECENT_EMAILS_KEY = "rebalancer-recent-emails";
const MAX_RECENT = 5;

export interface AuthUser {
  id: string;
  email: string;
}

interface AuthState {
  user: AuthUser | null;
  pin: string;          // in memory only, never persisted
}

interface AuthContextValue {
  user: AuthUser | null;
  pin: string;
  isLoggedIn: boolean;
  login: (user: AuthUser, pin: string) => void;
  logout: () => void;
  recentEmails: string[];
}

const AuthContext = createContext<AuthContextValue | null>(null);

function loadRecentEmails(): string[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_EMAILS_KEY) ?? "[]");
  } catch {
    return [];
  }
}

function addRecentEmail(email: string): string[] {
  const list = [email, ...loadRecentEmails().filter((e) => e !== email)].slice(0, MAX_RECENT);
  localStorage.setItem(RECENT_EMAILS_KEY, JSON.stringify(list));
  return list;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [auth, setAuth] = useState<AuthState>({ user: null, pin: "" });
  const [recentEmails, setRecentEmails] = useState<string[]>(loadRecentEmails);

  const login = useCallback((user: AuthUser, pin: string) => {
    setAuth({ user, pin });
    setRecentEmails(addRecentEmail(user.email));
  }, []);

  const logout = useCallback(() => {
    setAuth({ user: null, pin: "" });
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user: auth.user,
        pin: auth.pin,
        isLoggedIn: auth.user !== null,
        login,
        logout,
        recentEmails,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
