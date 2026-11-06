/**
 * Barra di attesa in cima allo schermo (docs/changelog/2026-11-05-barra-di-attesa.md).
 * Un solo stato per tutto il sito: la accende un link interno, una ricerca o
 * l'uscita verso Stripe/Didit, la spegne `NavigationProgress` quando la
 * pagina nuova è arrivata (o al ritorno con "Indietro").
 */

export type ProgressState = {
  active: boolean;
  /** Frase sotto la barra, letta anche dal lettore di schermo. */
  label?: string;
  /** Indirizzo interno atteso: la barra si spegne quando la pagina cambia. */
  href?: string;
};

/** Frase mentre si cerca dal problema scritto: la stessa della home (luci che accelerano). */
export const PROBLEM_SEARCH_LABEL = "Cerco chi ti serve…";
/** Frase mentre si va a pagare su Stripe. */
export const PAYMENT_PAGE_LABEL = "Ti portiamo al pagamento sicuro…";
/** Frase mentre si va a Stripe (conto) o a Didit (verifica dell'identità). */
export const SECURE_PAGE_LABEL = "Ti portiamo alla pagina sicura…";

let state: ProgressState = { active: false };
const listeners = new Set<() => void>();

function emit(next: ProgressState) {
  state = next;
  listeners.forEach((listener) => listener());
}

export function subscribeProgress(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getProgress(): ProgressState {
  return state;
}

const IDLE: ProgressState = { active: false };
export function getServerProgress(): ProgressState {
  return IDLE;
}

function sameUrl(a: URL, b: URL) {
  return a.pathname === b.pathname && a.search === b.search;
}

/** Percorso e parametri scritti sempre allo stesso modo, per riconoscere la pagina arrivata. */
export function pageKey(pathname: string, search: URLSearchParams) {
  return `${pathname}?${search.toString()}`;
}

/**
 * Accende la barra per una pagina interna. Non fa nulla se l'indirizzo è
 * quello già aperto (cambia solo il #) o porta fuori dal sito.
 */
export function startNavigationProgress(href: string) {
  if (typeof window === "undefined") return;
  let target: URL;
  try {
    target = new URL(href, window.location.href);
  } catch {
    return;
  }
  if (target.origin !== window.location.origin) return;
  if (sameUrl(target, new URL(window.location.href))) return;
  const label = target.pathname === "/cerca" && target.searchParams.get("problema") ? PROBLEM_SEARCH_LABEL : undefined;
  emit({ active: true, label, href: pageKey(target.pathname, target.searchParams) });
}

/**
 * Tasto Indietro/Avanti del browser: l'indirizzo è già quello nuovo, la
 * pagina può non esserlo ancora. Se è già in memoria arriva subito e la
 * barra non compare (300 ms).
 */
export function startHistoryProgress() {
  if (typeof window === "undefined") return;
  const here = new URL(window.location.href);
  emit({ active: true, href: pageKey(here.pathname, here.searchParams) });
}

/** Accende la barra prima di lasciare il sito per Stripe o Didit. */
export function startExternalRedirectProgress(label: string = SECURE_PAGE_LABEL) {
  emit({ active: true, label });
}

export function stopProgress() {
  if (state.active) emit({ active: false });
}
