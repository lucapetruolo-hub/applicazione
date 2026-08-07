import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { PrismaClient } from "@professionisti/database";
import type { CancelBookingByProfessionalInput, CompleteBookingInput } from "@professionisti/shared";
import { PRISMA } from "../prisma/prisma.module";
import { NotificationsService } from "../notifications/notifications.service";
import { ProfessionalMetricsService } from "../professional-metrics/professional-metrics.service";

@Injectable()
export class BookingsService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly notificationsService: NotificationsService,
    private readonly professionalMetricsService: ProfessionalMetricsService,
  ) {}

  /**
   * Il cliente accetta un preventivo: crea la prenotazione, chiude la
   * richiesta e copia sulla prenotazione l'indirizzo di lavoro strutturato
   * già raccolto sulla GuidedRequest fin dall'invio della richiesta
   * (richiesta esplicita dell'utente: "voglio che li inserisca subito
   * appena [invia] un preventivo... ma verranno visualizzati al
   * professionista... solo quando si è conclusa la trattativa" — prima
   * questi campi arrivavano da un input separato raccolto solo qui, in una
   * schermata dedicata all'accettazione).
   */
  async createFromQuote(clientId: string, quoteId: string) {
    const quote = await this.prisma.quote.findUnique({
      where: { id: quoteId },
      include: { guidedRequest: true, booking: true, professionalProfile: true },
    });
    if (!quote) {
      throw new NotFoundException("Preventivo non trovato.");
    }
    if (quote.guidedRequest.clientId !== clientId) {
      throw new ForbiddenException("Questo preventivo non è associato a una tua richiesta.");
    }
    if (quote.booking) {
      throw new ForbiddenException("Questo preventivo è già stato accettato.");
    }
    // Bug reale scoperto in verifica: mancava un controllo sullo stato del
    // preventivo — un preventivo REJECTED (rifiutato dallo stesso cliente)
    // o WITHDRAWN (ritirato dal professionista) restava comunque
    // accettabile, perché l'unica guardia era "non ha già una booking".
    if (quote.status === "REJECTED" || quote.status === "WITHDRAWN") {
      throw new ForbiddenException("Questo preventivo non è più disponibile.");
    }

    const { guidedRequest } = quote;
    const booking = await this.prisma.booking.create({
      data: {
        quoteId: quote.id,
        clientId,
        professionalProfileId: quote.professionalProfileId,
        scheduledAt: quote.estimatedStartDate,
        scheduledEndAt: quote.estimatedEndDate,
        status: "CONFIRMED",
        recipientName: guidedRequest.recipientName,
        recipientSurname: guidedRequest.recipientSurname,
        recipientPhone: guidedRequest.recipientPhone,
        street: guidedRequest.address,
        houseNumber: guidedRequest.houseNumber,
        addressExtra: guidedRequest.addressExtra,
        postalCode: guidedRequest.postalCode,
        city: guidedRequest.city,
        province: guidedRequest.province,
      },
    });

    await this.prisma.quote.update({ where: { id: quote.id }, data: { status: "ACCEPTED" } });
    await this.prisma.guidedRequest.update({ where: { id: quote.guidedRequestId }, data: { status: "CLOSED", closedReason: "COMPLETED" } });

    // Il professionista deve sapere che il proprio preventivo è stato
    // accettato — mancava del tutto (richiesta esplicita dell'utente, "wow
    // hanno accettato un tuo preventivo" come esempio di popup atteso).
    await this.notificationsService.notify(quote.professionalProfile.userId, "QUOTE_ACCEPTED", {
      bookingId: booking.id,
      guidedRequestId: quote.guidedRequestId,
    });

    // Metriche di affidabilità (CLAUDE.md §15, evento 3): il preventivo è
    // diventato una prenotazione reale ("accettato" in questo dominio).
    await this.professionalMetricsService.recordJobAccepted(quote.professionalProfileId);

    return { bookingId: booking.id };
  }

  /**
   * Il professionista conferma, completa o annulla una prenotazione.
   * CONFIRMED serve soprattutto alle prenotazioni dirette dall'agenda
   * pubblica (bookAgendaSlot le crea come PENDING, vedi
   * ProfessionalsService): prima di questo cambio non esisteva alcuna azione
   * per farle avanzare, restavano PENDING per sempre — bug reale, la
   * dashboard mostrava il bottone "Segna come completato" solo per lo stato
   * CONFIRMED.
   */
  async updateStatus(professionalUserId: string, bookingId: string, status: "CONFIRMED" | "COMPLETED" | "CANCELED" | "NO_SHOW") {
    const professionalProfile = await this.prisma.professionalProfile.findUnique({ where: { userId: professionalUserId } });
    if (!professionalProfile) {
      throw new NotFoundException("Profilo professionista non trovato.");
    }

    const booking = await this.prisma.booking.findUnique({ where: { id: bookingId } });
    if (!booking || booking.professionalProfileId !== professionalProfile.id) {
      throw new ForbiddenException("Questa prenotazione non è tua.");
    }
    if (booking.status === "COMPLETED" || booking.status === "CANCELED") {
      throw new ForbiddenException("Questa prenotazione è già conclusa.");
    }

    await this.prisma.booking.update({
      where: { id: bookingId },
      // canceledBy: questo metodo è chiamato solo dal professionista (guardia
      // sopra su professionalProfile) — CANCELED da qui è sempre PROFESSIONAL,
      // stesso valore già usato da cancelByProfessional.
      data: { status, ...(status === "CANCELED" ? { canceledBy: "PROFESSIONAL" as const } : {}) },
    });

    // Metriche di affidabilità (CLAUDE.md §15): evento 4 (lavoro completato)
    // ed evento 6 (appuntamento onorato/mancato) — CANCELED non conta come
    // nessuno dei due (richiesta esplicita dell'utente), CONFIRMED è solo
    // "attività" del professionista senza statistiche da aggiornare.
    if (status === "COMPLETED") {
      await this.professionalMetricsService.recordJobCompleted(professionalProfile.id);
      await this.professionalMetricsService.recordAppointmentOutcome(professionalProfile.id, true);
    } else if (status === "NO_SHOW") {
      await this.professionalMetricsService.recordAppointmentOutcome(professionalProfile.id, false);
    } else {
      await this.professionalMetricsService.touchActivity(professionalProfile.id);
    }

    return { bookingId, status };
  }

  /**
   * Nota privata del professionista su una prenotazione (richiesta esplicita
   * dell'utente: "eventuali note da ricordare") — mai vista dal cliente,
   * modificabile indipendentemente dallo stato della prenotazione (anche
   * conclusa: può ancora servire per ricordare qualcosa dopo il lavoro).
   * Stringa vuota salvata come `null`.
   */
  async updateProfessionalNote(professionalUserId: string, bookingId: string, note: string) {
    const professionalProfile = await this.prisma.professionalProfile.findUnique({ where: { userId: professionalUserId } });
    if (!professionalProfile) {
      throw new NotFoundException("Profilo professionista non trovato.");
    }

    const booking = await this.prisma.booking.findUnique({ where: { id: bookingId } });
    if (!booking || booking.professionalProfileId !== professionalProfile.id) {
      throw new ForbiddenException("Questa prenotazione non è tua.");
    }

    const trimmed = note.trim();
    await this.prisma.booking.update({ where: { id: bookingId }, data: { professionalNote: trimmed || null } });
    // Metriche di affidabilità (CLAUDE.md §15, evento 7): azione del professionista.
    await this.professionalMetricsService.touchActivity(professionalProfile.id);
    return { bookingId, professionalNote: trimmed || null };
  }

  /**
   * Il professionista segnala un "Lavoro accettato" come terminato,
   * inserendo l'importo preciso — richiesta esplicita dell'utente: una
   * finestra dedicata (non un semplice cambio di stato) dove seguire le
   * voci del preventivo originale (QuoteItem, un range) ma con un prezzo
   * esatto, più eventuali voci aggiuntive non preventivate. Le QuoteItem
   * originali non vengono mai toccate: restano l'offerta di riferimento,
   * l'importo finale è un dato separato (BookingFinalItem).
   */
  async completeWithFinalAmount(professionalUserId: string, bookingId: string, input: CompleteBookingInput) {
    const professionalProfile = await this.prisma.professionalProfile.findUnique({ where: { userId: professionalUserId } });
    if (!professionalProfile) {
      throw new NotFoundException("Profilo professionista non trovato.");
    }

    const booking = await this.prisma.booking.findUnique({ where: { id: bookingId } });
    if (!booking || booking.professionalProfileId !== professionalProfile.id) {
      throw new ForbiddenException("Questa prenotazione non è tua.");
    }
    if (booking.status !== "CONFIRMED") {
      throw new BadRequestException("Solo un lavoro confermato può essere segnalato come terminato.");
    }

    const finalAmountEurCents = input.items.reduce((sum, item) => sum + item.priceEurCents, 0);

    await this.prisma.$transaction([
      this.prisma.bookingFinalItem.deleteMany({ where: { bookingId } }),
      this.prisma.bookingFinalItem.createMany({
        data: input.items.map((item) => ({ bookingId, name: item.name, priceEurCents: item.priceEurCents })),
      }),
      this.prisma.booking.update({ where: { id: bookingId }, data: { status: "COMPLETED", finalAmountEurCents } }),
    ]);

    await this.notificationsService.notify(booking.clientId, "JOB_COMPLETED", { bookingId, finalAmountEurCents });

    // Metriche di affidabilità (CLAUDE.md §15, eventi 4+6): lavoro
    // completato con importo esatto conta sia come lavoro concluso sia
    // come appuntamento onorato.
    await this.professionalMetricsService.recordJobCompleted(professionalProfile.id);
    await this.professionalMetricsService.recordAppointmentOutcome(professionalProfile.id, true);

    return { bookingId, status: "COMPLETED" as const, finalAmountEurCents };
  }

  /**
   * Il professionista annulla un intervento già confermato, con una nota
   * facoltativa per il cliente (richiesta esplicita dell'utente) — distinto
   * da cancelForClient (nessuna nota lì, il cliente non deve spiegazioni al
   * professionista) e dal generico updateStatus (usato dal calendario, senza
   * nota).
   */
  async cancelByProfessional(professionalUserId: string, bookingId: string, input: CancelBookingByProfessionalInput) {
    const professionalProfile = await this.prisma.professionalProfile.findUnique({ where: { userId: professionalUserId } });
    if (!professionalProfile) {
      throw new NotFoundException("Profilo professionista non trovato.");
    }

    const booking = await this.prisma.booking.findUnique({ where: { id: bookingId } });
    if (!booking || booking.professionalProfileId !== professionalProfile.id) {
      throw new ForbiddenException("Questa prenotazione non è tua.");
    }
    if (booking.status === "COMPLETED" || booking.status === "CANCELED") {
      throw new ForbiddenException("Questa prenotazione è già conclusa.");
    }

    const cancellationNote = input.note?.trim() || null;
    await this.prisma.booking.update({
      where: { id: bookingId },
      data: { status: "CANCELED", cancellationNote, canceledBy: "PROFESSIONAL" },
    });

    await this.notificationsService.notify(booking.clientId, "BOOKING_CANCELED_BY_PROFESSIONAL", { bookingId, cancellationNote });

    // Metriche di affidabilità (CLAUDE.md §15, evento 7): azione del
    // professionista — CANCELED non conta come appuntamento onorato/mancato
    // (evento 6, deciso esplicitamente), ma resta comunque "attività".
    await this.professionalMetricsService.touchActivity(professionalProfile.id);

    return { bookingId, status: "CANCELED" as const };
  }

  /**
   * Il cliente annulla una propria prenotazione ancora attiva (PENDING o
   * CONFIRMED). Prima di questo endpoint un cliente che prenotava
   * direttamente una fascia dall'agenda pubblica (bookAgendaSlot) non aveva
   * alcun modo di disdire — solo il professionista poteva farlo.
   */
  async cancelForClient(clientId: string, bookingId: string) {
    const booking = await this.prisma.booking.findUnique({ where: { id: bookingId } });
    if (!booking || booking.clientId !== clientId) {
      throw new ForbiddenException("Questa prenotazione non è tua.");
    }
    if (booking.status !== "PENDING" && booking.status !== "CONFIRMED") {
      throw new ForbiddenException("Questa prenotazione non può più essere annullata.");
    }

    await this.prisma.booking.update({ where: { id: bookingId }, data: { status: "CANCELED", canceledBy: "CLIENT" } });
    return { bookingId, status: "CANCELED" as const };
  }

  /**
   * Il cliente segnala che il professionista non si è presentato
   * all'appuntamento e chiede un rimborso (richiesta esplicita
   * dell'utente) — consentito solo su una prenotazione CONFIRMED propria,
   * e solo dopo che la data/ora prevista è realmente passata (mai fidarsi
   * del client per questo controllo). Non tocca `status`: il
   * professionista può ancora segnarla completata/annullarla, questa è
   * solo una segnalazione + notifica, nessun pagamento reale da
   * rimborsare in piattaforma (non ancora attivo, CLAUDE.md §9).
   */
  async reportProfessionalNoShow(clientId: string, bookingId: string) {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: { professionalProfile: true },
    });
    if (!booking || booking.clientId !== clientId) {
      throw new ForbiddenException("Questa prenotazione non è tua.");
    }
    if (booking.status !== "CONFIRMED") {
      throw new ForbiddenException("Solo un lavoro confermato può essere segnalato come non presentato.");
    }
    const referenceEnd = booking.scheduledEndAt ?? booking.scheduledAt;
    if (referenceEnd.getTime() > Date.now()) {
      throw new ForbiddenException("L'appuntamento non è ancora terminato.");
    }
    if (booking.refundRequested) {
      throw new ForbiddenException("Hai già segnalato questo appuntamento.");
    }

    const refundRequestedAt = new Date();
    await this.prisma.booking.update({ where: { id: bookingId }, data: { refundRequested: true, refundRequestedAt } });

    await this.notificationsService.notify(booking.professionalProfile.userId, "BOOKING_NO_SHOW_REPORTED", {
      bookingId,
    });

    return { bookingId, refundRequested: true, refundRequestedAt: refundRequestedAt.toISOString() };
  }

  /** Prenotazioni del cliente autenticato, per proporre la recensione a lavoro completato. */
  async listForClient(clientId: string) {
    const bookings = await this.prisma.booking.findMany({
      where: { clientId },
      include: {
        professionalProfile: { include: { user: true } },
        review: true,
        finalItems: true,
        // Richiesta esplicita dell'utente: "Lavori accettati" deve mostrare
        // anche i dati della richiesta guidata originale (titolo/categoria,
        // descrizione, foto) e del preventivo accettato (voci/note) — non
        // solo i dati del professionista. Assente per le prenotazioni
        // dirette da agenda pubblica (bookAgendaSlot), che non hanno una
        // Quote/GuidedRequest collegata.
        quote: { include: { items: true, guidedRequest: { include: { category: true } } } },
      },
      orderBy: { scheduledAt: "desc" },
    });

    return bookings.map((booking) => ({
      id: booking.id,
      scheduledAt: booking.scheduledAt.toISOString(),
      // Fine della fascia (richiesta esplicita dell'utente: mostrare tutta
      // la fascia oraria, non solo l'inizio) — null per prenotazioni senza
      // una fascia con fine nota (data indicata a mano, o create prima di
      // questa funzionalità).
      scheduledEndAt: booking.scheduledEndAt?.toISOString() ?? null,
      createdAt: booking.createdAt.toISOString(),
      updatedAt: booking.updatedAt.toISOString(),
      status: booking.status,
      businessName: booking.professionalProfile.businessName,
      professionalProfileId: booking.professionalProfileId,
      hasReview: booking.review !== null,
      // Titolo/categoria, descrizione e foto della richiesta guidata
      // originale — richiesta esplicita dell'utente ("i dati del
      // preventivo da lui inviato all'inizio come la descrizione
      // dell'evento con il titolo, le foto"). `null`/`[]` per le
      // prenotazioni dirette da agenda pubblica, senza GuidedRequest.
      categorySlug: booking.quote?.guidedRequest.category.slug ?? null,
      categoryLabel: booking.quote?.guidedRequest.category.label ?? null,
      description: booking.quote?.guidedRequest.description ?? null,
      photoUrls: booking.quote?.guidedRequest.photoUrls ?? [],
      // Voci e note del preventivo accettato (il range concordato prima
      // dell'importo finale esatto, quest'ultimo in finalItems sopra).
      quoteItems: (booking.quote?.items ?? []).map((item) => ({
        id: item.id,
        name: item.name,
        priceMinEurCents: item.priceMinEurCents,
        priceMaxEurCents: item.priceMaxEurCents,
      })),
      quoteNotes: booking.quote?.notes ?? null,
      // Importo finale esatto (voci del preventivo + eventuali extra),
      // valorizzato solo dopo che il professionista ha segnalato il lavoro
      // come terminato — richiesta esplicita dell'utente.
      finalAmountEurCents: booking.finalAmountEurCents,
      finalItems: booking.finalItems.map((item) => ({ id: item.id, name: item.name, priceEurCents: item.priceEurCents })),
      // Nota lasciata dal professionista se ha annullato l'intervento (facoltativa).
      cancellationNote: booking.cancellationNote,
      // Chi ha annullato — richiesta esplicita dell'utente, mostrato accanto
      // all'etichetta "Annullata".
      canceledBy: booking.canceledBy,
      // Dati di contatto del professionista, per il popup "Non presentato"
      // (contatta oppure chiedi il rimborso) — richiesta esplicita
      // dell'utente, visibili solo qui, non prima nel ciclo di vita.
      professionalPhone: booking.professionalProfile.user.phone,
      professionalEmail: booking.professionalProfile.user.email,
      professionalAddress: booking.professionalProfile.address,
      refundRequested: booking.refundRequested,
    }));
  }
}
