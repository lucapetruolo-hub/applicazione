import { ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { PrismaClient } from "@professionisti/database";
import type { ConversationEvent } from "@professionisti/shared";
import { PRISMA } from "../prisma/prisma.module";

export type TimelineActor = "CLIENT" | "PROFESSIONAL" | "SYSTEM";

@Injectable()
export class TimelineService {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaClient) {}

  /**
   * Punto unico di scrittura di un evento AUTOMATICO della cronologia —
   * richiamato esplicitamente da ogni service che compie l'azione (stessa
   * convenzione già in uso per NotificationsService.notify), mai un
   * trigger/middleware Prisma. `message` è testo già pronto per la UI
   * (include eventuali dettagli/note dell'evento), non un `type` da
   * tradurre lato client: a differenza delle notifiche, qui la
   * formulazione varia con i dati reali dell'evento (data proposta, nota
   * scritta, importo finale...). Mai `mediaUrls` qui: quelli esistono solo
   * per gli aggiornamenti scritti a mano (vedi addUpdate).
   */
  async log(guidedRequestId: string, professionalProfileId: string, actor: TimelineActor, message: string): Promise<void> {
    await this.prisma.conversationEvent.create({ data: { guidedRequestId, professionalProfileId, actor, message } });
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
    const actor = await this.resolveActor(userId, guidedRequestId, professionalProfileId);
    const event = await this.prisma.conversationEvent.create({
      data: { guidedRequestId, professionalProfileId, actor, message: message.trim(), mediaUrls },
    });
    return {
      id: event.id,
      actor: event.actor,
      message: event.message,
      mediaUrls: event.mediaUrls,
      createdAt: event.createdAt.toISOString(),
    };
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
    return events.map((event) => ({
      id: event.id,
      actor: event.actor,
      message: event.message,
      mediaUrls: event.mediaUrls,
      createdAt: event.createdAt.toISOString(),
    }));
  }

  private async resolveActor(userId: string, guidedRequestId: string, professionalProfileId: string): Promise<"CLIENT" | "PROFESSIONAL"> {
    const [guidedRequest, professionalProfile] = await Promise.all([
      this.prisma.guidedRequest.findUnique({ where: { id: guidedRequestId }, select: { clientId: true } }),
      this.prisma.professionalProfile.findUnique({ where: { id: professionalProfileId }, select: { userId: true } }),
    ]);
    if (!guidedRequest || !professionalProfile) {
      throw new NotFoundException("Richiesta o professionista non trovati.");
    }
    if (guidedRequest.clientId === userId) return "CLIENT";
    if (professionalProfile.userId === userId) return "PROFESSIONAL";
    throw new ForbiddenException("Non hai accesso a questa cronologia.");
  }
}
