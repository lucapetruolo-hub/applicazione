import { z } from "zod";
import { PROFESSIONAL_CATEGORIES } from "./categories";

const categorySlugs = PROFESSIONAL_CATEGORIES.map((category) => category.slug) as [string, ...string[]];

export const professionalCategorySlugSchema = z.enum(categorySlugs);

export const googleVerifySchema = z.object({
  idToken: z.string().min(10),
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
});
export type RegisterInput = z.infer<typeof registerSchema>;

/** Richiesta guidata cliente: foto + poche domande → categoria/prezzo stimato (CLAUDE.md §8). */
export const guidedRequestSchema = z.object({
  categorySlug: professionalCategorySlugSchema,
  description: z.string().min(10).max(2000),
  photoUrls: z.array(z.string().url()).max(5).default([]),
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

/** Recensione: consentita solo se legata a una prenotazione confermata (CLAUDE.md §8). */
export const reviewSchema = z.object({
  bookingId: z.string().uuid(),
  rating: z.number().int().min(1).max(5),
  comment: z.string().max(2000).optional(),
});
export type ReviewInput = z.infer<typeof reviewSchema>;

export const professionalProfileSchema = z.object({
  userId: z.string().uuid(),
  categorySlug: professionalCategorySlugSchema,
  subTags: z.array(z.string()).default([]),
  businessName: z.string().min(2).max(120),
  city: z.string().min(2),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  bio: z.string().max(2000).optional(),
});
export type ProfessionalProfileInput = z.infer<typeof professionalProfileSchema>;
