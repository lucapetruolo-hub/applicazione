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
