import { z } from "zod";
import "./zod";

/**
 * Controlli dei moduli (zod) di `agendaTools.ts`, in un file loro: le pagine che
 * usano solo le funzioni di `agendaTools.ts` non creano questi schemi all'apertura
 * (docs/changelog/2026-11-02-oggi-piu-leggera.md).
 */
const time = z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "Orario non valido.");

/** Una fascia della settimana tipo: stessi campi di una fascia dell'agenda, senza data. */
export const weekTemplateSlotSchema = z
  .object({
    start: time,
    end: time,
    allowsHome: z.boolean(),
    allowsOnline: z.boolean(),
    homeMax: z.number().int().min(1).max(20).nullable(),
    onlineMax: z.number().int().min(1).max(20).nullable(),
  })
  .refine((slot) => slot.end > slot.start, { message: "L'orario di fine deve essere dopo l'orario di inizio.", path: ["end"] })
  .refine((slot) => slot.allowsHome || slot.allowsOnline, { message: "Seleziona almeno una modalità (a domicilio o online).", path: ["allowsHome"] });
export type WeekTemplateSlot = z.infer<typeof weekTemplateSlotSchema>;

/** Sette giorni, da domenica (0) a sabato (6) come `Date.getUTCDay()`. */
export const agendaWeekTemplateSchema = z
  .object({ days: z.array(z.array(weekTemplateSlotSchema).max(6)).length(7) })
  .superRefine((template, ctx) => {
    template.days.forEach((slots, day) => {
      const sorted = [...slots].sort((a, b) => a.start.localeCompare(b.start));
      for (let i = 1; i < sorted.length; i++) {
        if (sorted[i]!.start < sorted[i - 1]!.end) {
          ctx.addIssue({ code: "custom", message: "Due fasce dello stesso giorno non possono sovrapporsi.", path: ["days", day] });
          return;
        }
      }
    });
  });
export type AgendaWeekTemplate = z.infer<typeof agendaWeekTemplateSchema>;

/**
 * Settimana di tutti i mesi (docs/changelog/2026-11-10-eccezioni-settimana.md):
 * `applyToManual` = "Applica anche a questi", i giorni cambiati a mano prendono
 * la settimana nuova (mai quelli con lavori fissati). Si accetta anche la sola
 * settimana, come prima.
 */
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data non valida.");
/** `true` = tutti i giorni cambiati a mano, oppure solo quelli spuntati (AAAA-MM-GG). */
const applyToManualSchema = z.union([z.boolean(), z.array(isoDate).max(400)]).default(false);

export const agendaWeekTemplateSaveSchema = z.union([
  z.object({ template: agendaWeekTemplateSchema, applyToManual: applyToManualSchema }),
  agendaWeekTemplateSchema.transform((template) => ({ template, applyToManual: false as boolean | string[] })),
]);
export type AgendaWeekTemplateSave = z.infer<typeof agendaWeekTemplateSaveSchema>;

/**
 * Settimana tipo salvata per un mese solo (richiesta dell'utente,
 * docs/CHANGELOG.md §323): `month` in AAAA-MM, al massimo un anno avanti.
 */
const monthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Mese non valido.");
export const agendaWeekTemplateMonthSchema = z.object({
  month: monthSchema,
  template: agendaWeekTemplateSchema,
  applyToManual: applyToManualSchema,
});
export type AgendaWeekTemplateMonth = z.infer<typeof agendaWeekTemplateMonthSchema>;

/** Domanda prima di salvare: la settimana e, se è per un mese solo, quel mese (docs/changelog/2026-11-10-eccezioni-settimana.md). */
export const agendaWeekTemplatePreviewSchema = z.union([
  z.object({ template: agendaWeekTemplateSchema, month: monthSchema.nullable().default(null) }),
  agendaWeekTemplateSchema.transform((template) => ({ template, month: null as string | null })),
]);
export type AgendaWeekTemplatePreviewInput = z.infer<typeof agendaWeekTemplatePreviewSchema>;
