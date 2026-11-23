import { Inject, Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { ReplaySubject, Subject, type Observable } from "rxjs";
import { randomUUID } from "node:crypto";
import type { Prisma, PrismaClient } from "@professionisti/database";
import type { RealtimeEvent } from "@professionisti/shared";
import { PRISMA } from "../prisma/prisma.module";

/** Ogni quanto ogni copia legge gli eventi delle altre: al massimo un secondo di ritardo. */
const POLL_MS = 1000;
const POLL_BATCH = 500;
const CLEANUP_EVERY_POLLS = 60;
/** Gli eventi servono solo per pochi secondi: dopo 5 minuti si tolgono. */
const KEEP_EVENTS_MS = 5 * 60_000;

/**
 * Canali push per utente (SSE). Ogni copia dell'API tiene in memoria chi è
 * collegato da lei; un evento pubblicato su una copia arriva alle altre
 * dalla tabella `realtime_events`, che ognuna legge ogni secondo
 * (docs/changelog/2026-11-16-traffico-elevato.md). Prima era solo in
 * memoria: con due copie un messaggio di chat poteva non arrivare mai a chi
 * era collegato all'altra. Nessuna infrastruttura nuova (niente Redis): basta
 * Postgres, già nello stack. Il push resta un acceleratore: i dati veri si
 * leggono sempre via REST, un evento perso non rompe nulla.
 *
 * Un `Subject` per utente (non uno per connessione): un utente con più
 * schede/dispositivi aperti condivide lo stesso Subject, RxJS lo trasmette
 * già a tutti i sottoscrittori attivi.
 */
@Injectable()
export class RealtimeService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RealtimeService.name);
  private readonly subjectsByUser = new Map<string, Subject<RealtimeEvent>>();
  /** Questa copia dell'API: i suoi eventi li ha già consegnati da sé. */
  private readonly instanceId = randomUUID();
  private lastEventId: bigint | null = null;
  private timer: NodeJS.Timeout | null = null;
  private polling = false;
  private polls = 0;
  /** Emette una volta, quando l'API si sta chiudendo (vedi `closing$`). */
  private readonly closingSubject = new ReplaySubject<void>(1);

  /**
   * Segnale di chiusura dell'API: chiude tutti i flussi aperti. Senza, a ogni
   * riavvio (Render manda SIGTERM) il server aspettava la fine dei flussi in
   * tempo reale, che non finiscono mai da soli, e Render lo spegneva di forza
   * dopo 30 secondi. Il browser si ricollega da solo alla copia nuova
   * (docs/changelog/2026-11-23-chiusura-api-e-express-perdite-stripe.md).
   */
  readonly closing$: Observable<void> = this.closingSubject.asObservable();

  constructor(@Inject(PRISMA) private readonly prisma: Pick<PrismaClient, "realtimeEvent">) {}

  onModuleInit(): void {
    this.timer = setInterval(() => void this.pollOtherInstances(), POLL_MS);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    // Prima di chiudere il server HTTP (Nest chiama questo aggancio prima).
    this.closingSubject.next();
    this.closingSubject.complete();
  }

  private getOrCreateSubject(userId: string): Subject<RealtimeEvent> {
    let subject = this.subjectsByUser.get(userId);
    if (!subject) {
      subject = new Subject<RealtimeEvent>();
      this.subjectsByUser.set(userId, subject);
    }
    return subject;
  }

  /** Stream di eventi per un utente autenticato — un `Observable` per connessione SSE aperta. */
  stream(userId: string): Observable<RealtimeEvent> {
    return this.getOrCreateSubject(userId).asObservable();
  }

  /**
   * Punto unico di pubblicazione: subito a chi è collegato a questa copia,
   * e nella tabella per le altre. Mai un errore per chi pubblica.
   */
  publish(userId: string, event: RealtimeEvent): void {
    this.subjectsByUser.get(userId)?.next(event);
    void this.prisma.realtimeEvent
      .create({ data: { userId, payload: event as unknown as Prisma.InputJsonValue, origin: this.instanceId } })
      .catch((error: unknown) => this.logger.warn(`Evento in tempo reale non condiviso: ${error instanceof Error ? error.message : error}`));
  }

  /** Legge gli eventi delle altre copie e li consegna a chi è collegato qui. */
  async pollOtherInstances(now = Date.now()): Promise<void> {
    if (this.polling) return;
    this.polling = true;
    try {
      if (this.lastEventId === null) {
        // Al primo giro si parte da adesso: gli eventi vecchi non servono.
        const last = await this.prisma.realtimeEvent.findFirst({ orderBy: { id: "desc" }, select: { id: true } });
        this.lastEventId = last?.id ?? 0n;
        return;
      }
      const rows = await this.prisma.realtimeEvent.findMany({
        where: { id: { gt: this.lastEventId } },
        orderBy: { id: "asc" },
        take: POLL_BATCH,
        select: { id: true, userId: true, payload: true, origin: true },
      });
      for (const row of rows) {
        this.lastEventId = row.id;
        if (row.origin === this.instanceId) continue;
        this.subjectsByUser.get(row.userId)?.next(row.payload as unknown as RealtimeEvent);
      }
      // Una volta al minuto si tolgono gli eventi vecchi (lo fa ogni copia, è innocuo).
      this.polls += 1;
      if (this.polls % CLEANUP_EVERY_POLLS === 0) {
        await this.prisma.realtimeEvent.deleteMany({ where: { createdAt: { lt: new Date(now - KEEP_EVENTS_MS) } } });
      }
    } catch (error) {
      this.logger.warn(`Eventi in tempo reale delle altre copie non letti: ${error instanceof Error ? error.message : error}`);
    } finally {
      this.polling = false;
    }
  }
}
