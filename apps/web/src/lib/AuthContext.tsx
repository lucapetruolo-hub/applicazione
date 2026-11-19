"use client";

import { createContext, startTransition, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { ApiError, type CurrentUser } from "@professionisti/api-client";
import { DEFAULT_NOTIFICATION_PREFERENCES, type NotificationPreferences, type RealtimeEvent } from "@professionisti/shared";
import { apiClient } from "./apiClient";
import { clearAgendaOffline, clearOfflineUser, readOfflineUser, saveOfflineUser } from "./agendaOffline";
import { emitRealtimeEvent } from "./realtimeBus";
import { installNotificationSoundUnlock, playNotificationSound } from "./notificationSound";
import { isConversationOnScreen } from "./openConversations";
import { isCountingDisabled, setCountingDisabled } from "./siteCounts";

export const TOKEN_STORAGE_KEY = "professionisti_token";

/** `type` porta la notifica di origine — usato da ToastStack per sapere dove navigare al click (richiesta esplicita dell'utente). */
export type NotificationToast = { id: string; icon: string; message: string; type: string; payload: unknown };
/** Notifiche arrivate entro questo tempo dall'ultimo popup lo aggiornano invece di aggiungerne un altro. */
const TOAST_BURST_MS = 10_000;

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
  /**
   * Segna tutte le notifiche come lette e azzera il badge — chiamato all'apertura di /dashboard o /le-mie-richieste.
   * `fetched` sono le non lette appena lette dalla pagina: quelle nuove hanno
   * prima il loro popup e suono, che altrimenti la pagina "mangerebbe"
   * segnandole lette prima del controllo dell'app (docs/CHANGELOG.md §331).
   */
  markNotificationsRead: (fetched?: UnreadNotification[]) => Promise<void>;
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
  /** Preferenze di notifica (argomenti, canali, popup, suono) — docs/CHANGELOG.md §152. `null` finché non caricate. */
  notificationPrefs: NotificationPreferences | null;
  setNotificationPrefs: (prefs: NotificationPreferences) => void;
};

