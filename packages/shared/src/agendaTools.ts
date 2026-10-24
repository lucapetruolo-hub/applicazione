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

/**
 * Settimana tipo con il suo stato (docs/CHANGELOG.md §321): `active` dopo il
 * primo "Salva la settimana", da lì vale per tutte le settimane;
 * `changedDays` = giorni aggiornati dall'ultimo salvataggio.
 */
export type AgendaWeekTemplateState = { template: AgendaWeekTemplate; active: boolean; changedDays: number };

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

/** Una fascia già salvata, come la vede la settimana tipo continua. */
export type WeekTemplateExistingSlot = WeekTemplateSlot & {
  id: string;
  dayOfWeek: number;
  /** AAAA-MM-GG, `null` per le vecchie fasce ricorrenti. */
  date: string | null;
  fromWeekTemplate: boolean;
};

function sameSlots(a: WeekTemplateSlot[], b: WeekTemplateSlot[]): boolean {
  const key = (s: WeekTemplateSlot) => `${s.start}|${s.end}|${s.allowsHome}|${s.allowsOnline}|${s.homeMax}|${s.onlineMax}`;
  const ka = a.map(key).sort();
  const kb = b.map(key).sort();
  return ka.length === kb.length && ka.every((k, i) => k === kb[i]);
}

/**
 * Settimana tipo che vale per tutte le settimane (decisione dell'utente,
 * docs/CHANGELOG.md §321). Le fasce restano per data: qui si decide, per
 * ogni giorno da oggi in poi, cosa togliere e cosa aggiungere.
 * - Giorno chiuso, con vecchie fasce ricorrenti o con lavori già fissati: resta com'è.
 * - Giorno con le sole fasce della settimana tipo: prende quelle nuove.
 * - Giorno con orari cambiati a mano: resta com'è.
 * - Giorno vuoto mai riempito (dopo `filledUntil`): prende la settimana tipo.
 * - Giorno vuoto già riempito in passato: si riempie solo se era vuoto per
 *   la settimana tipo di prima (giorno libero), non se è stato svuotato a mano.
 */
export function weekTemplateSync(input: {
  template: AgendaWeekTemplate;
  previous: AgendaWeekTemplate | null;
  dates: string[];
  filledUntil: string | null;
  existing: WeekTemplateExistingSlot[];
  closedDates: ReadonlySet<string>;
  bookedDates: ReadonlySet<string>;
}): { deleteIds: string[]; added: WeekTemplateDateSlot[]; changedDays: number } {
  const { template, previous, filledUntil, existing, closedDates, bookedDates } = input;
  const recurringDays = new Set(existing.filter((s) => s.date === null).map((s) => s.dayOfWeek));
  const byDate = new Map<string, WeekTemplateExistingSlot[]>();
  for (const slot of existing) {
    if (!slot.date) continue;
    byDate.set(slot.date, [...(byDate.get(slot.date) ?? []), slot]);
  }
  const deleteIds: string[] = [];
  const added: WeekTemplateDateSlot[] = [];
  let changedDays = 0;
  for (const date of input.dates) {
    const dayOfWeek = new Date(`${date}T00:00:00.000Z`).getUTCDay();
    if (closedDates.has(date) || recurringDays.has(dayOfWeek)) continue;
    const wanted = template.days[dayOfWeek] ?? [];
    const current = byDate.get(date) ?? [];
    if (current.length > 0) {
      if (bookedDates.has(date) || !current.every((s) => s.fromWeekTemplate) || sameSlots(current, wanted)) continue;
      deleteIds.push(...current.map((s) => s.id));
      for (const slot of wanted) added.push({ ...slot, dayOfWeek, date });
      changedDays++;
      continue;
    }
    if (wanted.length === 0) continue;
    const neverFilled = filledUntil === null || date > filledUntil;
    const wasFreeDay = previous !== null && (previous.days[dayOfWeek] ?? []).length === 0;
    if (!neverFilled && !wasFreeDay) continue;
    for (const slot of wanted) added.push({ ...slot, dayOfWeek, date });
    changedDays++;
  }
  return { deleteIds, added, changedDays };
}

/**
 * Salvataggio di "Giorno per giorno": una fascia resta "della settimana tipo"
 * solo se il suo giorno ha ancora esattamente le fasce della settimana tipo.
 * Restituisce le date (AAAA-MM-GG) che restano della settimana tipo.
 */
export function weekTemplateDatesKept(previous: { date: string | null; fromWeekTemplate: boolean; slot: WeekTemplateSlot }[], incoming: { date: string | null; slot: WeekTemplateSlot }[]): Set<string> {
  const group = <T extends { date: string | null }>(list: T[]) => {
    const map = new Map<string, T[]>();
    for (const item of list) if (item.date) map.set(item.date, [...(map.get(item.date) ?? []), item]);
    return map;
  };
  const before = group(previous);
  const after = group(incoming);
  const kept = new Set<string>();
  for (const [date, slots] of before) {
    if (!slots.every((s) => s.fromWeekTemplate)) continue;
    const next = after.get(date);
    if (next && sameSlots(slots.map((s) => s.slot), next.map((s) => s.slot))) kept.add(date);
  }
  return kept;
}

/**
 * Lavoro su più giorni (decisione dell'utente, docs/CHANGELOG.md §310): la
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
 * dell'utente, §310: "comparirà il lavoro per *numero* giorni e nell'orario
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
