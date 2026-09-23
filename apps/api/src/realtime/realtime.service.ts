import { Injectable } from "@nestjs/common";
import { Subject, type Observable } from "rxjs";
import type { RealtimeEvent } from "@professionisti/shared";

/**
 * Registro in-process di canali push per utente — nessuna infrastruttura
 * esterna (Redis/pub-sub), coerente con "niente infrastruttura nuova se non
 * strettamente necessaria" già seguito ovunque nel progetto
 * (`@nestjs/schedule` invece di BullMQ, ecc.):
 * `apps/api` gira oggi come un'unica istanza su Render (nessuno scaling
 * orizzontale in atto), quindi un `Map` in memoria basta — un utente
 * connesso da un'altra istanza semplicemente non riceverebbe il push,
 * scenario che oggi non si presenta mai. **Se in futuro l'API girasse su
 * più istanze**, questo è il solo punto da sostituire con un vero pub/sub
 * condiviso (es. Redis, già nello stack approvato per un domani — CLAUDE.md
 * §2): `publish`/`stream` restano la stessa interfaccia, cambia solo cosa
 * c'è dietro.
 *
 * Un `Subject` per utente (non uno per connessione): un utente con più
 * schede/dispositivi aperti condivide lo stesso Subject, RxJS lo trasmette
 * già a tutti i sottoscrittori attivi — nessun bisogno di un `Set` di
 * canali da gestire a mano.
 */
@Injectable()
export class RealtimeService {
  private readonly subjectsByUser = new Map<string, Subject<RealtimeEvent>>();

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

  /** Punto unico di pubblicazione — nessun effetto se l'utente non ha alcuna connessione SSE aperta in questo momento (mai un errore: il push è un acceleratore, non l'unica fonte di verità, i dati restano sempre leggibili via REST). */
  publish(userId: string, event: RealtimeEvent): void {
    this.subjectsByUser.get(userId)?.next(event);
  }
}
