"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { CurrentUser } from "@professionisti/api-client";
import { apiClient } from "./apiClient";
import { notificationCopy } from "./notificationCopy";

const TOKEN_STORAGE_KEY = "professionisti_token";

export type NotificationToast = { id: string; icon: string; message: string };
export type UnreadNotification = { id: string; type: string; payload: unknown; createdAt: string };

type AuthContextValue = {
  user: CurrentUser | null;
  token: string | null;
  isLoading: boolean;
  /** Ritorna l'utente appena autenticato: usato per decidere subito dove reindirizzare in base al ruolo (es. professionista → /dashboard), senza aspettare un re-render. */
  login: (token: string) => Promise<CurrentUser | null>;
  logout: () => void;
  refreshUser: () => Promise<void>;
  /** Notifiche non lette (nuova richiesta/risposta/aggiornamento) — badge in AccountMenu, visibile solo al proprietario loggato. */
  unreadCount: number;
  refreshUnreadCount: () => Promise<void>;
  /** Segna tutte le notifiche come lette e azzera il badge — chiamato all'apertura di /dashboard o /le-mie-richieste. */
  markNotificationsRead: () => Promise<void>;
  /** Popup "toast" per notifiche appena arrivate (richiesta esplicita dell'utente) — vedi ToastStack. */
  toasts: NotificationToast[];
  dismissToast: (id: string) => void;
  /**
   * Elenco grezzo delle notifiche non lette (tipo/payload) — usato da
   * /dashboard e /le-mie-richieste per mostrare un numeretto per sezione
   * ("Richieste ricevute"/"Lavori accettati" ecc.), non solo il totale
   * nell'header (richiesta esplicita dell'utente: "indica anche in quale
   * sezione c'è stato l'aggiornamento"). Si aggiorna con lo stesso poll dei
   * toast; `markNotificationsRead` non lo svuota subito (solo il conteggio
   * dell'header) — resta visibile finché il prossimo giro di polling non
   * conferma che è stato letto, così l'utente fa in tempo a vedere DOVE
   * era l'aggiornamento prima che sparisca.
   */
  unreadNotifications: UnreadNotification[];
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);
  const [toasts, setToasts] = useState<NotificationToast[]>([]);
  const [unreadNotifications, setUnreadNotifications] = useState<UnreadNotification[]>([]);
  // `null` = non ancora stabilita una "baseline": al primo controllo dopo
  // login le notifiche già non lette (magari vecchie di giorni) non devono
  // generare un toast tutte insieme — solo quelle arrivate DOPO vengono
  // segnalate. Azzerato ad ogni cambio utente (login/logout).
  const seenNotificationIdsRef = useRef<Set<string> | null>(null);

  const loadUser = useCallback(async (currentToken: string) => {
    try {
      const currentUser = await apiClient.me(currentToken);
      setUser(currentUser);
      setToken(currentUser ? currentToken : null);
      return currentUser;
    } catch {
      window.localStorage.removeItem(TOKEN_STORAGE_KEY);
      setUser(null);
      setToken(null);
      return null;
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
      return loadUser(newToken);
    },
    [loadUser],
  );

  const logout = useCallback(() => {
    window.localStorage.removeItem(TOKEN_STORAGE_KEY);
    setUser(null);
    setToken(null);
    setUnreadCount(0);
    seenNotificationIdsRef.current = null;
    setToasts([]);
    setUnreadNotifications([]);
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

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  /**
   * Confronta le notifiche non lette con quelle già viste in questa
   * sessione: quelle nuove diventano un popup "toast" con un messaggio
   * simpatico (richiesta esplicita dell'utente, es. "Fantastico! Hai
   * ricevuto un nuovo preventivo"). Il primo controllo dopo login stabilisce
   * solo la baseline, senza mostrare toast per notifiche già in attesa da
   * prima — altrimenti un professionista con 5 richieste non lette da
   * giorni vedrebbe 5 popup tutti insieme al primo caricamento.
   */
  const checkForNewNotifications = useCallback(async () => {
    const storedToken = window.localStorage.getItem(TOKEN_STORAGE_KEY);
    if (!storedToken) return;
    try {
      const notifications = await apiClient.unreadNotifications(storedToken);
      setUnreadNotifications(notifications);
      if (seenNotificationIdsRef.current === null) {
        seenNotificationIdsRef.current = new Set(notifications.map((n) => n.id));
        return;
      }
      const seen = seenNotificationIdsRef.current;
      const freshOnes = notifications.filter((n) => !seen.has(n.id));
      for (const n of freshOnes) {
        seen.add(n.id);
      }
      if (freshOnes.length > 0) {
        setToasts((prev) => [
          ...prev,
          ...freshOnes.map((n) => {
            const { icon, message } = notificationCopy(n.type);
            return { id: n.id, icon, message };
          }),
        ]);
      }
    } catch {
      // Silenzioso, stesso principio di refreshUnreadCount: un toast mancato non deve rompere l'app.
    }
  }, []);

  // Aggiorna conteggio+toast ogni volta che l'utente (dis)connesso cambia, non solo al primo mount.
  useEffect(() => {
    if (user) {
      refreshUnreadCount();
      checkForNewNotifications();
    } else {
      setUnreadCount(0);
    }
  }, [user, refreshUnreadCount, checkForNewNotifications]);

  // Poll periodico mentre l'utente resta loggato con la scheda aperta: senza
  // questo il badge si aggiornava solo al login/refresh della pagina — un
  // professionista già sulla dashboard quando arriva un nuovo lead non
  // vedeva comparire il numero finché non ricaricava. Non c'è
  // un'infrastruttura push/websocket in questo stack (CLAUDE.md §9,
  // notifiche reali ancora rimandate), 45s è un compromesso pragmatico
  // "quasi istantaneo" (CLAUDE.md §8) senza sovraccaricare l'API.
  useEffect(() => {
    if (!user) return;
    const interval = setInterval(() => {
      refreshUnreadCount();
      checkForNewNotifications();
    }, 45_000);
    return () => clearInterval(interval);
  }, [user, refreshUnreadCount, checkForNewNotifications]);

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isLoading,
        login,
        logout,
        refreshUser,
        unreadCount,
        refreshUnreadCount,
        markNotificationsRead,
        toasts,
        dismissToast,
        unreadNotifications,
      }}
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
