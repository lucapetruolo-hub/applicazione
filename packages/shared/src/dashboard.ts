/** Profilo professionista gestito dal titolare (creazione/modifica in dashboard). */
export type MyProfessionalProfile = {
  id: string;
  businessName: string;
  categorySlug: string;
  categoryLabel: string;
  city: string;
  address: string | null;
  /** Posizione reale (geocodificata dal comune scelto, o dall'indirizzo preciso): usata per centrare la mappa del raggio di ingaggio. */
  latitude: number;
  longitude: number;
  bio: string | null;
  subTags: string[];
  verified: boolean;
  remoteAvailable: boolean;
  imageUrl: string | null;
  /** Foto reali di lavori svolti (fino a 10), mostrate in una galleria sul profilo pubblico. */
  portfolioUrls: string[];
  services: { id: string; name: string; priceMinEurCents: number | null; priceMaxEurCents: number | null }[];
  /** Raggio (km, 1-25) entro cui arrivano rispettivamente le richieste standard e quelle urgenti — vedi updateEngagementRadiusSchema. */
  engagementRadiusKm: number;
  urgentEngagementRadiusKm: number;
  /** Lingue parlate (richiesta esplicita dell'utente), "Italiano" precompilato di default, rimovibile/estendibile. */
  spokenLanguages: string[];
};

