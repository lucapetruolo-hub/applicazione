import { Controller, Inject, MessageEvent, Query, Sse, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { filter, from, interval, map, merge, Observable, switchMap, take, takeUntil } from "rxjs";
import type { PrismaClient } from "@professionisti/database";
import type { RealtimeEvent } from "@professionisti/shared";
import { PRISMA } from "../prisma/prisma.module";
import { isRevokedSession, type SessionTokenPayload } from "../auth/jwt-auth.guard";
import { RealtimeService } from "./realtime.service";

// Un ping ogni 25s tiene la connessione viva attraverso i proxy/hosting che
// chiudono una connessione HTTP silenziosa dopo un certo periodo (Render
// incluso) — il client lo ignora (nessun `kind` che riconosce), serve solo a
// far transitare byte reali sul socket.
const HEARTBEAT_MS = 25_000;

@Controller("realtime")
export class RealtimeController {
  constructor(
    private readonly realtimeService: RealtimeService,
    private readonly jwtService: JwtService,
    @Inject(PRISMA) private readonly prisma: PrismaClient,
  ) {}

  /** Account sospeso, eliminato o password cambiata dopo l'emissione del token (§292). */
  private async sessionClosed(payload: SessionTokenPayload): Promise<boolean> {
    const user = await this.prisma.user.findUnique({ where: { id: payload.sub }, select: { suspendedAt: true, sessionVersion: true } });
    return !user || user.suspendedAt !== null || isRevokedSession(payload, user.sessionVersion);
  }

  /**
   * Stream SSE dei push in tempo reale per l'utente autenticato (nuovi
   * messaggi di chat, notifiche) — CTO, "socket.io vs websocket vs
   * alternative": vedi `RealtimeService` per il perché SSE.
   *
   * **Token nella query string, non nell'header `Authorization`**: `EventSource`
   * (l'API browser nativa per SSE) non supporta header custom — è un limite
   * della piattaforma, non una scelta di design. Per questo non si può
   * riusare `JwtAuthGuard` (legge solo l'header) — la verifica qui è
   * manuale, stesso identico pattern (`JwtService.verify`, mai
   * `@nestjs/passport`, CLAUDE.md) solo con la sorgente del token diversa.
   * **Nota di sicurezza onesta**: un token in un URL può finire nei log del
   * server (Render) o nella cronologia del browser — stesso rischio già
   * presente per qualunque URL con parametri sensibili, non introdotto da
   * zero qui; il token resta comunque a scadenza (30gg, invariata) e SSE è
   * usato solo per un canale di lettura (mai un'azione che scrive dati).
   */
  @Sse("stream")
  async stream(@Query("token") token: string | undefined): Promise<Observable<MessageEvent>> {
    if (!token) {
      throw new UnauthorizedException("Token mancante.");
    }
    let payload: SessionTokenPayload;
    try {
      payload = this.jwtService.verify<SessionTokenPayload>(token);
    } catch {
      throw new UnauthorizedException("Token non valido o scaduto.");
    }
    if (await this.sessionClosed(payload)) {
      throw new UnauthorizedException("Token non valido o scaduto.");
    }

    const events$ = this.realtimeService.stream(payload.sub).pipe(map((event): MessageEvent => ({ data: event })));
    const heartbeat$ = interval(HEARTBEAT_MS).pipe(map((): MessageEvent => ({ data: { kind: "ping" } as unknown as RealtimeEvent })));
    // A ogni battito si ricontrolla l'account: dopo un cambio password la
    // connessione aperta su un altro dispositivo si chiude entro 25 secondi
    // e la riconnessione col token vecchio viene rifiutata (§292).
    const closed$ = interval(HEARTBEAT_MS).pipe(
      switchMap(() => from(this.sessionClosed(payload).catch(() => false))),
      filter(Boolean),
      take(1),
    );
    return merge(events$, heartbeat$).pipe(takeUntil(closed$));
  }
}
