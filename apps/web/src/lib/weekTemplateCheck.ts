import { agendaWeekTemplateSchema, type AgendaWeekTemplate } from "@professionisti/shared";

/**
 * Controllo della settimana tipo, caricato solo quando la si cambia
 * (`WeekTemplateEditor`): così Agenda e Oggi non avviano zod all'apertura
 * (docs/changelog/2026-11-02-oggi-piu-leggera.md). Stesso schema dell'API.
 */
export function isValidWeekTemplate(template: AgendaWeekTemplate): boolean {
  return agendaWeekTemplateSchema.safeParse(template).success;
}
