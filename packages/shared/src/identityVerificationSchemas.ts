import { z } from "zod";
import "./zod";

// Schema in un file a parte: `identityVerification.ts` entra in ogni pagina
// del sito (menu del professionista), zod no (collaudo N-01,
// docs/changelog/2026-10-30-velocita-telefono.md).

export const startIdentityVerificationSchema = z.object({
  biometricConsent: z.literal(true, { message: "Per continuare spunta il consenso al confronto del selfie." }),
});
export type StartIdentityVerificationInput = z.infer<typeof startIdentityVerificationSchema>;
