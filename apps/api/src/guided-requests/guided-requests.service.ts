import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, type PrismaClient } from "@professionisti/database";
import type { GuidedRequestInput, GuidedRequestUpdateInput } from "@professionisti/shared";
import { PRISMA } from "../prisma/prisma.module";

// Lead standard vs urgente: la richiesta "ora" ha margine più alto per il
// professionista che risponde per primo (CLAUDE.md §7.5).
const LEAD_PRICE_STANDARD_EUR_CENTS = 500;
const LEAD_PRICE_URGENT_EUR_CENTS = 800;

@Injectable()
export class GuidedRequestsService {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaClient) {}

  async create(clientId: string, input: GuidedRequestInput) {
    const category = await this.prisma.category.findUnique({ where: { slug: input.categorySlug } });
    if (!category) {
      throw new BadRequestException("Categoria non valida.");
    }

    let targetProfile: { id: string } | null = null;
    if (input.professionalProfileId) {
      targetProfile = await this.prisma.professionalProfile.findUnique({
        where: { id: input.professionalProfileId },
        select: { id: true },
      });
      if (!targetProfile) {
        throw new NotFoundException("Professionista non trovato.");
      }
    }

    // Richiesta agganciata a una fascia "generica" dell'agenda pubblica
    // (AvailabilitySlot.maxBookings > 1, vedi packages/shared/src/
    // availability.ts): rivalida server-side che la fascia esista davvero,
    // non cada in un giorno di chiusura e abbia ancora capienza libera,
    // invece di fidarsi ciecamente di quanto inviato dal client — stessa
    // cautela già applicata a bookAgendaSlot.
    let resolvedSlot: { date: Date; maxBookings: number } | null = null;
    if (input.preferredDate && input.preferredTimeSlot) {
      if (!targetProfile) {
        throw new BadRequestException("Una fascia oraria preferita richiede un professionista specifico.");
      }
      resolvedSlot = await this.resolveGenericSlot(targetProfile.id, input.preferredDate, input.preferredTimeSlot);
    }

    let guidedRequest;
    try {
      guidedRequest = await this.prisma.$transaction(
        async (tx) => {
          if (resolvedSlot && targetProfile) {
            // Riconta dentro la transazione (isolamento Serializable) per
            // evitare che due clienti superino insieme la capienza massima
            // della stessa fascia nello stesso istante — stesso principio
            // già applicato a ProfessionalsService.bookAgendaSlot.
            const currentCount = await tx.guidedRequest.count({
              where: { professionalProfileId: targetProfile.id, preferredDate: resolvedSlot.date, preferredTimeSlot: input.preferredTimeSlot },
            });
            if (currentCount >= resolvedSlot.maxBookings) {
              throw new ConflictException("Questa fascia ha già raggiunto il numero massimo di richieste.");
            }
          }
          return tx.guidedRequest.create({
            data: {
              clientId,
              categoryId: category.id,
              description: input.description,
              photoUrls: input.photoUrls,
              city: input.city,
              address: input.address?.trim() || null,
              isUrgent: input.isUrgent,
              professionalProfileId: targetProfile?.id,
              preferredDate: resolvedSlot?.date,
              preferredTimeSlot: resolvedSlot ? input.preferredTimeSlot : undefined,
            },
          });
        },
        resolvedSlot ? { isolationLevel: Prisma.TransactionIsolationLevel.Serializable } : undefined,
      );
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2034") {
        throw new ConflictException("Questa fascia ha già raggiunto il numero massimo di richieste.");
      }
      throw err;
    }

    // Fan-out: se la richiesta parte dal profilo di un professionista specifico
    // va solo a lui, altrimenti a tutti i professionisti compatibili per
    // categoria+città (CLAUDE.md §8).
    const matchingProfiles = input.professionalProfileId
      ? await this.prisma.professionalProfile.findMany({ where: { id: input.professionalProfileId } })
      : await this.prisma.professionalProfile.findMany({
          where: { categoryId: category.id, city: { equals: input.city, mode: "insensitive" } },
        });

    const leadPriceEurCents = input.isUrgent ? LEAD_PRICE_URGENT_EUR_CENTS : LEAD_PRICE_STANDARD_EUR_CENTS;

    if (matchingProfiles.length > 0) {
      await this.prisma.lead.createMany({
        data: matchingProfiles.map((profile) => ({
          guidedRequestId: guidedRequest.id,
          professionalProfileId: profile.id,
          priceEurCents: leadPriceEurCents,
        })),
        skipDuplicates: true,
      });

      await this.prisma.guidedRequest.update({ where: { id: guidedRequest.id }, data: { status: "MATCHED" } });

      await this.prisma.notification.createMany({
        data: matchingProfiles.map((profile) => ({
          userId: profile.userId,
          channel: "PUSH" as const,
          type: "NEW_LEAD",
          payload: {
            guidedRequestId: guidedRequest.id,
            category: category.label,
            city: input.city,
            isUrgent: input.isUrgent,
          },
        })),
      });
    }

    return {
      guidedRequestId: guidedRequest.id,
      matchedProfessionals: matchingProfiles.length,
    };
  }

  /** Richieste (con relativi lead) inviate dal cliente autenticato. */
  async listForClient(clientId: string) {
    const requests = await this.prisma.guidedRequest.findMany({
      where: { clientId },
      include: {
        category: true,
        quotes: { include: { professionalProfile: true, items: true } },
        // A chi è stata inviata la richiesta: mostrato in /le-mie-richieste
        // (richiesta esplicita dell'utente — "deve essere chiaro a chi si è
        // inviata la richiesta"), un professionista o più in caso di fan-out.
        leads: { include: { professionalProfile: { include: { category: true } } } },
      },
      orderBy: { createdAt: "desc" },
    });

    return requests.map((request) => {
      // Il più recente tra l'aggiornamento della richiesta stessa (modifica
      // descrizione/città/foto) e quello di un qualunque preventivo ricevuto
      // (invio/modifica/accettazione/rifiuto) — "ultimo aggiornamento" per
      // l'ordinamento richiesto dall'utente deve riflettere l'evento più
      // recente sull'intera richiesta, non solo sulla riga stessa.
      const latestQuoteUpdate = request.quotes.reduce(
        (latest, quote) => (quote.updatedAt > latest ? quote.updatedAt : latest),
        request.updatedAt,
      );
      return {
        id: request.id,
        categorySlug: request.category.slug,
        categoryLabel: request.category.label,
        description: request.description,
        city: request.city,
        address: request.address,
        // Necessarie qui (non solo lato professionista in ProfessionalLead)
        // per permettere al cliente di modificare le foto già inviate in
        // /le-mie-richieste — prima non erano esposte affatto lato cliente.
        photoUrls: request.photoUrls,
        isUrgent: request.isUrgent,
        status: request.status,
        createdAt: request.createdAt.toISOString(),
        updatedAt: latestQuoteUpdate.toISOString(),
        preferredDate: request.preferredDate?.toISOString().slice(0, 10) ?? null,
        preferredTimeSlot: request.preferredTimeSlot,
        sentTo: request.leads.map((lead) => ({
          id: lead.professionalProfileId,
          businessName: lead.professionalProfile.businessName,
          imageUrl: lead.professionalProfile.imageUrl,
          categorySlug: lead.professionalProfile.category.slug,
          categoryLabel: lead.professionalProfile.category.label,
          city: lead.professionalProfile.city,
          verified: lead.professionalProfile.verified,
          declined: lead.status === "DECLINED",
          declineNote: lead.declineNote,
        })),
        quotes: request.quotes.map((quote) => ({
          id: quote.id,
          professionalProfileId: quote.professionalProfileId,
          businessName: quote.professionalProfile.businessName,
          items: quote.items.map((item) => ({
            id: item.id,
            name: item.name,
            priceMinEurCents: item.priceMinEurCents,
            priceMaxEurCents: item.priceMaxEurCents,
          })),
          estimatedStartDate: quote.estimatedStartDate.toISOString(),
          clientProposedDate: quote.clientProposedDate?.toISOString() ?? null,
          clientProposedNote: quote.clientProposedNote,
          notes: quote.notes,
          status: quote.status,
        })),
      };
    });
  }

  /**
   * Modifica di una richiesta già inviata: descrizione, città, indirizzo
   * preciso e foto (vedi guidedRequestUpdateSchema), non la categoria —
   * determina già a chi è stata inoltrata la richiesta. Consentita finché
   * non è CLOSED (una richiesta chiusa ha già portato a una prenotazione,
   * non ha senso modificarla — stesso confine già usato per
   * l'eliminazione). `photoUrls` sostituisce l'intero set solo se presente
   * nel payload (richiesta esplicita dell'utente: "dai la possibilità di
   * modificare anche le foto inviate") — se assente il set esistente resta
   * intatto, coerente con `photoUrls` opzionale nello schema.
   */
  async update(clientId: string, id: string, input: GuidedRequestUpdateInput) {
    const request = await this.requireOwnEditableRequest(clientId, id, "modificare");
    // Una volta che un professionista ha già inviato un preventivo basato
    // su descrizione/città/indirizzo/foto della richiesta, cambiarli
    // dopo invaliderebbe silenziosamente quel lavoro — richiesta esplicita
    // dell'utente. La categoria non è modificabile per un motivo analogo
    // (determina già a chi è stata inoltrata), ma quel vincolo era già
    // presente da prima; questo è nuovo e riguarda l'intera richiesta non
    // appena arriva anche un solo preventivo (il fan-out può aver
    // raggiunto più professionisti, basta che uno solo abbia già risposto).
    const quoteCount = await this.prisma.quote.count({ where: { guidedRequestId: request.id } });
    if (quoteCount > 0) {
      throw new ForbiddenException("Non puoi modificare la richiesta: un professionista ha già inviato un preventivo.");
    }
    const updated = await this.prisma.guidedRequest.update({
      where: { id: request.id },
      data: {
        description: input.description,
        city: input.city,
        address: input.address?.trim() || null,
        ...(input.photoUrls !== undefined ? { photoUrls: input.photoUrls } : {}),
      },
    });
    return { id: updated.id, description: updated.description, city: updated.city, address: updated.address, photoUrls: updated.photoUrls };
  }

  /**
   * Eliminazione di una richiesta già inviata: cascata su Lead e Quote
   * (onDelete: Cascade nello schema Prisma). Bloccata se CLOSED — a quel
   * punto esiste una Booking che referenzia la Quote (Booking.quoteId non è
   * in cascade), cancellarla romperebbe un lavoro già confermato, oltre a
   * violare il vincolo di chiave esterna.
   */
  async remove(clientId: string, id: string): Promise<void> {
    await this.requireOwnEditableRequest(clientId, id, "eliminare");
    await this.prisma.guidedRequest.delete({ where: { id } });
  }

  private async requireOwnEditableRequest(clientId: string, id: string, action: string) {
    const request = await this.prisma.guidedRequest.findUnique({ where: { id } });
    if (!request) {
      throw new NotFoundException("Richiesta non trovata.");
    }
    if (request.clientId !== clientId) {
      throw new ForbiddenException("Questa richiesta non è tua.");
    }
    if (request.status === "CLOSED") {
      throw new ForbiddenException(`Non puoi ${action} una richiesta già conclusa.`);
    }
    return request;
  }

  /**
   * Valida che dateStr/timeSlot corrispondano a una fascia "generica" reale
   * (AvailabilitySlot.maxBookings > 1) del professionista, e che quella data
   * non sia un giorno di chiusura straordinaria — stessa cautela già
   * applicata da ProfessionalsService.bookAgendaSlot per le fasce esatte.
   */
  private async resolveGenericSlot(professionalProfileId: string, dateStr: string, timeSlot: string): Promise<{ date: Date; maxBookings: number }> {
    const date = new Date(`${dateStr}T00:00:00.000Z`);
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException("Data non valida.");
    }
    const [startTime, endTime] = timeSlot.split("-");
    const dayOfWeek = date.getUTCDay();

    const [slot, exception] = await Promise.all([
      // Corrisponde sia a una fascia legata a questa data esatta sia a una
      // fascia ricorrente (date=null, comportamento storico) per lo stesso
      // giorno della settimana — vedi slotAppliesOnDate (apps/api/src/common).
      this.prisma.availabilitySlot.findFirst({
        where: { professionalProfileId, startTime, endTime, OR: [{ date }, { date: null, dayOfWeek }] },
      }),
      this.prisma.availabilityException.findUnique({
        where: { professionalProfileId_date: { professionalProfileId, date } },
      }),
    ]);
    if (!slot || slot.maxBookings <= 1) {
      throw new BadRequestException("Questa fascia oraria non è disponibile per l'invio di una richiesta di preventivo.");
    }
    if (exception) {
      throw new ConflictException("Il professionista non è disponibile in questa data.");
    }
    return { date, maxBookings: slot.maxBookings };
  }
}
