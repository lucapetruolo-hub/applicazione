import type { ProfessionalAgenda } from "./availability";
import type { ProfessionalAvailabilityPreviewDay } from "./professionals";

/**
 * Agenda leggera nelle schede della ricerca (docs/changelog/2026-11-16-traffico-elevato.md,
 * miglioria scelta da Luca). Prima ogni scheda portava 63 giorni di fasce,
 * circa 22 KB: 50 schede facevano 1,2 MB, che finivano anche nella pagina
 * scaricata dal telefono. Ora la ricerca manda:
 * - tutti i giorni della prima settimana (bastano per la prima finestra di
 *   4 colonne e per i filtri "Oggi", "Entro 3 giorni" e "Intervento urgente");
 * - più avanti solo il primo giorno con un orario libero a domicilio e il
 *   primo online, per "Mostra orari disponibili" e l'anteprima sulla mappa.
 * Il resto arriva con una sola chiamata all'agenda del profilo quando il
 * cliente sfoglia la scheda oltre la prima settimana.
 */
export const SEARCH_AGENDA_COMPLETE_DAYS = 7;

/** Ultimo giorno (AAAA-MM-GG) che la ricerca manda completo, partendo da `from`. */
export function searchAgendaCompleteUntil(from: string): string {
  const date = new Date(`${from}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + SEARCH_AGENDA_COMPLETE_DAYS - 1);
  return date.toISOString().slice(0, 10);
}

/** Giorni da mandare nella scheda della ricerca: la prima settimana intera, poi il primo giorno libero per modalità. */
export function trimSearchAgenda(days: ProfessionalAvailabilityPreviewDay[], from: string): ProfessionalAvailabilityPreviewDay[] {
  const completeUntil = searchAgendaCompleteUntil(from);
  const kept = days.filter((day) => day.date <= completeUntil);
  const later = days.filter((day) => day.date > completeUntil);
  const firstHome = later.find((day) => day.times.some((slot) => slot.allowsHome && slot.homeAvailable));
  const firstOnline = later.find((day) => day.times.some((slot) => slot.allowsOnline && slot.onlineAvailable));
  for (const day of [firstHome, firstOnline]) {
    if (day && !kept.includes(day)) kept.push(day);
  }
  // Nessun giorno tenuto ma qualche fascia più avanti, tutte al completo: il
  // primo giorno resta, così la scheda mostra comunque la griglia (§206).
  if (kept.length === 0 && days.length > 0) kept.push(days[0]!);
  return kept.sort((a, b) => a.date.localeCompare(b.date));
}

/** Agenda della pagina profilo (`GET /professionals/:id/agenda`) nella forma della scheda della ricerca. */
export function agendaToPreviewDays(agenda: ProfessionalAgenda): ProfessionalAvailabilityPreviewDay[] {
  return agenda.days
    .map((day) => ({
      date: day.date,
      times: day.slots.map((slot) => ({
        time: slot.startTime,
        endTime: slot.endTime,
        allowsHome: slot.home !== null,
        allowsOnline: slot.online !== null,
        homeAvailable: slot.home !== null && slot.home.bookedCount < slot.home.maxBookings,
        onlineAvailable: slot.online !== null && slot.online.bookedCount < slot.online.maxBookings,
      })),
    }))
    .filter((day) => day.times.length > 0);
}
