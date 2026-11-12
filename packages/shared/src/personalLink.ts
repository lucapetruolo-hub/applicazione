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
    `style="display:inline-block;padding:12px 22px;border-radius:999px;background:#1E6B6E;color:#ffffff;` +
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
  /** Persone che hanno aperto il link nel periodo (una volta per scheda del browser, dal lancio). */
  opensThisPeriod: number;
  /** Colleghi iscritti dal suo invito "Porta un collega", da sempre. */
  colleaguesInvited: number;
  /** Voto medio e numero delle recensioni, per l'anteprima del bollino. */
  rating: number | null;
  reviewCount: number;
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

// ── Passaparola (docs/changelog/2026-11-09-passaparola.md) ─────────────────

/**
 * Codice dei link d'invito dei partner (commercialisti, associazioni):
 * stesso alfabeto, 7 caratteri, così non coincide mai con il link personale
 * di un professionista (6).
 */
export const INVITE_PARTNER_CODE_LENGTH = 7;
const PARTNER_CODE_PATTERN = new RegExp(`^[${PERSONAL_LINK_ALPHABET}]{${INVITE_PARTNER_CODE_LENGTH}}$`);

export function isInvitePartnerCode(value: string): boolean {
  return PARTNER_CODE_PATTERN.test(value);
}

/** Codice d'invito valido: di un professionista ("Porta un collega") o di un partner. */
export function isInviteCode(value: string): boolean {
  return isPersonalLinkCode(value) || isInvitePartnerCode(value);
}

/** Parametro dell'indirizzo con il codice d'invito: `/per-professionisti?invito=k7m2qa`. */
export const INVITE_PARAM = "invito";

/** Pagina a cui porta un invito: la presentazione per i professionisti. */
export function inviteLinkPath(code: string): string {
  return `/per-professionisti?${INVITE_PARAM}=${code}`;
}

/** Chi ha mandato l'invito, mostrato a chi lo apre (`GET /professionals/invite/:code`). */
export type InviteSender = { kind: "PROFESSIONAL" | "PARTNER"; name: string };

/**
 * Messaggio già pronto di "Porta un collega". Nessun premio e nessuna
 * promessa sull'offerta del momento (decisione di Luca del 09/11/2026: ci
 * sono già i mesi gratis, detti sulla pagina).
 */
export function colleagueInviteMessage(input: { businessName: string; siteName: string; url: string }): string {
  return `Ciao, sono ${input.businessName}. Per preventivi, agenda e promemoria ai clienti uso ${input.siteName}, mi trovo bene. Se ti interessa, da qui vedi come funziona e ti iscrivi: ${input.url}`;
}

/** Bollino con le stelle per il sito del professionista: immagine del nostro sito, sotto il suo link. */
export function personalLinkBadgePath(code: string, theme: PersonalLinkBadgeTheme = "light"): string {
  return theme === "dark" ? `/p/${code}/bollino.svg?tema=scuro` : `/p/${code}/bollino.svg`;
}

/** Chiaro per i siti a sfondo chiaro, scuro per quelli a sfondo scuro. */
export type PersonalLinkBadgeTheme = "light" | "dark";

/** Il tema dall'indirizzo del bollino (`?tema=scuro`): ogni altro valore è chiaro. */
export function personalLinkBadgeTheme(value: string | null | undefined): PersonalLinkBadgeTheme {
  return value === "scuro" ? "dark" : "light";
}

const BADGE_COLORS: Record<PersonalLinkBadgeTheme, { background: string; border: string; text: string; muted: string; emptyStar: string; star: string }> = {
  light: { background: "#FFFFFF", border: "#1E6B6E", text: "#1B1A18", muted: "#5E5A54", emptyStar: "#E7E0D7", star: "#E0A100" },
  dark: { background: "#1F1A17", border: "#76BCBC", text: "#FFFFFF", muted: "#D9CFC4", emptyStar: "#4A403A", star: "#F5B820" },
};

const BADGE_WIDTH = 220;
const BADGE_HEIGHT = 64;

function escapeXml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c]!);
}

function starPath(cx: number, cy: number, r: number): string {
  const points: string[] = [];
  for (let i = 0; i < 10; i += 1) {
    const radius = i % 2 === 0 ? r : r * 0.45;
    const angle = (Math.PI / 5) * i - Math.PI / 2;
    points.push(`${(cx + radius * Math.cos(angle)).toFixed(2)},${(cy + radius * Math.sin(angle)).toFixed(2)}`);
  }
  return `M${points.join("L")}Z`;
}