/** Lead ricevuto da un professionista in seguito a una richiesta guidata. */
export type ProfessionalLead = {
  id: string;
  status: "PENDING" | "PAID" | "CONVERTED" | "DECLINED" | "EXPIRED";
  /** Nota lasciata dal professionista se ha rifiutato la richiesta (facoltativa). */
  declineNote: string | null;
  /** Nota privata del professionista su questa richiesta, mai vista dal cliente (`/dashboard/richieste`). */
  professionalNote: string | null;
  priceEurCents: number;
  createdAt: string;
  /**
   * Ultimo aggiornamento rilevante per questo lead: il più recente tra
   * `Lead.updatedAt` (es. rifiuto) e `Quote.updatedAt` (invio/modifica del
   * preventivo) se esiste — usato per l'ordinamento "per ultimo
   * aggiornamento" nelle liste (richiesta esplicita dell'utente).
   */
  updatedAt: string;
  /**
   * Scadenza del Lead (CLAUDE.md §14): passato questo momento senza un
   * preventivo, il job schedulato lo marca scaduto e pesca il prossimo
   * candidato dalla coda di riserva — mostrata in `/dashboard/richieste`
   * come "Rispondi entro..." per spingere a quotare in fretta (richiesta
   * esplicita dell'utente). `null` per un Lead senza scadenza (righe
   * precedenti a questa funzionalità) o non più pertinente (già scaduto o
   * con un preventivo già inviato).
   */
  expiresAt: string | null;
  /**
   * Preventivo eventualmente già inviato per questo lead (null se non ancora
   * inviato). `clientProposedDate` valorizzata solo quando status è
   * MODIFICATION_REQUESTED: il cliente ha proposto una data diversa tra le
   * fasce libere dell'agenda del professionista, in attesa di conferma.
   */
  quote: {
    id: string;
    status: "SENT" | "ACCEPTED" | "REJECTED" | "MODIFICATION_REQUESTED" | "WITHDRAWN";
    /** Data+ora di invio del preventivo (richiesta esplicita dell'utente), visibile sia al cliente che al professionista. */
    sentAt: string;
    estimatedStartDate: string;
    /** Fine della fascia (richiesta esplicita dell'utente: mostrare tutta la fascia oraria, non solo l'inizio), null se non nota. */
    estimatedEndDate: string | null;
    clientProposedDate: string | null;
    clientProposedEndDate: string | null;
    /** Dettagli facoltativi scritti dal cliente insieme alla data proposta. */
    clientProposedNote: string | null;
    /**
     * Contenuto del preventivo già inviato (voci + note), per mostrarlo al
     * professionista sulla propria dashboard invece del solo stato —
     * richiesta esplicita dell'utente.
     */
    items: { id: string; name: string; priceMinEurCents: number | null; priceMaxEurCents: number | null }[];
    notes: string | null;
    /**
     * Stato della prenotazione nata da questo preventivo (solo se
     * accettato), per lo stepper di stato "in stile Deliveroo" — richiesta
     * esplicita dell'utente: visibile anche dall'account professionista,
     * non solo dal cliente (che lo ha già, vedi ClientGuidedRequest).
     * `null` finché il preventivo non è stato accettato.
     */
    bookingStatus: string | null;
  } | null;
  guidedRequest: {
    id: string;
    categoryLabel: string;
    description: string;
    city: string;
    /**
     * Nome e cognome del cliente che ha inviato la richiesta (richiesta
     * esplicita dell'utente: "nelle richieste ricevute deve esserci anche
     * il nome").
     */
    clientName: string | null;
    /**
     * Data di nascita del cliente (solo data, YYYY-MM-DD), per la scheda
     * profilo aperta cliccando il nome (ClientProfileModal) — richiesta
     * esplicita dell'utente: "vedere nome cognome, data di nascita e
     * immagine del profilo". `null` se il cliente non l'ha compilata.
     */
    clientBirthDate: string | null;
    /**
     * Telefono/email/indirizzo NON esposti a questo livello — decisione di
     * privacy ribaltata di nuovo su richiesta esplicita dell'utente ("non
     * devono già comparire il numero di telefono e il contatto email né
     * l'indirizzo, ma solo la città... tutte le info relative al cliente gli
     * verranno visualizzate solo ad accettazione del lavoro"): quei dati
     * restano disponibili solo dopo l'accettazione, su
     * `ProfessionalBooking` (recipientPhone/street/ecc., già esistenti lì).
     */
    /** Immagine profilo dell'account cliente, se presente — richiesta esplicita dell'utente (scheda cliente, ClientProfileModal). */
    clientImageUrl: string | null;
    /**
     * True se il cliente ha eliminato il proprio account (soft-delete,
     * User.deletedAt) — richiesta esplicita dell'utente: la richiesta e il
     * preventivo restano visibili ("traccia completa"), ma con
     * un'indicazione "Account eliminato" al posto del nome, e senza più
     * poter inviare/modificare un preventivo per questa richiesta
     * (QuotesService.createOrUpdate lo rifiuta esplicitamente). `clientName`/
     * `clientImageUrl` sono già `null` in
     * questo caso (anonimizzati alla cancellazione), questo flag esiste
     * solo per distinguere in UI "account eliminato" da "account senza
     * questi dati compilati".
     */
    clientAccountDeleted: boolean;
    /**
     * Recensioni ricevute dal cliente da qualunque professionista
     * (richiesta esplicita dell'utente: "per il professionista per fare
     * una recensione al cliente... visibile nella scheda cliente") —
     * mostrate in ClientProfileModal, mai su un profilo pubblico (il
     * cliente non ne ha uno in questo marketplace). Pubbliche solo se
     * "doppio cieco" sbloccato (vedi ProfessionalMetricsService/ReviewsService).
     */
    clientReviews: {
      id: string;
      rating: number;
      comment: string | null;
      mediaUrls: string[];
      createdAt: string;
      isAutomatic: boolean;
      reviewerBusinessName: string;
    }[];
    /** Foto caricate dal cliente per far capire il lavoro al professionista (fino a 3). */
    photoUrls: string[];
    /** Tipo di intervento (richiesta esplicita dell'utente: "il professionista già sa se può trattarsi di un intervento a domicilio o online") — `null` per le richieste create prima di questo campo. */
    serviceMode: "HOME" | "ONLINE" | null;
    isUrgent: boolean;
    /** Valorizzati solo se la richiesta è nata da una fascia generica dell'agenda (vedi packages/shared/src/availability.ts). */
    preferredDate: string | null;
    preferredTimeSlot: string | null;
  };
};

/**
 * Prenotazione lato professionista (agenda + dashboard): una volta un
 * preventivo accettato (o una fascia esatta prenotata direttamente), il
 * professionista deve poter vedere i dati del cliente utili per andare a
 * svolgere il lavoro (nome e cognome, telefono, email, indirizzo preciso se
 * indicato nella richiesta). `clientPhone`/`clientEmail` possono essere
 * `null` (account creato via Google senza telefono, o senza email se creato
 * solo con telefono — non ancora un flusso reale ma il campo resta
 * opzionale nello schema). `address` è `null` per le prenotazioni dirette
 * dall'agenda pubblica (bookAgendaSlot), che non hanno una GuidedRequest
 * collegata.
 */
