import { Controller, MessageEvent, Query, Sse, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { interval, map, merge, Observable } from "rxjs";
import type { RealtimeEvent } from "@professionisti/shared";
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
  ) {}

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
  stream(@Query("token") token: string | undefined): Observable<MessageEvent> {
    if (!token) {
      throw new UnauthorizedException("Token mancante.");
    }
    let userId: string;
    try {
      const payload = this.jwtService.verify<{ sub: string }>(token);
      userId = payload.sub;
    } catch {
      throw new UnauthorizedException("Token non valido o scaduto.");
    }

    const events$ = this.realtimeService.stream(userId).pipe(map((event): MessageEvent => ({ data: event })));
    const heartbeat$ = interval(HEARTBEAT_MS).pipe(map((): MessageEvent => ({ data: { kind: "ping" } as unknown as RealtimeEvent })));
    return merge(events$, heartbeat$);
  }
}
