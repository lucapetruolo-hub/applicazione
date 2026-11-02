import { createHmac } from "node:crypto";

/**
 * Impronta dell'email di un account chiuso (collaudo, gruppo 12,
 * docs/changelog/2026-10-30-admin-persone.md): alla chiusura l'email si
 * cancella, resta solo questa. In Admin → Persone chi scrive l'email esatta
 * ritrova "Account chiuso il …"; dall'impronta l'email non si ricava.
 * Chiave dedicata dei dati delicati (`FISCAL_DATA_KEY`), come i dati
 * fiscali: ruotare `JWT_SECRET` non deve far perdere gli account chiusi.
 */
export function emailFingerprint(email: string): string {
  const secret = process.env.FISCAL_DATA_KEY?.trim() || process.env.JWT_SECRET || "dev-secret-change-me";
  return createHmac("sha256", `closed-account-email:${secret}`).update(email.trim().toLowerCase()).digest("hex");
}
