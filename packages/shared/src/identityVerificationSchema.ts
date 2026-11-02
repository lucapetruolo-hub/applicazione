import { z } from "zod";
import "./zod";

// Schemi in un file a parte (docs/changelog/2026-11-02-nextjs-16.md): le
// costanti di identityVerification.ts servono in ogni pagina del sito, zod solo dove si valida.

export const startIdentityVerificationSchema = z.object({
  biometricConsent: z.literal(true, { message: "Per continuare spunta il consenso al confronto del selfie." }),
});
export type StartIdentityVerificationInput = z.infer<typeof startIdentityVerificationSchema>;
