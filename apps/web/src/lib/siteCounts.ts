import {
  NO_COUNT_COOKIE,
  type DeviceKind,
  type ProfileRequestSource,
  type RequestOrigin,
  type RequestStepKey,
  type SubmitFailureKind,
  type SubmitFormKey,
} from "@professionisti/shared";

/**
 * Conteggi dell'andamento del sito mandati dal browser (docs/CHANGELOG.md
 * §372): un passo della richiesta raggiunto, un invio non riuscito. Solo
 * il nome del passo o del modulo, mai chi è la persona né cosa ha scritto;
 * nessun cookie di profilazione. Non si conta chi ha scelto "Non contare
 * questo browser" (gli admin lo hanno da soli); i robot li scarta l'API.
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

/** Un anno: chi prova il sito non deve ricordarsi di riattivarlo. */
const NO_COUNT_MAX_AGE = 365 * 24 * 60 * 60;

export function isCountingDisabled(): boolean {
  if (typeof document === "undefined") return true;
  return document.cookie.split("; ").includes(`${NO_COUNT_COOKIE}=1`);
}

/**
 * "Non contare questo browser": un cookie tecnico chiesto da chi usa il
 * browser (admin e chi prova il sito), letto anche dalle pagine di ricerca
 * fatte dal server. Nessun consenso: serve solo a non contarlo.
 */
export function setCountingDisabled(disabled: boolean): void {
  if (typeof document === "undefined") return;
  const secure = window.location.protocol === "https:" ? "; secure" : "";
  document.cookie = disabled
    ? `${NO_COUNT_COOKIE}=1; path=/; max-age=${NO_COUNT_MAX_AGE}; samesite=lax${secure}`
    : `${NO_COUNT_COOKIE}=; path=/; max-age=0; samesite=lax${secure}`;
}

const CHOICE_KEY = "non_contare_scelto";

/**
 * Chi entra nell'area admin non viene più contato, la prima volta da solo:
 * se poi riaccende il conteggio dall'interruttore, la sua scelta resta.
 */
export function disableCountingForAdminOnce(): void {
  try {
    if (window.localStorage.getItem(CHOICE_KEY)) return;
    window.localStorage.setItem(CHOICE_KEY, "1");
  } catch {
    // Senza localStorage si spegne a ogni ingresso: va bene lo stesso.
  }
  setCountingDisabled(true);
}

/** L'interruttore "Non contare questo browser" della pagina Andamento. */
export function chooseCountingDisabled(disabled: boolean): void {
  try {
    window.localStorage.setItem(CHOICE_KEY, "1");
  } catch {
    // Ignorato: vale comunque il cookie.
  }
  setCountingDisabled(disabled);
}

function send(path: "step" | "failure" | "profile-view", body: object): void {
  if (isCountingDisabled()) return;
  // `keepalive`: parte anche se la pagina cambia subito dopo (invio riuscito).
  void fetch(`${API_URL}/site/${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), keepalive: true }).catch(
    () => undefined,
  );
}

/** TELEFONO fino a 767 px, come la barra "Richiedi un preventivo"; il resto è COMPUTER (§391). */
export function deviceKind(): DeviceKind {
  return typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches ? "TELEFONO" : "COMPUTER";
}

/**
 * `origin`: PROFILE se la richiesta parte dalla pagina di un professionista;
 * allora vanno anche il pulsante da cui è partita (`source`) e il
 * dispositivo (§391).
 */
export function countRequestStep(step: RequestStepKey, categorySlug?: string | null, origin: RequestOrigin = "GENERAL", source?: ProfileRequestSource): void {
  send("step", { step, origin, ...(categorySlug ? { categorySlug } : {}), ...(origin === "PROFILE" ? { source: source ?? "ALTRO", device: deviceKind() } : {}) });
}

/** Profilo pubblico aperto, solo il dispositivo (§391). */
export function countProfileView(): void {
  send("profile-view", { device: deviceKind() });
}

/** Modulo a cui appartiene una chiamata all'API, solo per gli invii che contano. */
export function submitFormOf(method: string, path: string): SubmitFormKey | null {
  if (method.toUpperCase() !== "POST") return null;
  const clean = path.split("?")[0] ?? path;
  if (clean === "/auth/register" || clean === "/auth/google/verify") return "REGISTRAZIONE";
  if (clean === "/guided-requests" || clean === "/guided-requests/photos") return "RICHIESTA";
  if (clean === "/quotes") return "PREVENTIVO";
  if (clean.startsWith("/bookings/from-quote/")) return "ACCETTAZIONE";
  if (/^\/guided-requests\/[^/]+\/timeline$/.test(clean) || clean === "/guided-requests/timeline-photos") return "MESSAGGIO";
  return null;
}

/**
 * Tipo di errore: rete assente, errore del sito, dati rifiutati. Un accesso
 * scaduto o negato (401, 403) non è un invio fallito del modulo: non conta.
 */
export function submitFailureKindOf(status: number | null): SubmitFailureKind | null {
  if (status === null) return "RETE";
  if (status === 401 || status === 403) return null;
  if (status >= 500 || status === 429) return "SERVER";
  if (status >= 400) return "DATI";
  return null;
}

/** Da passare a `createApiClient({ onFailure })`. */
export function countSubmitFailure({ method, path, status }: { method: string; path: string; status: number | null }): void {
  const form = submitFormOf(method, path);
  const kind = submitFailureKindOf(status);
  if (form && kind) send("failure", { form, kind });
}
