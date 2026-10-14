import { describe, expect, it } from "vitest";
import { calendarIcs, googleCalendarUrl } from "./email-calendar";

/** "Aggiungi al calendario" nei promemoria (docs/CHANGELOG.md §235). */
const event = {
  uid: "booking-1@professionisti",
  title: "Idraulico con Luigi Rossi",
  start: new Date("2026-10-15T09:00:00.000Z"),
  end: new Date("2026-10-15T11:00:00.000Z"),
  location: "Via Roma 10, 00100 Roma (RM)",
  description: "Perdita; sotto il lavandino\nurgente",
};

describe("calendario dei promemoria", () => {
  it("il file .ics tiene l'ora di parete in ora italiana", () => {
    const ics = calendarIcs(event);
    expect(ics).toContain("DTSTART;TZID=Europe/Rome:20261015T090000");
    expect(ics).toContain("DTEND;TZID=Europe/Rome:20261015T110000");
    expect(ics).toContain("UID:booking-1@professionisti");
    expect(ics).toContain("LOCATION:Via Roma 10\\, 00100 Roma (RM)");
    expect(ics).toContain("DESCRIPTION:Perdita\; sotto il lavandino\\nurgente");
    expect(ics.split("\r\n").every((line) => Buffer.byteLength(line) <= 75)).toBe(true);
  });

  it("senza fine l'evento dura un'ora", () => {
    expect(calendarIcs({ ...event, end: null })).toContain("DTEND;TZID=Europe/Rome:20261015T100000");
  });

  it("spezza le righe lunghe", () => {
    const ics = calendarIcs({ ...event, description: "è".repeat(200) });
    expect(ics.split("\r\n").every((line) => Buffer.byteLength(line) <= 75)).toBe(true);
    expect(ics).toContain("\r\n è");
  });

  it("link a Google Calendar con le stesse ore", () => {
    const url = new URL(googleCalendarUrl(event));
    expect(url.hostname).toBe("calendar.google.com");
    expect(url.searchParams.get("dates")).toBe("20261015T090000/20261015T110000");
    expect(url.searchParams.get("ctz")).toBe("Europe/Rome");
    expect(url.searchParams.get("location")).toBe(event.location);
  });
});
