import { z } from "zod";
import "./zod";

/**
 * Pulsanti "Ci sarò" e "Non posso più" dell'email del giorno prima (Luca,
 * 29/10/2026, docs/changelog/2026-10-28-promemoria-whatsapp.md): la pagina
 * del link mostra l'appuntamento e registra la risposta con un tocco.
 */
export const APPOINTMENT_REPLY_ACTIONS = [
  "CONFIRM",
  "CANT_COME",
  "UNDO_CONFIRM",
  "UNDO_CANT_COME",
] as const;
export type AppointmentReplyAction = (typeof APPOINTMENT_REPLY_ACTIONS)[number];

export const appointmentReplySchema = z.object({
  action: z.enum(APPOINTMENT_REPLY_ACTIONS),
});
export type AppointmentReplyInput = z.infer<typeof appointmentReplySchema>;

/** Quello che vede il cliente sulla pagina del link: niente dati di contatto. */
export type AppointmentReplyState = {
  businessName: string;
  scheduledAt: string;
  scheduledEndAt: string | null;
  /** Confermato e ancora da venire: solo allora si può rispondere. */
  upcoming: boolean;
  confirmedAt: string | null;
  cantComeAt: string | null;
  /** Fino a quando annullando l'acconto torna indietro (ora italiana scritta in UTC). */
  depositDeadline: string | null;
  guidedRequestId: string | null;
};
