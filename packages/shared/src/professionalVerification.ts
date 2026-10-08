import { z } from "zod";

/**
 * Verifica manuale dei professionisti (docs/CHANGELOG.md §199, checklist
 * lancio punto 15): un admin controlla un documento d'identità e la partita
 * IVA (o il codice fiscale, per chi non ha partita IVA) e assegna il badge
 * "Verificato". Niente documenti caricati sul sito: il controllo avviene
 * fuori (videochiamata, email), qui resta solo l'esito.
 */
export const verifyProfessionalSchema = z.object({
  identityChecked: z.literal(true, { errorMap: () => ({ message: "Conferma di aver controllato il documento d'identità." }) }),
  taxIdChecked: z.literal(true, { errorMap: () => ({ message: "Conferma di aver controllato partita IVA o codice fiscale." }) }),
  note: z.string().trim().max(500).optional(),
});
export type VerifyProfessionalInput = z.infer<typeof verifyProfessionalSchema>;

export const unverifyProfessionalSchema = z.object({
  note: z.string().trim().min(3, "Scrivi il motivo.").max(500),
});
export type UnverifyProfessionalInput = z.infer<typeof unverifyProfessionalSchema>;

export type ProfessionalVerificationFilter = "pending" | "verified";

/** Riga dell'elenco in /admin/verifiche. */
export type ProfessionalVerificationRow = {
  professionalProfileId: string;
  userId: string;
  businessName: string;
  ownerName: string;
  email: string;
  phone: string | null;
  categoryLabel: string;
  city: string;
  createdAt: string;
  /** Partita IVA o codice fiscale inseriti nei dati fiscali, se compilati. */
  vatNumber: string | null;
  codiceFiscale: string | null;
  hasLiabilityInsurance: boolean;
  verified: boolean;
  verifiedAt: string | null;
  verifiedByName: string | null;
  verificationNote: string | null;
};
