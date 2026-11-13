import { formatEurCents } from "./professionals";
import { wallClockNow } from "./appointmentTime";

/**
 * Preavviso per annullare scelto dal professionista (docs/CHANGELOG.md §347,
 * decisione dell'utente): 24 ore, 48 ore o 3 giorni. Si copia sul lavoro
 * quando il cliente accetta, così cambiarlo dopo non tocca i lavori già
 * prenotati. Oggi è un'indicazione: il cliente può annullare fino all'inizio
 * dell'appuntamento, e un annullamento dentro il preavviso resta segnato.
 * Cosa succede all'acconto in quel caso lo decide il parere dell'avvocato.
 */
export const CANCELLATION_NOTICE_OPTIONS = [24, 48, 72] as const;
export type CancellationNoticeHours = (typeof CANCELLATION_NOTICE_OPTIONS)[number];
export const DEFAULT_CANCELLATION_NOTICE_HOURS: CancellationNoticeHours = 24;

export function isCancellationNoticeHours(value: unknown): value is CancellationNoticeHours {
  return CANCELLATION_NOTICE_OPTIONS.includes(value as CancellationNoticeHours);
}

/** "24 ore", "48 ore", "3 giorni". */
export function cancellationNoticeLabel(hours: number | null | undefined): string {
  const h = hours ?? DEFAULT_CANCELLATION_NOTICE_HOURS;
  return h % 24 === 0 && h > 48 ? `${h / 24} giorni` : `${h} ore`;
}

/** Vero se l'annullamento cade dentro il preavviso (orari "di parete" italiani, come scheduledAt). */
export function isLateCancellation(scheduledAt: Date | string, hours: number | null | undefined, now: Date = new Date()): boolean {
  return wallClockNow(now).getTime() > freeCancellationDeadline(scheduledAt, hours).getTime();
}

/**
 * Fino a quando si annulla senza perdere l'acconto, detto con giorno e ora
 * ("lunedì 9 novembre alle 08:00") invece che "24 ore prima": la scadenza
 * esatta non va calcolata dal cliente (decisione di Luca dell'11/11,
 * docs/changelog/2026-11-11-rosso-solo-errori.md). Orari "di parete"
 * italiani, come scheduledAt: si formatta in UTC.
 */
export function freeCancellationUntilLabel(scheduledAt: Date | string, hours: number | null | undefined): string {
  const until = freeCancellationDeadline(scheduledAt, hours);
  const day = until.toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
  const time = until.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" });
  return `${day} alle ${time}`;
}

/**
 * Fine dell'annullamento gratuito: l'inizio meno il preavviso, in orario "di
 * parete" italiano come scheduledAt. Una sola fonte per frasi, promemoria e
 * controlli (docs/changelog/2026-11-13-annullare-una-fonte.md).
 */
export function freeCancellationDeadline(scheduledAt: Date | string, hours: number | null | undefined): Date {
  return new Date(new Date(scheduledAt).getTime() - (hours ?? DEFAULT_CANCELLATION_NOTICE_HOURS) * 60 * 60_000);
}

/**
 * In che momento siamo rispetto all'appuntamento, per annullare
 * (tabella dei casi, analisi/annullamento-acconto/tabella-casi.md):
 * - `free`: prima del preavviso, si annulla gratis;
 * - `late`: dentro il preavviso, si annulla ancora ma resta segnato;
 * - `started`: fascia iniziata, si può ancora accettare (decisione dell'11/11,
 *   docs/changelog/2026-11-11-fascia-in-corso.md) ma non più annullare (§346);
 * - `over`: fascia finita.
 */
export type CancellationPhase = "free" | "late" | "started" | "over";

export function cancellationPhase(
  start: Date | string,
  end: Date | string | null | undefined,
  hours: number | null | undefined,
  now: Date = new Date(),
): CancellationPhase {
  const wall = wallClockNow(now).getTime();
  const startMs = new Date(start).getTime();
  const endMs = end ? Math.max(new Date(end).getTime(), startMs) : startMs;
  // Senza fine nota (o fine uguale all'inizio) vale l'inizio, come appointmentStillAhead.
  if (wall >= endMs) return "over";
  if (wall >= startMs) return "started";
  return wall > freeCancellationDeadline(start, hours).getTime() ? "late" : "free";
}

/**
 * Cosa succede ai soldi pagati online se si annulla tardi:
 * - `none`: niente pagato online (pagamento diretto o online non offerto);
 * - `kept`: l'acconto resta al professionista (`full`: si è pagato tutto);
 * - `refunded`: l'acconto torna sempre.
 * `eurCents` è l'importo, se si conosce.
 */
export type CancellationMoney = { kind: "none" } | { kind: "kept"; eurCents?: number | null; full?: boolean } | { kind: "refunded"; eurCents?: number | null; full?: boolean };

