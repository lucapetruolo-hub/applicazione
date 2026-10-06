import { z } from "zod";
import { professionalCategorySlugSchema } from "./schemas";

/**
 * Profilo creato da un operatore al telefono (docs/CHANGELOG.md §170,
 * CLAUDE.md §7-§8: "in fase di lancio manuale, un operatore crea il profilo
 * al telefono con loro"). L'operatore inserisce i dati essenziali e manda al
 * professionista un link: il professionista sceglie la password, accetta
 * informative e dichiarazione, e solo allora il profilo entra in ricerca.
 */
export const PROFILE_INVITE_DAYS = 14;

export const operatorProfileInviteSchema = z.object({
  email: z.string().email("Email non valida"),
  name: z.string().min(2, "Nome troppo corto").max(120),
  surname: z.string().max(120).optional(),
  phone: z.string().min(6).max(20).optional(),
  businessName: z.string().min(2, "Nome attività troppo corto").max(120),
  categorySlug: professionalCategorySlugSchema,
  city: z.string().min(2, "Scegli il comune"),
  address: z.string().max(200).optional(),
  bio: z.string().max(2000).optional(),
});
export type OperatorProfileInviteInput = z.infer<typeof operatorProfileInviteSchema>;

export const acceptProfileInviteSchema = z.object({
  token: z.string().min(20).max(200),
  password: z.string().min(8, "La password deve avere almeno 8 caratteri"),
  acceptedLegalTerms: z.boolean().refine((v) => v === true, "Devi accettare Privacy Policy e Termini di Servizio."),
  declaredAdult: z.boolean().refine((v) => v === true, "Devi dichiarare di avere almeno 18 anni."),
});
export type AcceptProfileInviteInput = z.infer<typeof acceptProfileInviteSchema>;

/** Link appena creato, da copiare e mandare al professionista. */
export type ProfileInviteLink = {
  userId: string;
  email: string;
  businessName: string;
  inviteUrl: string;
  expiresAt: string;
  /** L'email con il link è partita (serve Resend configurato). */
  emailSent: boolean;
};

/** Cosa vede il professionista aprendo il link, prima di scegliere la password. */
export type ProfileInvitePreview = {
  email: string;
  name: string | null;
  businessName: string;
};

/** Profili creati da un operatore e non ancora confermati, per l'area admin. */
export type PendingProfileInvite = {
  userId: string;
  email: string;
  name: string | null;
  businessName: string;
  city: string;
  categoryLabel: string;
  createdAt: string;
  lastLinkExpiresAt: string | null;
};
