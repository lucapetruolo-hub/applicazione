import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { PrismaClient } from "@professionisti/database";
import type { ProfessionalStats, ProfessionalStatsBucket, ProfessionalStatsTotals } from "@professionisti/shared";
import { PRISMA } from "../prisma/prisma.module";

const TRAILING_MONTHS = 12;
const MONTH_LABELS = ["Gen", "Feb", "Mar", "Apr", "Mag", "Giu", "Lug", "Ago", "Set", "Ott", "Nov", "Dic"];

export interface RevenueMonthlyPoint {
  month: string; // "2026-09", chiave ordinabile per confronto/ordinamento
  label: string; // "Set 2026", mostrata in UI
  totalEurCents: number;
  jobCount: number;
}

export interface RevenueAnalyticsSummary {
  currentYearTotalEurCents: number;
  currentYearJobCount: number;
  currentMonthTotalEurCents: number;
  currentMonthJobCount: number;
  previousMonthTotalEurCents: number;
  // null quando il mese precedente non ha entrate da confrontare (0€): una
  // percentuale calcolata da zero sarebbe sempre "+infinito", mai un numero
  // onesto — il frontend mostra "Nuovo" in quel caso invece di una % finta.
  monthOverMonthChangePercent: number | null;
  allTimeTotalEurCents: number;
  allTimeJobCount: number;
  monthlySeries: RevenueMonthlyPoint[];
}

function monthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

const DAY_MS = 24 * 60 * 60 * 1000;
/** Oltre questa durata il grafico passa da giorni a mesi. */
const MAX_DAILY_SPAN_DAYS = 92;
/** Periodo massimo interrogabile in una volta (due anni). */
const MAX_SPAN_DAYS = 731;

function parseDay(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

type StatsRows = {
  views: { day: Date; count: number }[];
  requests: { createdAt: Date }[];
  quotes: { createdAt: Date }[];
  won: { createdAt: Date }[];
  completed: { updatedAt: Date; finalAmountEurCents: number | null }[];
  reviews: { rating: number }[];
};

function emptyBucket(key: string, label: string): ProfessionalStatsBucket {
  return { key, label, views: 0, requests: 0, quotes: 0, won: 0, completed: 0, revenueEurCents: 0 };
}

function totalsOf(rows: StatsRows): ProfessionalStatsTotals {
  const ratingSum = rows.reviews.reduce((sum, r) => sum + r.rating, 0);
  return {
    views: rows.views.reduce((sum, v) => sum + v.count, 0),
    requests: rows.requests.length,
    quotes: rows.quotes.length,
    won: rows.won.length,
    completed: rows.completed.length,
    revenueEurCents: rows.completed.reduce((sum, b) => sum + (b.finalAmountEurCents ?? 0), 0),
    reviews: rows.reviews.length,
    ratingAvg: rows.reviews.length > 0 ? Math.round((ratingSum / rows.reviews.length) * 10) / 10 : null,
  };
}

/**
 * Raggruppa le righe per giorno o per mese, con tutti i giorni/mesi del
 * periodo presenti anche a zero (un grafico con buchi mente sull'andamento).
 */
export function bucketStatsRows(rows: StatsRows, start: Date, endInclusive: Date, granularity: "day" | "month"): ProfessionalStatsBucket[] {
  const buckets = new Map<string, ProfessionalStatsBucket>();
  const keyOf = granularity === "day" ? dayKey : monthKey;
  if (granularity === "day") {
    for (let t = start.getTime(); t <= endInclusive.getTime(); t += DAY_MS) {
      const d = new Date(t);
      buckets.set(dayKey(d), emptyBucket(dayKey(d), `${d.getUTCDate()} ${MONTH_LABELS[d.getUTCMonth()]}`));
    }
  } else {
    for (
      let d = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
      d <= endInclusive;
      d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1))
    ) {
      buckets.set(monthKey(d), emptyBucket(monthKey(d), `${MONTH_LABELS[d.getUTCMonth()]} ${d.getUTCFullYear()}`));
    }
  }
  const add = (date: Date, field: Exclude<keyof ProfessionalStatsBucket, "key" | "label">, amount: number) => {
    const bucket = buckets.get(keyOf(date));
    if (bucket) bucket[field] += amount;
  };
  for (const v of rows.views) add(v.day, "views", v.count);
  for (const r of rows.requests) add(r.createdAt, "requests", 1);
  for (const q of rows.quotes) add(q.createdAt, "quotes", 1);
  for (const w of rows.won) add(w.createdAt, "won", 1);
  for (const c of rows.completed) {
    add(c.updatedAt, "completed", 1);
    add(c.updatedAt, "revenueEurCents", c.finalAmountEurCents ?? 0);
  }
  return Array.from(buckets.values());
}

