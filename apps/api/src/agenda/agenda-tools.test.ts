import { describe, expect, it } from "vitest";
import { agendaWeekTemplateSchema, dayRouteMapsUrl, DEFAULT_WEEK_TEMPLATE, starterWeekTemplate, weekTemplateCovers } from "@professionisti/shared";
import { comuniWithinRadius, firstHomeCity, zoneDemandTips } from "./agenda.service";
import { dayForecasts, weatherAlertKind, weatherAlerts, weatherCondition } from "./weather.service";
import { comuneInAddress, estimateLeg, legTiming } from "./day-route.service";
import { calendarFeedIcs } from "../email/email-calendar";

describe("icona meteo", () => {
  it("riconosce temporale, neve, pioggia probabile, vento forte e nebbia", () => {
    expect(weatherAlertKind(95, 10, 5)).toBe("storm");
    expect(weatherAlertKind(73, 0, 5)).toBe("snow");
    expect(weatherAlertKind(63, 80, 5)).toBe("rain");
    expect(weatherAlertKind(63, 30, 5)).toBeNull();
    expect(weatherAlertKind(1, 0, 70)).toBe("wind");
    expect(weatherAlertKind(45, 0, 10)).toBe("fog");
    expect(weatherAlertKind(0, 0, 10)).toBeNull();
  });
  it("tiene solo i giorni con un fenomeno", () => {
    expect(
      weatherAlerts({ daily: { time: ["2026-10-22", "2026-10-23"], weather_code: [0, 95], precipitation_probability_max: [0, 90], wind_gusts_10m_max: [10, 40] } }),
    ).toEqual([{ date: "2026-10-23", kind: "storm" }]);
    expect(weatherAlerts({})).toEqual([]);
  });
});

describe("meteo e lavori dei prossimi giorni in Oggi", () => {
  it("dà sempre un tempo: prima i fenomeni dell'agenda, poi il cielo", () => {
    expect(weatherCondition(0, 0, 10)).toBe("clear");
    expect(weatherCondition(2, 0, 10)).toBe("partly");
    expect(weatherCondition(3, 0, 10)).toBe("cloudy");
    // Pioggia poco probabile: nuvoloso, come l'agenda che non mette l'icona.
    expect(weatherCondition(61, 20, 10)).toBe("cloudy");
    expect(weatherCondition(61, 80, 10)).toBe("rain");
    expect(weatherCondition(0, 0, 75)).toBe("wind");
  });
  it("arrotonda le temperature e tollera i dati mancanti", () => {
    expect(
      dayForecasts({ daily: { time: ["2026-10-24", "2026-10-25"], weather_code: [0, null], temperature_2m_max: [21.6, null], temperature_2m_min: [12.4, 9] } }),
    ).toEqual([
      { date: "2026-10-24", condition: "clear", tempMax: 22, tempMin: 12 },
      { date: "2026-10-25", condition: "cloudy", tempMax: null, tempMin: 9 },
    ]);
    expect(dayForecasts({})).toEqual([]);
  });
  it("prende il meteo dal comune del primo lavoro a domicilio", () => {
    const at = (time: string) => new Date(`2026-10-24T${time}:00.000Z`);
    expect(
      firstHomeCity([
        { start: at("14:00"), online: false, city: "Sezze" },
        { start: at("08:00"), online: true, city: "Roma" },
        { start: at("09:00"), online: false, city: " " },
        { start: at("10:00"), online: false, city: "Latina" },
      ]),
    ).toBe("Latina");
    expect(firstHomeCity([{ start: at("08:00"), online: true, city: "Roma" }])).toBeNull();
  });
});

describe("giro intelligente", () => {
  const latina = { latitude: 41.4676, longitude: 12.9037 };
  const sabaudia = { latitude: 41.3006, longitude: 13.0271 };
  it("stima strada e tempo dalla distanza", () => {
    const leg = estimateLeg(latina, sabaudia);
    expect(leg.km).toBeGreaterThan(25);
    expect(leg.km).toBeLessThan(32);
    expect(leg.minutes % 5).toBe(0);
    expect(leg.minutes).toBeGreaterThanOrEqual(40);
  });
  it("avvisa quando tra due lavori non c'è tempo per arrivare", () => {
    const previous = { start: "2026-10-22T11:00:00.000Z", end: "2026-10-22T13:00:00.000Z" };
    expect(legTiming(previous, { start: "2026-10-22T13:15:00.000Z" }, 25)).toEqual({ gapMinutes: 15, tight: true });
    expect(legTiming(previous, { start: "2026-10-22T14:00:00.000Z" }, 25)).toEqual({ gapMinutes: 60, tight: false });
    // Senza orario di fine si conta un'ora.
    expect(legTiming({ start: previous.start, end: null }, { start: "2026-10-22T12:30:00.000Z" }, 20)).toEqual({ gapMinutes: 30, tight: false });
  });
  it("apre il giro in Google Maps con le tappe in ordine", () => {
    const url = dayRouteMapsUrl([
      { ...latina, address: "Via Roma 10, 04100 Latina" },
      { ...sabaudia, address: null },
    ]);
    expect(url).toContain("waypoints=Via+Roma+10%2C+04100+Latina");
    expect(url).toContain("destination=41.3006%2C13.0271");
  });
});

