import { z } from "zod";
import "./zod";

/** "Togli verifica" dall'area admin: il motivo arriva al professionista. */
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
  /** Ha premuto "Richiedi la verifica" (docs/CHANGELOG.md §201). */
  verificationRequestedAt: string | null;
  verifiedAt: string | null;
  verifiedByName: string | null;
  verificationNote: string | null;
  /** Ultima verifica di documento e selfie (Didit, docs/CHANGELOG.md §253). */
  identity: {
    id: string;
    status: "STARTED" | "PROCESSING" | "APPROVED" | "NEEDS_REVIEW" | "DECLINED" | "EXPIRED";
    reason: string | null;
    provider: string;
    providerSessionId: string;
    updatedAt: string;
    /** Fatta con DIDIT_SANDBOX: dal lancio non tiene il badge (§338). */
    sandbox: boolean;
    /** Scadenza del documento letta dal fornitore, se c'è. */
    documentExpiresAt: string | null;
    /** Solo se approvata: fino a quando tiene il badge (scadenza del documento o 5 anni). */
    validUntil: string | null;
  } | null;
  /** Verifiche di codice fiscale e partita IVA (VIES, Openapi). */
  taxIdChecks: { kind: "CODICE_FISCALE" | "PARTITA_IVA"; status: "PENDING" | "VALID" | "INVALID" | "REVIEW"; detail: string | null; officialName: string | null }[];
};
