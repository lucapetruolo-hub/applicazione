"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import type { CurrentUser } from "@professionisti/api-client";
import { apiClient } from "./apiClient";

const TOKEN_STORAGE_KEY = "professionisti_token";

type AuthContextValue = {
  user: CurrentUser | null;
  token: string | null;
  isLoading: boolean;
  login: (token: string) => Promise<void>;
  logout: () => void;
  refreshUser: () => Promise<void>;
  /** Notifiche non lette (nuova richiesta/risposta/aggiornamento) — badge in AccountMenu, visibile solo al proprietario loggato. */
  unreadCount: number;
  refreshUnreadCount: () => Promise<void>;
  /** Segna tutte le notifiche come lette e azzera il badge — chiamato all'apertura di /dashboard o /le-mie-richieste. */
  markNotificationsRead: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);

  const loadUser = useCallback(async (currentToken: string) => {
    try {
      const currentUser = await apiClient.me(currentToken);
      setUser(currentUser);
      setToken(currentUser ? currentToken : null);
    } catch {
      window.localStorage.removeItem(TOKEN_STORAGE_KEY);
      setUser(null);
      setToken(null);
    }
  }, []);

  useEffect(() => {
    const storedToken = window.localStorage.getItem(TOKEN_STORAGE_KEY);
    if (storedToken) {
      loadUser(storedToken).finally(() => setIsLoading(false));
    } else {
      setIsLoading(false);
    }
  }, [loadUser]);

  const login = useCallback(
    async (newToken: string) => {
      window.localStorage.setItem(TOKEN_STORAGE_KEY, newToken);
      await loadUser(newToken);
    },
    [loadUser],
  );

  const logout = useCallback(() => {
    window.localStorage.removeItem(TOKEN_STORAGE_KEY);
    setUser(null);
    setToken(null);
    setUnreadCount(0);
  }, []);

  const refreshUser = useCallback(async () => {
    const storedToken = window.localStorage.getItem(TOKEN_STORAGE_KEY);
    if (storedToken) {
      await loadUser(storedToken);
    }
  }, [loadUser]);

  const refreshUnreadCount = useCallback(async () => {
    const storedToken = window.localStorage.getItem(TOKEN_STORAGE_KEY);
    if (!storedToken) {
      setUnreadCount(0);
      return;
    }
    try {
      const { count } = await apiClient.unreadNotificationsCount(storedToken);
      setUnreadCount(count);
    } catch {
      // Silenzioso: un badge che non si aggiorna per un errore di rete
      // transitorio non deve bloccare o disturbare il resto dell'app.
    }
  }, []);

  const markNotificationsRead = useCallback(async () => {
    const storedToken = window.localStorage.getItem(TOKEN_STORAGE_KEY);
    if (!storedToken) return;
    try {
      await apiClient.markNotificationsRead(storedToken);
      setUnreadCount(0);
    } catch {
      // Idem: un fallimento nel segnare come lette non deve rompere la pagina.
    }
  }, []);

  // Aggiorna il conteggio ogni volta che l'utente (dis)connesso cambia, non solo al primo mount.
  useEffect(() => {
    if (user) {
      refreshUnreadCount();
    } else {
      setUnreadCount(0);
    }
  }, [user, refreshUnreadCount]);

  return (
    <AuthContext.Provider
      value={{ user, token, isLoading, login, logout, refreshUser, unreadCount, refreshUnreadCount, markNotificationsRead }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth va usato dentro <AuthProvider>");
  }
  return context;
}
