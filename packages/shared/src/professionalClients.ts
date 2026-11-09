import { z } from "zod";
import "./zod";

/**
 * Rubrica "I miei clienti" del professionista
 * (docs/changelog/2026-11-08-rubrica-clienti.md): i clienti dei lavori presi
 * sul sito e di quelli aggiunti a mano in Agenda, con lo storico e una nota
 * privata. I contatti di un cliente del sito ci sono solo perché esiste un
 * lavoro accettato (CLAUDE.md §5 punto 9).
 */
export type ProfessionalClientJob = {
  id: string;
  kind: "BOOKING" | "EXTERNAL";
  /** Prima voce del preventivo, mestiere o descrizione scritta a mano. */
  label: string;
  at: string;
  status: "SCHEDULED" | "COMPLETED" | "CANCELED";
  amountEurCents: number | null;
  /** Richiesta di origine, per aprire la scheda o la chat (solo lavori del sito). */
  guidedRequestId: string | null;
};

export type ProfessionalClient = {
  /** "u:<account>" per i clienti del sito, "e:<telefono o nome>" per quelli esterni. */
  key: string;
  kind: "SITE" | "EXTERNAL";
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  /** Dal più recente. */
  jobs: ProfessionalClientJob[];
  jobsDone: number;
  lastJobAt: string | null;
  nextJobAt: string | null;
  /** Somma degli importi dei lavori terminati (finale sul sito, prezzo scritto per gli esterni). */
  totalEurCents: number;
  note: string | null;
  /** Richiesta più recente con la chat, per "Proponi una data" ai clienti del sito. */
  chatGuidedRequestId: string | null;
};

export const PROFESSIONAL_CLIENT_NOTE_MAX = 2000;

export const professionalClientNoteSchema = z.object({
  clientKey: z.string().regex(/^(u|e):\S.{0,199}$/),
  note: z.string().max(PROFESSIONAL_CLIENT_NOTE_MAX),
});
export type ProfessionalClientNoteInput = z.infer<typeof professionalClientNoteSchema>;

/**
 * Chiave di un cliente dei lavori esterni: le ultime 9 cifre del telefono
 * (lo stesso numero scritto con o senza +39 o spazi), altrimenti il nome in
 * minuscolo senza spazi doppi.
 */
export function externalClientKey(clientName: string, clientPhone: string | null): string {
  const digits = (clientPhone ?? "").replace(/\D/g, "");
  if (digits.length >= 6) return `e:${digits.slice(-9)}`;
  return `e:${clientName.trim().toLowerCase().replace(/\s+/g, " ")}`;
}

/** Ricerca nella rubrica: nome, telefono (anche senza spazi) o indirizzo. */
export function matchesClientSearch(client: Pick<ProfessionalClient, "name" | "phone" | "address" | "email">, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const qDigits = q.replace(/\D/g, "");
  if (qDigits.length >= 3 && (client.phone ?? "").replace(/\D/g, "").includes(qDigits)) return true;
  return [client.name, client.address, client.email].some((v) => (v ?? "").toLowerCase().includes(q));
}
