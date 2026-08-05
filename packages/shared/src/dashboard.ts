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
};

/** Lead ricevuto da un professionista in seguito a una richiesta guidata. */
export type ProfessionalLead = {
  id: string;
  status: "PENDING" | "PAID" | "CONVERTED" | "DECLINED";
  /** Nota lasciata dal professionista se ha rifiutato la richiesta (facoltativa). */
  declineNote: string | null;
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
   * Preventivo eventualmente già inviato per questo lead (null se non ancora
   * inviato). `clientProposedDate` valorizzata solo quando status è
   * MODIFICATION_REQUESTED: il cliente ha proposto una data diversa tra le
   * fasce libere dell'agenda del professionista, in attesa di conferma.
   */
  quote: {
    id: string;
    status: "SENT" | "ACCEPTED" | "REJECTED" | "MODIFICATION_REQUESTED" | "WITHDRAWN";
    estimatedStartDate: string;
    clientProposedDate: string | null;
    /** Dettagli facoltativi scritti dal cliente insieme alla data proposta. */
    clientProposedNote: string | null;
    /**
     * Contenuto del preventivo già inviato (voci + note), per mostrarlo al
     * professionista sulla propria dashboard invece del solo stato —
     * richiesta esplicita dell'utente.
     */
    items: { id: string; name: string; priceMinEurCents: number | null; priceMaxEurCents: number | null }[];
    notes: string | null;
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
     * Telefono/email del cliente, visibili già dalla prima richiesta
     * ricevuta — non solo dopo l'accettazione del preventivo (correzione
     * esplicita dell'utente rispetto alla scelta precedente, che li
     * mostrava solo su `ProfessionalBooking`/`AcceptedJobCard`).
     */
    clientPhone: string | null;
    clientEmail: string | null;
    /** Immagine profilo dell'account cliente, se presente — richiesta esplicita dell'utente (scheda cliente, ClientProfileModal). */
    clientImageUrl: string | null;
    /** Via e numero civico indicati dal cliente, facoltativo. */
    address: string | null;
    /** Foto caricate dal cliente per far capire il lavoro al professionista (fino a 3). */
    photoUrls: string[];
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
  scheduledAt: string;
  /** Per l'ordinamento "per data di ricezione"/"per ultimo aggiornamento" nelle liste. */
  createdAt: string;
  updatedAt: string;
  status: "PENDING" | "CONFIRMED" | "COMPLETED" | "CANCELED" | "NO_SHOW";
  clientName: string | null;
  clientPhone: string | null;
  clientEmail: string | null;
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
  /** Nota privata del professionista (mai vista dal cliente), modificabile da BookingDetailPanel. */
  professionalNote: string | null;
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
};
