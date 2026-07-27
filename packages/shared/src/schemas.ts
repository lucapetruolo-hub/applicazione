import { z } from "zod";
import { PROFESSIONAL_CATEGORIES } from "./categories";

const categorySlugs = PROFESSIONAL_CATEGORIES.map((category) => category.slug) as [string, ...string[]];

export const professionalCategorySlugSchema = z.enum(categorySlugs);

export const googleVerifySchema = z.object({
  idToken: z.string().min(10),
  /** Usato solo se l'account Google non esiste ancora (nuova registrazione): un login su un account esistente non cambia mai il ruolo. */
  role: z.enum(["CLIENT", "PROFESSIONAL"]).optional(),
});
export type GoogleVerifyInput = z.infer<typeof googleVerifySchema>;

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
export const guidedRequestSchema = z.object({
  categorySlug: professionalCategorySlugSchema,
  description: z.string().min(10).max(2000),
  photoUrls: z.array(z.string().url()).max(3).default([]),
  city: z.string().min(2),
  isUrgent: z.boolean().default(false),
  /** Se presente, la richiesta va solo a questo professionista (partita dal suo profilo pubblico), non in fan-out. */
  professionalProfileId: z.string().uuid().optional(),
});
export type GuidedRequestInput = z.infer<typeof guidedRequestSchema>;

/** Preventivo strutturato in-app (CLAUDE.md §8): niente scambio libero di contatti. */
export const quoteSchema = z.object({
  requestId: z.string().uuid(),
  professionalProfileId: z.string().uuid(),
  laborEurCents: z.number().int().nonnegative(),
  materialsEurCents: z.number().int().nonnegative(),
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

const timeSchema = z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "Orario non valido.");

/** Fascia oraria ricorrente (agenda settimanale), vedi packages/shared/src/availability.ts. */
export const availabilitySlotSchema = z
  .object({
    dayOfWeek: z.number().int().min(0).max(6),
    startTime: timeSchema,
    endTime: timeSchema,
  })
  .refine((data) => data.endTime > data.startTime, {
    message: "L'orario di fine deve essere dopo l'orario di inizio.",
    path: ["endTime"],
  });
export type AvailabilitySlotInput = z.infer<typeof availabilitySlotSchema>;

export const professionalAvailabilitySchema = z.object({
  slots: z.array(availabilitySlotSchema).max(50).default([]),
});
export type ProfessionalAvailabilityInput = z.infer<typeof professionalAvailabilitySchema>;

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
