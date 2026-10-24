import { expect, test } from "@playwright/test";
import ICAL from "ical.js";
import { BOOKING_CASES } from "../fixtures/cases";
import { e2eData } from "../fixtures/data";
import { API_URL } from "../fixtures/env";

/**
 * Link del calendario (docs/CHANGELOG.md §288 e §297): il file che leggono
 * Google Calendar e iPhone, letto con un lettore iCalendar indipendente
 * (ical.js, lo stesso di Thunderbird). Ogni appuntamento deve cadere
 * all'istante giusto: le 09:00 italiane sono le 07:00 UTC d'estate e le
 * 08:00 UTC d'inverno.
 */
test.describe.configure({ mode: "serial" });

test("il calendario collegato porta gli appuntamenti all'istante giusto, prima e dopo il cambio d'ora", async ({ request }, testInfo) => {
  test.skip(testInfo.project.name !== "telefono-italia", "Il file è lo stesso per tutti i dispositivi: basta leggerlo una volta.");
  const { token, bookings } = e2eData();
  const enabled = await request.post(`${API_URL}/agenda/calendar-feed`, { headers: { Authorization: `Bearer ${token}` } });
  expect(enabled.ok()).toBe(true);
  const { token: feedToken } = (await enabled.json()) as { token: string };

  const response = await request.get(`${API_URL}/calendar/${feedToken}.ics`);
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toContain("text/calendar");
  const ics = await response.text();
  for (const line of ics.split("\r\n")) expect(Buffer.byteLength(line)).toBeLessThanOrEqual(75);

  const calendar = new ICAL.Component(ICAL.parse(ics));
  const timezone = new ICAL.Timezone(calendar.getFirstSubcomponent("vtimezone")!);
  const events = calendar.getAllSubcomponents("vevent").map((v) => new ICAL.Event(v));

  // Istante vero atteso per ogni appuntamento di prova.
  const expectedUtc: Record<string, string> = {
    "2026-10-24 09:00": "2026-10-24T07:00:00.000Z",
    "2026-10-26 09:00": "2026-10-26T08:00:00.000Z",
    "2026-10-26 23:30": "2026-10-26T22:30:00.000Z",
    "2027-03-26 09:00": "2027-03-26T08:00:00.000Z",
    "2027-03-29 09:00": "2027-03-29T07:00:00.000Z",
  };
  for (const item of BOOKING_CASES) {
    const booking = bookings.find((b) => b.wallClock === item.wallClock)!;
    const event = events.find((e) => e.uid === `booking-${booking.id}@agenda`);
    expect(event, item.label).toBeTruthy();
    const start = event!.startDate;
    start.zone = timezone;
    expect(start.toJSDate().toISOString(), item.label).toBe(expectedUtc[item.wallClock]);
  }

  // Spento il link, quello vecchio non funziona più.
  const disabled = await request.delete(`${API_URL}/agenda/calendar-feed`, { headers: { Authorization: `Bearer ${token}` } });
  expect(disabled.ok()).toBe(true);
  expect((await request.get(`${API_URL}/calendar/${feedToken}.ics`)).status()).toBe(404);
});
