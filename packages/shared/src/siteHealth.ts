import { z } from "zod";
import "./zod";

/**
 * Scadenze del sito e controllo notturno (docs/changelog/2026-11-13-admin-scadenze-controlli.md,
 * PR 3 dell'Admin automatico approvata da Luca il 13/11/2026): quello che
 * prima si ricordava a memoria (il database gratuito che scade, una chiave da
 * rinnovare) e quello che si rompe di notte compare in cima a Da fare.
 */

/** Giorni prima della scadenza in cui compare in Da fare. */
export const SITE_DEADLINE_NOTICE_DAYS = 15;

export type SiteDeadline = {
  id: string;
  title: string;
  note: string | null;
  dueAt: string;
  doneAt: string | null;
};

export const siteDeadlineSchema = z.object({
  title: z.string().trim().min(4, "Scrivi cosa scade.").max(120, "Al massimo 120 caratteri."),
  note: z.string().trim().max(400, "Al massimo 400 caratteri.").optional().transform((v) => v || undefined),
  dueAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data non valida."),
});
export type SiteDeadlineInput = z.infer<typeof siteDeadlineSchema>;

/** I controlli della notte, con il nome che legge l'admin. */
export type SiteCheckKey = "SITE" | "SEARCH_PAGE" | "SCHEDULED_JOBS" | "PAYMENTS_EVENTS";

export const SITE_CHECK_LABEL: Record<SiteCheckKey, string> = {
  SITE: "Il sito si apre",
  SEARCH_PAGE: "La pagina di ricerca si apre",
  SCHEDULED_JOBS: "I lavori automatici della notte",
  PAYMENTS_EVENTS: "Arrivano le notizie dei pagamenti",
};

export type SiteCheck = {
  id: string;
  key: SiteCheckKey;
  ok: boolean;
  problem: string | null;
  techNote: string | null;
  /** Da quando non va (resta uguale finché il problema c'è). */
  failingSince: string | null;
  checkedAt: string;
};

export type SiteHealth = { checks: SiteCheck[]; deadlines: SiteDeadline[] };
