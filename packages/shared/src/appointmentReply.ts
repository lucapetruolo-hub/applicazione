import { z } from "zod";
import "./zod";

// Come in schemas.ts: data AAAA-MM-GG e ora HH:MM.
const timeSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "Orario non valido.");
const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Data non valida.");

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

/**
 * "Non posso più" → il cliente propone un'altra data per un appuntamento già
 * fissato; il professionista la accetta (l'appuntamento si sposta) o la
 * rifiuta. Nessun controllo sull'agenda: decide il professionista.
 */
export const rescheduleBookingSchema = z.object({
  date: isoDateSchema,
  startTime: timeSchema,
  endTime: timeSchema,
  note: z.string().trim().max(1000).optional(),
});
export type RescheduleBookingInput = z.infer<typeof rescheduleBookingSchema>;

export const rejectRescheduleSchema = z.object({
  note: z.string().trim().max(1000).optional(),
});
export type RejectRescheduleInput = z.infer<typeof rejectRescheduleSchema>;
