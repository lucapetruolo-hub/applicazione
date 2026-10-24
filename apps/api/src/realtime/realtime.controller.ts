import { CanActivate, Controller, ExecutionContext, Inject, Injectable, MessageEvent, Post, Req, Sse, UnauthorizedException, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { Throttle } from "@nestjs/throttler";
import { filter, from, interval, map, merge, Observable, switchMap, take, takeUntil } from "rxjs";
import type { PrismaClient } from "@professionisti/database";
import type { RealtimeEvent } from "@professionisti/shared";
import { PRISMA } from "../prisma/prisma.module";
import { isRevokedSession, JwtAuthGuard, type AuthenticatedRequest } from "../auth/jwt-auth.guard";
import { RealtimeService } from "./realtime.service";
import { RealtimeTickets, type RealtimeTicket } from "./realtime-tickets";

// Un ping ogni 25s tiene la connessione viva attraverso i proxy/hosting che
// chiudono una connessione HTTP silenziosa dopo un certo periodo (Render
// incluso) — il client lo ignora (nessun `kind` che riconosce), serve solo a
// far transitare byte reali sul socket.
const HEARTBEAT_MS = 25_000;

type TicketRequest = Request & { realtimeTicket?: RealtimeTicket };

/** Account sospeso, eliminato o password cambiata dopo l'emissione del biglietto (§292). */
async function sessionClosed(prisma: PrismaClient, ticket: RealtimeTicket): Promise<boolean> {
  const user = await prisma.user.findUnique({ where: { id: ticket.userId }, select: { suspendedAt: true, sessionVersion: true } });
  return !user || user.suspendedAt !== null || isRevokedSession({ sub: ticket.userId, sv: ticket.sessionVersion }, user.sessionVersion);
}

/**
 * Controlla il biglietto prima che lo stream parta (§293): un errore dentro
 * il metodo `@Sse` arriverebbe come evento con stato 200 e il browser
 * riproverebbe all'infinito con lo stesso biglietto; dal guard esce un 401
 * vero, `EventSource` si chiude e il sito chiede un biglietto nuovo.
 */
@Injectable()
export class RealtimeTicketGuard implements CanActivate {
  constructor(
    private readonly tickets: RealtimeTickets,
    @Inject(PRISMA) private readonly prisma: PrismaClient,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<TicketRequest>();
    const code = typeof request.query.ticket === "string" ? request.query.ticket : null;
    const ticket = code ? this.tickets.redeem(code) : null;
    if (!ticket || (await sessionClosed(this.prisma, ticket))) throw new UnauthorizedException("Biglietto non valido o scaduto.");
    request.realtimeTicket = ticket;
    return true;
  }
}

@Controller("realtime")
export class RealtimeController {
  constructor(
    private readonly realtimeService: RealtimeService,
    private readonly tickets: RealtimeTickets,
    @Inject(PRISMA) private readonly prisma: PrismaClient,
  ) {}

  /**
   * Biglietto monouso da 60 secondi per aprire lo stream (§293): si chiede
   * con il token nell'header, come ogni altra chiamata, così il token di
   * accesso non finisce mai in un indirizzo.
   */
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post("ticket")
  async ticket(@Req() req: AuthenticatedRequest): Promise<{ ticket: string }> {
    const user = await this.prisma.user.findUnique({ where: { id: req.user.userId }, select: { sessionVersion: true } });
    if (!user) throw new UnauthorizedException("Accesso non valido.");
    return { ticket: this.tickets.issue({ userId: req.user.userId, sessionVersion: user.sessionVersion }) };
  }

  /**
   * Stream SSE dei push in tempo reale per l'utente autenticato (nuovi
   * messaggi di chat, notifiche) — CTO, "socket.io vs websocket vs
   * alternative": vedi `RealtimeService` per il perché SSE.
   *
   * `EventSource` (l'API browser nativa per SSE) non supporta header
   * custom, quindi l'accesso passa nell'indirizzo: un biglietto monouso di
   * `POST /realtime/ticket`, mai il token di accesso (§293). Se la
   * connessione cade, il browser riprova con lo stesso biglietto, riceve
   * 401 e il sito ne chiede uno nuovo.
   */
  @UseGuards(RealtimeTicketGuard)
  @Sse("stream")
  stream(@Req() req: TicketRequest): Observable<MessageEvent> {
    const ticket = req.realtimeTicket!;

    const events$ = this.realtimeService.stream(ticket.userId).pipe(map((event): MessageEvent => ({ data: event })));
    const heartbeat$ = interval(HEARTBEAT_MS).pipe(map((): MessageEvent => ({ data: { kind: "ping" } as unknown as RealtimeEvent })));
    // A ogni battito si ricontrolla l'account: dopo un cambio password la
    // connessione aperta su un altro dispositivo si chiude entro 25 secondi
    // e un biglietto nuovo viene negato col token vecchio (§292).
    const closed$ = interval(HEARTBEAT_MS).pipe(
      switchMap(() => from(sessionClosed(this.prisma, ticket).catch(() => false))),
      filter(Boolean),
      take(1),
    );
    return merge(events$, heartbeat$).pipe(takeUntil(closed$));
  }
}
