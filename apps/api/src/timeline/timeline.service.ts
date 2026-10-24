import { ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { ConversationEvent as ConversationEventRow, PrismaClient } from "@professionisti/database";
import type { ChatThreadSummary, ConversationEvent, RealtimeEvent } from "@professionisti/shared";
import { PRISMA } from "../prisma/prisma.module";
import { NotificationsService } from "../notifications/notifications.service";
import { RealtimeService } from "../realtime/realtime.service";
import { clientNameForProfessional } from "../common/client-name.util";

export type TimelineActor = "CLIENT" | "PROFESSIONAL" | "SYSTEM";

@Injectable()
export class TimelineService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly notificationsService: NotificationsService,
    private readonly realtimeService: RealtimeService,
  ) {}

  /**
   * Punto unico di scrittura di un evento AUTOMATICO della cronologia —
   * richiamato esplicitamente da ogni service che compie l'azione (stessa
   * convenzione già in uso per NotificationsService.notify), mai un
   * trigger/middleware Prisma. `message` è testo già pronto per la UI
   * (include eventuali dettagli/note dell'evento), non un `type` da
   * tradurre lato client: a differenza delle notifiche, qui la
   * formulazione varia con i dati reali dell'evento (data proposta, nota
   * scritta, importo finale...). `mediaUrls` solo per gli aggiornamenti
   * scritti a mano (vedi addUpdate) e per le foto della segnalazione del
   * professionista (§197).
   *
   * Pubblica anche un push SSE "chat_message" a entrambe le parti del
   * thread (CTO — real-time): una conversazione già aperta vede comparire
   * l'evento subito, senza aspettare il poll di riserva.
   */
  async log(guidedRequestId: string, professionalProfileId: string, actor: TimelineActor, message: string, mediaUrls: string[] = []): Promise<void> {
    const row = await this.prisma.conversationEvent.create({ data: { guidedRequestId, professionalProfileId, actor, message, mediaUrls, automatic: true } });
    const participants = await this.resolveParticipantIds(guidedRequestId, professionalProfileId);
    if (participants) this.publishChatMessage(guidedRequestId, professionalProfileId, row, participants);
  }

  /**
   * Aggiornamento scritto a mano da cliente o professionista (richiesta
   * esplicita dell'utente), con foto/video facoltativi dell'avanzamento
   * lavori. L'attore è dedotto da chi chiama, mai passato dal client:
   * stessa verifica di accesso di listForUser sotto (cliente proprietario
   * della richiesta o professionista del thread indicato).
   */
  async addUpdate(
    userId: string,
    guidedRequestId: string,
    professionalProfileId: string,
    message: string,
    mediaUrls: string[],
  ): Promise<ConversationEvent> {
    const { actor, clientUserId, professionalUserId } = await this.resolveActorWithParticipants(
      userId,
      guidedRequestId,
      professionalProfileId,
    );
    const event = await this.prisma.conversationEvent.create({
      data: { guidedRequestId, professionalProfileId, actor, message: message.trim(), mediaUrls },
    });
    // Richiesta esplicita dell'utente: un aggiornamento scritto a mano deve
    // avvisare l'altra parte (badge/toast, stesso meccanismo già in uso per
    // ogni altro evento del ciclo di vita, CLAUDE.md §13) — mai chi lo ha
    // appena scritto. Due tipi distinti (non uno solo) per rispettare la
    // stessa convenzione già in uso per ogni altro tipo di notifica: "ogni
    // tipo corrisponde sempre allo stesso ruolo destinatario", necessaria
    // per instradare correttamente il click sul toast (notificationSections.ts).
    const recipientUserId = actor === "CLIENT" ? professionalUserId : clientUserId;
    const notificationType = actor === "CLIENT" ? "TIMELINE_MESSAGE_FROM_CLIENT" : "TIMELINE_MESSAGE_FROM_PROFESSIONAL";
    await this.notificationsService.notify(recipientUserId, notificationType, { guidedRequestId, professionalProfileId });
    this.publishChatMessage(guidedRequestId, professionalProfileId, event, { clientUserId, professionalUserId });
    return this.serializeEvent(event);
  }

  /**
   * Elenco dei thread (coppie richiesta guidata+professionista) a cui
   * questo utente partecipa, con solo l'ultimo evento come anteprima —
   * richiesta esplicita dell'utente: menu "Chat" che elenca "solo il nome
   * del cliente o professionista con l'ultimo messaggio ricevuto/inviato",
   * la cronologia completa si apre solo al click (stesso TimelineModal già
   * esistente). Un utente può comparire sia come cliente (proprie
   * GuidedRequest) sia come professionista (proprio ProfessionalProfile) —
   * in pratica mai insieme, ma la query copre comunque entrambi i casi con
   * un solo OR invece di due chiamate. Nessuna paginazione: stessa scala di
   * lancio già documentata altrove nel progetto (una città, poche
   * categorie) — il numero di thread per utente resta piccolo.
   */
  async listThreadsForUser(userId: string): Promise<ChatThreadSummary[]> {
    const events = await this.prisma.conversationEvent.findMany({
      where: { OR: [{ guidedRequest: { clientId: userId } }, { professionalProfile: { userId } }] },
      orderBy: { createdAt: "desc" },
      include: {
        guidedRequest: {
          include: {
            client: true,
            category: true,
            // Preventivi accettati della richiesta: il cognome del cliente
            // e la foto si mostrano al professionista solo con la Booking (§216).
            quotes: { where: { booking: { isNot: null } }, select: { professionalProfileId: true } },
          },
        },
        professionalProfile: true,
      },
    });

    const threads: ChatThreadSummary[] = [];
    const seen = new Set<string>();
    for (const event of events) {
      const key = `${event.guidedRequestId}:${event.professionalProfileId}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const viewerRole: "CLIENT" | "PROFESSIONAL" = event.guidedRequest.clientId === userId ? "CLIENT" : "PROFESSIONAL";
      const client = event.guidedRequest.client;
      const professionalProfile = event.professionalProfile;
      const clientUnlocked = event.guidedRequest.quotes.some((quote) => quote.professionalProfileId === event.professionalProfileId);
      const otherPartyName =
        viewerRole === "CLIENT"
          ? professionalProfile.businessName
          : client.deletedAt
            ? "Account eliminato"
            : (clientNameForProfessional(client, clientUnlocked) ?? "Cliente");
      // Foto del cliente al professionista solo a preventivo accettato (§216).
      const otherPartyImageUrl =
        viewerRole === "CLIENT" ? professionalProfile.imageUrl : client.deletedAt || !clientUnlocked ? null : client.imageUrl;

      threads.push({
        guidedRequestId: event.guidedRequestId,
        professionalProfileId: event.professionalProfileId,
        viewerRole,
        otherPartyName,
        otherPartyImageUrl,
        categoryLabel: event.guidedRequest.category.label,
        requestDescription: event.guidedRequest.description,
        lastMessage: event.message || null,
        lastMessageHasMedia: event.mediaUrls.length > 0,
        lastMessageAt: event.createdAt.toISOString(),
        // Un messaggio automatico non è "tuo" anche se porta il tuo ruolo
        // ("Tu: Il professionista ha annullato…" non si legge bene).
        lastMessageIsMine: !event.automatic && event.actor !== "SYSTEM" && event.actor === viewerRole,
      });
    }
    return threads;
  }

  /**
   * Cronologia completa di una coppia (richiesta guidata, professionista),
   * in ordine cronologico. Accessibile sia dal cliente proprietario della
   * richiesta sia dal professionista destinatario di quel thread — nessun
   * altro, mai l'identità/i dettagli di altri professionisti coinvolti nello
   * stesso fan-out (coerente con GuidedRequestsService.getStatus, che per lo
   * stesso motivo non espone mai gli altri candidati al cliente).
   */
  async listForUser(userId: string, guidedRequestId: string, professionalProfileId: string): Promise<ConversationEvent[]> {
    await this.resolveActor(userId, guidedRequestId, professionalProfileId);

    const events = await this.prisma.conversationEvent.findMany({
      where: { guidedRequestId, professionalProfileId },
      orderBy: { createdAt: "asc" },
    });
    return events.map((event) => this.serializeEvent(event));
  }

  private serializeEvent(event: ConversationEventRow): ConversationEvent {
    return {
      id: event.id,
      actor: event.actor,
      message: event.message,
      mediaUrls: event.mediaUrls,
      automatic: event.automatic,
      createdAt: event.createdAt.toISOString(),
    };
  }

  /** Push SSE "chat_message" a entrambe le parti del thread — mai un errore se nessuna delle due ha una connessione aperta in questo momento (vedi RealtimeService.publish). */
  private publishChatMessage(
    guidedRequestId: string,
    professionalProfileId: string,
    event: ConversationEventRow,
    participants: { clientUserId: string; professionalUserId: string },
  ): void {
    const payload: RealtimeEvent = { kind: "chat_message", guidedRequestId, professionalProfileId, event: this.serializeEvent(event) };
    this.realtimeService.publish(participants.clientUserId, payload);
    this.realtimeService.publish(participants.professionalUserId, payload);
  }

  private async resolveActor(userId: string, guidedRequestId: string, professionalProfileId: string): Promise<"CLIENT" | "PROFESSIONAL"> {
    const { actor } = await this.resolveActorWithParticipants(userId, guidedRequestId, professionalProfileId);
    return actor;
  }

  /**
   * Id utente di entrambe le parti di un thread, senza alcun controllo di
   * accesso (a differenza di `resolveActorWithParticipants` sotto) —
   * `null` se la richiesta o il professionista non esistono più. Usato da
   * `log()`, che scrive un evento automatico per conto del sistema (nessun
   * `userId` chiamante da verificare), per sapere a chi pubblicare il push
   * SSE.
   */
  private async resolveParticipantIds(
    guidedRequestId: string,
    professionalProfileId: string,
  ): Promise<{ clientUserId: string; professionalUserId: string } | null> {
    const [guidedRequest, professionalProfile] = await Promise.all([
      this.prisma.guidedRequest.findUnique({ where: { id: guidedRequestId }, select: { clientId: true } }),
      this.prisma.professionalProfile.findUnique({ where: { id: professionalProfileId }, select: { userId: true } }),
    ]);
    if (!guidedRequest || !professionalProfile) return null;
    return { clientUserId: guidedRequest.clientId, professionalUserId: professionalProfile.userId };
  }

  /**
   * Come resolveParticipantIds, ma verifica anche che `userId` sia
   * davvero una delle due parti del thread (cliente proprietario o
   * professionista destinatario) — usato da ogni punto che agisce per
   * conto di un utente autenticato specifico (addUpdate, listForUser),
   * mai da `log()` (evento di sistema, nessun utente chiamante).
   */
  private async resolveActorWithParticipants(
    userId: string,
    guidedRequestId: string,
    professionalProfileId: string,
  ): Promise<{ actor: "CLIENT" | "PROFESSIONAL"; clientUserId: string; professionalUserId: string }> {
    const participants = await this.resolveParticipantIds(guidedRequestId, professionalProfileId);
    if (!participants) {
      throw new NotFoundException("Richiesta o professionista non trovati.");
    }
    const actor = participants.clientUserId === userId ? "CLIENT" : participants.professionalUserId === userId ? "PROFESSIONAL" : null;
    if (!actor || !(await this.isRealThread(guidedRequestId, professionalProfileId))) {
      throw new ForbiddenException("Non hai accesso a questa cronologia.");
    }
    return { actor, ...participants };
  }

  /**
   * La coppia richiesta+professionista è una conversazione vera solo se la
   * richiesta è arrivata a quel professionista (Lead), se lui ha mandato un
   * preventivo o se il sistema ha già scritto un evento per loro (controllo
   * sicurezza, docs/CHANGELOG.md §290). Prima bastava essere un
   * professionista qualsiasi: si poteva scrivere al cliente di una richiesta
   * mai ricevuta, e un cliente a qualunque professionista.
   */
  private async isRealThread(guidedRequestId: string, professionalProfileId: string): Promise<boolean> {
    const pair = { guidedRequestId, professionalProfileId };
    const [lead, quote, systemEvent] = await Promise.all([
      this.prisma.lead.findUnique({ where: { guidedRequestId_professionalProfileId: pair }, select: { id: true } }),
      this.prisma.quote.findFirst({ where: pair, select: { id: true } }),
      this.prisma.conversationEvent.findFirst({ where: { ...pair, automatic: true }, select: { id: true } }),
    ]);
    return Boolean(lead || quote || systemEvent);
  }
}