describe("settimana tipo", () => {
  it("quella proposta è valida e le sovrapposizioni no", () => {
    expect(agendaWeekTemplateSchema.safeParse(DEFAULT_WEEK_TEMPLATE).success).toBe(true);
    const overlapping = {
      days: [[], [{ start: "08:00", end: "13:00", allowsHome: true, allowsOnline: false, homeMax: 1, onlineMax: null }, { start: "12:00", end: "14:00", allowsHome: true, allowsOnline: false, homeMax: 1, onlineMax: null }], [], [], [], [], []],
    };
    expect(agendaWeekTemplateSchema.safeParse(overlapping).success).toBe(false);
  });

  it("orari di partenza: dal lunedì al sabato 8–13 e 14–20, 5 a domicilio e 5 online (§356)", () => {
    const online = starterWeekTemplate(true);
    expect(agendaWeekTemplateSchema.safeParse(online).success).toBe(true);
    expect(online.days[0]).toEqual([]);
    for (const day of [1, 2, 3, 4, 5, 6]) {
      expect(online.days[day]!.map((s) => `${s.start}-${s.end}`)).toEqual(["08:00-13:00", "14:00-20:00"]);
      expect(online.days[day]!.every((s) => s.homeMax === 5 && s.onlineMax === 5 && s.allowsHome && s.allowsOnline)).toBe(true);
    }
    const homeOnly = starterWeekTemplate(false);
    expect(agendaWeekTemplateSchema.safeParse(homeOnly).success).toBe(true);
    expect(homeOnly.days.flat().every((s) => !s.allowsOnline && s.onlineMax === null && s.homeMax === 5)).toBe(true);
  });
});

describe("calendario collegato", () => {
  it("mette tutti gli appuntamenti in un solo file, in ora italiana", () => {
    const ics = calendarFeedIcs("Professionisti", [
      { uid: "a", title: "Idraulico · Luca Neri", start: new Date("2026-10-22T11:00:00.000Z"), end: new Date("2026-10-22T13:00:00.000Z"), location: "Via Roma 10" },
      { uid: "b", title: "Giulia", start: new Date("2026-10-23T08:00:00.000Z") },
    ]);
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(2);
    expect(ics).toContain("DTSTART;TZID=Europe/Rome:20261022T110000");
    expect(ics).toContain("X-WR-CALNAME:Professionisti");
    expect(ics).not.toContain("METHOD:CANCEL");
  });
});

describe("comuneInAddress", () => {
  it("trova il comune nell'indirizzo scritto in un solo campo", () => {
    expect(comuneInAddress("Via Isonzo 40, Latina")).toBe("Latina");
    expect(comuneInAddress("Via Roma 1, 04011 Aprilia (LT)")).toBe("Aprilia");
    expect(comuneInAddress("Via senza città")).toBeNull();
    expect(comuneInAddress(null)).toBeNull();
  });
});

describe("zoneDemandTips", () => {
  const at = (date: string, slot: string | null) => ({ preferredDate: new Date(`${date}T00:00:00.000Z`), preferredTimeSlot: slot });
  it("trova i momenti più richiesti, con almeno 3 richieste", () => {
    const saturdayMorning = Array.from({ length: 4 }, () => at("2026-10-24", "09:00-12:00"));
    const mondayEvening = Array.from({ length: 3 }, () => at("2026-10-26", "18:30-20:00"));
    const fewTuesday = [at("2026-10-27", "15:00-16:00"), at("2026-10-27", "15:00-16:00")];
    const noDate = [{ preferredDate: null, preferredTimeSlot: null }];
    expect(zoneDemandTips([...mondayEvening, ...saturdayMorning, ...fewTuesday, ...noDate])).toEqual([
      { weekday: 6, part: "morning", count: 4 },
      { weekday: 1, part: "evening", count: 3 },
    ]);
  });
  it("nessun consiglio senza date preferite", () => {
    expect(zoneDemandTips([{ preferredDate: null, preferredTimeSlot: null }])).toEqual([]);
  });
});

describe("weekTemplateCovers", () => {
  it("riconosce la parte del giorno già coperta", () => {
    expect(weekTemplateCovers(DEFAULT_WEEK_TEMPLATE, 1, "morning")).toBe(true);
    expect(weekTemplateCovers(DEFAULT_WEEK_TEMPLATE, 0, "morning")).toBe(false);
    expect(weekTemplateCovers(DEFAULT_WEEK_TEMPLATE, 1, "evening")).toBe(true);
    expect(weekTemplateCovers({ days: DEFAULT_WEEK_TEMPLATE.days.map((d) => d.slice(0, 1)) }, 1, "evening")).toBe(false);
  });
});

describe("comuniWithinRadius", () => {
  it("prende i comuni nel raggio di lavoro", () => {
    const near = comuniWithinRadius(41.4677, 12.9036, 15);
    expect(near).toContain("Latina");
    expect(near).toContain("Sermoneta");
    expect(near).not.toContain("Roma");
  });
});
