import { z } from "zod";
import { PROFESSIONAL_CATEGORIES } from "./categories";

const categorySlugs = PROFESSIONAL_CATEGORIES.map((category) => category.slug) as [string, ...string[]];

const timeSchema = z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "Orario non valido.");
const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data non valida.");
const timeRangeSchema = z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)-([01]\d|2[0-3]):([0-5]\d)$/, "Fascia oraria non valida.");

export const professionalCategorySlugSchema = z.enum(categorySlugs);

export const googleVerifySchema = z.object({
  idToken: z.string().min(10),
  /** Usato solo se l'account Google non esiste ancora (nuova registrazione): un login su un account esistente non cambia mai il ruolo. */
  role: z.enum(["CLIENT", "PROFESSIONAL"]).optional(),
});
export type GoogleVerifyInput = z.infer<typeof googleVerifySchema>;

/** Iscrizione alla waitlist "in costruzione" della homepage (redesign "Scheda Intervento" §4.6). */
export const waitlistSignupSchema = z.object({
  email: z.string().email("Email non valida"),
  // Honeypot anti-spam (Fase 6): campo tenuto vuoto e nascosto in UI per un
  // utente reale, ma visibile ai bot che compilano ogni campo del form —
  // se arriva valorizzato, il controller finge un successo senza salvare
  // nulla (apps/api/src/waitlist/waitlist.controller.ts).
  website: z.string().max(200).optional(),
});
export type WaitlistSignupInput = z.infer<typeof waitlistSignupSchema>;

/** Login via email + password (CLAUDE.md §8). */
export const emailPasswordSchema = z.object({
  email: z.string().email("Email non valida"),
  password: z.string().min(8, "La password deve avere almeno 8 caratteri"),
});
export type EmailPasswordInput = z.infer<typeof emailPasswordSchema>;

export const registerSchema = emailPasswordSchema.extend({
  name: z.string().min(2).max(120).optional(),
  role: z.enum(["CLIENT", "PROFESSIONAL"]).default("CLIENT"),
});
export type RegisterInput = z.infer<typeof registerSchema>;

/** Modifica dati anagrafici dal proprio account (CLAUDE.md §8 — impostazioni account). */
export const updateAccountSchema = z.object({
  name: z.string().min(2).max(120).optional(),
  surname: z.string().min(1).max(120).optional(),
  birthDate: z.string().date("Data non valida").optional(),
  email: z.string().email("Email non valida").optional(),
  phone: z.string().min(6).max(20).optional(),
});
export type UpdateAccountInput = z.infer<typeof updateAccountSchema>;

/**
 * Cambio password: currentPassword obbligatoria solo se l'account ne ha già
 * una impostata (un account creato via Google potrebbe non averla ancora).
 */
export const changePasswordSchema = z.object({
  currentPassword: z.string().min(8).optional(),
  newPassword: z.string().min(8, "La password deve avere almeno 8 caratteri"),
});
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

/** Richiesta guidata cliente: foto + poche domande → categoria/prezzo stimato (CLAUDE.md §8). */
export const guidedRequestSchema = z
  .object({
    categorySlug: professionalCategorySlugSchema,
    description: z.string().min(10).max(2000),
    /** Almeno una foto obbligatoria (richiesta esplicita dell'utente: "tutte le voci del richiedi un preventivo devono essere obbligatorie"). */
    photoUrls: z.array(z.string().url()).min(1, "Aggiungi almeno una foto.").max(3),
    city: z.string().min(2),
    /** Via, obbligatorio (numero civico non richiesto qui: il dettaglio completo arriva solo all'accettazione del preventivo, vedi acceptQuoteSchema). */
    address: z.string().min(1, "L'indirizzo è obbligatorio.").max(200),
    isUrgent: z.boolean().default(false),
    /** Se presente, la richiesta va solo a questo professionista (partita dal suo profilo pubblico), non in fan-out. */
    professionalProfileId: z.string().uuid().optional(),
    /**
     * Data+fascia oraria preferita: valorizzate solo quando la richiesta
     * parte da una fascia "generica" dell'agenda pubblica di un
     * professionista (AvailabilitySlot.maxBookings > 1) — vedi
     * packages/shared/src/availability.ts. Richiedono sempre
     * professionalProfileId (una fascia generica appartiene a un
     * professionista specifico).
     */
    preferredDate: isoDateSchema.optional(),
    preferredTimeSlot: timeRangeSchema.optional(),
  })
  .refine((data) => Boolean(data.preferredDate) === Boolean(data.preferredTimeSlot), {
    message: "Data e fascia oraria preferita vanno indicate insieme.",
    path: ["preferredTimeSlot"],
  })
  .refine((data) => !data.preferredDate || Boolean(data.professionalProfileId), {
    message: "Una fascia oraria preferita richiede un professionista specifico.",
    path: ["professionalProfileId"],
  });
