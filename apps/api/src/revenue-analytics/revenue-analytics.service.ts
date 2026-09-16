import { Inject, Injectable } from "@nestjs/common";
import type { PrismaClient } from "@professionisti/database";
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
 */
@Injectable()
export class RevenueAnalyticsService {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaClient) {}

  async getSummary(): Promise<RevenueAnalyticsSummary> {
    const bookings = await this.prisma.booking.findMany({
      where: { status: "COMPLETED", clientConfirmedCompletedAt: { not: null } },
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

    const monthlySeries: RevenueMonthlyPoint[] = [];
    for (let i = TRAILING_MONTHS - 1; i >= 0; i--) {
      const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
      const key = monthKey(d);
      const bucket = byMonth.get(key);
      monthlySeries.push({
        month: key,
        label: `${MONTH_LABELS[d.getUTCMonth()]} ${d.getUTCFullYear()}`,
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
