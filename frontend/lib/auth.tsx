"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { useRouter } from "next/navigation";
import { api } from "./api";
import type { User } from "./types";

interface AuthState {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<User>;
  register: (payload: {
    email: string;
    password: string;
    full_name: string;
    organization_name: string;
    country?: string;
    website?: string;
  }) => Promise<User>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    // The session lives in an httpOnly cookie the browser sends automatically —
    // just ask the server who we are. A 401 simply means "not logged in".
    api
      .me()
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  async function login(email: string, password: string) {
    const res = await api.login(email, password);
    setUser(res.user);
    return res.user;
  }

  async function register(payload: Parameters<AuthState["register"]>[0]) {
    const res = await api.register(payload);
    setUser(res.user);
    return res.user;
  }

  async function logout() {
    try {
      await api.logout();
    } catch {
      /* ignore — clear locally regardless */
    }
    setUser(null);
    router.push("/login");
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

/** Landing route for a role. */
export function homeForRole(role: User["role"]): string {
  if (role === "admin") return "/admin";
  if (role === "reviewer") return "/reviewer";
  return "/projects";
}