export type ProfessionalBooking = {
  id: string;
  /**
   * Richiesta guidata di origine (via Booking.quote.guidedRequestId) — usata
   * per il bottone "Vai alla cronologia della richiesta" (richiesta
   * esplicita dell'utente), `null` per le prenotazioni dirette da agenda
   * pubblica (bookAgendaSlot), che non hanno una GuidedRequest collegata.
   */
  guidedRequestId: string | null;
  scheduledAt: string;
  /** Fine della fascia (richiesta esplicita dell'utente: mostrare tutta la fascia oraria, non solo l'inizio), null se non nota. */
  scheduledEndAt: string | null;
  /** Per l'ordinamento "per data di ricezione"/"per ultimo aggiornamento" nelle liste. */
  createdAt: string;
  updatedAt: string;
  status: "PENDING" | "CONFIRMED" | "COMPLETED" | "CANCELED" | "NO_SHOW";
  clientName: string | null;
  clientPhone: string | null;
  clientEmail: string | null;
  /** Stesso significato di ProfessionalLead.guidedRequest.clientAccountDeleted — vedi lì. */
  clientAccountDeleted: boolean;
  address: string | null;
  /**
   * Indirizzo di lavoro strutturato, raccolto dal cliente nella schermata
   * di accettazione preventivo (richiesta esplicita dell'utente: campi
   * separati invece di un indirizzo libero). `null` per le prenotazioni
   * dirette dall'agenda pubblica (bookAgendaSlot, non passano da quella
   * schermata) o create prima di questa funzionalità — in quel caso resta
   * valido solo il campo `address` sopra. Quando presente, sostituisce
   * `address` come fonte principale da mostrare in UI.
   */
  recipientName: string | null;
  recipientSurname: string | null;
  recipientPhone: string | null;
  street: string | null;
  houseNumber: string | null;
  addressExtra: string | null;
  postalCode: string | null;
  city: string | null;
  province: string | null;
  items: { id: string; name: string; priceMinEurCents: number | null; priceMaxEurCents: number | null }[];
  /**
   * Importo finale esatto e relative voci, valorizzati solo dopo che il
   * professionista ha segnalato il lavoro come terminato (richiesta
   * esplicita dell'utente: una finestra dedicata raccoglie l'importo
   * preciso seguendo le voci del preventivo, con possibilità di aggiungerne
   * altre). `null`/`[]` finché il lavoro non è COMPLETED da questo percorso.
   */
  finalAmountEurCents: number | null;
  finalItems: { id: string; name: string; priceEurCents: number }[];
  /** Nota lasciata dal professionista quando annulla un intervento già confermato (facoltativa). */
  cancellationNote: string | null;
  /** Chi ha annullato — richiesta esplicita dell'utente, mostrato accanto all'etichetta "Annullata". `null` finché non CANCELED, o per righe annullate prima di questo campo. */
  canceledBy: "CLIENT" | "PROFESSIONAL" | null;
  /**
   * Descrizione del lavoro e foto scritte/caricate dal cliente nella
   * richiesta guidata originale — richiesta esplicita dell'utente
   * ("devono uscire scritte anche quello che il cliente ha scritto in
   * descrivi il lavoro e le foto inserite" cliccando una prenotazione in
   * agenda). `null`/`[]` per le prenotazioni dirette dall'agenda pubblica
   * (bookAgendaSlot), che non hanno una GuidedRequest collegata.
   */
  description: string | null;
  photoUrls: string[];
  /**
   * Categoria e modalità (a domicilio/online) del lavoro — richiesta
   * esplicita dell'utente per il redesign "Lavori accettati" (titolo card +
   * badge). `null` per le prenotazioni dirette da agenda pubblica
   * (bookAgendaSlot, dormiente da CLAUDE.md §20), che non hanno una
   * GuidedRequest collegata da cui derivarli.
   */
  categorySlug: string | null;
  categoryLabel: string | null;
  serviceMode: "HOME" | "ONLINE" | null;
  /** Nota privata del professionista (mai vista dal cliente), modificabile da BookingDetailPanel. */
  professionalNote: string | null;
  /**
   * Il cliente ha segnalato che il professionista non si è presentato
   * all'appuntamento e ha chiesto un rimborso (richiesta esplicita
   * dell'utente) — non cambia `status`, il professionista può ancora
   * segnare il lavoro come completato/annullato in seguito.
   */
  refundRequested: boolean;
  /**
   * Link per una consulenza video (Meet, Zoom, ecc.), facoltativo —
   * richiesta esplicita dell'utente per la consulenza online (CLAUDE.md
   * §1). Impostato dal professionista stesso, visibile anche al cliente.
   */
  meetingLink: string | null;
  /**
   * Conferma del cliente che il lavoro è davvero terminato dal suo lato
   * (richiesta esplicita dell'utente: "servono i completed da entrambi") —
   * `null` finché non ha ancora confermato.
   */
  clientConfirmedCompletedAt: string | null;
  /** Foto/video del lavoro terminato allegate da ciascuna parte (richiesta esplicita dell'utente). */
  professionalCompletionPhotoUrls: string[];
  clientCompletionPhotoUrls: string[];
  /** Vero se il professionista ha già recensito il cliente per questa prenotazione. */
  hasClientReview: boolean;
};

