import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, Logger, NotFoundException, Optional } from "@nestjs/common";
import { GeocodingService } from "../geocoding/geocoding.service";
import { Cron, CronExpression } from "@nestjs/schedule";
import { randomUUID } from "node:crypto";
import { Prisma, type PrismaClient, type ProfessionalProfile } from "@professionisti/database";
import { findComuneByName, professionalRestrictions, clientPaymentOffer, scheduleChangeBetween, type GuidedRequestInput, type GuidedRequestStatusSummary, type GuidedRequestUpdateInput } from "@professionisti/shared";
import { PRISMA } from "../prisma/prisma.module";
import { PUBLIC_VISIBILITY_SELECT, publicVisibilityMissing, publicVisibilityWhere, stripeVerified } from "../professional-fiscal/public-visibility";
import { NOT_ACCEPTING_REQUESTS } from "../subscriptions/subscription-rules";
import { calculateDistanceKm } from "../common/geo.util";
import { NotificationsService } from "../notifications/notifications.service";
import { ProfessionalMetricsService } from "../professional-metrics/professional-metrics.service";
import { TimelineService } from "../timeline/timeline.service";
import { GeneralRequestsService } from "../general-requests/general-requests.service";
import { toMyState } from "./guided-request-user-state.service";
import { computeDirectForwardAt } from "./lead-routing";

/** Candidato compatibile con la distanza dalla richiesta (null se non calcolabile). */
type MatchedCandidate = { profile: ProfessionalProfile; distanceKm: number | null; radiusKm: number | null };

// Lead standard vs urgente: la richiesta "ora" ha margine più alto per il
// professionista che risponde per primo (CLAUDE.md §7.5).
const LEAD_PRICE_STANDARD_EUR_CENTS = 500;
const LEAD_PRICE_URGENT_EUR_CENTS = 800;

// Smistamento (docs/CHANGELOG.md §210, decisione dell'utente): una richiesta
// generale va a tutti i professionisti della categoria nel cui raggio cade
// la città del cliente, senza tetto né scadenza per rispondere; resta aperta
// finché non si chiude (al più 30 giorni se urgente, 60 se normale). Una
// richiesta diretta va solo al professionista scelto, senza scadenza per lui:
// l'eventuale inoltro agli altri parte dopo 60 minuti / 6 ore (§209).
// Il boost a pagamento non entra mai nello smistamento.

// Scadenza dell'intera richiesta guidata: oltre questo tempo, se ancora
// aperta senza nessuna Quote ricevuta, il job schedulato la chiude
// (closedReason EXPIRED) invece di lasciarla appesa per sempre.
const URGENT_REQUEST_EXPIRY_DAYS = 30;
const STANDARD_REQUEST_EXPIRY_DAYS = 60;

function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000);
}
function addHours(date: Date, hours: number): Date {
  return addMinutes(date, hours * 60);
}
function addDays(date: Date, days: number): Date {
  return addHours(date, days * 24);
}

/**
 * Scadenza da scrivere nell'email "Nuova richiesta" (docs/CHANGELOG.md
 * §224): la scadenza della richiesta, mai per le urgenti (resta la
 * dicitura di prima, decisione dell'utente §221).
 */
function respondUntilForEmail(isUrgent: boolean, expiresAt: Date | null): string | null {
  return !isUrgent && expiresAt ? expiresAt.toISOString() : null;
}

/** "Idraulico, Elettricista e Muratore". */
function joinItalian(items: string[]): string {
  return items.length <= 1 ? (items[0] ?? "") : `${items.slice(0, -1).join(", ")} e ${items[items.length - 1]}`;
}