/** Messaggio di una chat aperta a schermo in questo momento (§332). */
function chatOnScreen(n: UnreadNotification): boolean {
  if (n.type !== "TIMELINE_MESSAGE_FROM_CLIENT" && n.type !== "TIMELINE_MESSAGE_FROM_PROFESSIONAL") return false;
  const payload = n.payload && typeof n.payload === "object" ? (n.payload as Record<string, unknown>) : {};
  const { guidedRequestId, professionalProfileId } = payload;
  return typeof guidedRequestId === "string" && typeof professionalProfileId === "string" && isConversationOnScreen(guidedRequestId, professionalProfileId);
}

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
  // Ultimo popup di una raffica: le notifiche che arrivano entro pochi
  // secondi lo aggiornano ("Hai N nuovi aggiornamenti") invece di aggiungerne
  // un altro (docs/changelog/2026-11-19-completa-profilo-migliorie.md).
  const toastBurstRef = useRef<{ id: string; count: number; at: number } | null>(null);
  const toastSeqRef = useRef(0);
  const [notificationPrefs, setNotificationPrefsState] = useState<NotificationPreferences | null>(null);
  // Letto dentro `checkForNewNotifications` (callback stabile) per sapere
  // se mostrare il popup e suonare, senza ricrearla a ogni cambio.
  const notificationPrefsRef = useRef<NotificationPreferences>(DEFAULT_NOTIFICATION_PREFERENCES);
  const setNotificationPrefs = useCallback((prefs: NotificationPreferences) => {
    notificationPrefsRef.current = prefs;
    setNotificationPrefsState(prefs);
  }, []);

  const loadUser = useCallback(async (currentToken: string): Promise<CurrentUser | null> => {
    for (let attempt = 0; ; attempt++) {
      try {
        const currentUser = await apiClient.me(currentToken);
        // `null` copre sia un token non valido sia un account eliminato nel
        // frattempo (`/auth/me` lo tratta come inesistente, vedi
        // AuthController) — in entrambi i casi il token salvato non serve
        // più a nulla: senza rimuoverlo, ogni ricarica di pagina ripeterebbe
        // la stessa chiamata fallita all'infinito invece di restare
        // semplicemente disconnessi.
        if (!currentUser) {
          window.localStorage.removeItem(TOKEN_STORAGE_KEY);
          clearOfflineUser();
        } else {
          saveOfflineUser(currentUser);
          // Account di prova (docs/CHANGELOG.md §395): da qui in poi questo browser non conta, anche dopo l'uscita.
          if (currentUser.testAccount && !isCountingDisabled()) setCountingDisabled(true);
        }
        // Con `startTransition` (docs/CHANGELOG.md §345): l'utente arrivato
        // ridisegna tutta la pagina (menu, intestazione, contenuto) e su un
        // telefono lento React lo fa a piccoli pezzi invece che in un blocco.
        startTransition(() => {
          setUser(currentUser);
          setToken(currentUser ? currentToken : null);
        });
        return currentUser;
      } catch (err) {
        // Bug reale trovato da un agente di verifica: un fetch fallito a
        // livello di rete (offline, richiesta interrotta perché l'utente ha
        // navigato altrove prima che /auth/me rispondesse — `TypeError` o
        // `AbortError`, mai un vero 401) veniva trattato esattamente come un
        // token non valido, disconnettendo silenziosamente un utente con una
        // sessione perfettamente valida solo per sfortuna di tempistica. Solo
        // una risposta HTTP che l'API ha davvero dato (qui `request()` lancia
        // un `Error` generico con lo status nel messaggio, mai un `TypeError`/
        // `AbortError`) significa "il token non è più valido" — un fallimento
        // di rete lascia lo stato invariato, il prossimo tentativo (poll,
        // ricarica, navigazione) riproverà da solo.
        // Anche un 429 (troppe richieste) o un errore del server non dicono
        // che il token non vale più: solo 401/403 disconnettono (§311, visto
        // nelle prove nel browser in CI).
        const isNetworkFailure = err instanceof TypeError || (err instanceof DOMException && err.name === "AbortError");
        const sessionRejected = err instanceof ApiError ? err.status === 401 || err.status === 403 : !isNetworkFailure;
        // Troppe richieste o server in difficoltà: si riprova due volte prima di arrendersi.
        if (err instanceof ApiError && (err.status === 429 || err.status >= 500) && attempt < 2) {
          await new Promise((resolve) => setTimeout(resolve, 1500 * (attempt + 1)));
          continue;
        }
        if (sessionRejected) {
          window.localStorage.removeItem(TOKEN_STORAGE_KEY);
          clearOfflineUser();
          setUser(null);
          setToken(null);
          setNotificationPrefsState(null);
          return null;
        }
        // Senza rete si resta dentro con l'ultimo profilo salvato, così
        // l'agenda mostra la sua copia invece di "Accedi" (R1 della verifica,
        // docs/CHANGELOG.md §309-§310). Le azioni chiedono comunque la rete.
        const offlineUser = readOfflineUser();
        if (offlineUser) {
          setUser((current) => current ?? offlineUser);
          setToken((current) => current ?? currentToken);
        }
        return offlineUser;
      }
    }
  }, []);

  // La sessione salvata si legge solo dopo il montaggio: nel render del
  // server localStorage non esiste e la pagina non combacerebbe.
  useEffect(() => {
    const storedToken = window.localStorage.getItem(TOKEN_STORAGE_KEY);
    if (storedToken) {
      // Nella stessa transizione dell'utente (vedi loadUser): React le
      // disegna insieme, così non si vede mai "caricato" senza l'utente.
      // eslint-disable-next-line react-hooks/set-state-in-effect -- loadUser aggiorna lo stato solo dopo la risposta dell'API
      loadUser(storedToken).finally(() => startTransition(() => setIsLoading(false)));
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
    // Chiude l'accesso anche sul server (controllo pre-lancio dell'08/11): su
    // un computer condiviso il token copiato prima non vale più. Non si
    // aspetta la risposta: l'uscita nel browser è immediata comunque.
    const storedToken = window.localStorage.getItem(TOKEN_STORAGE_KEY);
    if (storedToken) void apiClient.logout(storedToken).catch(() => undefined);
    window.localStorage.removeItem(TOKEN_STORAGE_KEY);
    // Copia dell'agenda senza rete (docs/CHANGELOG.md §288): non resta sul telefono dopo l'uscita.
    clearAgendaOffline();
    clearOfflineUser();
    setUser(null);
    setToken(null);
    setUnreadCount(0);
    setNotificationPrefsState(null);
    seenNotificationIdsRef.current = null;
    toastBurstRef.current = null;
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
      startTransition(() => setUnreadCount(count));
    } catch {
      // Silenzioso: un badge che non si aggiorna per un errore di rete
      // transitorio non deve bloccare o disturbare il resto dell'app.
    }
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
  const announceNotifications = useCallback((notifications: UnreadNotification[]) => {
    startTransition(() => setUnreadNotifications(notifications));
    if (seenNotificationIdsRef.current === null) {
      seenNotificationIdsRef.current = new Set(notifications.map((n) => n.id));
      return;
    }
    const seen = seenNotificationIdsRef.current;
    const freshOnes = notifications.filter((n) => !seen.has(n.id));
    for (const n of freshOnes) {
      seen.add(n.id);
    }
    // Un messaggio della chat già aperta a schermo si vede lì: niente popup né suono (§332).
    const toAnnounce = freshOnes.filter((n) => !chatOnScreen(n));
    // Preferenze (docs/CHANGELOG.md §152): suono e popup si possono
    // spegnere separatamente; la campanella e il numeretto restano.
    const prefs = notificationPrefsRef.current;
    if (toAnnounce.length > 0 && prefs.sound) {
      // Richieste urgenti e problemi hanno un suono loro, le buone notizie
      // la marimba, il resto il suono scelto (docs/changelog/2026-11-17-suoni-notifica.md).
      // Il tono si legge dal testo della notifica, caricato solo qui.
      void import("./notificationTopicStyle")
        .then(({ notificationSoundKind }) => playNotificationSound(prefs.soundName, notificationSoundKind(toAnnounce)))
        .catch(() => playNotificationSound(prefs.soundName));
    }
    if (!prefs.popups || toAnnounce.length === 0) return;
    // Raffica: al primo profilo arrivano insieme le richieste già aperte in
    // zona, una notifica ciascuna, e ogni evento in tempo reale faceva un
    // controllo suo. Prima ne usciva un popup per giro, fino a coprire tutto
    // lo schermo del telefono (e con lo stesso id `batch-<ms>` React ne
    // disegnava più del limite di 3). Ora quello che arriva entro
    // TOAST_BURST_MS dall'ultimo popup ancora aperto lo aggiorna.
    const now = Date.now();
    const burst = toastBurstRef.current && now - toastBurstRef.current.at < TOAST_BURST_MS ? toastBurstRef.current : null;
    const count = (burst?.count ?? 0) + toAnnounce.length;
    if (count === 1) {
      // Caso comune: un solo evento, con il suo messaggio simpatico di sempre.
      // I testi di tutte le notifiche si caricano solo qui, al primo
      // popup: prima stavano nel JavaScript di ogni pagina, anche per chi
      // visita senza account (docs/changelog/2026-11-09-meno-javascript-comune.md).
      const fresh = toAnnounce[0]!;
      toastBurstRef.current = { id: fresh.id, count: 1, at: now };
      void import("./notificationCopy").then(({ notificationCopy }) => {
        // Nel frattempo è arrivato altro: c'è già il popup che li conta tutti.
        if (toastBurstRef.current?.id !== fresh.id) return;
        const { icon, message } = notificationCopy(fresh.type, fresh.payload);
        setToasts((prev) => [...prev, { id: fresh.id, icon, message, type: fresh.type, payload: fresh.payload }]);
      });
      return;
    }
    // Più eventi insieme: un solo popup che li conta (Verbale Cognitivo F7.2,
    // "notification fatigue": i popup non spariscono da soli, ognuno va
    // chiuso). Il clic apre la pagina del primo evento del gruppo.
    const id = `batch-${now}-${++toastSeqRef.current}`;
    const replaces = burst?.id;
    const first = toAnnounce[0]!;
    toastBurstRef.current = { id, count, at: now };
    setToasts((prev) => [
      ...prev.filter((t) => t.id !== replaces),
      { id, icon: "🔔", message: `Hai ${count} nuovi aggiornamenti.`, type: first.type, payload: first.payload },
    ]);
  }, []);

  const checkForNewNotifications = useCallback(async () => {
    const storedToken = window.localStorage.getItem(TOKEN_STORAGE_KEY);
    if (!storedToken) return;
    try {
      announceNotifications(await apiClient.unreadNotifications(storedToken));
    } catch {
      // Silenzioso, stesso principio di refreshUnreadCount: un toast mancato non deve rompere l'app.
    }
  }, [announceNotifications]);

  const markNotificationsRead = useCallback(async (fetched?: UnreadNotification[]) => {
    const storedToken = window.localStorage.getItem(TOKEN_STORAGE_KEY);
    if (!storedToken) return;
    if (fetched) announceNotifications(fetched);
    try {
      await apiClient.markNotificationsRead(storedToken);
      setUnreadCount(0);
      // Svuotato anche qui (non solo al prossimo poll da 45s): senza,
      // il badge per voce di menu (AccountMenu) resterebbe "sporco" per
      // fino a 45s dopo aver visitato la pagina che le segna come lette.
      setUnreadNotifications([]);
    } catch {
      // Idem: un fallimento nel segnare come lette non deve rompere la pagina.
    }
  }, [announceNotifications]);

  const dismissToast = useCallback((id: string) => {
    // Chiuso il popup della raffica: quello che arriva dopo ne apre uno nuovo, da 1.
    if (toastBurstRef.current?.id === id) toastBurstRef.current = null;
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);


  useEffect(() => {
    installNotificationSoundUnlock();
  }, []);

  // Preferenze di notifica, ricaricate a ogni cambio di utente (all'uscita
  // le azzerano logout e loadUser, insieme all'utente).
  useEffect(() => {
    if (!user || !token) {
      notificationPrefsRef.current = DEFAULT_NOTIFICATION_PREFERENCES;
      return;
    }
    // Badge, notifiche e preferenze arrivate dall'API si mostrano con
    // `startTransition` (docs/CHANGELOG.md §345): ognuno ridisegna tutte le
    // pagine che usano useAuth e su un telefono lento, in un blocco unico,
    // fermava la pagina.
    apiClient
      .notificationPreferences(token)
      .then((prefs) => startTransition(() => setNotificationPrefs(prefs)))
      .catch(() => undefined);
  }, [user, token, setNotificationPrefs]);

  // Aggiorna conteggio+toast ogni volta che l'utente (dis)connesso cambia, non solo al primo mount.
  useEffect(() => {
    if (user) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- il conteggio arriva dall'API, lo stato cambia solo alla risposta
      refreshUnreadCount();
      checkForNewNotifications();
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

  /**
   * Canale push in tempo reale (Server-Sent Events — CTO: "per il nostro
   * contesto, socket.io vs websocket vs alternative" — vedi
   * `apps/api/src/realtime/realtime.service.ts` per il verdetto e il
   * perché). Un solo `EventSource` per l'intera app (non uno per pagina):
   * inoltrato al bus `realtimeBus` per chiunque sia iscritto (una
   * `ConversationView` aperta, l'inbox `/chat`) e, per un evento
   * `notification`, riusa integralmente `refreshUnreadCount`/
   * `checkForNewNotifications` già esistenti — stessa logica di
   * dedup/baseline/batching del poll, nessuna duplicazione.
   *
   * Il poll da 45s sopra **resta**, non sostituito: è la rete di sicurezza
   * per una disconnessione prolungata (l'istanza Render in sleep dopo
   * inattività, o un redeploy che chiude la connessione) — `EventSource`
   * riprova da sé appena la rete/l'API tornano disponibili.
   *
   * L'indirizzo porta un biglietto monouso da 60 secondi, mai il token
   * (docs/CHANGELOG.md §293): quando il browser riprova con il biglietto
   * già usato riceve 401 e chiude, e qui se ne chiede uno nuovo, con
   * un'attesa che raddoppia fino a un minuto.
   */
  useEffect(() => {
    if (!token) return;
    let source: EventSource | null = null;
    let retry: ReturnType<typeof setTimeout> | null = null;
    let delayMs = 2_000;
    let stopped = false;
    const reopenLater = () => {
      if (stopped) return;
      retry = setTimeout(open, delayMs);
      delayMs = Math.min(delayMs * 2, 60_000);
    };
    async function open() {
      let ticket: string;
      try {
        ({ ticket } = await apiClient.realtimeTicket(token!));
      } catch {
        reopenLater();
        return;
      }
      if (stopped) return;
      source = new EventSource(apiClient.realtimeStreamUrl(ticket));
      source.onopen = () => {
        delayMs = 2_000;
      };
      // 401 (biglietto già usato o scaduto): il browser chiude; un evento
      // "error" mandato dal server porta `data`. In entrambi i casi serve un
      // biglietto nuovo. Gli altri errori sono la rete: riprova il browser.
      source.onerror = (event) => {
        if (source?.readyState !== EventSource.CLOSED && !(event instanceof MessageEvent)) return;
        source?.close();
        reopenLater();
      };
      source.onmessage = (message) => {
        try {
          const data = JSON.parse(message.data) as RealtimeEvent | { kind: "ping" };
          if (data.kind === "ping") return; // heartbeat, nessun contenuto reale
          emitRealtimeEvent(data);
          if (data.kind === "notification") {
            refreshUnreadCount();
            checkForNewNotifications();
          }
        } catch {
          // Payload malformato o inatteso — mai bloccare il resto dell'app per un singolo evento scartato.
        }
      };
    }
    void open();
    return () => {
      stopped = true;
      if (retry) clearTimeout(retry);
      source?.close();
    };
  }, [token, refreshUnreadCount, checkForNewNotifications]);

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isLoading,
        login,
        logout,
        refreshUser,
        // Senza utente il conteggio è sempre 0, anche prima che logout/loadUser lo azzerino.
        unreadCount: user ? unreadCount : 0,
        refreshUnreadCount,
        markNotificationsRead,
        toasts,
        dismissToast,
        unreadNotifications,
        notificationPrefs: user ? notificationPrefs : null,
        setNotificationPrefs,
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
