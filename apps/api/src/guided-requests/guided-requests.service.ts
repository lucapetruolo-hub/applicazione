import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { Prisma, type PrismaClient, type ProfessionalProfile } from "@professionisti/database";
import { findComuneByName, type GuidedRequestInput, type GuidedRequestStatusSummary, type GuidedRequestUpdateInput } from "@professionisti/shared";
import { PRISMA } from "../prisma/prisma.module";
import { calculateDistanceKm } from "../common/geo.util";
import { NotificationsService } from "../notifications/notifications.service";
import { ProfessionalMetricsService } from "../professional-metrics/professional-metrics.service";
import { TimelineService } from "../timeline/timeline.service";

// Lead standard vs urgente: la richiesta "ora" ha margine più alto per il
// professionista che risponde per primo (CLAUDE.md §7.5).
const LEAD_PRICE_STANDARD_EUR_CENTS = 500;
const LEAD_PRICE_URGENT_EUR_CENTS = 800;

// Selezione intelligente dei Lead (CLAUDE.md §14): quanti professionisti
// contatta al massimo il fan-out iniziale di una singola richiesta guidata,
// anche quando i candidati compatibili (categoria + raggio) sono di più —
// richiesta esplicita dell'utente, per non sommergere il cliente di
// preventivi concorrenti né i professionisti fuori selezione di
// notifiche inutili. Stesso approccio già in uso per LEAD_PRICE_*
// sopra: costante in cima al file, facile da modificare.
const MAX_LEADS_PER_REQUEST = 3;

// Scadenza del singolo Lead: passato questo tempo senza che il
// professionista abbia inviato una Quote, il job schedulato lo marca
// EXPIRED e pesca il prossimo candidato dalla coda di riserva (vedi
// expandLeadQueue). Le urgenti scadono molto più in fretta: un allagamento
// non può aspettare 4 ore una risposta.
const URGENT_LEAD_EXPIRY_MINUTES = 20;
const STANDARD_LEAD_EXPIRY_HOURS = 4;

// Scadenza dell'intera richiesta guidata: oltre questo tempo, se ancora
// aperta senza nessuna Quote ricevuta, il job schedulato la chiude
// (closedReason EXPIRED) invece di lasciarla appesa per sempre.
const URGENT_REQUEST_EXPIRY_DAYS = 7;
const STANDARD_REQUEST_EXPIRY_DAYS = 14;

function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000);
}
function addHours(date: Date, hours: number): Date {
  return addMinutes(date, hours * 60);
}
function addDays(date: Date, days: number): Date {
  return addHours(date, days * 24);
}