@Injectable()
export class GuidedRequestsService {
  private readonly logger = new Logger(GuidedRequestsService.name);

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly notificationsService: NotificationsService,
    private readonly professionalMetricsService: ProfessionalMetricsService,
    private readonly timelineService: TimelineService,
    private readonly generalRequestsService: GeneralRequestsService,
    // Facoltativo solo per i test che costruiscono il servizio a mano.
    @Optional() private readonly geocodingService?: GeocodingService,
  ) {}

  /**
   * Richiesta del modulo, con una o più categorie (docs/CHANGELOG.md §259):
   * una richiesta separata per ogni categoria, con gli stessi dati. I
   * controlli (categorie, zona aperta, indirizzo) si fanno tutti prima di
   * crearne una, così non resta mai una parte delle richieste a metà.
   */
  async createForCategories(clientId: string, input: GuidedRequestInput) {
    const { extraCategorySlugs, ...rest } = input;
    const slugs = [input.categorySlug, ...(extraCategorySlugs ?? [])];
    if (slugs.length === 1) {
      const created = await this.create(clientId, rest);
      return { ...created, requests: [{ ...created, categorySlug: input.categorySlug }] };
    }
    const categories = await this.prisma.category.findMany({ where: { slug: { in: slugs } } });
    if (categories.length !== slugs.length) {
      throw new BadRequestException("Categoria non valida.");
    }
    for (const slug of slugs) {
      const category = categories.find((c) => c.slug === slug)!;
      await this.assertGeneralRequestsOpen(category, input.city ?? null, true);
    }
    await this.assertAddressInCity(input);
    const submissionGroupId = randomUUID();
    const requests: { guidedRequestId: string; matchedProfessionals: number; categorySlug: string }[] = [];
    for (const slug of slugs) {
      const created = await this.create(clientId, { ...rest, categorySlug: slug as GuidedRequestInput["categorySlug"] }, { checksDone: true, submissionGroupId });
      requests.push({ ...created, categorySlug: slug });
    }
    // Una sola email di conferma per tutto l'invio, non una per categoria.
    this.notificationsService.emailRequestSent(clientId, {
      category: joinItalian(slugs.map((slug) => categories.find((c) => c.slug === slug)!.label)),
      requestsCount: slugs.length,
      city: input.city ?? null,
      isUrgent: input.isUrgent,
      sentTo: requests.reduce((sum, r) => sum + r.matchedProfessionals, 0),
      direct: false,
      description: input.description,
    });
    return {
      guidedRequestId: requests[0]!.guidedRequestId,
      matchedProfessionals: requests.reduce((sum, r) => sum + r.matchedProfessionals, 0),
      requests,
    };
  }

  /** Indirizzo vero e nel comune indicato (docs/CHANGELOG.md §214). */
  private async assertAddressInCity(input: Pick<GuidedRequestInput, "serviceMode" | "address" | "houseNumber" | "postalCode" | "city">) {
    if (input.serviceMode === "HOME" && input.address?.trim() && input.city?.trim()) {
      await this.geocodingService?.assertAddressInCity({
        street: input.address,
        houseNumber: input.houseNumber,
        postalCode: input.postalCode,
        city: input.city,
      });
    }
  }

  /**
   * Richieste generali chiuse per tutto il sito o per questa categoria in
   * questa città (docs/CHANGELOG.md §211).
   */
  private async assertGeneralRequestsOpen(category: { id: string; label: string }, city: string | null, nameCategory = false) {
    const availability = await this.generalRequestsService.availability(category.id, city);
    if (!availability.open) {
      throw new ForbiddenException(
        availability.closedScope === "GLOBAL"
          ? "Le richieste generali non sono attive: scegli un professionista dalla ricerca e invia la richiesta dal suo profilo."
          : `In questa zona le richieste generali per ${nameCategory ? category.label : "questa categoria"} sono chiuse: scegli un professionista dalla ricerca e invia la richiesta dal suo profilo.`,
      );
    }
  }

  /**
   * `opts.excludeProfileId`: professionista da escludere dallo smistamento
   * (richiesta rinviata ad altri dopo una mancata presentazione accolta,
   * docs/CHANGELOG.md §167). `opts.checksDone`: zona e indirizzo già
   * controllati da createForCategories, che manda anche una sola email di
   * conferma per tutto l'invio (`submissionGroupId` valorizzato).
   */
  async create(
    clientId: string,
    input: Omit<GuidedRequestInput, "extraCategorySlugs">,
    opts: { excludeProfileId?: string; checksDone?: boolean; submissionGroupId?: string } = {},
  ) {
    let category = await this.prisma.category.findUnique({ where: { slug: input.categorySlug } });
    if (!category) {
      throw new BadRequestException("Categoria non valida.");
    }
    if (!opts.checksDone) await this.assertAddressInCity(input);
    // Non vale per il rinvio fatto dal sistema dopo una mancata
    // presentazione (excludeProfileId, §167).
    if (!input.professionalProfileId && !opts.excludeProfileId && !opts.checksDone) {
      await this.assertGeneralRequestsOpen(category, input.city ?? null);
    }

    let targetProfile: {
      id: string;
      deletedAt: Date | null;
      suspendedAt: Date | null;
      invitePendingAt: Date | null;
      pausedAt: Date | null;
      demotedUntil: Date | null;
      requestsBlockedUntil: Date | null;
      category: NonNullable<typeof category>;
      extraCategories: { id: string }[];
      isDemo: boolean;
      fiscalProfile: { fiscalDataCompleteAt: Date | null } | null;
    } | null = null;
    if (input.professionalProfileId) {
      targetProfile = await this.prisma.professionalProfile.findUnique({
        where: { id: input.professionalProfileId },
        select: {
          id: true,
          deletedAt: true,
          suspendedAt: true,
          invitePendingAt: true,
          pausedAt: true,
          demotedUntil: true,
          requestsBlockedUntil: true,
          category: true,
          extraCategories: { select: { id: true } },
          ...PUBLIC_VISIBILITY_SELECT,
        },
      });
      // Un professionista che ha eliminato l'account (soft-delete) non può
      // ricevere nuove richieste — stesso stato di "non trovato" già
      // applicato altrove alle query pubbliche su ProfessionalProfile.
      if (!targetProfile || targetProfile.deletedAt || targetProfile.suspendedAt || targetProfile.invitePendingAt || publicVisibilityMissing(targetProfile)) {
        throw new NotFoundException("Professionista non trovato.");
      }
      // Account in pausa per l'abbonamento (docs/CHANGELOG.md §162).
      // Account in pausa, o bloccato per segnalazioni accolte (§167).
      if (targetProfile.pausedAt || professionalRestrictions(targetProfile, new Date()).blocked) {
        throw new ConflictException(NOT_ACCEPTING_REQUESTS);
      }
      // La categoria di una richiesta diretta deve essere una delle sue
      // (docs/CHANGELOG.md §217): il modulo non la fa più scegliere, ma un
      // link vecchio o una chiamata diretta potrebbero mandarne un'altra.
      // Si usa la sua principale invece di rifiutare la richiesta.
      const ownCategoryIds = [targetProfile.category.id, ...targetProfile.extraCategories.map((extra) => extra.id)];
      if (!ownCategoryIds.includes(category.id)) {
        category = targetProfile.category;
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
              // Facoltativa per un intervento online (richiesta esplicita
              // dell'utente) — la colonna resta non-nullable a livello DB
              // (nessuna migrazione, stessa convenzione già in uso per
              // altri campi opzionali di questo modello: stringa vuota =
              // "non indicata", non un null).
              city: input.city?.trim() ?? "",
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
              forwardIfNoReply: !!targetProfile && input.forwardIfNoReply,
              forwardAt: targetProfile && input.forwardIfNoReply ? computeDirectForwardAt(input.isUrgent) : null,
              preferredDate: resolvedSlot?.date,
              preferredTimeSlot: resolvedSlot ? input.preferredTimeSlot : undefined,
              submissionGroupId: opts.submissionGroupId,
              trafficSource: input.trafficSource ?? null,
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
    const matchingProfiles: MatchedCandidate[] = input.professionalProfileId
      ? (await this.prisma.professionalProfile.findMany({ where: { id: input.professionalProfileId } })).map((profile) => ({
          profile,
          distanceKm: null,
          radiusKm: null,
        }))
      : await this.matchProfilesForFanOut(category.id, input.city ?? "", input.isUrgent, {
          excludeProfileId: opts.excludeProfileId,
          remoteOnly: input.serviceMode === "ONLINE",
        });

    // A tutti i compatibili, senza tetto né coda di riserva (docs/CHANGELOG.md §210).
    const leadRecipients = matchingProfiles.map((m) => m.profile);

    const leadPriceEurCents = input.isUrgent ? LEAD_PRICE_URGENT_EUR_CENTS : LEAD_PRICE_STANDARD_EUR_CENTS;
    const requestExpiresAt = this.computeRequestExpiry(input.isUrgent);

    if (leadRecipients.length > 0) {
      // Nessuna scadenza per rispondere (docs/CHANGELOG.md §209-§210): si
      // risponde finché la richiesta è aperta. Per una richiesta diretta
      // l'eventuale inoltro ad altri parte da GuidedRequest.forwardAt.
      await this.prisma.lead.createMany({
        data: leadRecipients.map((profile) => ({
          guidedRequestId: guidedRequest.id,
          professionalProfileId: profile.id,
          priceEurCents: leadPriceEurCents,
          expiresAt: null,
        })),
        skipDuplicates: true,
      });

      await this.prisma.guidedRequest.update({
        where: { id: guidedRequest.id },
        data: { status: "MATCHED", expiresAt: requestExpiresAt },
      });

      // Notifica a ogni destinatario con `notify` (docs/CHANGELOG.md §154):
      // prima era una createMany diretta, che saltava il push in tempo reale
      // (il professionista la vedeva solo al controllo successivo, fino a
      // 45s dopo) e le preferenze di notifica; `notify` fa anche l'email.
      for (const profile of leadRecipients) {
        await this.notificationsService.notify(profile.userId, "NEW_LEAD", {
          guidedRequestId: guidedRequest.id,
          category: category.label,
          city: input.city ?? null,
          isUrgent: input.isUrgent,
          respondUntil: respondUntilForEmail(input.isUrgent, requestExpiresAt),
        });
      }

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

    // Conferma al cliente che la richiesta è partita (docs/CHANGELOG.md §185).
    if (!opts.submissionGroupId) this.notificationsService.emailRequestSent(clientId, {
      category: category.label,
      city: input.city ?? null,
      isUrgent: input.isUrgent,
      sentTo: leadRecipients.length,
      direct: Boolean(input.professionalProfileId),
      description: guidedRequest.description,
    });

    return {
      // Professionisti che hanno DAVVERO ricevuto un Lead (dopo la
      // selezione), non solo i candidati compatibili trovati — questo
      // numero coincide con matchingProfiles.length (nessun tetto, §210).
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
        quotes: {
          include: {
            professionalProfile: { include: { fiscalProfile: { select: { stripePayoutsEnabled: true, entityType: true } } } },
            items: true,
            booking: { select: { status: true } },
          },
        },
        // A chi è stata inviata la richiesta: mostrato in /le-mie-richieste
        // (richiesta esplicita dell'utente — "deve essere chiaro a chi si è
        // inviata la richiesta"), un professionista o più in caso di fan-out.
        leads: { include: { professionalProfile: { include: { category: true } } } },
        // Stato personale del cliente sulla scheda (archiviata, silenziata,
        // ecc. — docs/CHANGELOG.md §130): al più una riga per utente.
        userStates: { where: { userId: clientId } },
      },
      orderBy: { createdAt: "desc" },
    });

    return requests.map((request) => {
      // Altre richieste dello stesso invio con più categorie (§259).
      const sentWith = request.submissionGroupId
        ? requests
            .filter((other) => other.id !== request.id && other.submissionGroupId === request.submissionGroupId)
            .map((other) => ({ id: other.id, categoryLabel: other.category.label }))
        : [];
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
      const requestedEnd = this.preferredStartDate(request.preferredDate, request.preferredTimeSlot?.split("-")[1] ?? null);
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
        // Esposto ora anche qui (richiesta esplicita dell'utente,
        // /le-mie-richieste "simile alle richieste ricevute"): distingue
        // lato client una richiesta scaduta da una annullata volontariamente,
        // stesso dato già usato solo internamente da getStatus() sopra.
        closedReason: request.closedReason,
        // "La richiesta resta aperta fino al …" (docs/CHANGELOG.md §224):
        // finché è aperta e nessun preventivo è stato accettato.
        openUntil:
          request.status !== "CLOSED" &&
          request.expiresAt &&
          request.expiresAt.getTime() > Date.now() &&
          !request.quotes.some((quote) => quote.status === "ACCEPTED")
            ? request.expiresAt.toISOString()
            : null,
        createdAt: request.createdAt.toISOString(),
        updatedAt: latestQuoteUpdate.toISOString(),
        sentWith,
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
          // Foto profilo accanto al nome nella scheda del preventivo
          // (richiesta esplicita dell'utente: riconoscere a colpo d'occhio
          // di chi si tratta). Mai per un profilo eliminato.
          imageUrl: quote.professionalProfile.deletedAt ? null : quote.professionalProfile.imageUrl,
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
          // Nota del cliente senza cambio di data (docs/CHANGELOG.md §196).
          clientNote: quote.clientNote,
          // Totale prima dell'ultima modifica dei prezzi (docs/CHANGELOG.md §196).
          previousPrice:
            quote.previousPriceMinEurCents !== null || quote.previousPriceMaxEurCents !== null
              ? { minEurCents: quote.previousPriceMinEurCents, maxEurCents: quote.previousPriceMaxEurCents }
              : null,
          // Appuntamento che quello attuale ha sostituito, per il "prima →
          // ora" del cliente (docs/CHANGELOG.md §186, come lo vede il
          // professionista): l'ultima modifica del professionista se c'è,
          // altrimenti l'orario che il cliente aveva chiesto quando la
          // richiesta è nata da una fascia dell'agenda pubblica e il
          // preventivo non lo rispetta (docs/CHANGELOG.md §180).
          previousSchedule: quote.previousStartDate
            ? { start: quote.previousStartDate.toISOString(), end: quote.previousEndDate?.toISOString() ?? null }
            : requestedStart && scheduleChangeBetween({ start: requestedStart }, { start: quote.estimatedStartDate })
              ? { start: requestedStart.toISOString(), end: requestedEnd?.toISOString() ?? null }
              : null,
          // Nota lasciata dal professionista quando modifica direttamente
          // l'orario proposto dal cliente durante la trattativa (richiesta
          // esplicita dell'utente) — valorizzata solo appena dopo quella
          // azione, resta finché il cliente non agisce di nuovo sul
          // preventivo (non azzerata da qui, il ciclo di vita è dello
          // stesso Quote.notes-like campo).
          professionalCounterNote: quote.professionalCounterNote,
          // Nota del rifiuto e nuovo preventivo dopo il rifiuto (docs/CHANGELOG.md §188).
          rejectionNote: quote.status === "REJECTED" ? quote.rejectionNote : null,
          // Modi di pagamento offerti (docs/CHANGELOG.md §237), coi valori di
          // serie per i preventivi vecchi; senza la verifica su Stripe del
          // professionista l'acconto online non si può scegliere (§241).
          ...clientPaymentOffer(quote, stripeVerified(quote.professionalProfile.fiscalProfile)),
          resentAt: quote.resentAt?.toISOString() ?? null,
          notes: quote.notes,
          status: quote.status,
          // Stato della prenotazione nata da questo preventivo (solo se
          // accettato), per lo stepper di stato — richiesta esplicita
          // dell'utente ("Richiesta → Preventivo inviato → Preventivo
          // accettato → Completato"). `null` finché il preventivo non è
          // stato accettato.
          bookingStatus: quote.booking?.status ?? null,
        })),
        myState: toMyState(request.userStates?.[0]),
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
    // Richiesta generale: la città resta obbligatoria anche online (§210).
    if (!request.professionalProfileId && !input.city?.trim()) {
      throw new BadRequestException("La città è obbligatoria.");
    }
    // Indirizzo controllato solo se cambia via, civico o città (docs/CHANGELOG.md §214).
    const newAddress = input.address?.trim() || null;
    const newHouseNumber = input.houseNumber !== undefined ? input.houseNumber.trim() || null : request.houseNumber;
    const newCity = input.city?.trim() ?? "";
    if (
      (input.serviceMode ?? request.serviceMode) === "HOME" &&
      newAddress &&
      newCity &&
      (newAddress !== request.address || newHouseNumber !== request.houseNumber || newCity !== request.city)
    ) {
      await this.geocodingService?.assertAddressInCity({
        street: newAddress,
        houseNumber: newHouseNumber,
        postalCode: input.postalCode !== undefined ? input.postalCode : request.postalCode,
        city: newCity,
      });
    }
    const updated = await this.prisma.guidedRequest.update({
      where: { id: request.id },
      data: {
        description: input.description,
        city: input.city?.trim() ?? "",
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
   * Eliminazione definitiva lato cliente (docs/CHANGELOG.md §130, richiesta
   * esplicita dell'utente: "prima annulli, poi archivi o elimini") — a
   * differenza di `remove` sopra (che annulla, CLOSED/CANCELED_BY_CLIENT),
   * qui la riga sparisce davvero, con Lead/Quote/cronologia in cascata.
   * Solo su una richiesta già chiusa (annullata o scaduta: prima va
   * annullata, così i professionisti vengono avvisati nella cronologia) e
   * mai se un preventivo ha già generato una prenotazione: quella documenta
   * un lavoro reale (e `Booking.quoteId` non è in cascata).
   * Le notifiche che puntano alla richiesta vengono rimosse per tutti,
   * altrimenti porterebbero a una scheda che non esiste più.
   */
  async permanentlyDelete(clientId: string, id: string): Promise<void> {
    const request = await this.prisma.guidedRequest.findUnique({ where: { id } });
    if (!request) {
      throw new NotFoundException("Richiesta non trovata.");
    }
    if (request.clientId !== clientId) {
      throw new ForbiddenException("Questa richiesta non è tua.");
    }
    if (request.status !== "CLOSED") {
      throw new ForbiddenException("Annulla la richiesta prima di eliminarla definitivamente.");
    }
    const bookingCount = await this.prisma.booking.count({ where: { quote: { guidedRequestId: id } } });
    if (bookingCount > 0) {
      throw new ForbiddenException("Non puoi eliminare una richiesta che ha già portato a una prenotazione: puoi archiviarla.");
    }
    await this.prisma.$transaction([
      this.prisma.notification.deleteMany({ where: { payload: { path: ["guidedRequestId"], equals: id } } }),
      this.prisma.guidedRequest.delete({ where: { id } }),
    ]);
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
      // expiresAt nullo: professionista scelto dal cliente, senza scadenza (§209).
      this.prisma.lead.count({
        where: { guidedRequestId: id, status: "PENDING", OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
      }),
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
  private async matchProfilesForFanOut(
    categoryId: string,
    city: string,
    isUrgent: boolean,
    opts: { excludeProfileId?: string; remoteOnly?: boolean } = {},
  ): Promise<MatchedCandidate[]> {
    const { excludeProfileId, remoteOnly } = opts;
    // Un professionista che ha eliminato l'account (soft-delete) non entra
    // mai nel fan-out — stesso filtro già applicato a search()/getById().
    const candidates = await this.prisma.professionalProfile.findMany({
      where: {
        // Categoria principale o una delle aggiuntive (docs/CHANGELOG.md §217).
        // Solo professionisti verificati su Stripe (docs/CHANGELOG.md §239).
        AND: [{ OR: [{ categoryId }, { extraCategories: { some: { id: categoryId } } }] }, publicVisibilityWhere()],
        deletedAt: null,
        suspendedAt: null,
        pausedAt: null,
        // Profilo creato da un operatore, non ancora confermato (§170).
        invitePendingAt: null,
        // Nessuna nuova richiesta per 14 giorni dopo la 3ª segnalazione accolta (§167).
        OR: [{ requestsBlockedUntil: null }, { requestsBlockedUntil: { lte: new Date() } }],
        ...(excludeProfileId ? { id: { not: excludeProfileId } } : {}),
        // Intervento online: solo chi offre consulenza da remoto (§210).
        ...(remoteOnly ? { remoteAvailable: true } : {}),
      },
    });
    const trimmedCity = city.trim();
    // Città facoltativa per una richiesta "online": senza una zona il raggio
    // non si applica, il match ricade su chi offre consulenza da remoto.
    if (!trimmedCity) {
      return candidates.filter((profile) => profile.remoteAvailable).map((profile) => ({ profile, distanceKm: null, radiusKm: null }));
    }
    const requestComune = findComuneByName(trimmedCity);
    if (!requestComune) {
      return candidates
        .filter((profile) => profile.city.toLowerCase() === trimmedCity.toLowerCase())
        .map((profile) => ({ profile, distanceKm: null, radiusKm: null }));
    }
    const matched: MatchedCandidate[] = [];
    for (const profile of candidates) {
      // Senza coordinate reali (0,0 placeholder) mai dentro un raggio.
      if (profile.latitude === 0 && profile.longitude === 0) continue;
      const radiusKm = isUrgent ? profile.urgentEngagementRadiusKm : profile.engagementRadiusKm;
      const distanceKm = calculateDistanceKm(requestComune.lat, requestComune.lon, profile.latitude, profile.longitude);
      if (distanceKm <= radiusKm) matched.push({ profile, distanceKm, radiusKm });
    }
    return matched;
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
    /** Categorie per cui cercare richieste aperte: tutte alla creazione, solo le nuove quando le cambia. */
    categoryIds: string[];
    latitude: number;
    longitude: number;
    engagementRadiusKm: number;
    urgentEngagementRadiusKm: number;
    remoteAvailable: boolean;
  }): Promise<void> {
    // Comune non ancora geocodificato (0,0 placeholder) — stessa
    // convenzione già usata in matchProfilesForFanOut, mai eleggibile.
    if (profile.latitude === 0 && profile.longitude === 0) return;

    const now = new Date();
    const openRequests = await this.prisma.guidedRequest.findMany({
      where: {
        status: { in: ["OPEN", "MATCHED"] },
        categoryId: { in: profile.categoryIds },
        professionalProfileId: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      include: { category: true },
    });

    for (const request of openRequests) {
      // Ogni richiesta generale va a tutti i compatibili (§210): anche a chi
      // si iscrive dopo, purché non l'abbia già ricevuta.
      if (request.serviceMode === "ONLINE" && !profile.remoteAvailable) continue;
      const alreadyReceived = await this.prisma.lead.count({ where: { guidedRequestId: request.id, professionalProfileId: profile.id } });
      if (alreadyReceived > 0) continue;
      // Nessun destinatario finora: il cliente aveva inviato la richiesta
      // quando in zona non c'era nessuno e va avvisato (docs/CHANGELOG.md §271).
      const isFirstRecipient = (await this.prisma.lead.count({ where: { guidedRequestId: request.id } })) === 0;

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
          expiresAt: null,
          wasExpanded: true,
        },
      });
      await this.prisma.guidedRequest.update({ where: { id: request.id }, data: { status: "MATCHED" } });
      await this.notificationsService.notify(profile.userId, "NEW_LEAD", {
        guidedRequestId: request.id,
        category: request.category.label,
        city: request.city,
        isUrgent: request.isUrgent,
        respondUntil: respondUntilForEmail(request.isUrgent, request.expiresAt),
      });
      if (isFirstRecipient) {
        await this.notificationsService.notify(request.clientId, "REQUEST_MATCHED_LATER", { guidedRequestId: request.id });
      }
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

  private computeRequestExpiry(isUrgent: boolean): Date {
    return isUrgent ? addDays(new Date(), URGENT_REQUEST_EXPIRY_DAYS) : addDays(new Date(), STANDARD_REQUEST_EXPIRY_DAYS);
  }

  /**
   * Inoltra una richiesta diretta ad altri professionisti simili quando
   * quello scelto non ha risposto entro `forwardAt` (runExpiryCheck) o ha
   * rifiutato, se il cliente ha lasciato attiva la casella (docs/CHANGELOG.md
   * §154, tempi in §209). Una sola volta: la
   * prima chiamata "prenota" l'inoltro con un update condizionato su
   * `forwardedAt` nullo, così due espansioni concorrenti non lo raddoppiano.
   * Stessa selezione per punteggio delle richieste generiche, escluso il
   * professionista scelto: va a tutti i compatibili della zona, senza
   * scadenza (§210).
   */
  private async forwardDirectRequest(guidedRequestId: string): Promise<void> {
    const claimed = await this.prisma.guidedRequest.updateMany({
      where: { id: guidedRequestId, forwardedAt: null, forwardIfNoReply: true, status: { in: ["OPEN", "MATCHED"] } },
      data: { forwardedAt: new Date() },
    });
    if (claimed.count === 0) return;
    const request = await this.prisma.guidedRequest.findUnique({ where: { id: guidedRequestId }, include: { category: true } });
    if (!request) return;

    // Zona: quella scritta dal cliente; se non l'ha indicata (es. intervento
    // online), quella del professionista scelto (docs/CHANGELOG.md §209).
    const chosen = request.professionalProfileId
      ? await this.prisma.professionalProfile.findUnique({ where: { id: request.professionalProfileId }, select: { city: true } })
      : null;
    const zone = request.city.trim() || chosen?.city || "";
    const matched = await this.matchProfilesForFanOut(request.categoryId, zone, request.isUrgent, {
      excludeProfileId: request.professionalProfileId ?? undefined,
      remoteOnly: request.serviceMode === "ONLINE",
    });
    // A tutti i compatibili della zona, come una richiesta generale (§210).
    const selected = matched.map((m) => m.profile);

    if (selected.length === 0) {
      await this.notificationsService.notify(request.clientId, "REQUEST_FORWARD_NO_MATCH", { guidedRequestId });
      return;
    }

    await this.prisma.lead.createMany({
      data: selected.map((profile) => ({
        guidedRequestId,
        professionalProfileId: profile.id,
        priceEurCents: request.isUrgent ? LEAD_PRICE_URGENT_EUR_CENTS : LEAD_PRICE_STANDARD_EUR_CENTS,
        expiresAt: null,
        wasExpanded: true,
      })),
      skipDuplicates: true,
    });
    await this.prisma.guidedRequest.update({ where: { id: guidedRequestId }, data: { status: "MATCHED" } });

    for (const profile of selected) {
      await this.notificationsService.notify(profile.userId, "NEW_LEAD", {
        guidedRequestId,
        category: request.category.label,
        city: request.city,
        isUrgent: request.isUrgent,
        respondUntil: respondUntilForEmail(request.isUrgent, request.expiresAt),
      });
      await this.professionalMetricsService.recordRequestReceived(profile.id);
      await this.timelineService.log(
        guidedRequestId,
        profile.id,
        "SYSTEM",
        "Il cliente aveva scelto un altro professionista che non ha ancora risposto: la richiesta è stata inoltrata anche a te.",
      );
    }
    await this.notificationsService.notify(request.clientId, "REQUEST_FORWARDED", { guidedRequestId, count: selected.length });
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
    // Richiesta diretta senza risposta: se il cliente l'ha chiesto, la si
    // inoltra ad altri professionisti simili (docs/CHANGELOG.md §154).
    const pre = await this.prisma.guidedRequest.findUnique({
      where: { id: guidedRequestId },
      select: { reserveCandidateIds: true, professionalProfileId: true, forwardIfNoReply: true, forwardedAt: true },
    });
    if (pre && pre.reserveCandidateIds.length === 0 && pre.professionalProfileId && pre.forwardIfNoReply && !pre.forwardedAt) {
      await this.forwardDirectRequest(guidedRequestId);
      return;
    }
    type NotifyTarget = { userId: string; professionalProfileId: string; categoryLabel: string; city: string; isUrgent: boolean; expiresAt: Date | null };
    let notifyTarget: NotifyTarget | null;

    try {
      notifyTarget = await this.prisma.$transaction(
        async (tx): Promise<NotifyTarget | null> => {
          const request = await tx.guidedRequest.findUnique({ where: { id: guidedRequestId }, include: { category: true } });
          if (!request || request.reserveCandidateIds.length === 0) return null;

          const [nextCandidateId, ...remainingReserve] = request.reserveCandidateIds;
          const candidate = await tx.professionalProfile.findUnique({ where: { id: nextCandidateId }, include: { fiscalProfile: { select: { fiscalDataCompleteAt: true } } } });
          // Scartato anche se nel frattempo è uscito dallo smistamento
          // (eliminato, sospeso, in pausa, bloccato per segnalazioni, §167).
          if (
            !candidate ||
            candidate.deletedAt ||
            candidate.suspendedAt ||
            candidate.invitePendingAt ||
            candidate.pausedAt ||
            publicVisibilityMissing(candidate) ||
            professionalRestrictions(candidate, new Date()).blocked
          ) {
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
              expiresAt: null,
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
            expiresAt: request.expiresAt,
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
        respondUntil: respondUntilForEmail(notifyTarget.isUrgent, notifyTarget.expiresAt),
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

    // Richieste dirette senza risposta dal professionista scelto entro
    // forwardAt (60 minuti se urgente, 6 ore se normale, docs/CHANGELOG.md
    // §209), né preventivo né messaggio in chat: se il cliente ha lasciato
    // la casella, si inoltrano ad altri.
    // Il professionista scelto tiene la richiesta e può ancora rispondere.
    const dueForward = await this.prisma.guidedRequest.findMany({
      where: { forwardIfNoReply: true, forwardedAt: null, forwardAt: { lt: now }, status: { in: ["OPEN", "MATCHED"] } },
      select: { id: true, professionalProfileId: true },
    });
    for (const request of dueForward) {
      if (!request.professionalProfileId) continue;
      // Risposta = un preventivo o un messaggio scritto da lui in chat.
      const [quotes, messages] = await Promise.all([
        this.prisma.quote.count({ where: { guidedRequestId: request.id, professionalProfileId: request.professionalProfileId } }),
        this.prisma.conversationEvent.count({
          where: { guidedRequestId: request.id, professionalProfileId: request.professionalProfileId, actor: "PROFESSIONAL", automatic: false },
        }),
      ]);
      if (quotes + messages > 0) {
        // Ha già risposto: nessun inoltro, e la richiesta esce da questo controllo.
        await this.prisma.guidedRequest.update({ where: { id: request.id }, data: { forwardAt: null } });
        continue;
      }
      await this.forwardDirectRequest(request.id);
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