/** Testo del bollino, anche per l'attributo alt dell'immagine. */
export function personalLinkBadgeLabel(input: { rating: number | null; reviewCount: number; siteName: string }): string {
  if (input.rating === null || input.reviewCount === 0) return `Chiedi un preventivo su ${input.siteName}`;
  const rating = input.rating.toFixed(1).replace(".", ",");
  return `${rating} su 5, ${input.reviewCount} ${input.reviewCount === 1 ? "recensione" : "recensioni"} su ${input.siteName}`;
}

/**
 * Bollino in SVG: voto medio su tutte le recensioni (mai una selezione) e
 * numero delle recensioni, o "Chiedi un preventivo" se non ce ne sono
 * ancora. Colori del marchio, testo di sistema: nessun font da scaricare.
 */
export function personalLinkBadgeSvg(input: { rating: number | null; reviewCount: number; siteName: string; theme?: PersonalLinkBadgeTheme }): string {
  const c = BADGE_COLORS[input.theme ?? "light"];
  const site = escapeXml(input.siteName);
  const label = escapeXml(personalLinkBadgeLabel(input));
  const font = "system-ui,-apple-system,'Segoe UI',Roboto,sans-serif";
  const hasReviews = input.rating !== null && input.reviewCount > 0;
  let body: string;
  if (hasReviews) {
    const rating = input.rating as number;
    const stars: string[] = [];
    for (let i = 0; i < 5; i += 1) {
      const fill = Math.max(0, Math.min(1, rating - i));
      const cx = 22 + i * 19;
      const id = `s${i}`;
      stars.push(
        `<clipPath id="${id}"><rect x="${cx - 9}" y="12" width="${(18 * fill).toFixed(2)}" height="18"/></clipPath>` +
          `<path d="${starPath(cx, 21, 8.5)}" fill="${c.emptyStar}"/>` +
          `<path d="${starPath(cx, 21, 8.5)}" fill="${c.star}" clip-path="url(#${id})"/>`,
      );
    }
    const ratingText = rating.toFixed(1).replace(".", ",");
    const count = `${input.reviewCount} ${input.reviewCount === 1 ? "recensione" : "recensioni"}`;
    body =
      stars.join("") +
      `<text x="116" y="27" font-family="${font}" font-size="16" font-weight="700" fill="${c.text}">${ratingText}</text>` +
      `<text x="14" y="50" font-family="${font}" font-size="12" fill="${c.muted}">${escapeXml(count)} su ${site}</text>`;
  } else {
    body =
      `<text x="14" y="28" font-family="${font}" font-size="15" font-weight="700" fill="${c.text}">Chiedi un preventivo</text>` +
      `<text x="14" y="49" font-family="${font}" font-size="12" fill="${c.muted}">su ${site}</text>`;
  }
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${BADGE_WIDTH}" height="${BADGE_HEIGHT}" viewBox="0 0 ${BADGE_WIDTH} ${BADGE_HEIGHT}" role="img" aria-label="${label}">` +
    `<title>${label}</title>` +
    `<rect x="0.5" y="0.5" width="${BADGE_WIDTH - 1}" height="${BADGE_HEIGHT - 1}" rx="10" fill="${c.background}" stroke="${c.border}"/>` +
    body +
    `</svg>`
  );
}

/** Codice del bollino da incollare: l'immagine dentro un link, nessuno script. */
export function personalLinkBadgeHtml(url: string, badgeUrl: string, alt: string): string {
  const esc = (v: string) => v.replace(/[&"<>]/g, (c) => ({ "&": "&amp;", '"': "&quot;", "<": "&lt;", ">": "&gt;" })[c]!);
  return `<a href="${esc(url)}" target="_blank" rel="noopener"><img src="${esc(badgeUrl)}" alt="${esc(alt)}" width="${BADGE_WIDTH}" height="${BADGE_HEIGHT}" style="border:0"></a>`;
}

/** Riga di Admin → Andamento, "Link dei partner". */
export type AdminInvitePartner = {
  id: string;
  name: string;
  code: string;
  createdAt: string;
  /** Professionisti iscritti dal suo link (account di prova esclusi). */
  signups: number;
};