export type GuidedRequestInput = z.infer<typeof guidedRequestSchema>;

/**
 * Modifica di una richiesta già inviata (descrizione, città, indirizzo e
 * foto: la categoria non è modificabile perché determina già a quali
 * professionisti è stata inoltrata la richiesta — cambiarla dopo il
 * fan-out non avrebbe senso). Consentita solo finché la richiesta non è
 * `CLOSED` (vedi GuidedRequestsService.update). `photoUrls` opzionale
 * (non `.default([])` come in guidedRequestSchema): se assente il set di
 * foto esistente non viene toccato, se presente sostituisce l'intero set
 * — stesso pattern "sostituzione per intero" già in uso per le prestazioni
 * professionista e le voci di preventivo.
 */
export const guidedRequestUpdateSchema = z.object({
  description: z.string().min(10).max(2000),
  city: z.string().min(2),
  address: z.string().max(200).optional(),
  photoUrls: z.array(z.string().url()).max(3).optional(),
});
export type GuidedRequestUpdateInput = z.infer<typeof guidedRequestUpdateSchema>;

/** Preventivo strutturato in-app (CLAUDE.md §8): niente scambio libero di contatti. */
/** Voce di un preventivo (es. "Manodopera", "Materiali"): nome + range di prezzo, stesso pattern di professionalServiceSchema. */
export const quoteItemSchema = z
  .object({
    name: z.string().min(2).max(120),
    priceMinEurCents: z.number().int().nonnegative().optional(),
    priceMaxEurCents: z.number().int().nonnegative().optional(),
  })
  .refine((data) => data.priceMinEurCents === undefined || data.priceMaxEurCents === undefined || data.priceMaxEurCents >= data.priceMinEurCents, {
    message: "Il prezzo massimo deve essere maggiore o uguale al minimo.",
    path: ["priceMaxEurCents"],
  });
export type QuoteItemInput = z.infer<typeof quoteItemSchema>;

export const quoteSchema = z.object({
  requestId: z.string().uuid(),
  professionalProfileId: z.string().uuid(),
  items: z.array(quoteItemSchema).min(1).max(20),
  estimatedStartDate: z.string().datetime(),
  notes: z.string().max(2000).optional(),
});
export type QuoteInput = z.infer<typeof quoteSchema>;

/** Preventivo inviato dal professionista autenticato: professionalProfileId viene dal JWT, non dal body. */
export const quoteSelfSchema = quoteSchema.omit({ professionalProfileId: true });
export type QuoteSelfInput = z.infer<typeof quoteSelfSchema>;

/**
 * Il cliente propone una data diversa per un preventivo ricevuto, scelta
 * tra le fasce libere dell'agenda del professionista (mai una data libera
 * scollegata: sarebbe validata comunque server-side, meglio vincolarla già
 * qui). Stessa struttura date+startTime+endTime già usata per le fasce
 * generiche dell'agenda in guidedRequestSchema.
 */
export const proposeQuoteDateSchema = z.object({
  date: isoDateSchema,
  startTime: timeSchema,
  endTime: timeSchema,
  /** Dettagli facoltativi sulla data proposta (es. "posso solo dopo le 17"), mostrati al professionista. */
  note: z.string().max(1000).optional(),
});
export type ProposeQuoteDateInput = z.infer<typeof proposeQuoteDateSchema>;

/**
 * Accettazione di un preventivo: oltre a creare la prenotazione, raccoglie
 * l'indirizzo di lavoro in campi separati (richiesta esplicita dell'utente:
 * "una schermata dove inserire dettagliatamente in riquadri diversi") —
 * tutti obbligatori tranne `addressExtra` (scala/piano/interno/azienda).
 * Nome/cognome/telefono sono ridondanti con l'account (`User.name`/
 * `surname`/`phone`) ma raccolti di nuovo qui: la persona che riceve il
 * professionista sul lavoro può non coincidere con l'intestatario
 * dell'account, e l'account potrebbe non avere questi campi compilati —
 * qui diventano obbligatori indipendentemente dallo stato del profilo.
 */
