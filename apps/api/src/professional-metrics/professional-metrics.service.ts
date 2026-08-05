import { Inject, Injectable } from "@nestjs/common";
import type { PrismaClient } from "@professionisti/database";
import { PRISMA } from "../prisma/prisma.module";

// Sotto questo numero di lavori completati il punteggio resta null —
// troppo pochi dati per essere affidabile (richiesta esplicita
// dell'utente).
const MIN_COMPLETED_JOBS_FOR_SCORE = 3;

// Oltre questo tempo medio di risposta (minuti) il tasso di risposta
// normalizzato scende a 0 — richiesta esplicita dell'utente.
const RESPONSE_TIME_CEILING_MINUTES = 120;

type ScoreInputs = {
  completedJobs: number;
  acceptedJobs: number;
  avgRating: number | null;
  avgResponseTimeMinutes: number | null;
  honoredAppointments: number;
  totalAppointments: number;
};

/**
 * Punteggio di affidabilità (CLAUDE.md §15, STEP 3) — funzione pura,
 * separata dal service per poterla testare/riusare senza un DB davanti.
 * Formula e pesi esatti richiesti dall'utente. Non calcola nulla se
 * `completedJobs` è sotto la soglia minima.
 */
export function calculateReliabilityScore(m: ScoreInputs): number | null {
  if (m.completedJobs < MIN_COMPLETED_JOBS_FOR_SCORE) return null;

  const completionRate = m.acceptedJobs > 0 ? m.completedJobs / m.acceptedJobs : 0;
  const responseRateNormalized =
    m.avgResponseTimeMinutes === null ? 0 : Math.max(0, Math.min(1, 1 - m.avgResponseTimeMinutes / RESPONSE_TIME_CEILING_MINUTES));
  const punctualityRate = m.totalAppointments > 0 ? m.honoredAppointments / m.totalAppointments : 0;
  const ratingComponent = (m.avgRating ?? 0) / 5;

  const score = completionRate * 0.3 + ratingComponent * 0.3 + responseRateNormalized * 0.2 + punctualityRate * 0.2;
  return Math.round(score * 1000) / 1000;
}

/**
 * Aggiorna le metriche di affidabilità di un professionista sui 7 eventi
 * richiesti esplicitamente dall'utente — ogni metodo fa upsert (la riga
 * non esiste finché non succede il primo evento, non alla creazione del
 * profilo) e ricalcola reliabilityScore alla fine, come richiesto
 * ("esegui questa funzione ogni volta che uno dei campi sopra viene
 * aggiornato"). Nessun trigger/middleware Prisma: richiamato esplicitamente
 * dai service che eseguono l'azione corrispondente (guided-requests,
 * quotes, bookings, reviews, auth, professionals), stessa convenzione già
 * in uso in tutto il progetto.
 */
