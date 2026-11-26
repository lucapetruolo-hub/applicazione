/**
 * Admin → Numeri → Conti del mese (decisione di Luca del 25/11/2026,
 * docs/changelog/2026-11-25-conti-del-mese.md): abbonati paganti, prezzo
 * medio, quanti restano dopo i mesi gratis e utile stimato del mese, presi
 * dal database, con il traguardo dei 12.000 € di utile all'anno
 * (analisi/punto-di-pareggio-12000-versione-profonda.md).
 *
 * Solo tipi e calcoli puri: lo schema zod per salvare i costi sta in
 * `monthlyAccountsSchemas.ts`.
 */

/** Traguardo di utile all'anno prima delle tasse (richiesta di Luca del 25/11/2026). */
export const PROFIT_TARGET_YEAR_EUR_CENTS = 1_200_000;

/**
 * Margine al mese per abbonato pagante della stima del 25/11/2026 (scenario
 * medio): si usa finché il sito non ha un mese con abbonati e ricavi veri.
 */
export const ESTIMATED_MARGIN_PER_PAYING_EUR_CENTS = 4_233;

/** Tetto alle voci dei costi fissi, per tenere la pagina leggibile. */
export const MONTHLY_COST_LINES_MAX = 30;

export type MonthlyCostLine = { label: string; monthlyEurCents: number };

export type MonthlyAccountsSubscriberRow = {
  userId: string;
  businessName: string;
  city: string | null;
  phone: string | null;
  tier: "BASE" | "PLUS" | "PRO";
  /** Nei mesi gratis con la carta. */
  free: boolean;
  requests: number;
};

/**
 * Le voci della stima del 25/11/2026 (scenario medio, 10.878 € l'anno),
 * proposte con un clic quando l'elenco è vuoto. Da correggere con le
 * fatture vere.
 */
export const ESTIMATED_MONTHLY_COSTS: MonthlyCostLine[] = [
  { label: "Server del sito e del database", monthlyEurCents: 6_000 },
  { label: "Altri servizi (email, IA, controlli fiscali, mappe, copie di riserva)", monthlyEurCents: 8_400 },
  { label: "Commercialista", monthlyEurCents: 25_000 },
  { label: "Spese della società (Camera di commercio, PEC, banca, bilancio)", monthlyEurCents: 5_833 },
  { label: "Polizza", monthlyEurCents: 7_500 },
  { label: "Avvocato", monthlyEurCents: 8_333 },
  { label: "Dominio e marchio", monthlyEurCents: 1_250 },
  { label: "Notaio della costituzione (in 5 anni)", monthlyEurCents: 3_333 },
  { label: "Pubblicità per i clienti", monthlyEurCents: 25_000 },
];

export type AdminMonthlyAccounts = {
  /** Mese mostrato, "AAAA-MM". */
  month: string;
  /** Mesi che si possono scegliere, dal più recente (mai prima del lancio). */
  months: string[];
  /** Prima del lancio i numeri comprendono le prove (account di prova sempre esclusi). */
  launched: boolean;
  /** Fotografia di oggi, non del mese scelto. */
  today: {
    paying: number;
    byTier: { tier: "BASE" | "PLUS" | "PRO"; count: number }[];
    /** Nei mesi gratis con la carta data. */
    inFreeMonths: number;
    /** Prezzo medio al mese degli abbonati paganti (annuale diviso 12), IVA esclusa. */
    averagePriceEurCents: number;
    /** Somma dei prezzi al mese degli abbonati paganti, IVA esclusa. */
    monthlyRecurringEurCents: number;
    /** Hanno finito i mesi gratis con la carta data (dal lancio). */
    freeMonthsEnded: number;
    /** Di questi, pagano ancora. */
    stayedAfterFreeMonths: number;
  };
  /** Abbonamenti chiusi nel mese scelto. */
  canceledInMonth: number;
  /**
   * Richieste arrivate nel mese agli abbonati di oggi (paganti e nei mesi
   * gratis): chi non ne riceve è il primo che se ne va (decisione di Luca del 26/11).
   */
  requests: {
    subscribers: number;
    total: number;
    /** Abbonati senza nessuna richiesta nel mese. */
    withoutRequests: number;
    /** Gli abbonati uno per uno, prima chi ne ha ricevute meno (si apre con un clic). */
    list: MonthlyAccountsSubscriberRow[];
  };
  revenue: {
    subscriptionsEurCents: number;
    visibilityEurCents: number;
    jobFeesEurCents: number;
    totalEurCents: number;
  };
  variableCosts: {
    /** Carta dei pagamenti online, registrata a ogni incasso. */
    jobCardEurCents: number;
    /** Stripe Connect: 2 € per professionista pagato nel mese, più i bonifici (stima). */
    connectEurCents: number;
    /** Stripe sugli abbonamenti e sui pacchetti (stima dal listino). */
    subscriptionStripeEurCents: number;
    /** Fatture elettroniche emesse nel mese (stima a fattura). */
    invoicesEurCents: number;
    /** WhatsApp, dal costo registrato di ogni messaggio. */
    whatsappEurCents: number;
    totalEurCents: number;
  };
  fixedCosts: { lines: MonthlyCostLine[]; totalEurCents: number };
  profitEurCents: number;
  target: {
    yearEurCents: number;
    /** true = traguardo scritto dall'admin, false = quello di partenza (12.000 €). */
    custom: boolean;
    /** Margine al mese per abbonato pagante usato nel calcolo. */
    marginPerPayingEurCents: number;
    /** true = margine della stima del 25/11, il mese non ha ancora dati sufficienti. */
    marginEstimated: boolean;
    /** Abbonati paganti che servono, tenuti tutto l'anno; null se il margine non è positivo. */
    payingNeeded: number | null;
  };
};

/**
 * Abbonati paganti che servono per il traguardo: i costi fissi dell'anno più
 * l'utile voluto, divisi per il margine di un abbonato in un anno.
 */
export function payingNeededFor(targetYearEurCents: number, fixedMonthlyEurCents: number, marginPerPayingEurCents: number): number | null {
  if (marginPerPayingEurCents <= 0) return null;
  return Math.ceil((targetYearEurCents + fixedMonthlyEurCents * 12) / (marginPerPayingEurCents * 12));
}

/**
 * Margine al mese per abbonato: ricavi meno costi variabili del mese, diviso
 * per gli abbonati paganti. Senza abbonati o senza ricavi si usa la stima.
 */
export function marginPerPaying(input: { paying: number; revenueEurCents: number; variableCostsEurCents: number }): { eurCents: number; estimated: boolean } {
  if (input.paying <= 0 || input.revenueEurCents <= 0) return { eurCents: ESTIMATED_MARGIN_PER_PAYING_EUR_CENTS, estimated: true };
  return { eurCents: Math.round((input.revenueEurCents - input.variableCostsEurCents) / input.paying), estimated: false };
}

/** "2026-11" → "novembre 2026". */
export function monthLabelIt(month: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (!match) return month;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 15));
  return date.toLocaleDateString("it-IT", { month: "long", year: "numeric", timeZone: "UTC" });
}

/**
 * Sotto questi abbonati con i mesi gratis finiti la percentuale di chi resta
 * cambia troppo da un professionista all'altro per fidarsi: prima di spendere
 * in pubblicità si aspettano almeno 20 professionisti (decisione di Luca del 26/11).
 */
export const STAYED_RELIABLE_FROM = 20;