export const acceptQuoteSchema = z.object({
  recipientName: z.string().min(1, "Il nome è obbligatorio.").max(120),
  recipientSurname: z.string().min(1, "Il cognome è obbligatorio.").max(120),
  recipientPhone: z.string().min(6, "Numero di telefono non valido.").max(20),
  street: z.string().min(1, "L'indirizzo è obbligatorio.").max(200),
  houseNumber: z.string().min(1, "Il numero civico è obbligatorio.").max(20),
  addressExtra: z.string().max(200).optional(),
  postalCode: z.string().min(1, "Il CAP è obbligatorio.").max(10),
  city: z.string().min(1, "La città è obbligatoria.").max(120),
  province: z.string().min(1, "La provincia è obbligatoria.").max(50),
});
export type AcceptQuoteInput = z.infer<typeof acceptQuoteSchema>;

/**
 * Voce dell'importo finale di un lavoro completato (richiesta esplicita
 * dell'utente): a differenza di quoteItemSchema qui il prezzo è un valore
 * esatto, non un range — il professionista sta comunicando quanto ha
 * effettivamente addebitato, non più stimando.
 */
export const bookingFinalItemSchema = z.object({
  name: z.string().min(1, "Il nome della voce è obbligatorio.").max(120),
  priceEurCents: z.number().int().nonnegative().max(100_000_00),
});
export type BookingFinalItemInput = z.infer<typeof bookingFinalItemSchema>;

/** Il professionista segnala un lavoro come terminato, inserendo l'importo preciso (voci del preventivo + eventuali extra). */
export const completeBookingSchema = z.object({
  items: z.array(bookingFinalItemSchema).min(1, "Aggiungi almeno una voce.").max(20),
});
export type CompleteBookingInput = z.infer<typeof completeBookingSchema>;

/** Il professionista annulla un intervento già confermato, con una nota facoltativa spiegata al cliente. */
export const cancelBookingByProfessionalSchema = z.object({
  note: z.string().max(1000).optional(),
});
export type CancelBookingByProfessionalInput = z.infer<typeof cancelBookingByProfessionalSchema>;

/** Il professionista rifiuta una richiesta ricevuta prima di inviare un preventivo, con una nota facoltativa per il cliente. */
export const declineLeadSchema = z.object({
  note: z.string().max(1000).optional(),
});
export type DeclineLeadInput = z.infer<typeof declineLeadSchema>;

/** Recensione: consentita solo se legata a una prenotazione confermata (CLAUDE.md §8). */
export const reviewSchema = z.object({
  bookingId: z.string().uuid(),
  rating: z.number().int().min(1).max(5),
  comment: z.string().max(2000).optional(),
  /** Foto del lavoro svolto, opzionali: mostrate poi nella sezione recensioni del professionista. */
  photoUrls: z.array(z.string().url()).max(3).default([]),
});
export type ReviewInput = z.infer<typeof reviewSchema>;

/** Prestazione offerta dal professionista: nome + prezzo facoltativo (in centesimi). */
export const professionalServiceSchema = z
  .object({
    name: z.string().min(2).max(120),
    priceMinEurCents: z.number().int().nonnegative().optional(),
    priceMaxEurCents: z.number().int().nonnegative().optional(),
  })
  .refine((data) => data.priceMinEurCents === undefined || data.priceMaxEurCents === undefined || data.priceMaxEurCents >= data.priceMinEurCents, {
    message: "Il prezzo massimo deve essere maggiore o uguale al minimo.",
    path: ["priceMaxEurCents"],
  });
export type ProfessionalServiceInput = z.infer<typeof professionalServiceSchema>;

export const professionalProfileSchema = z.object({
  userId: z.string().uuid(),
  categorySlug: professionalCategorySlugSchema,
  subTags: z.array(z.string()).default([]),
  businessName: z.string().min(2).max(120),
  city: z.string().min(2),
  address: z.string().max(200).optional(),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  bio: z.string().max(2000).optional(),
  remoteAvailable: z.boolean().default(false),
  services: z.array(professionalServiceSchema).max(30).default([]),
  // Opzionale: un professionista può caricare la foto prima ancora di aver
  // salvato il resto del profilo (è la prima sezione del form in
  // /dashboard/profilo) — in quel caso non esiste ancora una riga
  // ProfessionalProfile su cui persisterla subito, quindi l'URL resta in
  // stato locale finché non arriva qui, nel primo salvataggio vero e proprio.
  imageUrl: z.string().url().optional(),
});
export type ProfessionalProfileInput = z.infer<typeof professionalProfileSchema>;

/**
 * Creazione/aggiornamento del proprio profilo professionista (userId preso
 * dal JWT, non dal body). lat/lng sono opzionali: se non inviate, il backend
 * le ricava dal comune scelto (`findComuneByName`, dataset ISTAT in
 * packages/shared) — geocodifica reale, non più un placeholder 0,0.
 */
