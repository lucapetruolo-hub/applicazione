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
    photoUrls: z.array(z.string().url()).max(3).default([]),
    city: z.string().min(2),
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
 * Modifica di una richiesta già inviata (solo descrizione e città: la
 * categoria non è modificabile perché determina già a quali professionisti
 * è stata inoltrata la richiesta — cambiarla dopo il fan-out non avrebbe
 * senso). Consentita solo finché la richiesta non è `CLOSED` (vedi
 * GuidedRequestsService.update).
 */
export const guidedRequestUpdateSchema = z.object({
  description: z.string().min(10).max(2000),
  city: z.string().min(2),
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

/** Fascia oraria ricorrente (agenda settimanale), vedi packages/shared/src/availability.ts. */
export const availabilitySlotSchema = z
  .object({
    dayOfWeek: z.number().int().min(0).max(6),
    startTime: timeSchema,
    endTime: timeSchema,
    /** 1 (esatta) o >1 (generica, richiede preventivo invece di prenotazione istantanea). */
    maxBookings: z.number().int().min(1).max(20).default(1),
  })
  .refine((data) => data.endTime > data.startTime, {
    message: "L'orario di fine deve essere dopo l'orario di inizio.",
    path: ["endTime"],
  });
export type AvailabilitySlotInput = z.infer<typeof availabilitySlotSchema>;

export const professionalAvailabilitySchema = z
  .object({
    slots: z.array(availabilitySlotSchema).max(50).default([]),
    /** Se true, un cliente può prenotare direttamente una fascia libera dell'agenda pubblica. */
    bookableAgenda: z.boolean().default(false),
  })
  // Due fasce sullo stesso giorno non possono sovrapporsi (es. 09:00–13:00 e
  // 10:00–11:00): fonte di verità unica condivisa da client (validazione
  // immediata in /dashboard/agenda) e server (ZodValidationPipe), invece di
  // duplicare la stessa logica in due punti che potrebbero disallinearsi.
  .superRefine((data, ctx) => {
    const byDay = new Map<number, { startTime: string; endTime: string }[]>();
    for (const slot of data.slots) {
      const list = byDay.get(slot.dayOfWeek) ?? [];
      list.push(slot);
      byDay.set(slot.dayOfWeek, list);
    }
    for (const daySlots of byDay.values()) {
      const sorted = [...daySlots].sort((a, b) => a.startTime.localeCompare(b.startTime));
      for (let i = 1; i < sorted.length; i++) {
        const current = sorted[i];
        const previous = sorted[i - 1];
        if (current && previous && current.startTime < previous.endTime) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Due fasce orarie dello stesso giorno non possono sovrapporsi.",
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
