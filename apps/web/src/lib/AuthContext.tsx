"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import type { CurrentUser } from "@professionisti/api-client";
import { apiClient } from "./apiClient";

const TOKEN_STORAGE_KEY = "professionisti_token";

type AuthContextValue = {
  user: CurrentUser | null;
  isLoading: boolean;
  login: (token: string) => Promise<void>;
  logout: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadUser = useCallback(async (token: string) => {
    try {
      const currentUser = await apiClient.me(token);
      setUser(currentUser);
    } catch {
      window.localStorage.removeItem(TOKEN_STORAGE_KEY);
      setUser(null);
    }
  }, []);

  useEffect(() => {
    const token = window.localStorage.getItem(TOKEN_STORAGE_KEY);
    if (token) {
      loadUser(token).finally(() => setIsLoading(false));
    } else {
      setIsLoading(false);
    }
  }, [loadUser]);

  const login = useCallback(
    async (token: string) => {
      window.localStorage.setItem(TOKEN_STORAGE_KEY, token);
      await loadUser(token);
    },
    [loadUser],
  );

  const logout = useCallback(() => {
    window.localStorage.removeItem(TOKEN_STORAGE_KEY);
    setUser(null);
  }, []);

  return <AuthContext.Provider value={{ user, isLoading, login, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth va usato dentro <AuthProvider>");
  }
  return context;
}