@Injectable()
export class ProfessionalMetricsService {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaClient) {}

  /** Evento 1: una richiesta guidata genera un Lead per questo professionista (fan-out iniziale, espansione, o coinvolgimento a posteriori). */
  async recordRequestReceived(professionalProfileId: string): Promise<void> {
    await this.prisma.professionalMetrics.upsert({
      where: { professionalProfileId },
      create: { professionalProfileId, totalRequestsReceived: 1, lastActivityAt: new Date() },
      update: { totalRequestsReceived: { increment: 1 }, lastActivityAt: new Date() },
    });
    await this.refreshScore(professionalProfileId);
  }

  /**
   * Evento 2: prima risposta del professionista a un Lead (primo
   * preventivo inviato per quel Lead, non le modifiche successive).
   * `responseMinutes` = minuti trascorsi da quando il professionista ha
   * ricevuto QUEL Lead (Lead.createdAt) a ora, non dalla creazione della
   * GuidedRequest originale (che può essere più vecchia se il Lead è nato
   * da un'espansione, CLAUDE.md §14) — misura la reattività di questo
   * professionista, non l'età della richiesta.
   */
  async recordFirstResponse(professionalProfileId: string, responseMinutes: number): Promise<void> {
    const existing = await this.prisma.professionalMetrics.findUnique({ where: { professionalProfileId } });
    // Media mobile, formula esatta richiesta dall'utente: nuova_media =
    // ((vecchia_media × n) + nuovo_valore) / (n+1) — n è il numero di
    // risposte già misurate finora, non il totale delle richieste ricevute
    // (un professionista può ricevere Lead senza mai rispondere).
    const n = existing?.totalResponsesMeasured ?? 0;
    const previousAvg = existing?.avgResponseTimeMinutes ?? 0;
    const newAvg = (previousAvg * n + responseMinutes) / (n + 1);

    await this.prisma.professionalMetrics.upsert({
      where: { professionalProfileId },
      create: { professionalProfileId, avgResponseTimeMinutes: responseMinutes, totalResponsesMeasured: 1, lastActivityAt: new Date() },
      update: { avgResponseTimeMinutes: newAvg, totalResponsesMeasured: { increment: 1 }, lastActivityAt: new Date() },
    });
    await this.refreshScore(professionalProfileId);
  }

  /** Evento 3: un preventivo diventa una Booking reale ("accettato" nel vocabolario di questo dominio). */
  async recordJobAccepted(professionalProfileId: string): Promise<void> {
    await this.prisma.professionalMetrics.upsert({
      where: { professionalProfileId },
      create: { professionalProfileId, acceptedRequests: 1, acceptedJobs: 1, lastActivityAt: new Date() },
      update: { acceptedRequests: { increment: 1 }, acceptedJobs: { increment: 1 }, lastActivityAt: new Date() },
    });
    await this.refreshScore(professionalProfileId);
  }

  /** Evento 4: una Booking viene segnata COMPLETED. */
  async recordJobCompleted(professionalProfileId: string): Promise<void> {
    await this.prisma.professionalMetrics.upsert({
      where: { professionalProfileId },
      create: { professionalProfileId, completedJobs: 1, lastActivityAt: new Date() },
      update: { completedJobs: { increment: 1 }, lastActivityAt: new Date() },
    });
    await this.refreshScore(professionalProfileId);
  }

  /**
   * Evento 5: il cliente lascia una recensione — ricalcolo esatto della
   * media (non una media mobile: il volume di recensioni per
   * professionista resta basso abbastanza da non giustificare
   * l'approssimazione, a differenza del tempo di risposta che si misura
   * molto più spesso).
   */
  async recordReview(professionalProfileId: string, rating: number): Promise<void> {
    const existing = await this.prisma.professionalMetrics.findUnique({ where: { professionalProfileId } });
    const previousCount = existing?.reviewCount ?? 0;
    const previousAvg = existing?.avgRating ?? 0;
    const newAvg = (previousAvg * previousCount + rating) / (previousCount + 1);

    await this.prisma.professionalMetrics.upsert({
      where: { professionalProfileId },
      create: { professionalProfileId, avgRating: rating, reviewCount: 1, lastActivityAt: new Date() },
      update: { avgRating: newAvg, reviewCount: { increment: 1 }, lastActivityAt: new Date() },
    });
    await this.refreshScore(professionalProfileId);
  }

  /** Evento 6: un appuntamento (Booking) viene segnato COMPLETED (onorato) o NO_SHOW (mancato) — CANCELED non conta né come onorato né come mancato. */
  async recordAppointmentOutcome(professionalProfileId: string, honored: boolean): Promise<void> {
    await this.prisma.professionalMetrics.upsert({
      where: { professionalProfileId },
      create: { professionalProfileId, totalAppointments: 1, honoredAppointments: honored ? 1 : 0, lastActivityAt: new Date() },
      update: { totalAppointments: { increment: 1 }, honoredAppointments: honored ? { increment: 1 } : undefined, lastActivityAt: new Date() },
    });
    await this.refreshScore(professionalProfileId);
  }

  /** Evento 7: qualunque azione del professionista (login, risposta, aggiornamento disponibilità) — nessun incremento, solo il timestamp. */
  async touchActivity(professionalProfileId: string): Promise<void> {
    await this.prisma.professionalMetrics.upsert({
      where: { professionalProfileId },
      create: { professionalProfileId, lastActivityAt: new Date() },
      update: { lastActivityAt: new Date() },
    });
    // Nessun campo che concorre al punteggio cambia qui: refreshScore
    // sarebbe un no-op costoso, saltato deliberatamente.
  }

  private async refreshScore(professionalProfileId: string): Promise<void> {
    const metrics = await this.prisma.professionalMetrics.findUnique({ where: { professionalProfileId } });
    if (!metrics) return;
    const score = calculateReliabilityScore(metrics);
    await this.prisma.professionalMetrics.update({ where: { professionalProfileId }, data: { reliabilityScore: score } });
  }
}