/** `plain` testo normale, `muted` grigio, `warning` ocra scuro (decisioni di Luca dell'11/11). */
export type CancellationTone = "plain" | "muted" | "warning";
export type CancellationLine = { text: string; tone: CancellationTone };

export type CancellationTermsInput = {
  phase: CancellationPhase;
  start: Date | string;
  hours: number | null | undefined;
  money: CancellationMoney;
  /** `offer`: preventivo non ancora accettato; `booked`: lavoro fissato. */
  stage: "offer" | "booked";
  audience: "client" | "professional";
  /** Il pagamento online è uno dei modi offerti: le frasi sui soldi iniziano con "Pagando online". */
  onlineIsOption?: boolean;
  /** Importi già formattati altrove (es. con spazi normali): di serie formatEurCents. */
  formatAmount?: (eurCents: number) => string;
};

export type CancellationTerms = {
  /** Quanto preavviso o in che momento siamo. */
  notice: CancellationLine | null;
  /** Cosa succede ai soldi pagati online. */
  money: CancellationLine | null;
};

function depositPhrase(money: Exclude<CancellationMoney, { kind: "none" }>, format: (eurCents: number) => string, short: boolean, stage: "offer" | "booked" = "booked"): string {
  const amount = money.eurCents && money.eurCents > 0 ? format(money.eurCents) : null;
  // Prima di accettare "quello che paghi", dopo "quello che hai pagato".
  const paid = stage === "offer" ? "quello che paghi online" : "quello che hai pagato online";
  // Senza importo (es. scheda con più modi di pagamento) si dice solo "l'acconto".
  void short;
  if (!amount) return money.full ? paid : "l'acconto";
  return money.full ? `${paid} (${amount})` : `l'acconto di ${amount}`;
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * Le frasi su annullamento e acconto, in ogni punto del sito, delle email e
 * dei PDF: una sola fonte, così non dicono più cose diverse (tabella dei casi,
 * analisi/annullamento-acconto/tabella-casi.md; parole e colori decisi da
 * Luca l'11/11, docs/changelog/2026-11-11-rosso-solo-errori.md).
 */
export function cancellationTerms(input: CancellationTermsInput): CancellationTerms {
  const { phase, start, hours, money, stage, audience } = input;
  const format = input.formatAmount ?? formatEurCents;
  const notice = cancellationNoticeLabel(hours);
  const until = freeCancellationUntilLabel(start, hours);
  const prefix = input.onlineIsOption ? "Pagando online, " : "";

  if (phase === "over") return { notice: null, money: null };

  if (audience === "professional") {
    if (stage !== "booked") return { notice: { text: `Preavviso per annullare: ${notice}.`, tone: "muted" }, money: null };
    if (phase === "started") return { notice: null, money: null };
    if (phase === "late") {
      return {
        notice: null,
        money:
          money.kind === "kept"
            ? { text: `Il preavviso è iniziato: se il cliente annulla ora, ${depositPhrase(money, format, false).replace("quello che hai pagato online", "quello che ha pagato online")} resta a te.`, tone: "muted" }
            : null,
      };
    }
    return {
      notice: null,
      money:
        money.kind === "kept"
          ? { text: `Il cliente può annullare gratis fino a ${until}. Dopo, l'acconto resta a te.`, tone: "muted" }
          : { text: `Se annulla, il cliente deve avvisarti entro ${until}.`, tone: "muted" },
    };
  }

  // Cliente.
  if (phase === "started") {
    return {
      notice: {
        text: stage === "offer" ? "L'appuntamento è già iniziato: dopo aver accettato non si può più annullare." : "L'appuntamento è già iniziato: non si può più annullare.",
        tone: "muted",
      },
      money: null,
    };
  }

  if (phase === "late") {
    const noticeLine: CancellationLine = { text: `Mancano meno di ${notice} all'appuntamento.`, tone: stage === "offer" ? "plain" : "muted" };
    if (money.kind === "kept") {
      const what = depositPhrase(money, format, !!input.onlineIsOption, stage);
      return { notice: noticeLine, money: { text: `${prefix}${input.onlineIsOption ? what : capitalize(what)} non è rimborsabile, anche se annulli.`, tone: "warning" } };
    }
    if (money.kind === "refunded") {
      const what = depositPhrase(money, format, !!input.onlineIsOption, stage);
      return {
        notice: noticeLine,
        money: {
          text:
            stage === "offer"
              ? `${input.onlineIsOption ? "Pagando online, se" : "Se"} annulli, ${what} ti torna sulla carta.`
              : `Se annulli, ${what} ti torna sulla carta, ma il professionista vede che hai annullato all'ultimo.`,
          tone: "muted",
        },
      };
    }
    return {
      notice: noticeLine,
      money: stage === "booked" ? { text: "Se annulli non paghi niente, ma il professionista vede che hai annullato all'ultimo.", tone: "muted" } : null,
    };
  }

  // Prima del preavviso.
  const noticeLine: CancellationLine = {
    text: stage === "offer" ? `Avvisa almeno ${notice} prima.` : `Se devi annullare, avvisa almeno ${notice} prima.`,
    tone: stage === "offer" ? "plain" : "muted",
  };
  if (money.kind === "kept") {
    const what = depositPhrase(money, format, !!input.onlineIsOption, stage);
    return {
      // A lavoro fissato la data esatta basta, "avvisa almeno 24 ore prima" la ripeterebbe.
      notice: stage === "booked" ? null : noticeLine,
      money: { text: `${input.onlineIsOption ? "Pagando online: annullamento" : "Annullamento"} gratuito fino a ${until}. Dopo, ${what} non è rimborsabile.`, tone: "warning" },
    };
  }
  if (money.kind === "refunded") {
    const what = depositPhrase(money, format, !!input.onlineIsOption, stage);
    return {
      notice: noticeLine,
      money: { text: `${input.onlineIsOption ? "Pagando online, se" : "Se"} annulli prima dell'appuntamento, ${what} ti torna sempre sulla carta.`, tone: "muted" },
    };
  }
  return { notice: noticeLine, money: null };
}

/** Le due righe in una, per email, PDF e righe singole. */
export function cancellationTermsText(terms: CancellationTerms): string | null {
  const parts = [terms.notice?.text, terms.money?.text].filter((part): part is string => !!part);
  return parts.length ? parts.join(" ") : null;
}

/**
 * I soldi in gioco annullando un lavoro fissato: quanto è stato pagato online
 * e non ancora rimborsato, e se resta al professionista (§348). `totalMaxEurCents`
 * dice se si è pagato tutto (acconto al 100%).
 */
export function bookingCancellationMoney(
  payment: { method: "ONLINE" | "DIRECT"; paidEurCents: number; refundedEurCents: number } | null | undefined,
  lateCancelKeepsDeposit: boolean,
  totalMaxEurCents?: number,
): CancellationMoney {
  if (!payment || payment.method !== "ONLINE") return { kind: "none" };
  const paid = Math.max(0, payment.paidEurCents - payment.refundedEurCents);
  if (paid <= 0) return { kind: "none" };
  const full = totalMaxEurCents !== undefined && totalMaxEurCents > 0 && paid >= totalMaxEurCents;
  return { kind: lateCancelKeepsDeposit ? "kept" : "refunded", eurCents: paid, full };
}

/**
 * Prima di spostare un appuntamento già fissato (accettare la nuova data o
 * proporne una): cosa cambia per annullare con la data nuova
 * (docs/changelog/2026-11-13-annullare-spostamento.md). Con l'acconto
 * trattenuto e la data dentro il preavviso, l'acconto non sarà più
 * rimborsabile: si dice prima, in ocra scuro. null se non cambia niente da dire.
 */
export function rescheduleCancellationLine(input: {
  start: Date | string;
  end?: Date | string | null;
  hours: number | null | undefined;
  money: CancellationMoney;
  /** Chi sta scegliendo: il cliente accetta o propone, il professionista accetta la data del cliente. */
  audience: "client" | "professional";
  now?: Date;
  formatAmount?: (eurCents: number) => string;
}): CancellationLine | null {
  const format = input.formatAmount ?? formatEurCents;
  const phase = cancellationPhase(input.start, input.end, input.hours, input.now);
  if (phase === "over") return null;
  const notice = cancellationNoticeLabel(input.hours);
  const kept = input.money.kind === "kept" ? input.money : null;
  const what = kept ? depositPhrase(kept, format, false, "booked") : null;
  if (phase === "free") {
    if (!kept) return null;
    return input.audience === "client"
      ? { text: `Con questa data puoi annullare gratis fino a ${freeCancellationUntilLabel(input.start, input.hours)}.`, tone: "muted" }
      : { text: `Con questa data il cliente può annullare gratis fino a ${freeCancellationUntilLabel(input.start, input.hours)}.`, tone: "muted" };
  }
  // Dentro il preavviso o già iniziata.
  if (input.audience === "professional") {
    return kept
      ? { text: `Con questa data il preavviso è già iniziato: se il cliente annulla, ${what?.replace("quello che hai pagato online", "quello che ha pagato online")} resta a te.`, tone: "muted" }
      : { text: `Con questa data mancano meno di ${notice} all'appuntamento.`, tone: "muted" };
  }
  if (kept) return { text: `Con questa data mancano meno di ${notice}: ${what} non sarà più rimborsabile, anche se annulli.`, tone: "warning" };
  return { text: `Con questa data mancano meno di ${notice} all'appuntamento.`, tone: "muted" };
}
