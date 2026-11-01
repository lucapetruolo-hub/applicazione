import { z } from "zod";
import "./zod";
import type { AdminScope } from "./adminRoles";

/**
 * Coda "Da fare" dell'area admin (docs/changelog/2026-10-30-admin-riordino.md):
 * tutti i casi che aspettano una decisione in un solo elenco, prima quelli che
 * scadono prima. Prima la Home aveva solo dei contatori per tipo, e per sapere
 * quale caso scadeva per primo bisognava aprire le pagine una per una.
 */
export type AdminQueueKind =
  | "BANK_DISPUTE"
  | "JOB_ISSUE"
  | "JOB_ISSUE_APPEAL"
  | "REFUND"
  | "DISPUTE"
  | "UNPAID_BALANCE"
  | "SDI_REJECTED"
  | "CONTENT_REPORT"
  | "REPORT_APPEAL"
  | "PROBLEM_TAKEOVER"
  | "CONTACT_MESSAGE"
  | "VERIFICATION"
  | "CLOSED_ZONE";

/** Gruppo del filtro "Tipo" della coda: gli stessi nomi delle voci del menu. */
export type AdminQueueGroup = "soldi" | "reclami" | "richieste" | "persone" | "fisco";

export const ADMIN_QUEUE_KINDS: Record<AdminQueueKind, { label: string; group: AdminQueueGroup; scope: AdminScope }> = {
  BANK_DISPUTE: { label: "Contestazione in banca", group: "soldi", scope: "FINANCE" },
  JOB_ISSUE: { label: "Problema sul lavoro", group: "reclami", scope: "ANY" },
  JOB_ISSUE_APPEAL: { label: "Ricorso su un problema", group: "reclami", scope: "ANY" },
  REFUND: { label: "Rimborso", group: "soldi", scope: "FINANCE" },
  DISPUTE: { label: "Contestazione di pagamento", group: "soldi", scope: "FINANCE" },
  UNPAID_BALANCE: { label: "Saldo non pagato", group: "soldi", scope: "FINANCE" },
  SDI_REJECTED: { label: "Fattura scartata dallo SdI", group: "fisco", scope: "FINANCE" },
  CONTENT_REPORT: { label: "Segnalazione", group: "reclami", scope: "MODERATION" },
  REPORT_APPEAL: { label: "Ricorso su una segnalazione", group: "reclami", scope: "MODERATION" },
  PROBLEM_TAKEOVER: { label: "Ce ne occupiamo noi", group: "richieste", scope: "MODERATION" },
  CONTACT_MESSAGE: { label: "Messaggio dal sito", group: "richieste", scope: "MODERATION" },
  VERIFICATION: { label: "Verifica del profilo", group: "persone", scope: "MODERATION" },
  CLOSED_ZONE: { label: "Zona con le richieste chiuse", group: "richieste", scope: "MODERATION" },
};

export const ADMIN_QUEUE_GROUP_LABEL: Record<AdminQueueGroup, string> = {
  soldi: "Soldi",
  reclami: "Reclami e segnalazioni",
  richieste: "Richieste",
  persone: "Persone",
  fisco: "Fisco e fatture",
};

export type AdminQueueItem = {
  /** "<tipo>:<id>", la stessa chiave di "Prendo io". */
  key: string;
  kind: AdminQueueKind;
  /** Pagina dove si decide. */
  href: string;
  /** Cosa è successo, in poche parole (es. "non si è presentato"). */
  title: string;
  detail: string | null;
  /** Chi è coinvolto (es. "Piero Gallo → Marco Rossi Idraulica"). */
  who: string | null;
  amountEurCents: number | null;
  /** Ultimo momento utile; `null` se il caso non ha una scadenza. */
  dueAt: string | null;
  /** Da dove viene la scadenza, detto in breve (es. "Termini: 2 giorni"). */
  dueNote: string | null;
  createdAt: string;
  status: string;
  /** Pericolo per le persone (gas, monossido, acqua sull'impianto elettrico): in cima. */
  danger: boolean;
  claimedBy: { id: string; name: string } | null;
};

export type AdminQueue = {
  items: AdminQueueItem[];
  /** Da guardare senza decidere: problemi ancora in chat tra le parti. */
  watching: { key: string; href: string; title: string; who: string | null; since: string }[];
};

/**
 * Ordine della coda: prima i pericoli, poi i casi con scadenza (la più vicina
 * per prima, anche se già passata), poi gli altri dal più vecchio.
 */
export function sortAdminQueue<T extends Pick<AdminQueueItem, "danger" | "dueAt" | "createdAt">>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    if (a.danger !== b.danger) return a.danger ? -1 : 1;
    if (a.dueAt && b.dueAt) return a.dueAt.localeCompare(b.dueAt);
    if (a.dueAt) return -1;
    if (b.dueAt) return 1;
    return a.createdAt.localeCompare(b.createdAt);
  });
}

/** "Prendo io" e "Lascia" nella coda: la chiave del caso. */
export const adminQueueClaimSchema = z.object({ caseKey: z.string().trim().regex(/^[A-Z_]+:[0-9a-f-]{36}$/) });
export type AdminQueueClaimInput = z.infer<typeof adminQueueClaimSchema>;
