/** Profilo professionista gestito dal titolare (creazione/modifica in dashboard). */
export type MyProfessionalProfile = {
  id: string;
  businessName: string;
  categorySlug: string;
  categoryLabel: string;
  city: string;
  address: string | null;
  bio: string | null;
  subTags: string[];
  verified: boolean;
  remoteAvailable: boolean;
  imageUrl: string | null;
  services: { id: string; name: string; priceMinEurCents: number | null; priceMaxEurCents: number | null }[];
};

/** Lead ricevuto da un professionista in seguito a una richiesta guidata. */
export type ProfessionalLead = {
  id: string;
  status: "PENDING" | "PAID" | "CONVERTED";
  priceEurCents: number;
  createdAt: string;
  /**
   * Preventivo eventualmente già inviato per questo lead (null se non ancora
   * inviato). `clientProposedDate` valorizzata solo quando status è
   * MODIFICATION_REQUESTED: il cliente ha proposto una data diversa tra le
   * fasce libere dell'agenda del professionista, in attesa di conferma.
   */
  quote: {
    id: string;
    status: "SENT" | "ACCEPTED" | "REJECTED" | "MODIFICATION_REQUESTED";
    estimatedStartDate: string;
    clientProposedDate: string | null;
  } | null;
  guidedRequest: {
    id: string;
    categoryLabel: string;
    description: string;
    city: string;
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
  status: "PENDING" | "CONFIRMED" | "COMPLETED" | "CANCELED" | "NO_SHOW";
  clientName: string | null;
  clientPhone: string | null;
  clientEmail: string | null;
  address: string | null;
  items: { id: string; name: string; priceMinEurCents: number | null; priceMaxEurCents: number | null }[];
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
