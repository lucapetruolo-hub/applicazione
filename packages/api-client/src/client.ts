import type {
  PROFESSIONAL_CATEGORIES,
  AvailabilitySlotInput,
  BookAgendaSlotInput,
  CancelBookingByProfessionalInput,
  ChangePasswordInput,
  CompleteBookingInput,
  GuidedRequestInput,
  GuidedRequestStatusSummary,
  GuidedRequestUpdateInput,
  MyAvailability,
  MyProfessionalProfile,
  ProfessionalAgenda,
  ProfessionalAvailableSlot,
  ProfessionalBooking,
  ProfessionalDetail,
  ProfessionalLead,
  ProfessionalProfileSelfInput,
  ProfessionalSearchResult,
  ProposeQuoteDateInput,
  QuoteSelfInput,
  ReviewInput,
  UpdateAccountInput,
  UpdateBookingNoteInput,
  UpdateEngagementRadiusInput,
} from "@professionisti/shared";

export type BookingStatus = "PENDING" | "CONFIRMED" | "COMPLETED" | "CANCELED" | "NO_SHOW";

export type ClientBooking = {
  id: string;
  scheduledAt: string;
  /** Fine della fascia (richiesta esplicita dell'utente), null se non nota (data indicata a mano o prenotazione precedente a questa funzionalità). */
  scheduledEndAt: string | null;
  /** Per l'ordinamento "per data di ricezione"/"per ultimo aggiornamento" nelle liste. */
  createdAt: string;
  updatedAt: string;
  status: BookingStatus;
  businessName: string;
  professionalProfileId: string;
  hasReview: boolean;
  /**
   * Titolo/categoria, descrizione e foto della richiesta guidata originale
   * — richiesta esplicita dell'utente ("i dati del preventivo da lui
   * inviato all'inizio come la descrizione dell'evento con il titolo, le
   * foto"). `null`/`[]` per le prenotazioni dirette da agenda pubblica.
   */
  categorySlug: string | null;
  categoryLabel: string | null;
  description: string | null;
  photoUrls: string[];
  /** Voci e note del preventivo accettato (range concordato, distinto da finalItems sotto). */
  quoteItems: { id: string; name: string; priceMinEurCents: number | null; priceMaxEurCents: number | null }[];
  quoteNotes: string | null;
  /** Importo finale esatto (voci del preventivo + eventuali extra), valorizzato solo a lavoro terminato. */
  finalAmountEurCents: number | null;
  finalItems: { id: string; name: string; priceEurCents: number }[];
  /** Nota lasciata dal professionista se ha annullato l'intervento (facoltativa). */
  cancellationNote: string | null;
  /** Chi ha annullato — richiesta esplicita dell'utente, mostrato accanto all'etichetta "Annullata". `null` finché non CANCELED, o per righe annullate prima di questo campo. */
  canceledBy: "CLIENT" | "PROFESSIONAL" | null;
  /** Dati di contatto del professionista, per il popup "Non presentato" (contatta oppure chiedi il rimborso). */
  professionalPhone: string | null;
  professionalEmail: string | null;
  professionalAddress: string | null;
  /** Vero se il cliente ha già segnalato un no-show per questa prenotazione. */
  refundRequested: boolean;
};