@Injectable()
export class GuidedRequestsService {
  private readonly logger = new Logger(GuidedRequestsService.name);

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly notificationsService: NotificationsService,
    private readonly professionalMetricsService: ProfessionalMetricsService,
    private readonly timelineService: TimelineService,
  ) {}

  async create(clientId: string, input: GuidedRequestInput) {
    const category = await this.prisma.category.findUnique({ where: { slug: input.categorySlug } });
    if (!category) {
      throw new BadRequestException("Categoria non valida.");
    }

    let targetProfile: { id: string; deletedAt: Date | null } | null = null;
    if (input.professionalProfileId) {
      targetProfile = await this.prisma.professionalProfile.findUnique({
        where: { id: input.professionalProfileId },
        select: { id: true, deletedAt: true },
      });
      // Un professionista che ha eliminato l'account (soft-delete) non può
      // ricevere nuove richieste — stesso stato di "non trovato" già
      // applicato altrove alle query pubbliche su ProfessionalProfile.
      if (!targetProfile || targetProfile.deletedAt) {
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
      resolvedSlot = await this.resolveGenericSlot(
        targetProfile.id,
        input.preferredDate,
        input.preferredTimeSlot,
        input.serviceMode,
      );
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
              where: {
                professionalProfileId: targetProfile.id,
                preferredDate: resolvedSlot.date,
                preferredTimeSlot: input.preferredTimeSlot,
                serviceMode: input.serviceMode,
              },
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
              // Destinatario + resto dell'indirizzo strutturato, raccolti
              // fin dall'invio della richiesta (richiesta esplicita
              // dell'utente) — mai esposti al professionista prima della
              // conferma, vedi ProfessionalsService.getMyLeads.
              recipientName: input.recipientName?.trim() || null,
              recipientSurname: input.recipientSurname?.trim() || null,
              recipientPhone: input.recipientPhone?.trim() || null,
              houseNumber: input.houseNumber?.trim() || null,
              addressExtra: input.addressExtra?.trim() || null,
              postalCode: input.postalCode?.trim() || null,
              province: input.province?.trim() || null,
              isUrgent: input.isUrgent,
              serviceMode: input.serviceMode,
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
    // categoria + raggio di ingaggio (CLAUDE.md §8) — non più un match
    // esatto sulla stringa città: ogni professionista imposta il proprio
    // raggio (standard/urgente, vedi updateEngagementRadiusSchema),
    // rispettato da matchProfilesForFanOut sotto.
    const matchingProfiles = input.professionalProfileId
      ? await this.prisma.professionalProfile.findMany({ where: { id: input.professionalProfileId } })
      : await this.matchProfilesForFanOut(category.id, input.city, input.isUrgent);

    // Selezione intelligente (CLAUDE.md §14): sopra MAX_LEADS_PER_REQUEST
    // candidati non li contatta tutti — sceglie i migliori per rating +
    // 1 slot riservato a un professionista nuovo, il resto va in coda di
    // riserva (pescata da expandLeadQueue quando un Lead scade/viene
    // rifiutato). Una richiesta diretta a un professionista specifico non
    // passa da qui: è già una scelta esplicita del cliente, nessuna
    // selezione da fare.
    const { selected: leadRecipients, reserve: reserveCandidateIds } = input.professionalProfileId
      ? { selected: matchingProfiles, reserve: [] as string[] }
      : await this.selectLeadCandidates(matchingProfiles);

    const leadPriceEurCents = input.isUrgent ? LEAD_PRICE_URGENT_EUR_CENTS : LEAD_PRICE_STANDARD_EUR_CENTS;
    const requestExpiresAt = this.computeRequestExpiry(input.isUrgent);

    if (leadRecipients.length > 0) {
      const leadExpiresAt = this.computeLeadExpiry(input.isUrgent);
      await this.prisma.lead.createMany({
        data: leadRecipients.map((profile) => ({
          guidedRequestId: guidedRequest.id,
          professionalProfileId: profile.id,
          priceEurCents: leadPriceEurCents,
          expiresAt: leadExpiresAt,
        })),
        skipDuplicates: true,
      });

      await this.prisma.guidedRequest.update({
        where: { id: guidedRequest.id },
        data: { status: "MATCHED", reserveCandidateIds, expiresAt: requestExpiresAt },
      });

      await this.prisma.notification.createMany({
        data: leadRecipients.map((profile) => ({
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

      // Metriche di affidabilità (CLAUDE.md §15, evento 1): ogni
      // destinatario del fan-out ha appena "ricevuto una richiesta".
      await Promise.all(leadRecipients.map((profile) => this.professionalMetricsService.recordRequestReceived(profile.id)));

      // Cronologia (richiesta esplicita dell'utente): primo evento del
      // thread per ogni professionista che ha davvero ricevuto il Lead.
      const receivedMessage = input.professionalProfileId
        ? "Il cliente ha inviato una richiesta di preventivo direttamente a te."
        : "Il cliente ha inviato una richiesta di preventivo, ricevuta anche da te.";
      await Promise.all(
        leadRecipients.map((profile) => this.timelineService.log(guidedRequest.id, profile.id, "CLIENT", receivedMessage)),
      );
    } else {
      // Nessun candidato entro il raggio oggi: la richiesta resta OPEN, ma
      // ha comunque una scadenza propria — un professionista compatibile
      // che si iscrive più tardi (STEP 4, coinvolgimento a posteriori) la
      // trova comunque ancora valida solo se non è scaduta nel frattempo.
      await this.prisma.guidedRequest.update({ where: { id: guidedRequest.id }, data: { expiresAt: requestExpiresAt } });
    }

    return {
      // Professionisti che hanno DAVVERO ricevuto un Lead (dopo la
      // selezione), non solo i candidati compatibili trovati — questo
      // numero prima coincideva sempre con matchingProfiles.length, ora che
      // esiste un tetto (MAX_LEADS_PER_REQUEST) i due possono differire.
      guidedRequestId: guidedRequest.id,
      matchedProfessionals: leadRecipients.length,
    };
  }

  /** Richieste (con relativi lead) inviate dal cliente autenticato. */
  async listForClient(clientId: string) {
    const requests = await this.prisma.guidedRequest.findMany({
      where: { clientId },
      include: {
        category: true,
        // `booking` (relazione inversa 1:1 su Quote, valorizzata solo per il
        // preventivo eventualmente accettato) serve per lo stato "Completato"
        // dello stepper "Richiesta → Preventivo inviato → Preventivo
        // accettato → Completato" (richiesta esplicita dell'utente, stile
        // Deliveroo) — nessun altro punto del prodotto aveva ancora bisogno
        // di leggere lo stato della prenotazione da qui.
        quotes: { include: { professionalProfile: true, items: true, booking: { select: { status: true } } } },
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
      // Se la richiesta è nata da una fascia generica dell'agenda pubblica
      // (preferredDate/preferredTimeSlot), l'orario che il cliente aveva
      // effettivamente chiesto — usato sotto per segnalare al cliente se il
      // professionista ha inviato il preventivo con un orario diverso da
      // quello richiesto (richiesta esplicita dell'utente: "evidenzialo
      // quando viene restituito al cliente per farglielo notare").
      const requestedStart = this.preferredStartDate(request.preferredDate, request.preferredTimeSlot);
      return {
        id: request.id,
        categorySlug: request.category.slug,
        categoryLabel: request.category.label,
        description: request.description,
        city: request.city,
        address: request.address,
        // Valorizzato solo se la richiesta è nata dal profilo di un
        // professionista specifico ("Richiedi un preventivo a [nome]"),
        // null per una richiesta generica (fan-out categoria+città) — usato
        // in UI per mostrare "prezzo totale medio" solo su queste ultime
        // (richiesta esplicita dell'utente).
        professionalProfileId: request.professionalProfileId,
        // Destinatario + resto dell'indirizzo strutturato: visibili qui
        // perché è il cliente stesso a vederli (i propri dati), a
        // differenza di ProfessionalLead.guidedRequest, che non li espone
        // prima della conferma (richiesta esplicita dell'utente).
        recipientName: request.recipientName,
        recipientSurname: request.recipientSurname,
        recipientPhone: request.recipientPhone,
        houseNumber: request.houseNumber,
        addressExtra: request.addressExtra,
        postalCode: request.postalCode,
        province: request.province,
        // Necessarie qui (non solo lato professionista in ProfessionalLead)
        // per permettere al cliente di modificare le foto già inviate in
        // /le-mie-richieste — prima non erano esposte affatto lato cliente.
        photoUrls: request.photoUrls,
        serviceMode: request.serviceMode,
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
          // Data+ora di invio (richiesta esplicita dell'utente, visibile
          // sia al cliente che al professionista) — già esistente sullo
          // schema (Quote.createdAt), qui solo esposta.
          sentAt: quote.createdAt.toISOString(),
          estimatedStartDate: quote.estimatedStartDate.toISOString(),
          // Fine della fascia (richiesta esplicita dell'utente: mostrare
          // tutta la fascia oraria, non solo l'inizio) — null se non nota.
          estimatedEndDate: quote.estimatedEndDate?.toISOString() ?? null,
          clientProposedDate: quote.clientProposedDate?.toISOString() ?? null,
          clientProposedEndDate: quote.clientProposedEndDate?.toISOString() ?? null,
          clientProposedNote: quote.clientProposedNote,
          // True se il professionista ha inviato il preventivo con un
          // orario diverso da quello che il cliente aveva effettivamente
          // richiesto (solo quando la richiesta porta un orario preferito,
          // cioè è nata da una fascia generica dell'agenda pubblica) —
          // richiesta esplicita dell'utente, per evidenziarlo al cliente.
          timeChangedFromRequest: Boolean(requestedStart) && requestedStart!.getTime() !== quote.estimatedStartDate.getTime(),
          // Nota lasciata dal professionista quando modifica direttamente
          // l'orario proposto dal cliente durante la trattativa (richiesta
          // esplicita dell'utente) — valorizzata solo appena dopo quella
          // azione, resta finché il cliente non agisce di nuovo sul
          // preventivo (non azzerata da qui, il ciclo di vita è dello
          // stesso Quote.notes-like campo).
          professionalCounterNote: quote.professionalCounterNote,
          notes: quote.notes,
          status: quote.status,
          // Stato della prenotazione nata da questo preventivo (solo se
          // accettato), per lo stepper di stato — richiesta esplicita
          // dell'utente ("Richiesta → Preventivo inviato → Preventivo
          // accettato → Completato"). `null` finché il preventivo non è
          // stato accettato.
          bookingStatus: quote.booking?.status ?? null,
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
        ...(input.recipientName !== undefined ? { recipientName: input.recipientName.trim() || null } : {}),
        ...(input.recipientSurname !== undefined ? { recipientSurname: input.recipientSurname.trim() || null } : {}),
        ...(input.recipientPhone !== undefined ? { recipientPhone: input.recipientPhone.trim() || null } : {}),
        ...(input.houseNumber !== undefined ? { houseNumber: input.houseNumber.trim() || null } : {}),
        ...(input.addressExtra !== undefined ? { addressExtra: input.addressExtra.trim() || null } : {}),
        ...(input.postalCode !== undefined ? { postalCode: input.postalCode.trim() || null } : {}),
        ...(input.province !== undefined ? { province: input.province.trim() || null } : {}),
        ...(input.photoUrls !== undefined ? { photoUrls: input.photoUrls } : {}),
        ...(input.serviceMode !== undefined ? { serviceMode: input.serviceMode } : {}),
      },
    });

    // Cronologia (richiesta esplicita dell'utente): a tutti i thread già
    // aperti su questa richiesta (quoteCount === 0 sopra garantisce che
    // nessuno abbia ancora risposto, ma può comunque averla già ricevuta).
    const leads = await this.prisma.lead.findMany({ where: { guidedRequestId: request.id }, select: { professionalProfileId: true } });
    await Promise.all(
      leads.map((lead) =>
        this.timelineService.log(request.id, lead.professionalProfileId, "CLIENT", "Il cliente ha modificato i dettagli della richiesta."),
      ),
    );

    return {
      id: updated.id,
      description: updated.description,
      city: updated.city,
      address: updated.address,
      recipientName: updated.recipientName,
      recipientSurname: updated.recipientSurname,
      recipientPhone: updated.recipientPhone,
      houseNumber: updated.houseNumber,
      addressExtra: updated.addressExtra,
      postalCode: updated.postalCode,
      province: updated.province,
      photoUrls: updated.photoUrls,
    };
  }

  /**
   * Cancellazione lato cliente (CLAUDE.md §14) — CLOSED con closedReason
   * CANCELED_BY_CLIENT, non più un hard delete come prima di
   * GET /guided-requests/:id/status: una riga davvero cancellata non
   * potrebbe più riportare alcuno stato dopo la cancellazione, e Lead/Quote
   * (storico utile anche solo per debug) andrebbero persi con lei. Bloccata
   * se già CLOSED — stessa guardia di prima (requireOwnEditableRequest).
   * I Lead ancora PENDING vengono marcati EXPIRED (non DECLINED: non è
   * stato un professionista a rifiutare) — nessuna notifica di scadenza in
   * questo caso, è una scelta esplicita del cliente, non un timeout.
   */
  async remove(clientId: string, id: string): Promise<void> {
    const request = await this.requireOwnEditableRequest(clientId, id, "eliminare");
    const leads = await this.prisma.lead.findMany({ where: { guidedRequestId: request.id }, select: { professionalProfileId: true } });
    await this.prisma.lead.updateMany({
      where: { guidedRequestId: request.id, status: "PENDING" },
      data: { status: "EXPIRED" },
    });
    await this.prisma.guidedRequest.update({
      where: { id: request.id },
      data: { status: "CLOSED", closedReason: "CANCELED_BY_CLIENT" },
    });
    await Promise.all(
      leads.map((lead) => this.timelineService.log(request.id, lead.professionalProfileId, "CLIENT", "Il cliente ha annullato la richiesta.")),
    );
  }

  /**
   * Stato aggregato di una richiesta guidata per il cliente (CLAUDE.md
   * §14): solo tre numeri, mai l'identità dei professionisti contattati né
   * dettagli interni (expiresAt, wasExpanded — quelli restano solo lato
   * professionista/debug). "responded" conta chi ha inviato almeno un
   * preventivo (qualunque stato attuale, anche se poi ritirato/rifiutato:
   * la domanda è "ha risposto", non "il preventivo è ancora valido").
   * Nessuna relazione diretta Lead→Quote nello schema: il conteggio passa
   * per guidedRequestId, non serve nemmeno passare da Lead.
   */
  async getStatus(clientId: string, id: string): Promise<GuidedRequestStatusSummary> {
    const request = await this.prisma.guidedRequest.findUnique({ where: { id } });
    if (!request) {
      throw new NotFoundException("Richiesta non trovata.");
    }
    if (request.clientId !== clientId) {
      throw new ForbiddenException("Questa richiesta non è tua.");
    }

    const [totalContacted, responded, pending] = await Promise.all([
      this.prisma.lead.count({ where: { guidedRequestId: id } }),
      this.prisma.quote.count({ where: { guidedRequestId: id } }),
      this.prisma.lead.count({ where: { guidedRequestId: id, status: "PENDING", expiresAt: { gt: new Date() } } }),
    ]);

    let statusMessage: string | null = null;
    if (request.status === "CLOSED") {
      if (request.closedReason === "EXPIRED") {
        statusMessage = "Nessun professionista ha risposto in tempo: la richiesta è scaduta.";
      } else if (request.closedReason === "CANCELED_BY_CLIENT") {
        statusMessage = "Hai annullato questa richiesta.";
      } else if (request.closedReason === "COMPLETED") {
        statusMessage = "Richiesta conclusa: hai accettato un preventivo.";
      }
    } else if (pending === 0 && responded === 0) {
      // Coda di riserva esaurita, nessuno ha risposto — richiesta esplicita
      // dell'utente, testo esatto.
      statusMessage =
        "Al momento non ci sono professionisti disponibili nella tua zona per questa richiesta. La lasciamo attiva: appena un professionista compatibile si iscrive, gli arriverà automaticamente e riceverai il suo preventivo.";
    }

    return { totalContacted, responded, pending, statusMessage };
  }

  /**
   * Professionisti compatibili col fan-out di una richiesta guidata:
   * stessa categoria + entro il raggio di ingaggio del professionista
   * candidato (engagementRadiusKm per le richieste standard,
   * urgentEngagementRadiusKm per quelle urgenti — indipendenti tra loro,
   * richiesta esplicita dell'utente), non più un match esatto sulla
   * stringa città. La posizione della richiesta viene geocodificata dal
   * nome del comune (`findComuneByName`, stesso dataset ISTAT già usato
   * per geolocalizzare il professionista in upsertMyProfile — nessun nuovo
   * servizio di geocoding introdotto). Se il comune non è riconosciuto
   * (nome libero non presente nel dataset), si ricade sul comportamento
   * storico (match esatto per stringa città) invece di non inoltrare la
   * richiesta a nessuno: fallire in modo silenzioso qui costerebbe un
   * intero fan-out perso, peggio del comportamento meno preciso che
   * sostituisce.
   */
  private async matchProfilesForFanOut(categoryId: string, city: string, isUrgent: boolean): Promise<ProfessionalProfile[]> {
    // Un professionista che ha eliminato l'account (soft-delete) non entra
    // mai nel fan-out — stesso filtro già applicato a search()/getById().
    const candidates = await this.prisma.professionalProfile.findMany({ where: { categoryId, deletedAt: null } });
    const requestComune = findComuneByName(city);
    if (!requestComune) {
      return candidates.filter((profile) => profile.city.toLowerCase() === city.trim().toLowerCase());
    }
    return candidates.filter((profile) => {
      // Professionista senza coordinate reali ancora (0,0 placeholder, vedi
      // upsertMyProfile) — mai dentro un raggio, stessa convenzione già
      // usata da ResultsMap.tsx per escludere i puntini senza posizione.
      if (profile.latitude === 0 && profile.longitude === 0) return false;
      const radiusKm = isUrgent ? profile.urgentEngagementRadiusKm : profile.engagementRadiusKm;
      const distanceKm = calculateDistanceKm(requestComune.lat, requestComune.lon, profile.latitude, profile.longitude);
      return distanceKm <= radiusKm;
    });
  }

  /**
   * Coinvolge un professionista APPENA CREATO nelle richieste guidate
   * ancora aperte e compatibili — CLAUDE.md §14, STEP 4. Solo per le
   * richieste rimaste senza nessun Lead PENDING attivo (coda di riserva
   * del fan-out originale esaurita): se c'è già qualcuno in corsa non ha
   * senso aggiungerne un altro adesso, arriverà comunque se quelli
   * scadono/vengono rifiutati tramite expandLeadQueue — solo che quella
   * coda è stata "congelata" al momento del fan-out originale e non
   * include chi non esisteva ancora, da qui questo secondo canale.
   * Richieste dirette a un professionista specifico (professionalProfileId
   * valorizzato) sono escluse: sono già una scelta esplicita del cliente,
   * non fan-out generico.
   */
  async matchNewProfileToOpenRequests(profile: {
    id: string;
    userId: string;
    categoryId: string;
    latitude: number;
    longitude: number;
    engagementRadiusKm: number;
    urgentEngagementRadiusKm: number;
  }): Promise<void> {
    // Comune non ancora geocodificato (0,0 placeholder) — stessa
    // convenzione già usata in matchProfilesForFanOut, mai eleggibile.
    if (profile.latitude === 0 && profile.longitude === 0) return;

    const now = new Date();
    const openRequests = await this.prisma.guidedRequest.findMany({
      where: {
        status: { in: ["OPEN", "MATCHED"] },
        categoryId: profile.categoryId,
        professionalProfileId: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      include: { category: true },
    });

    for (const request of openRequests) {
      const activePendingLeads = await this.prisma.lead.count({
        where: { guidedRequestId: request.id, status: "PENDING", expiresAt: { gt: now } },
      });
      if (activePendingLeads > 0) continue;

      const requestComune = findComuneByName(request.city);
      if (!requestComune) continue;
      const radiusKm = request.isUrgent ? profile.urgentEngagementRadiusKm : profile.engagementRadiusKm;
      const distanceKm = calculateDistanceKm(requestComune.lat, requestComune.lon, profile.latitude, profile.longitude);
      if (distanceKm > radiusKm) continue;

      await this.prisma.lead.create({
        data: {
          guidedRequestId: request.id,
          professionalProfileId: profile.id,
          priceEurCents: request.isUrgent ? LEAD_PRICE_URGENT_EUR_CENTS : LEAD_PRICE_STANDARD_EUR_CENTS,
          expiresAt: this.computeLeadExpiry(request.isUrgent),
          wasExpanded: true,
        },
      });
      await this.prisma.guidedRequest.update({ where: { id: request.id }, data: { status: "MATCHED" } });
      await this.notificationsService.notify(profile.userId, "NEW_LEAD", {
        guidedRequestId: request.id,
        category: request.category.label,
        city: request.city,
        isUrgent: request.isUrgent,
      });
      // Metriche di affidabilità (CLAUDE.md §15, evento 1).
      await this.professionalMetricsService.recordRequestReceived(profile.id);
      await this.timelineService.log(
        request.id,
        profile.id,
        "SYSTEM",
        "La richiesta ti è stata inoltrata: sei un professionista compatibile appena iscritto.",
      );
    }
  }

  /**
   * Sceglie chi riceve davvero un Lead tra i candidati compatibili
   * (matchProfilesForFanOut) quando sono più di MAX_LEADS_PER_REQUEST —
   * richiesta esplicita dell'utente. Priorità per rating decrescente
   * (stesso rating già calcolato live da ProfessionalsService.search/
   * getById dalle recensioni reali, mai un valore salvato — niente nuovo
   * campo "punteggio di affidabilità": qui riusa lo stesso segnale che il
   * sistema calcola già), ma con 1 slot sempre riservato a un
   * professionista scelto a caso tra quelli senza recensioni ancora:
   * altrimenti un professionista nuovo non riceverebbe mai un lead finché
   * non ne accumula uno per vie traverse. I candidati non selezionati
   * restano in `reserve`, in ordine di priorità: expandLeadQueue li pesca
   * da lì quando un Lead scade o viene rifiutato.
   */
  private async selectLeadCandidates(candidates: ProfessionalProfile[]): Promise<{ selected: ProfessionalProfile[]; reserve: string[] }> {
    if (candidates.length <= MAX_LEADS_PER_REQUEST) {
      return { selected: candidates, reserve: [] };
    }

    const ratings = await this.getRatingsByProfile(candidates.map((c) => c.id));
    const rated = candidates.filter((c) => ratings.has(c.id)).sort((a, b) => ratings.get(b.id)! - ratings.get(a.id)!);
    const unrated = candidates.filter((c) => !ratings.has(c.id));

    const selected: ProfessionalProfile[] = [];
    if (unrated.length > 0) {
      const randomIndex = Math.floor(Math.random() * unrated.length);
      selected.push(...unrated.splice(randomIndex, 1));
    }
    selected.push(...rated.splice(0, MAX_LEADS_PER_REQUEST - selected.length));
    // Se restano slot liberi (poche persone con rating, riserva "nuovo
    // professionista" già usata) li riempie con altri senza recensioni.
    selected.push(...unrated.splice(0, MAX_LEADS_PER_REQUEST - selected.length));

    return { selected, reserve: [...rated, ...unrated].map((c) => c.id) };
  }

  /**
   * Rating medio per gruppo di professionisti in un'unica query batch —
   * stessa formula già in uso in ProfessionalsService.search/getById
   * (CLAUDE.md: "il rating è sempre calcolato dalle recensioni reali, mai
   * un valore statico"), riusata qui per selectLeadCandidates invece di
   * introdurre un secondo modo di calcolarlo. Un professionista senza
   * recensioni non compare nella mappa (non "zero", proprio assente):
   * selectLeadCandidates lo riconosce così come "senza dati sufficienti".
   */
  private async getRatingsByProfile(profileIds: string[]): Promise<Map<string, number>> {
    if (profileIds.length === 0) return new Map();
    const bookings = await this.prisma.booking.findMany({
      where: { professionalProfileId: { in: profileIds } },
      include: { review: true },
    });
    const ratingsByProfile = new Map<string, number[]>();
    for (const booking of bookings) {
      if (!booking.review) continue;
      const list = ratingsByProfile.get(booking.professionalProfileId) ?? [];
      list.push(booking.review.rating);
      ratingsByProfile.set(booking.professionalProfileId, list);
    }
    const result = new Map<string, number>();
    for (const [profileId, values] of ratingsByProfile) {
      result.set(profileId, Math.round((values.reduce((sum, v) => sum + v, 0) / values.length) * 10) / 10);
    }
    return result;
  }

  private computeLeadExpiry(isUrgent: boolean): Date {
    return isUrgent ? addMinutes(new Date(), URGENT_LEAD_EXPIRY_MINUTES) : addHours(new Date(), STANDARD_LEAD_EXPIRY_HOURS);
  }

  private computeRequestExpiry(isUrgent: boolean): Date {
    return isUrgent ? addDays(new Date(), URGENT_REQUEST_EXPIRY_DAYS) : addDays(new Date(), STANDARD_REQUEST_EXPIRY_DAYS);
  }

  /** Combina preferredDate (data pura, mezzanotte UTC) + preferredTimeSlot ("HH:MM-HH:MM") nell'orario di inizio esatto originariamente richiesto — null se la richiesta non ne porta uno. */
  private preferredStartDate(preferredDate: Date | null, preferredTimeSlot: string | null): Date | null {
    if (!preferredDate || !preferredTimeSlot) return null;
    const [startTime] = preferredTimeSlot.split("-");
    if (!startTime) return null;
    const [hoursStr, minutesStr] = startTime.split(":");
    const result = new Date(preferredDate);
    result.setUTCHours(Number(hoursStr), Number(minutesStr), 0, 0);
    return result;
  }

  /**
   * Pesca il prossimo candidato dalla coda di riserva di una richiesta
   * guidata (STEP 1 sopra) e gli crea un nuovo Lead — richiamata sia dal
   * job schedulato (runExpiryCheck, Lead scaduto) sia subito da
   * ProfessionalsService.declineLead (rifiuto esplicito: non ha senso far
   * aspettare al cliente il prossimo giro del job quando si sa già ora che
   * quel professionista non risponderà). Se la coda è vuota non fa nulla,
   * come da richiesta esplicita dell'utente.
   *
   * Transazione Serializable (stesso principio già in uso per
   * bookAgendaSlot/resolveGenericSlot altrove nel progetto): due
   * espansioni concorrenti sulla stessa richiesta — es. due Lead scadono
   * nello stesso istante nello stesso giro del job — non devono poter
   * pescare due volte lo stesso candidato dalla coda o perderne uno.
   */
  async expandLeadQueue(guidedRequestId: string): Promise<void> {
    type NotifyTarget = { userId: string; professionalProfileId: string; categoryLabel: string; city: string; isUrgent: boolean };
    let notifyTarget: NotifyTarget | null;

    try {
      notifyTarget = await this.prisma.$transaction(
        async (tx): Promise<NotifyTarget | null> => {
          const request = await tx.guidedRequest.findUnique({ where: { id: guidedRequestId }, include: { category: true } });
          if (!request || request.reserveCandidateIds.length === 0) return null;

          const [nextCandidateId, ...remainingReserve] = request.reserveCandidateIds;
          const candidate = await tx.professionalProfile.findUnique({ where: { id: nextCandidateId } });
          if (!candidate) {
            // Il candidato non esiste più (profilo eliminato nel
            // frattempo): lo scarta e aggiorna comunque la coda, così non
            // resta bloccato lì per sempre — il prossimo trigger proverà
            // col candidato successivo.
            await tx.guidedRequest.update({ where: { id: guidedRequestId }, data: { reserveCandidateIds: remainingReserve } });
            return null;
          }

          await tx.lead.create({
            data: {
              guidedRequestId,
              professionalProfileId: candidate.id,
              priceEurCents: request.isUrgent ? LEAD_PRICE_URGENT_EUR_CENTS : LEAD_PRICE_STANDARD_EUR_CENTS,
              expiresAt: this.computeLeadExpiry(request.isUrgent),
              wasExpanded: true,
            },
          });
          await tx.guidedRequest.update({
            where: { id: guidedRequestId },
            data: { reserveCandidateIds: remainingReserve, status: "MATCHED" },
          });

          return {
            userId: candidate.userId,
            professionalProfileId: candidate.id,
            categoryLabel: request.category.label,
            city: request.city,
            isUrgent: request.isUrgent,
          };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2034") {
        // Conflitto di serializzazione: un'altra espansione concorrente ha
        // già consumato la coda in questo istante — non un errore da
        // propagare, il prossimo trigger (job o decline) riproverà.
        return;
      }
      throw err;
    }

    if (notifyTarget) {
      await this.notificationsService.notify(notifyTarget.userId, "NEW_LEAD", {
        guidedRequestId,
        category: notifyTarget.categoryLabel,
        city: notifyTarget.city,
        isUrgent: notifyTarget.isUrgent,
      });
      // Metriche di affidabilità (CLAUDE.md §15, evento 1).
      await this.professionalMetricsService.recordRequestReceived(notifyTarget.professionalProfileId);
      await this.timelineService.log(
        guidedRequestId,
        notifyTarget.professionalProfileId,
        "SYSTEM",
        "Richiesta inoltrata a te: il professionista precedente non ha risposto in tempo.",
      );
    }
  }

  /**
   * Job schedulato (CLAUDE.md §14): ogni 5 minuti, in due passaggi
   * indipendenti.
   *
   * 1. Lead scaduti — PENDING, expiresAt superato, e SENZA una Quote
   *    collegata (un professionista che ha già risposto non va scaduto
   *    solo perché Lead.status resta PENDING per sempre anche dopo l'invio
   *    di un preventivo — nessuna colonna lo aggiorna, verificato in
   *    QuotesService.createOrUpdate: bisogna escluderli esplicitamente qui
   *    incrociando Quote per la stessa coppia guidedRequestId+
   *    professionalProfileId, l'unico modo di sapere "ha risposto" visto
   *    che Quote non ha una relazione diretta con Lead). Marcati EXPIRED,
   *    poi espansi verso il prossimo candidato in coda.
   * 2. Richieste guidate scadute — OPEN/MATCHED, expiresAt superato: i Lead
   *    PENDING ancora aperti vengono marcati EXPIRED (senza espansione,
   *    la richiesta stessa sta chiudendo), la richiesta passa a CLOSED con
   *    closedReason EXPIRED, il cliente viene notificato.
   */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async runExpiryCheck(): Promise<void> {
    const now = new Date();

    const expiredLeads = await this.prisma.lead.findMany({
      where: { status: "PENDING", expiresAt: { lt: now } },
    });
    if (expiredLeads.length > 0) {
      const respondedQuotes = await this.prisma.quote.findMany({
        where: {
          guidedRequestId: { in: expiredLeads.map((l) => l.guidedRequestId) },
          professionalProfileId: { in: expiredLeads.map((l) => l.professionalProfileId) },
        },
        select: { guidedRequestId: true, professionalProfileId: true },
      });
      const respondedPairs = new Set(respondedQuotes.map((q) => `${q.guidedRequestId}:${q.professionalProfileId}`));
      const leadsToExpire = expiredLeads.filter((l) => !respondedPairs.has(`${l.guidedRequestId}:${l.professionalProfileId}`));

      for (const lead of leadsToExpire) {
        await this.prisma.lead.update({ where: { id: lead.id }, data: { status: "EXPIRED" } });
        await this.timelineService.log(
          lead.guidedRequestId,
          lead.professionalProfileId,
          "SYSTEM",
          "La richiesta è scaduta: nessuna risposta in tempo.",
        );
        await this.expandLeadQueue(lead.guidedRequestId);
      }
      if (leadsToExpire.length > 0) {
        this.logger.log(`Scaduti ed espansi ${leadsToExpire.length} lead.`);
      }
    }

    const expiredRequests = await this.prisma.guidedRequest.findMany({
      where: { status: { in: ["OPEN", "MATCHED"] }, expiresAt: { lt: now } },
    });
    for (const request of expiredRequests) {
      const leads = await this.prisma.lead.findMany({ where: { guidedRequestId: request.id }, select: { professionalProfileId: true } });
      await this.prisma.lead.updateMany({
        where: { guidedRequestId: request.id, status: "PENDING" },
        data: { status: "EXPIRED" },
      });
      await this.prisma.guidedRequest.update({
        where: { id: request.id },
        data: { status: "CLOSED", closedReason: "EXPIRED" },
      });
      await this.notificationsService.notify(request.clientId, "GUIDED_REQUEST_EXPIRED", {
        guidedRequestId: request.id,
      });
      await Promise.all(
        leads.map((lead) =>
          this.timelineService.log(request.id, lead.professionalProfileId, "SYSTEM", "La richiesta è stata chiusa per scadenza."),
        ),
      );
    }
    if (expiredRequests.length > 0) {
      this.logger.log(`Chiuse per scadenza ${expiredRequests.length} richieste guidate.`);
    }
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
   * Valida che dateStr/timeSlot corrispondano a una fascia reale del
   * professionista (esatta o generica), e che quella data non sia un giorno
   * di chiusura straordinaria. Accetta anche le fasce esatte
   * (maxBookings=1): prima richiedeva esplicitamente maxBookings > 1 perché
   * quelle venivano prenotate direttamente (bookAgendaSlot, istantaneo,
   * senza passare da una richiesta di preventivo) — da quando la
   * prenotazione diretta è stata rimossa (CLAUDE.md §20, "ogni fascia apre
   * sempre una richiesta di preventivo, esatta o generica"), il profilo
   * pubblico linka a questo stesso percorso anche per le fasce esatte, che
   * senza questo fix venivano sempre rifiutate con "Questa fascia oraria
   * non è disponibile" — bug reale segnalato dall'utente (tentativo di
   * richiesta su una fascia 9–13, rifiutato sistematicamente).
   */
  private async resolveGenericSlot(
    professionalProfileId: string,
    dateStr: string,
    timeSlot: string,
    serviceMode: "HOME" | "ONLINE",
  ): Promise<{ date: Date; maxBookings: number }> {
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
    if (!slot) {
      throw new BadRequestException("Questa fascia oraria non è disponibile per l'invio di una richiesta di preventivo.");
    }
    if (exception) {
      throw new ConflictException("Il professionista non è disponibile in questa data.");
    }
    // La fascia deve offrire proprio il tipo richiesto (richiesta esplicita
    // dell'utente: "differenzia sempre se si è partiti con una consulenza
    // online... in base a quale casella il professionista ha flaggato") —
    // capienza indipendente per tipo, mai un fallback sull'altro.
    const maxBookings = serviceMode === "HOME" ? slot.homeMaxBookings : slot.onlineMaxBookings;
    if (maxBookings === null) {
      throw new BadRequestException(
        serviceMode === "HOME"
          ? "Il professionista non offre interventi a domicilio su questa fascia oraria."
          : "Il professionista non offre consulenza online su questa fascia oraria.",
      );
    }
    return { date, maxBookings };
  }
}