/**
 * "Statistiche" → Revenue Analytics (richiesta esplicita dell'utente):
 * "il totale delle entrate generate dall'applicazione quando un lavoro viene
 * selezionato come completato sia dal cliente che dal professionista" — la
 * stessa condizione "doppio cieco" già stabilita in CLAUDE.md §40 per la
 * conferma del lavoro terminato, non lo stato COMPLETED da solo:
 * `Booking.status === "COMPLETED"` (azione del professionista, tramite
 * "Lavoro terminato" — imposta anche l'importo esatto in
 * `finalAmountEurCents`) **e** `clientConfirmedCompletedAt` valorizzato
 * (conferma indipendente del cliente dallo stesso identico lavoro, CLAUDE.md
 * §40). Un `Booking` può risultare `COMPLETED` anche tramite il semplice
 * cambio di stato dal calendario "Prenotazioni"
 * (`BookingsService.updateStatus`, senza mai passare dal modulo "Lavoro
 * terminato" con gli importi reali): in quel caso `finalAmountEurCents`
 * resta `null` e contribuisce 0€ — mai una stima, un dato fiscale/finanziario
 * inventato sarebbe peggio di ometterlo (stesso principio già seguito per
 * `ProfessionalMetrics`/DAC7 altrove in questo progetto).
 *
 * `updatedAt` come proxy della data di completamento (nessun campo
 * `completedAt` dedicato nello schema) — stessa convenzione già stabilita da
 * `countCompletedThisMonth` (CLAUDE.md §27, `apps/api/src/common/
 * completed-jobs.util.ts`).
 *
 * Distinta deliberatamente da `JobPaymentsService.financeSummary()`
 * (CLAUDE.md §88, `/admin/finanza`): quella traccia il ricavo REALE di
 * Manovia (la sola commissione trattenuta, `ManoviaRevenue`) e lo stato dei
 * pagamenti Stripe Connect/diretti — un concetto di piattaforma-commissione,
 * non ancora attivato in produzione (credenziali Stripe non configurate).
 * Questa pagina misura invece il valore lordo del lavoro reale svolto sulla
 * piattaforma (stile GMV), disponibile fin da subito perché non dipende da
 * alcuna integrazione di pagamento — la metrica di crescita più diretta da
 * mostrare oggi.
 *
 * **Riusata anche lato professionista** (richiesta esplicita dell'utente,
 * CLAUDE.md §103): stesso identico calcolo, scoped ai soli lavori del
 * professionista che guarda — `getSummary(professionalProfileId?)`, un
 * filtro opzionale invece di due metodi quasi identici. Nessuna
 * distinzione di dominio tra le due viste: solo "tutta la piattaforma" vs
 * "i miei lavori", stessa condizione doppio cieco, stessa formula.
 */
