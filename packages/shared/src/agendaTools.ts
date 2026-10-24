import { z } from "zod";

/**
 * Strumenti della nuova agenda (docs/CHANGELOG.md §288): settimana tipo,
 * calendario collegato, meteo e giro del giorno.
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
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Due fasce dello stesso giorno non possono sovrapporsi.", path: ["days", day] });
          return;
        }
      }
    });
  });
export type AgendaWeekTemplate = z.infer<typeof agendaWeekTemplateSchema>;

/** Settimana tipo proposta la prima volta: dal lunedì al venerdì 8–13 e 14–18, a domicilio. */
export const DEFAULT_WEEK_TEMPLATE: AgendaWeekTemplate = {
  days: [0, 1, 2, 3, 4, 5, 6].map((day) =>
    day === 0 || day === 6
      ? []
      : [
          { start: "08:00", end: "13:00", allowsHome: true, allowsOnline: false, homeMax: 1, onlineMax: null },
          { start: "14:00", end: "18:00", allowsHome: true, allowsOnline: false, homeMax: 1, onlineMax: null },
        ],
  ),
};

/** Calendario collegato (Google, iPhone): `token` serve a comporre il link, `null` se spento. */
export type CalendarFeedStatus = { token: string | null };

/** Fenomeni che meritano un'icona sul giorno (decisione dell'utente: solo un'icona, niente testo). */
export type WeatherAlertKind = "rain" | "storm" | "snow" | "wind" | "fog";
export type WeatherDayAlert = { date: string; kind: WeatherAlertKind };

export const WEATHER_ALERT_LABEL: Record<WeatherAlertKind, string> = {
  rain: "Pioggia",
  storm: "Temporale",
  snow: "Neve",
  wind: "Vento forte",
  fog: "Nebbia",
};

/** Una tappa del giro del giorno. */
export type DayRouteStop = {
  /** `booking-<id>` o `external-<id>`, per aprire l'appuntamento dal giro. */
  key: string;
  start: string;
  end: string | null;
  title: string;
  address: string | null;
  latitude: number;
  longitude: number;
  /** `true` se la posizione è solo il centro del comune (indirizzo non trovato). */
  approximate: boolean;
};

/** Tratto tra una tappa e la successiva. */
export type DayRouteLeg = {
  minutes: number;
  km: number;
  /** `true` se è una stima dalla distanza, non un percorso calcolato. */
  estimated: boolean;
  /** Minuti tra la fine della tappa prima (un'ora dopo l'inizio, se non ha un orario di fine) e l'inizio della successiva. */
  gapMinutes: number;
  /** Non c'è abbastanza tempo per arrivare. */
  tight: boolean;
};

export type DayRoute = { date: string; stops: DayRouteStop[]; legs: DayRouteLeg[] };

