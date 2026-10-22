import { describe, expect, it } from "vitest";
import { agendaWeekTemplateSchema, dayRouteMapsUrl, DEFAULT_WEEK_TEMPLATE } from "@professionisti/shared";
import { weatherAlertKind, weatherAlerts } from "./weather.service";
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