export type ClientGuidedRequest = {
  id: string;
  categorySlug: string;
  categoryLabel: string;
  description: string;
  city: string;
  /** Via, dove il professionista dovrà andare a svolgere il lavoro. */
  address: string | null;
  /**
   * Destinatario + resto dell'indirizzo strutturato, raccolti fin dalla
   * richiesta (richiesta esplicita dell'utente) — visibili solo al
   * cliente stesso qui: il professionista li vede solo dopo la conferma
   * (vedi ProfessionalBooking, valorizzati lì al momento dell'accettazione).
   */
  recipientName: string | null;
  recipientSurname: string | null;
  recipientPhone: string | null;
  houseNumber: string | null;
  addressExtra: string | null;
  postalCode: string | null;
  province: string | null;
  /** Foto caricate insieme alla richiesta (fino a 5), modificabili in /le-mie-richieste. */
  photoUrls: string[];
  isUrgent: boolean;
  status: "OPEN" | "MATCHED" | "CLOSED";
  createdAt: string;
  /** Per l'ordinamento "per ultimo aggiornamento" nelle liste (richiesta esplicita dell'utente). */
  updatedAt: string;
  /** Valorizzati solo se la richiesta è nata da una fascia generica dell'agenda (vedi packages/shared/src/availability.ts). */
  preferredDate: string | null;
  preferredTimeSlot: string | null;
  /** Professionisti a cui è stata inoltrata la richiesta (fan-out o singolo, vedi GuidedRequestsService.listForClient). */
  sentTo: {
    id: string;
    businessName: string;
    imageUrl: string | null;
    categorySlug: string;
    categoryLabel: string;
    city: string;
    verified: boolean;
    /** True se questo professionista ha rifiutato la richiesta prima di inviare un preventivo. */
    declined: boolean;
    /** Nota facoltativa lasciata dal professionista con il rifiuto. */
    declineNote: string | null;
  }[];
  quotes: {
    id: string;
    professionalProfileId: string;
    businessName: string;
    items: { id: string; name: string; priceMinEurCents: number | null; priceMaxEurCents: number | null }[];
    /** Data+ora di invio del preventivo (richiesta esplicita dell'utente), visibile sia al cliente che al professionista. */
    sentAt: string;
    estimatedStartDate: string;
    /** Fine della fascia (richiesta esplicita dell'utente: mostrare tutta la fascia oraria, non solo l'inizio), null se non nota. */
    estimatedEndDate: string | null;
    /** Valorizzata solo se il cliente ha proposto una data diversa (status MODIFICATION_REQUESTED), in attesa di conferma del professionista. */
    clientProposedDate: string | null;
    clientProposedEndDate: string | null;
    /** Dettagli facoltativi scritti dal cliente insieme alla data proposta. */
    clientProposedNote: string | null;
    /** True se il professionista ha inviato il preventivo con un orario diverso da quello che il cliente aveva effettivamente richiesto (richiesta esplicita dell'utente, evidenziato in UI). */
    timeChangedFromRequest: boolean;
    /** Nota lasciata dal professionista quando modifica direttamente l'orario proposto dal cliente durante la trattativa ("Modifica"), invece di limitarsi a confermarlo/rifiutarlo. */
    professionalCounterNote: string | null;
    notes: string | null;
    status: "SENT" | "ACCEPTED" | "REJECTED" | "MODIFICATION_REQUESTED" | "WITHDRAWN";
  }[];
};

export type ApiClientConfig = {
  baseUrl: string;
};

export type AuthResult = { token: string; isNewUser: boolean };

export type AdminUserRow = {
  email: string | null;
  name: string | null;
  surname: string | null;
  businessName: string | null;
  createdAt: string;
};
export type AdminUsersByRole = { clients: AdminUserRow[]; professionals: AdminUserRow[]; admins: AdminUserRow[] };

export type CurrentUser = {
  id: string;
  phone: string | null;
  email: string | null;
  name: string | null;
  surname: string | null;
  birthDate: string | null;
  role: "CLIENT" | "PROFESSIONAL" | "ADMIN";
  hasPassword: boolean;
  /** Immagine profilo dell'account (facoltativa), indipendente da ProfessionalProfile.imageUrl — richiesta esplicita dell'utente. */
  imageUrl: string | null;
  /** Nome attività (ProfessionalProfile.businessName), null per un account cliente o un professionista senza profilo ancora creato. */
  businessName: string | null;
  /** Immagine profilo pubblica (ProfessionalProfile.imageUrl), null per un account cliente o un professionista senza immagine caricata. */
  businessImageUrl: string | null;
  /**
   * Indirizzo di default dell'account (richiesta esplicita dell'utente:
   * usato per pre-compilare GuidedRequestForm quando si invia una richiesta
   * di preventivo, sempre modificabile per singola richiesta).
   */
  street: string | null;
  houseNumber: string | null;
  addressExtra: string | null;
  postalCode: string | null;
  city: string | null;
  province: string | null;
};

