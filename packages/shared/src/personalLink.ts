/**
 * Canale del professionista (docs/changelog/2026-11-08-canale-del-professionista.md,
 * decisione di Luca del 26/10/2026 fatta l'8/11): un link personale corto,
 * `/p/<codice>`, che il professionista manda ai suoi clienti o mette su
 * WhatsApp, scheda Google, biglietti e furgone. Le richieste partite da lì
 * sono "clienti suoi": il lavoro non conta nei lavori del mese e la casella
 * "se non risponde, inoltra ad altri" parte spenta.
 */

/** Lettere e cifre senza quelle che si confondono a voce o stampate (0/o, 1/l/i). */
export const PERSONAL_LINK_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";
export const PERSONAL_LINK_CODE_LENGTH = 6;

const CODE_PATTERN = new RegExp(`^[${PERSONAL_LINK_ALPHABET}]{${PERSONAL_LINK_CODE_LENGTH}}$`);

export function isPersonalLinkCode(value: string): boolean {
  return CODE_PATTERN.test(value);
}

/** Percorso del link personale: "/p/k7m2qa". */
export function personalLinkPath(code: string): string {
  return `/p/${code}`;
}

/**
 * Parametro che il link personale aggiunge all'indirizzo del profilo: la
 * pagina lo ricorda nella scheda del browser (sessionStorage, solo tecnico,
 * nessun consenso) e il modulo della richiesta lo manda al server.
 */
export const PERSONAL_LINK_PARAM = "link";

/** Chiave di sessionStorage per il profilo aperto dal link personale. */
export function personalLinkStorageKey(professionalProfileId: string): string {
  return `link-personale:${professionalProfileId}`;
}

/** Messaggio già pronto di "Invita un tuo cliente", che il professionista può cambiare. */
export function personalInviteMessage(input: { clientName?: string | null; businessName: string; siteName: string; url: string }): string {
  const name = input.clientName?.trim();
  const hello = name ? `Ciao ${name},` : "Ciao,";
  return `${hello} sono ${input.businessName}. Per preventivi e appuntamenti adesso uso ${input.siteName}: da qui mi scrivi, scegli l'orario e ricevi il promemoria. ${input.url}`;
}

/**
 * Codice da incollare sul sito del professionista: un pulsante "Chiedi un
 * preventivo" che porta al suo link personale. Solo un link con lo stile
 * scritto dentro: nessuno script, nessun cookie, funziona in ogni programma
 * per fare siti. Verde pieno del marchio con testo bianco (contrasto AA).
 */
export function personalLinkButtonHtml(url: string): string {
  const safeUrl = url.replace(/[&"<>]/g, (c) => ({ "&": "&amp;", '"': "&quot;", "<": "&lt;", ">": "&gt;" })[c]!);
  return (
    `<a href="${safeUrl}" target="_blank" rel="noopener" ` +
    `style="display:inline-block;padding:12px 22px;border-radius:999px;background:#128552;color:#ffffff;` +
    `font:600 16px/1.2 system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;text-decoration:none">Chiedi un preventivo</a>`
  );
}

/**
 * Invito "Hai altri clienti?" dopo "Lavoro terminato": al massimo una volta
 * ogni 30 giorni, mai a ogni lavoro (decisione di Luca del 09/11/2026).
 */
export const PERSONAL_LINK_NUDGE_EVERY_DAYS = 30;

export function personalLinkNudgeDue(lastShownAtMs: number | null, nowMs: number): boolean {
  if (lastShownAtMs === null || !Number.isFinite(lastShownAtMs) || lastShownAtMs > nowMs) return true;
  return nowMs - lastShownAtMs >= PERSONAL_LINK_NUDGE_EVERY_DAYS * 24 * 60 * 60 * 1000;
}

/** Dati della pagina "Il tuo link" (`GET /professionals/me/personal-link`). */
export type MyPersonalLink = {
  code: string;
  /** "/p/k7m2qa": il sito ci mette davanti il suo indirizzo. */
  path: string;
  /** Codice QR del link completo, come SVG pronto da mostrare o scaricare. */
  qrSvg: string;
  businessName: string;
  /** Richieste arrivate dal link nel periodo dei lavori in corso. */
  requestsThisPeriod: number;
  /** Lavori presi da clienti del link nel periodo: non contano nel limite. */
  jobsThisPeriod: number;
};

/**
 * La richiesta è di un cliente arrivato dal link personale di questo
 * professionista: non conta nei suoi lavori e gli si può rispondere anche
 * con i lavori esauriti. Per un altro professionista (richiesta inoltrata) è
 * una richiesta come le altre.
 */
export function ownClientRequest(request: { fromProfessionalLink: boolean; professionalProfileId: string | null }, professionalProfileId: string): boolean {
  return request.fromProfessionalLink && request.professionalProfileId === professionalProfileId;
}