export const professionalProfileSelfSchema = professionalProfileSchema
  .omit({ userId: true, latitude: true, longitude: true })
  .extend({
    latitude: z.number().min(-90).max(90).optional(),
    longitude: z.number().min(-180).max(180).optional(),
  });
export type ProfessionalProfileSelfInput = z.infer<typeof professionalProfileSelfSchema>;

/**
 * Fascia oraria, vedi packages/shared/src/availability.ts. `date`
 * opzionale: se presente, la fascia vale SOLO per quella data esatta (nuovo
 * comportamento di default, richiesta esplicita dell'utente); se assente,
 * ricorrenza settimanale indefinita per `dayOfWeek` — comportamento storico,
 * non più creabile dalla UI ma ancora supportato per le fasce già esistenti.
 */
export const availabilitySlotSchema = z
  .object({
    dayOfWeek: z.number().int().min(0).max(6),
    startTime: timeSchema,
    endTime: timeSchema,
    /** 1 (esatta) o >1 (generica, richiede preventivo invece di prenotazione istantanea). */
    maxBookings: z.number().int().min(1).max(20).default(1),
    date: isoDateSchema.optional(),
  })
  .refine((data) => data.endTime > data.startTime, {
    message: "L'orario di fine deve essere dopo l'orario di inizio.",
    path: ["endTime"],
  });
export type AvailabilitySlotInput = z.infer<typeof availabilitySlotSchema>;

/** True se due fasce potrebbero applicarsi nella stessa data di calendario (usata per il controllo di sovrapposizione). */
function slotsShareAnOccurrence(a: AvailabilitySlotInput, b: AvailabilitySlotInput): boolean {
  if (a.date && b.date) return a.date === b.date;
  if (a.date && !b.date) return new Date(`${a.date}T00:00:00.000Z`).getUTCDay() === b.dayOfWeek;
  if (!a.date && b.date) return new Date(`${b.date}T00:00:00.000Z`).getUTCDay() === a.dayOfWeek;
  return a.dayOfWeek === b.dayOfWeek;
}

export const professionalAvailabilitySchema = z
  .object({
    slots: z.array(availabilitySlotSchema).max(200).default([]),
    /** Se true, un cliente può prenotare direttamente una fascia libera dell'agenda pubblica. */
    bookableAgenda: z.boolean().default(false),
  })
  // Due fasce non possono sovrapporsi se potrebbero cadere nella stessa
  // data (es. due fasce dello stesso giorno esatto, o una fascia esatta e
  // una ricorrente sullo stesso giorno della settimana): fonte di verità
  // unica condivisa da client (validazione immediata in /dashboard/agenda)
  // e server (ZodValidationPipe), invece di duplicare la stessa logica in
  // due punti che potrebbero disallinearsi.
  .superRefine((data, ctx) => {
    for (let i = 0; i < data.slots.length; i++) {
      for (let j = i + 1; j < data.slots.length; j++) {
        const a = data.slots[i]!;
        const b = data.slots[j]!;
        if (!slotsShareAnOccurrence(a, b)) continue;
        if (a.startTime < b.endTime && b.startTime < a.endTime) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Due fasce orarie non possono sovrapporsi nello stesso giorno.",
            path: ["slots"],
          });
          return;
        }
      }
    }
  });
export type ProfessionalAvailabilityInput = z.infer<typeof professionalAvailabilitySchema>;

/** Giorno di chiusura straordinaria (ferie, festività, imprevisto), vedi packages/shared/src/availability.ts. */
export const availabilityExceptionSchema = z.object({
  date: isoDateSchema,
});
export type AvailabilityExceptionInput = z.infer<typeof availabilityExceptionSchema>;

/** Prenotazione diretta di una fascia dell'agenda pubblica (solo se bookableAgenda è true). */
export const bookAgendaSlotSchema = z.object({
  date: isoDateSchema,
  startTime: timeSchema,
  endTime: timeSchema,
});
export type BookAgendaSlotInput = z.infer<typeof bookAgendaSlotSchema>;

/**
 * Promozione ad ADMIN dell'account con questa email, protetta da un segreto
 * condiviso (`ADMIN_BOOTSTRAP_SECRET`, solo variabile d'ambiente su
 * apps/api, mai committato) invece che da un JWT: serve proprio a creare il
 * PRIMO admin, quando nessun account ha ancora quel ruolo per poter passare
 * dal normale AdminGuard (che richiede di essere già ADMIN).
 */
export const adminBootstrapSchema = z.object({
  email: z.string().email(),
  secret: z.string().min(1),
});
export type AdminBootstrapInput = z.infer<typeof adminBootstrapSchema>;