function extractErrorMessage(body: unknown, fallback: string): string {
  if (body && typeof body === "object") {
    const record = body as Record<string, unknown>;
    if (typeof record.message === "string") {
      return record.message;
    }
    if (record.fieldErrors && typeof record.fieldErrors === "object") {
      const firstError = Object.values(record.fieldErrors as Record<string, string[]>).flat()[0];
      if (firstError) return firstError;
    }
  }
  return fallback;
}

/**
 * Client tipizzato unico per chiamare apps/api da apps/web e apps/mobile —
 * niente logica di business duplicata nei due frontend (CLAUDE.md §3).
 */
export function createApiClient({ baseUrl }: ApiClientConfig) {
  async function request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(`${baseUrl}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...init?.headers,
      },
    });

    const body = await response.json().catch(() => null);

    if (!response.ok) {
      throw new Error(extractErrorMessage(body, `Richiesta API fallita: ${response.status} ${response.statusText}`));
    }

    return body as T;
  }

  async function uploadFile<T>(path: string, token: string, file: Blob, fieldName: string): Promise<T> {
    const formData = new FormData();
    formData.append(fieldName, file);

    const response = await fetch(`${baseUrl}${path}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    });

    const body = await response.json().catch(() => null);

    if (!response.ok) {
      throw new Error(extractErrorMessage(body, `Richiesta API fallita: ${response.status} ${response.statusText}`));
    }

    return body as T;
  }

  return {
    health: () => request<{ status: string }>("/health"),
    getCategories: () => request<typeof PROFESSIONAL_CATEGORIES>("/categories"),

    register: (email: string, password: string, name?: string, role?: "CLIENT" | "PROFESSIONAL") =>
      request<AuthResult>("/auth/register", {
        method: "POST",
        body: JSON.stringify({ email, password, name, role }),
      }),

    login: (email: string, password: string) =>
      request<AuthResult>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      }),

    verifyGoogle: (idToken: string, role?: "CLIENT" | "PROFESSIONAL") =>
      request<AuthResult>("/auth/google/verify", {
        method: "POST",
        body: JSON.stringify({ idToken, role }),
      }),

    me: (token: string) => request<CurrentUser | null>("/auth/me", { headers: { Authorization: `Bearer ${token}` } }),

    updateAccount: (token: string, input: UpdateAccountInput) =>
      request<CurrentUser>("/auth/me", {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify(input),
      }),

    changePassword: (token: string, input: ChangePasswordInput) =>
      request<{ success: boolean }>("/auth/change-password", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify(input),
      }),

    deleteAccount: (token: string) =>
      request<{ success: boolean }>("/auth/me", {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      }),

    /** Immagine profilo dell'account (cliente o professionista) — indipendente da uploadMyProfessionalImage. */
    uploadMyAccountImage: (token: string, file: Blob) => uploadFile<{ imageUrl: string }>("/auth/me/image", token, file, "image"),

    saveProfessional: (token: string, professionalProfileId: string) =>
      request<{ saved: boolean }>(`/saved-professionals/${professionalProfileId}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      }),

    unsaveProfessional: (token: string, professionalProfileId: string) =>
      request<{ saved: boolean }>(`/saved-professionals/${professionalProfileId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      }),

    mySavedProfessionals: (token: string) =>
      request<ProfessionalSearchResult[]>("/saved-professionals/me", { headers: { Authorization: `Bearer ${token}` } }),

    searchProfessionals: (params: { category?: string; city?: string; q?: string; remote?: boolean; excludeDemo?: boolean } = {}) => {
      const query = new URLSearchParams();
      if (params.category) query.set("category", params.category);
      if (params.city) query.set("city", params.city);
      if (params.q) query.set("q", params.q);
      if (params.remote) query.set("remote", "1");
      if (params.excludeDemo) query.set("excludeDemo", "1");
      const queryString = query.toString();
      // cache: "no-store" esplicito: senza questo, in Next.js il Data Cache
      // può mantenere in cache questa fetch indipendentemente da
      // `export const dynamic = "force-dynamic"` sulla pagina chiamante —
      // un professionista eliminato o modificato restava visibile in
      // ricerca anche dopo il fix della pagina, finché non si toccava
      // esplicitamente anche la fetch stessa.
      return request<ProfessionalSearchResult[]>(`/professionals/search${queryString ? `?${queryString}` : ""}`, {
        cache: "no-store",
      });
    },

    getProfessional: (id: string) => request<ProfessionalDetail>(`/professionals/${id}`, { cache: "no-store" }),

    getProfessionalAgenda: (id: string) =>
      request<ProfessionalAgenda>(`/professionals/${id}/agenda`, { cache: "no-store" }),

    getMyAvailability: (token: string) =>
      request<MyAvailability>("/professionals/me/availability", { headers: { Authorization: `Bearer ${token}` } }),

    upsertMyAvailability: (token: string, slots: AvailabilitySlotInput[]) =>
      request<MyAvailability>("/professionals/me/availability", {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({ slots }),
      }),

    addAvailabilityException: (token: string, date: string) =>
      request<{ exceptionDates: string[] }>("/professionals/me/availability/exceptions", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({ date }),
      }),

    removeAvailabilityException: (token: string, date: string) =>
      request<{ exceptionDates: string[] }>(`/professionals/me/availability/exceptions/${date}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      }),

    bookAgendaSlot: (token: string, professionalId: string, input: BookAgendaSlotInput) =>
      request<{ bookingId: string }>(`/professionals/${professionalId}/agenda/book`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify(input),
      }),

    createGuidedRequest: (token: string, input: GuidedRequestInput) =>
      request<{ guidedRequestId: string; matchedProfessionals: number }>("/guided-requests", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify(input),
      }),

    myGuidedRequests: (token: string) =>
      request<ClientGuidedRequest[]>("/guided-requests/me", { headers: { Authorization: `Bearer ${token}` } }),

    updateGuidedRequest: (token: string, id: string, input: GuidedRequestUpdateInput) =>
      request<{
        id: string;
        description: string;
        city: string;
        address: string | null;
        recipientName: string | null;
        recipientSurname: string | null;
        recipientPhone: string | null;
        houseNumber: string | null;
        addressExtra: string | null;
        postalCode: string | null;
        province: string | null;
        photoUrls: string[];
      }>(`/guided-requests/${id}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify(input),
      }),

    deleteGuidedRequest: (token: string, id: string) =>
      request<null>(`/guided-requests/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      }),

    /** Stato aggregato (contattati/risposto/in attesa) di una richiesta guidata — CLAUDE.md §14. */
    guidedRequestStatus: (token: string, id: string) =>
      request<GuidedRequestStatusSummary>(`/guided-requests/${id}/status`, { headers: { Authorization: `Bearer ${token}` } }),

    uploadGuidedRequestPhoto: (token: string, file: Blob) =>
      uploadFile<{ imageUrl: string }>("/guided-requests/photos", token, file, "image"),

    getMyProfessionalProfile: (token: string) =>
      request<MyProfessionalProfile | null>("/professionals/me", { headers: { Authorization: `Bearer ${token}` } }),

    upsertMyProfessionalProfile: (token: string, input: ProfessionalProfileSelfInput) =>
      request<MyProfessionalProfile>("/professionals/me", {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify(input),
      }),

    /** Raggio di ingaggio (standard/urgente, 1-25 km): salvato a parte dal resto del profilo, vedi EngagementRadiusMap. */
    updateEngagementRadius: (token: string, input: UpdateEngagementRadiusInput) =>
      request<{ engagementRadiusKm: number; urgentEngagementRadiusKm: number }>("/professionals/me/engagement-radius", {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify(input),
      }),

    uploadMyProfessionalImage: (token: string, file: Blob) =>
      uploadFile<{ imageUrl: string }>("/professionals/me/image", token, file, "image"),

    uploadMyPortfolioPhoto: (token: string, file: Blob) =>
      uploadFile<{ imageUrl: string }>("/professionals/me/portfolio-photos", token, file, "image"),

    myLeads: (token: string) =>
      request<ProfessionalLead[]>("/professionals/me/leads", { headers: { Authorization: `Bearer ${token}` } }),

    myProfessionalBookings: (token: string) =>
      request<ProfessionalBooking[]>("/professionals/me/bookings", { headers: { Authorization: `Bearer ${token}` } }),

    myAvailableSlots: (token: string) =>
      request<ProfessionalAvailableSlot[]>("/professionals/me/available-slots", { headers: { Authorization: `Bearer ${token}` } }),

    createQuote: (token: string, input: QuoteSelfInput) =>
      request<{ id: string; status: string }>("/quotes", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify(input),
      }),

    /**
     * Accetta un preventivo: crea la prenotazione. L'indirizzo di lavoro
     * strutturato (destinatario, via, civico, CAP, provincia) non viene più
     * raccolto qui — arriva dalla GuidedRequest, compilata fin dall'invio
     * della richiesta (richiesta esplicita dell'utente).
     */
    acceptQuote: (token: string, quoteId: string) =>
      request<{ bookingId: string }>(`/bookings/from-quote/${quoteId}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      }),

    /** Il cliente propone una data diversa per un preventivo ricevuto, tra le fasce libere dell'agenda del professionista. */
    proposeQuoteDate: (token: string, quoteId: string, input: ProposeQuoteDateInput) =>
      request<{ id: string; status: string; clientProposedDate: string | null; clientProposedEndDate: string | null; clientProposedNote: string | null }>(`/quotes/${quoteId}/propose-date`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify(input),
      }),

    /** Il professionista conferma la data proposta dal cliente: crea direttamente la prenotazione. */
    confirmProposedQuoteDate: (token: string, quoteId: string) =>
      request<{ bookingId: string }>(`/quotes/${quoteId}/confirm-proposed-date`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      }),

    /** Il professionista rifiuta la data proposta dal cliente: il preventivo torna SENT con la data originale. */
    rejectProposedQuoteDate: (token: string, quoteId: string) =>
      request<{ id: string; status: string }>(`/quotes/${quoteId}/reject-proposed-date`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      }),

    /** Il professionista modifica direttamente l'orario proposto dal cliente (invece di confermarlo/rifiutarlo), con una nota facoltativa. */
    counterProposeQuoteDate: (token: string, quoteId: string, input: ProposeQuoteDateInput) =>
      request<{ id: string; status: string; estimatedStartDate: string; estimatedEndDate: string | null }>(`/quotes/${quoteId}/counter-propose-date`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify(input),
      }),

    /** Il cliente rifiuta interamente un preventivo ricevuto (oltre ad accettarlo). */
    rejectQuote: (token: string, quoteId: string) =>
      request<{ id: string; status: string }>(`/quotes/${quoteId}/reject`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      }),

    /** Il professionista ritira un preventivo già inviato, prima che il cliente lo accetti. */
    withdrawQuote: (token: string, quoteId: string) =>
      request<{ id: string; status: string }>(`/quotes/${quoteId}/withdraw`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      }),

    /** Il professionista rifiuta una richiesta ricevuta prima di inviare un preventivo, con una nota facoltativa. */
    declineLead: (token: string, leadId: string, note?: string) =>
      request<void>(`/professionals/me/leads/${leadId}/decline`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({ note }),
      }),

    updateBookingStatus: (token: string, bookingId: string, status: "CONFIRMED" | "COMPLETED" | "CANCELED" | "NO_SHOW") =>
      request<{ bookingId: string; status: string }>(`/bookings/${bookingId}/status`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status }),
      }),

    cancelMyBooking: (token: string, bookingId: string) =>
      request<{ bookingId: string; status: string }>(`/bookings/${bookingId}/cancel`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}` },
      }),

    /** Il professionista segnala un "Lavoro accettato" come terminato, con l'importo preciso. */
    completeBooking: (token: string, bookingId: string, input: CompleteBookingInput) =>
      request<{ bookingId: string; status: string; finalAmountEurCents: number }>(`/bookings/${bookingId}/complete`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify(input),
      }),

    /** Il professionista annulla un intervento già confermato, con una nota facoltativa per il cliente. */
    cancelBookingByProfessional: (token: string, bookingId: string, input: CancelBookingByProfessionalInput) =>
      request<{ bookingId: string; status: string }>(`/bookings/${bookingId}/cancel-by-professional`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify(input),
      }),

    /** Nota privata del professionista su una prenotazione (mai vista dal cliente). */
    updateBookingNote: (token: string, bookingId: string, input: UpdateBookingNoteInput) =>
      request<{ bookingId: string; professionalNote: string | null }>(`/bookings/${bookingId}/note`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify(input),
      }),

    myClientBookings: (token: string) =>
      request<ClientBooking[]>("/bookings/me", { headers: { Authorization: `Bearer ${token}` } }),

    /** Il cliente segnala che il professionista non si è presentato e chiede un rimborso. */
    reportBookingNoShow: (token: string, bookingId: string) =>
      request<{ bookingId: string; refundRequested: boolean; refundRequestedAt: string }>(`/bookings/${bookingId}/report-no-show`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}` },
      }),

    createReview: (token: string, input: ReviewInput) =>
      request<{ id: string }>("/reviews", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify(input),
      }),

    uploadReviewPhoto: (token: string, file: Blob) => uploadFile<{ imageUrl: string }>("/reviews/photos", token, file, "image"),

    createSubscriptionCheckout: (token: string, plan: "PRO" | "BUSINESS") =>
      request<{ url: string | null }>("/billing/subscription/checkout", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({ plan }),
      }),

    createLeadCheckout: (token: string, leadId: string) =>
      request<{ url: string | null }>(`/billing/leads/${leadId}/checkout`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      }),

    createBoostCheckout: (token: string, type: "BOOST_LOCALE" | "BADGE_REPUTAZIONE" | "STORIA_SUCCESSO") =>
      request<{ url: string | null }>("/billing/boost/checkout", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({ type }),
      }),

    adminListUsers: (token: string) =>
      request<AdminUsersByRole>("/admin/users", { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" }),

    adminBootstrapPromote: (email: string, secret: string) =>
      request<{ email: string; role: string }>("/admin/bootstrap", {
        method: "POST",
        body: JSON.stringify({ email, secret }),
      }),

    /** `website`: honeypot anti-spam, va sempre passato vuoto da un form reale (Fase 6). */
    waitlistSignup: (email: string, website = "") =>
      request<{ ok: true }>("/waitlist", {
        method: "POST",
        body: JSON.stringify({ email, website }),
      }),

    /** Conteggio notifiche non lette, per il numeretto badge nell'header (CLAUDE.md §13). */
    unreadNotificationsCount: (token: string) =>
      request<{ count: number }>("/notifications/unread-count", { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" }),

    /** Contenuto delle notifiche non lette (tipo/payload), per il popup "toast" all'arrivo di un nuovo evento. */
    unreadNotifications: (token: string) =>
      request<{ id: string; type: string; payload: unknown; createdAt: string }[]>("/notifications/unread", {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      }),

    /** Segna tutte le notifiche dell'utente come lette — chiamato all'apertura di /dashboard o /le-mie-richieste. */
    markNotificationsRead: (token: string) =>
      request<void>("/notifications/mark-all-read", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      }),
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