/**
 * Lavoro preso al di fuori della piattaforma, inserito a mano dal
 * professionista nella propria agenda (richiesta esplicita dell'utente) —
 * nessun account cliente reale dietro: `clientName`/`clientPhone`/
 * `address` sono campi liberi scritti dal professionista stesso, non
 * riferimenti a un `User`.
 */
export type ExternalJob = {
  id: string;
  clientName: string;
  clientPhone: string | null;
  address: string | null;
  description: string | null;
  scheduledAt: string;
  scheduledEndAt: string | null;
  priceEurCents: number | null;
  notes: string | null;
  status: "SCHEDULED" | "COMPLETED" | "CANCELED";
  createdAt: string;
  updatedAt: string;
};

/**
 * Fascia esatta libera del professionista autenticato (prossimi 14 giorni,
 * solo fasce maxBookings=1): usata per far scegliere la data di inizio di
 * un preventivo dentro le proprie disponibilità reali, invece di una data
 * libera scollegata dall'agenda.
 */
export type ProfessionalAvailableSlot = {
  date: string;
  startTime: string;
  endTime: string;
  /** True se questa fascia ha ancora capienza residua per quel tipo (richiesta esplicita dell'utente) — usate per proporre solo le fasce compatibili con la modalità della richiesta in negoziazione. */
  homeAvailable: boolean;
  onlineAvailable: boolean;
};

/**
 * Stato aggregato di una richiesta guidata per il cliente (CLAUDE.md §14,
 * GuidedRequestsService.getStatus) — solo numeri, mai identità dei
 * professionisti contattati né dettagli interni (expiresAt, wasExpanded).
 * `statusMessage` sostituisce i tre numeri in due casi: richiesta chiusa
 * (spiega perché) o ancora aperta ma senza nessun professionista
 * disponibile al momento.
 */
export type GuidedRequestStatusSummary = {
  /** Lead creati in totale per questa richiesta, inclusi quelli nati da un'espansione (scadenza/rifiuto). */
  totalContacted: number;
  /** Professionisti che hanno inviato almeno un preventivo (qualunque stato, anche se poi ritirato/rifiutato). */
  responded: number;
  /** Lead ancora in attesa di risposta, non scaduti. */
  pending: number;
  statusMessage: string | null;
};

/**
 * Un singolo evento della cronologia cliente↔professionista per una
 * richiesta guidata (richiesta esplicita dell'utente: "tieni traccia delle
 * varie conversazioni e aggiornamenti... la cronologia completa di quello
 * che è successo con le date... il testo e la data e tutto il resto").
 * `message` è già testo pronto per la UI (include eventuali dettagli/note
 * dell'evento), non un `type` da tradurre lato client — a differenza delle
 * notifiche (notificationCopy.ts), qui la formulazione varia con i dati
 * reali di ogni evento.
 */
export type ConversationEvent = {
  id: string;
  actor: "CLIENT" | "PROFESSIONAL" | "SYSTEM";
  message: string;
  /** Foto/video allegati a un aggiornamento scritto a mano (vuoto per gli eventi automatici del ciclo di vita). */
  mediaUrls: string[];
  createdAt: string;
};

/**
 * Una riga dell'inbox "Chat" (richiesta esplicita dell'utente: "aggiungi un
 * menu Chat, dove saranno presenti tutte le chat di tutti i preventivi...
 * solo il nome del cliente o professionista con l'ultimo messaggio
 * ricevuto/inviato") — un thread è la stessa coppia (richiesta guidata,
 * professionista) già usata da TimelineModal, qui riassunta con l'ultimo
 * evento invece dell'intera cronologia. Un solo endpoint per entrambi i
 * ruoli: `viewerRole` dice a chi appartiene la riga (mai passato dal
 * client, dedotto server-side).
 */
export type ChatThreadSummary = {
  guidedRequestId: string;
  professionalProfileId: string;
  viewerRole: "CLIENT" | "PROFESSIONAL";
  /** Nome+cognome del cliente se viewerRole è PROFESSIONAL, nome attività del professionista se è CLIENT. */
  otherPartyName: string;
  otherPartyImageUrl: string | null;
  categoryLabel: string;
  lastMessage: string | null;
  /** True se l'ultimo evento porta almeno una foto/video allegata (il testo può essere vuoto in quel caso). */
  lastMessageHasMedia: boolean;
  lastMessageAt: string;
  /** True se l'ultimo messaggio è stato scritto da chi guarda la lista, non dall'altra parte. */
  lastMessageIsMine: boolean;
};