/** Link a Google Maps con tutte le tappe, nell'ordine (al massimo 9 intermedie, limite di Google). */
export function dayRouteMapsUrl(stops: Pick<DayRouteStop, "latitude" | "longitude" | "address">[]): string | null {
  if (stops.length === 0) return null;
  const place = (stop: Pick<DayRouteStop, "latitude" | "longitude" | "address">) => stop.address?.trim() || `${stop.latitude},${stop.longitude}`;
  const params = new URLSearchParams({ api: "1", destination: place(stops[stops.length - 1]!), travelmode: "driving" });
  const waypoints = stops.slice(0, -1).slice(0, 9).map(place);
  if (waypoints.length > 0) params.set("waypoints", waypoints.join("|"));
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

/** Link "Naviga" a un solo indirizzo. */
export function navigateUrl(destination: string): string {
  return `https://www.google.com/maps/dir/?${new URLSearchParams({ api: "1", destination, travelmode: "driving" }).toString()}`;
}

/**
 * Richieste in zona (docs/CHANGELOG.md §290-§291, scelta dell'utente): i
 * momenti della settimana in cui i clienti dei comuni nel raggio di lavoro
 * chiedono più spesso i lavori del professionista, da confrontare con la sua settimana tipo.
 * Solo conteggi: nessun dato del singolo cliente.
 */
export type DayPart = "morning" | "afternoon" | "evening";

export const DAY_PART_RANGE: Record<DayPart, { start: string; end: string; label: string }> = {
  morning: { start: "08:00", end: "13:00", label: "mattina" },
  afternoon: { start: "14:00", end: "18:00", label: "pomeriggio" },
  evening: { start: "18:00", end: "21:00", label: "sera" },
};

/** Sotto questo numero di richieste in 30 giorni i consigli sono "in arrivo". */
export const ZONE_DEMAND_MIN_REQUESTS = 10;

export type ZoneDemandTip = { weekday: number; part: DayPart; count: number };

export type ZoneDemand =
  | { status: "coming" }
  | {
      status: "ready";
      city: string;
      /** Raggio di lavoro del professionista: le richieste contate sono dei comuni entro questa distanza. */
      radiusKm: number | null;
      categoryLabel: string | null;
      total: number;
      tips: ZoneDemandTip[];
    };

/** Parte del giorno di un orario "HH:MM". */
export function dayPartOf(time: string): DayPart {
  const hour = Number(time.slice(0, 2));
  if (hour < 13) return "morning";
  if (hour < 18) return "afternoon";
  return "evening";
}

/** True se la settimana tipo ha già una fascia in quella parte del giorno. */
export function weekTemplateCovers(template: AgendaWeekTemplate, weekday: number, part: DayPart): boolean {
  const range = DAY_PART_RANGE[part];
  return (template.days[weekday] ?? []).some((slot) => slot.start < range.end && slot.end > range.start);
}

/** Fascia nata dalla settimana tipo per una data precisa. */
export type WeekTemplateDateSlot = WeekTemplateSlot & { dayOfWeek: number; date: string };

/**
 * Settimana tipo applicata a un mese (docs/CHANGELOG.md §288): riempie solo
 * i giorni da `fromDate` in poi, non chiusi e ancora senza orari; i giorni
 * che hanno già orari restano com'erano. `monthDates` in AAAA-MM-GG.
 */
export function weekTemplateMonthFill(
  template: AgendaWeekTemplate,
  monthDates: string[],
  existing: { dayOfWeek: number; date?: string | null }[],
  options: { fromDate: string; closedDates: ReadonlySet<string> },
): { added: WeekTemplateDateSlot[]; filledDays: number; skippedDays: number } {
  const added: WeekTemplateDateSlot[] = [];
  let filledDays = 0;
  let skippedDays = 0;
  for (const date of monthDates) {
    if (date < options.fromDate || options.closedDates.has(date)) continue;
    const dayOfWeek = new Date(`${date}T00:00:00.000Z`).getUTCDay();
    const templateSlots = template.days[dayOfWeek] ?? [];
    if (templateSlots.length === 0) continue;
    if (existing.some((slot) => (slot.date ? slot.date === date : slot.dayOfWeek === dayOfWeek))) {
      skippedDays++;
      continue;
    }
    filledDays++;
    for (const slot of templateSlots) added.push({ ...slot, dayOfWeek, date });
  }
  return { added, filledDays, skippedDays };
}

/**
 * Lavoro su più giorni (decisione dell'utente, docs/CHANGELOG.md §293): la
 * fine cade in un giorno di calendario dopo l'inizio. Gli orari sono ora
 * italiana salvata come UTC (§287); una fine alle 00:00 conta come fine del
 * giorno prima.
 */
export function spansMultipleDays(start: Date | string, end: Date | string | null | undefined): boolean {
  if (!end) return false;
  return multiDayDates(start, end).length > 1;
}

/** I giorni (AAAA-MM-GG) di un lavoro, dal primo all'ultimo; uno solo se non ha una fine in un altro giorno. */
export function multiDayDates(start: Date | string, end: Date | string | null | undefined): string[] {
  const startMs = new Date(start).getTime();
  const first = new Date(startMs).toISOString().slice(0, 10);
  if (!end) return [first];
  const endMs = new Date(end).getTime();
  if (!(endMs > startMs)) return [first];
  const last = new Date(endMs - 1).toISOString().slice(0, 10);
  const dates: string[] = [];
  for (let day = new Date(`${first}T00:00:00.000Z`); day.toISOString().slice(0, 10) <= last; day.setUTCDate(day.getUTCDate() + 1)) {
    dates.push(day.toISOString().slice(0, 10));
  }
  return dates;
}

/** Al massimo tanti giorni per un lavoro su più giorni. */
export const MAX_JOB_DAYS = 30;

/**
 * Le giornate di un lavoro, una per giorno con lo stesso orario (decisione
 * dell'utente, §293: "comparirà il lavoro per *numero* giorni e nell'orario
 * inserito"). Un lavoro di un solo giorno ha una sola giornata, uguale a sé.
 */
export function jobOccurrences(start: Date | string, end: Date | string | null | undefined): { date: string; start: Date; end: Date | null }[] {
  const startDate = new Date(start);
  const endDate = end ? new Date(end) : null;
  const dates = multiDayDates(startDate, endDate);
  if (dates.length === 1) return [{ date: dates[0]!, start: startDate, end: endDate }];
  const startTime = startDate.toISOString().slice(11, 23);
  // Fine alle 00:00: la giornata finisce a mezzanotte del giorno stesso.
  const endTime = endDate!.toISOString().slice(11, 23);
  return dates.map((date) => {
    const dayStart = new Date(`${date}T${startTime}Z`);
    let dayEnd = new Date(`${date}T${endTime}Z`);
    if (dayEnd <= dayStart) dayEnd = new Date(dayEnd.getTime() + 86_400_000);
    return { date, start: dayStart, end: dayEnd };
  });
}

/** La giornata di un lavoro in quella data (AAAA-MM-GG), se il lavoro la tocca. */
export function jobOccurrenceOn(start: Date | string, end: Date | string | null | undefined, date: string): { start: Date; end: Date | null } | null {
  return jobOccurrences(start, end).find((occurrence) => occurrence.date === date) ?? null;
}