@Injectable()
export class RevenueAnalyticsService {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaClient) {}

  /** Risolve il profilo professionista dell'utente autenticato — stesso pattern già in uso in `ProfessionalsService.requireMyProfileId`, duplicato qui per non introdurre una dipendenza incrociata tra i due moduli per un'unica riga. */
  async resolveMyProfessionalProfileId(userId: string): Promise<string> {
    const profile = await this.prisma.professionalProfile.findUnique({ where: { userId }, select: { id: true } });
    if (!profile) {
      throw new NotFoundException("Completa prima il tuo profilo professionista.");
    }
    return profile.id;
  }

  /**
   * Statistiche del professionista sul periodo scelto (docs/CHANGELOG.md
   * §149), con il periodo precedente di pari durata per il confronto.
   * Entrate e completati seguono la stessa regola di `getSummary` (doppia
   * conferma, `updatedAt` come data di completamento); le recensioni
   * contano solo quelle pubbliche (non nascoste, con la recensione del
   * professionista già lasciata), come sul profilo.
   */
  async getProfessionalStats(professionalProfileId: string, from: string, to: string): Promise<ProfessionalStats> {
    const start = parseDay(from);
    const endInclusive = parseDay(to);
    const spanDays = Math.round((endInclusive.getTime() - start.getTime()) / DAY_MS) + 1;
    if (spanDays > MAX_SPAN_DAYS) {
      throw new BadRequestException("Puoi guardare al massimo due anni alla volta.");
    }
    const previousEndInclusive = new Date(start.getTime() - DAY_MS);
    const previousStart = new Date(start.getTime() - spanDays * DAY_MS);

    const [rows, previousRows] = await Promise.all([
      this.loadStatsRows(professionalProfileId, start, endInclusive),
      this.loadStatsRows(professionalProfileId, previousStart, previousEndInclusive),
    ]);
    const granularity = spanDays <= MAX_DAILY_SPAN_DAYS ? "day" : "month";
    return {
      from,
      to,
      granularity,
      buckets: bucketStatsRows(rows, start, endInclusive, granularity),
      totals: totalsOf(rows),
      previousFrom: dayKey(previousStart),
      previousTo: dayKey(previousEndInclusive),
      previous: totalsOf(previousRows),
    };
  }

  private async loadStatsRows(professionalProfileId: string, start: Date, endInclusive: Date): Promise<StatsRows> {
    const endExclusive = new Date(endInclusive.getTime() + DAY_MS);
    const createdIn = { gte: start, lt: endExclusive };
    const [views, requests, quotes, won, completed, reviews] = await Promise.all([
      this.prisma.profileViewDay.findMany({ where: { professionalProfileId, day: { gte: start, lte: endInclusive } }, select: { day: true, count: true } }),
      this.prisma.lead.findMany({ where: { professionalProfileId, createdAt: createdIn }, select: { createdAt: true } }),
      this.prisma.quote.findMany({ where: { professionalProfileId, createdAt: createdIn }, select: { createdAt: true } }),
      this.prisma.booking.findMany({ where: { professionalProfileId, createdAt: createdIn }, select: { createdAt: true } }),
      this.prisma.booking.findMany({
        where: { professionalProfileId, status: "COMPLETED", clientConfirmedCompletedAt: { not: null }, updatedAt: createdIn },
        select: { updatedAt: true, finalAmountEurCents: true },
      }),
      this.prisma.review.findMany({
        where: { hiddenAt: null, createdAt: createdIn, booking: { professionalProfileId, clientReview: { isNot: null } } },
        select: { rating: true },
      }),
    ]);
    return { views, requests, quotes, won, completed, reviews };
  }

  async getSummary(professionalProfileId?: string): Promise<RevenueAnalyticsSummary> {
    const bookings = await this.prisma.booking.findMany({
      where: {
        status: "COMPLETED",
        clientConfirmedCompletedAt: { not: null },
        ...(professionalProfileId ? { professionalProfileId } : {}),
      },
      select: { finalAmountEurCents: true, updatedAt: true },
    });

    const now = new Date();
    const currentYear = now.getUTCFullYear();
    const currentMonthKey = monthKey(now);
    const previousMonthDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
    const previousMonthKey = monthKey(previousMonthDate);

    let currentYearTotalEurCents = 0;
    let currentYearJobCount = 0;
    let currentMonthTotalEurCents = 0;
    let currentMonthJobCount = 0;
    let previousMonthTotalEurCents = 0;
    let allTimeTotalEurCents = 0;

    const byMonth = new Map<string, { totalEurCents: number; jobCount: number }>();

    for (const booking of bookings) {
      const amount = booking.finalAmountEurCents ?? 0;
      allTimeTotalEurCents += amount;

      const key = monthKey(booking.updatedAt);
      const bucket = byMonth.get(key) ?? { totalEurCents: 0, jobCount: 0 };
      bucket.totalEurCents += amount;
      bucket.jobCount += 1;
      byMonth.set(key, bucket);

      if (booking.updatedAt.getUTCFullYear() === currentYear) {
        currentYearTotalEurCents += amount;
        currentYearJobCount += 1;
      }
      if (key === currentMonthKey) {
        currentMonthTotalEurCents += amount;
        currentMonthJobCount += 1;
      }
      if (key === previousMonthKey) {
        previousMonthTotalEurCents += amount;
      }
    }

    const monthOverMonthChangePercent =
      previousMonthTotalEurCents > 0 ? ((currentMonthTotalEurCents - previousMonthTotalEurCents) / previousMonthTotalEurCents) * 100 : null;

    // Serie mensile per intero (zero-filled dal primo mese con almeno un
    // lavoro completato ad oggi), non più un trailing fisso a 12 mesi —
    // richiesta esplicita dell'utente: un selettore di range temporale sul
    // grafico ("3/6/12/24 mesi", "Tutto") che aggiorna davvero i dati
    // mostrati richiede che il backend non tronchi già la storia a monte.
    // Con zero lavori mai completati (professionista nuovo, o piattaforma
    // appena partita) ricade su `TRAILING_MONTHS` mesi a zero, comunque
    // sensati da mostrare invece di un grafico vuoto.
    const monthKeysWithData = Array.from(byMonth.keys()).sort();
    const earliestMonthKey = monthKeysWithData[0];
    let seriesStart: Date;
    if (earliestMonthKey) {
      const [earliestYear, earliestMonth] = earliestMonthKey.split("-").map(Number);
      seriesStart = new Date(Date.UTC(earliestYear ?? now.getUTCFullYear(), (earliestMonth ?? 1) - 1, 1));
    } else {
      seriesStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (TRAILING_MONTHS - 1), 1));
    }
    const seriesEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

    const monthlySeries: RevenueMonthlyPoint[] = [];
    for (let cursor = seriesStart; cursor <= seriesEnd; cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1))) {
      const key = monthKey(cursor);
      const bucket = byMonth.get(key);
      monthlySeries.push({
        month: key,
        label: `${MONTH_LABELS[cursor.getUTCMonth()]} ${cursor.getUTCFullYear()}`,
        totalEurCents: bucket?.totalEurCents ?? 0,
        jobCount: bucket?.jobCount ?? 0,
      });
    }

    return {
      currentYearTotalEurCents,
      currentYearJobCount,
      currentMonthTotalEurCents,
      currentMonthJobCount,
      previousMonthTotalEurCents,
      monthOverMonthChangePercent,
      allTimeTotalEurCents,
      allTimeJobCount: bookings.length,
      monthlySeries,
    };
  }
}
