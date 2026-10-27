import { beforeAll, describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  agendaWeekTemplateSchema,
  formatAppointmentTime,
  professionalAvailabilitySchema,
  wallClockNow,
  weekTemplateMonthFill,
  type AvailabilitySlotInput,
} from "@professionisti/shared";
import { calendarFeedIcs, type CalendarEvent } from "../email/email-calendar";
import { countBookingsInSlot, countOverlapping } from "./commitments";

// ical.js è solo ESM: con TypeScript 6 un test CommonJS lo carica con import() dinamico.
let ICAL: typeof import("ical.js", { with: { "resolution-mode": "import" } }).default;
beforeAll(async () => {
  ICAL = (await import("ical.js")).default;
});

/**
 * Prove "a proprietà" dell'agenda (docs/CHANGELOG.md §309): invece di pochi
 * esempi scritti a mano, fast-check genera migliaia di casi a caso e cerca
 * quello che rompe la regola. Ogni regola è confrontata con un controllo
 * indipendente scritto qui, non con lo stesso codice che si vuole provare.
 */

const RUNS = 500;

/** "HH:MM" a passi di 15 minuti, come nell'editor degli orari. */
const quarter = fc.integer({ min: 0, max: 95 }).map((q) => `${String(Math.floor(q / 4)).padStart(2, "0")}:${String((q % 4) * 15).padStart(2, "0")}`);
const range = fc
  .tuple(quarter, quarter)
  .filter(([a, b]) => a !== b)
  .map(([a, b]) => (a < b ? { start: a, end: b } : { start: b, end: a }));

/** Minuti dalla mezzanotte. */
const minutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));

/** Controllo indipendente: due intervalli [inizio, fine) si toccano se hanno almeno un minuto in comune. */
function minutesOverlap(a: { start: string; end: string }, b: { start: string; end: string }): boolean {
  const used = new Set<number>();
  for (let m = minutes(a.start); m < minutes(a.end); m++) used.add(m);
  for (let m = minutes(b.start); m < minutes(b.end); m++) if (used.has(m)) return true;
  return false;
}

/** Alcune date di ottobre 2026 (da sabato 24 a martedì 27, con il cambio d'ora del 25). */
const DATES = ["2026-10-24", "2026-10-25", "2026-10-26", "2026-10-27"];
const weekdayOf = (date: string) => new Date(`${date}T00:00:00.000Z`).getUTCDay();

const slotArb: fc.Arbitrary<AvailabilitySlotInput> = fc
  .tuple(range, fc.option(fc.constantFrom(...DATES), { nil: undefined }), fc.integer({ min: 0, max: 6 }))
  .map(([r, date, weekday]) => ({
    dayOfWeek: date ? weekdayOf(date) : weekday,
    startTime: r.start,
    endTime: r.end,
    allowsHome: true,
    allowsOnline: false,
    homeMaxBookings: 1,
    date,
  }));

/** Date di calendario in cui una fascia vale: la sua data, o tutte quelle del suo giorno della settimana. */
function occurrences(slot: AvailabilitySlotInput): string[] {
  return slot.date ? [slot.date] : DATES.filter((date) => weekdayOf(date) === slot.dayOfWeek).concat(`weekday-${slot.dayOfWeek}`);
}

describe("fasce orarie generate a caso", () => {
  it("il controllo degli orari rifiuta tutte e sole le fasce che si sovrappongono nello stesso giorno", () => {
    fc.assert(
      fc.property(fc.array(slotArb, { maxLength: 8 }), (slots) => {
        let expectedOverlap = false;
        for (let i = 0; i < slots.length && !expectedOverlap; i++) {
          for (let j = i + 1; j < slots.length && !expectedOverlap; j++) {
            const a = slots[i]!;
            const b = slots[j]!;
            const shareDay = occurrences(a).some((day) => occurrences(b).includes(day));
            if (shareDay && minutesOverlap({ start: a.startTime, end: a.endTime }, { start: b.startTime, end: b.endTime })) expectedOverlap = true;
          }
        }
        expect(professionalAvailabilitySchema.safeParse({ slots }).success).toBe(!expectedOverlap);
      }),
      { numRuns: RUNS },
    );
  });

  const templateSlot = range.map((r) => ({ ...r, allowsHome: true, allowsOnline: false, homeMax: 1, onlineMax: null }));
  const templateArb = fc.array(fc.array(templateSlot, { maxLength: 4 }), { minLength: 7, maxLength: 7 }).map((days) => ({ days }));

  it("la settimana tipo rifiuta tutte e sole le fasce sovrapposte nello stesso giorno", () => {
    fc.assert(
      fc.property(templateArb, (template) => {
        const expectedOverlap = template.days.some((day) => day.some((a, i) => day.some((b, j) => i < j && minutesOverlap(a, b))));
        expect(agendaWeekTemplateSchema.safeParse(template).success).toBe(!expectedOverlap);
      }),
      { numRuns: RUNS },
    );
  });

  it("applicare la settimana tipo a un mese non crea mai fasce sovrapposte né tocca i giorni chiusi o passati", () => {
    const novemberDates = Array.from({ length: 30 }, (_, i) => `2026-11-${String(i + 1).padStart(2, "0")}`);
    const existingArb = fc
      .array(
        fc.tuple(range, fc.constantFrom(...novemberDates)).map(([r, date]) => ({
          dayOfWeek: weekdayOf(date),
          startTime: r.start,
          endTime: r.end,
          allowsHome: true,
          allowsOnline: false,
          homeMaxBookings: 1,
          date,
        })),
        { maxLength: 10 },
      )
      .filter((slots) => professionalAvailabilitySchema.safeParse({ slots }).success);
    fc.assert(
      fc.property(
        templateArb.filter((t) => agendaWeekTemplateSchema.safeParse(t).success),
        existingArb,
        fc.constantFrom(...novemberDates),
        fc.uniqueArray(fc.constantFrom(...novemberDates), { maxLength: 5 }),
        (template, existing, fromDate, closed) => {
          const fill = weekTemplateMonthFill(template, novemberDates, existing, { fromDate, closedDates: new Set(closed) });
          const added: AvailabilitySlotInput[] = fill.added.map((s) => ({
            dayOfWeek: s.dayOfWeek,
            startTime: s.start,
            endTime: s.end,
            allowsHome: s.allowsHome,
            allowsOnline: s.allowsOnline,
            homeMaxBookings: s.homeMax ?? undefined,
            date: s.date,
          }));
          expect(professionalAvailabilitySchema.safeParse({ slots: [...existing, ...added] }).success).toBe(true);
          for (const slot of fill.added) {
            expect(slot.date >= fromDate).toBe(true);
            expect(closed.includes(slot.date)).toBe(false);
            expect(existing.some((e) => e.date === slot.date)).toBe(false);
          }
        },
      ),
      { numRuns: RUNS },
    );
    // Il test più lento del file (circa 2 secondi): con la macchina carica
    // superava i 5 secondi predefiniti (docs/CHANGELOG.md §375).
  }, 30_000);

  it("un impegno occupa tutte e sole le fasce con cui ha almeno un minuto in comune; un lavoro su più giorni non ne occupa nessuna", () => {
    const base = Date.parse("2026-10-24T00:00:00.000Z") / 60000;
    const minuteOf = (date: string, time: string) => Date.parse(`${date}T${time}:00.000Z`) / 60000;
    fc.assert(
      fc.property(
        range,
        fc.constantFrom(...DATES),
        fc.constantFrom(...DATES),
        quarter,
        // Durata a passi di 15 minuti fino a 3 giorni; 0 = senza orario di fine.
        fc.integer({ min: 0, max: 288 }),
        fc.constantFrom<"HOME" | "ONLINE" | "EXTERNAL">("HOME", "ONLINE", "EXTERNAL"),
        fc.constantFrom<"HOME" | "ONLINE">("HOME", "ONLINE"),
        (slot, slotDate, bookingDate, bookingTime, quarters, kind, mode) => {
          const scheduledAt = new Date(`${bookingDate}T${bookingTime}:00.000Z`);
          const scheduledEndAt = quarters === 0 ? null : new Date(scheduledAt.getTime() + quarters * 15 * 60000);
          const commitment = kind === "EXTERNAL" ? { scheduledAt, scheduledEndAt, external: true } : { scheduledAt, scheduledEndAt, serviceMode: kind };
          // Minuti occupati dall'impegno: tutti quelli tra inizio e fine, o solo il primo se non ha una fine.
          const start = scheduledAt.getTime() / 60000 - base;
          const used = new Set<number>();
          for (let m = start; m < start + Math.max(quarters * 15, 1); m++) used.add(m);
          let touches = false;
          for (let m = minuteOf(slotDate, slot.start) - base; m < minuteOf(slotDate, slot.end) - base; m++) if (used.has(m)) touches = true;
          const sameMode = kind === "EXTERNAL" || kind === mode;
          // Su più giorni: primo e ultimo minuto in due giorni di calendario diversi.
          const multiDay = quarters > 0 && Math.floor(start / 1440) !== Math.floor((start + quarters * 15 - 1) / 1440);
          expect(countBookingsInSlot([commitment], slotDate, slot.start, slot.end, mode)).toBe(touches && sameMode && !multiDay ? 1 : 0);
          expect(countBookingsInSlot([commitment], slotDate, slot.start, slot.end)).toBe(touches && !multiDay ? 1 : 0);
        },
      ),
      { numRuns: RUNS * 4 },
    );
  });

  it("un nuovo lavoro si sovrappone a uno già preso solo se hanno almeno un minuto in comune e nessuno dei due dura più giorni", () => {
    const job = fc.tuple(fc.integer({ min: 0, max: 4 * 96 }), fc.integer({ min: 0, max: 192 })).map(([q, len]) => ({
      start: new Date(Date.parse("2026-10-24T00:00:00.000Z") + q * 15 * 60000),
      quarters: len,
    }));
    fc.assert(
      fc.property(job, job, (a, b) => {
        const minutesOf = (j: { start: Date; quarters: number }) => {
          const first = j.start.getTime() / 60000;
          return Array.from({ length: Math.max(j.quarters * 15, 1) }, (_, i) => first + i);
        };
        const usedA = new Set(minutesOf(a));
        const multiDay = (j: { start: Date; quarters: number }) => {
          const days = new Set(minutesOf(j).map((m) => Math.floor(m / 1440)));
          return days.size > 1;
        };
        const touches = minutesOf(b).some((m) => usedA.has(m)) && !multiDay(a) && !multiDay(b);
        const end = (j: { start: Date; quarters: number }) => (j.quarters === 0 ? null : new Date(j.start.getTime() + j.quarters * 15 * 60000));
        expect(countOverlapping([{ scheduledAt: a.start, scheduledEndAt: end(a), serviceMode: "HOME" }], b.start, end(b), "HOME")).toBe(touches ? 1 : 0);
      }),
      { numRuns: RUNS * 4 },
    );
  });
});

/** Controllo indipendente dell'ora italiana: regola europea (ultima domenica di marzo e di ottobre, alle 01:00 UTC). */
function romeOffsetHours(instant: Date): number {
  const year = instant.getUTCFullYear();
  const lastSunday = (month: number) => {
    const last = new Date(Date.UTC(year, month + 1, 0));
    return Date.UTC(year, month, last.getUTCDate() - last.getUTCDay(), 1);
  };
  const t = instant.getTime();
  return t >= lastSunday(2) && t < lastSunday(9) ? 2 : 1;
}

const instantArb = fc.date({ min: new Date("2026-01-01T00:00:00Z"), max: new Date("2030-12-31T23:59:59Z"), noInvalidDate: true });

describe("ora degli appuntamenti", () => {
  it("l'ora italiana di adesso è giusta in ogni momento, anche nelle notti del cambio d'ora", () => {
    const changeNights = fc.constantFrom("2026-03-29T00:30:00Z", "2026-03-29T01:30:00Z", "2026-10-25T00:30:00Z", "2026-10-25T01:30:00Z", "2027-10-31T00:59:00Z", "2027-10-31T01:00:00Z").map((iso) => new Date(iso));
    fc.assert(
      fc.property(fc.oneof(instantArb, changeNights), (now) => {
        const expected = new Date(now.getTime() + romeOffsetHours(now) * 3_600_000);
        expected.setUTCMilliseconds(0);
        expect(wallClockNow(now).toISOString()).toBe(expected.toISOString());
      }),
      { numRuns: RUNS * 4 },
    );
  });

  it("l'orario mostrato non cambia con il fuso del dispositivo", () => {
    const zones = ["Europe/Rome", "America/New_York", "Asia/Tokyo", "Pacific/Kiritimati", "America/Los_Angeles", "UTC"];
    const original = process.env.TZ;
    try {
      fc.assert(
        fc.property(instantArb, fc.constantFrom(...zones), (instant, zone) => {
          process.env.TZ = zone;
          expect(formatAppointmentTime(instant)).toBe(instant.toISOString().slice(11, 16));
        }),
        { numRuns: RUNS },
      );
    } finally {
      process.env.TZ = original;
    }
  });
});

describe("link del calendario (iCalendar, RFC 5545)", () => {
  const textArb = fc.string({ unit: "grapheme", maxLength: 120 });
  const eventArb: fc.Arbitrary<CalendarEvent> = fc
    .tuple(fc.uuid(), textArb, instantArb, fc.integer({ min: 15, max: 600 }), fc.option(textArb, { nil: null }), fc.option(textArb, { nil: null }))
    .map(([id, title, start, durationMin, location, description]) => {
      start.setUTCSeconds(0, 0);
      // Entro la mezzanotte: i lavori su più giorni hanno la loro prova sotto.
      const toMidnight = 24 * 60 - (start.getUTCHours() * 60 + start.getUTCMinutes());
      const end = new Date(start.getTime() + Math.min(durationMin, toMidnight) * 60_000);
      return { uid: `booking-${id}@agenda`, title: title || "Cliente", start, end, location, description };
    });

  it("il file si legge con un lettore iCalendar indipendente e ogni appuntamento cade all'ora italiana giusta", () => {
    fc.assert(
      fc.property(fc.uniqueArray(eventArb, { maxLength: 6, selector: (e) => e.uid }), (events) => {
        const ics = calendarFeedIcs("Agenda", events);
        // Righe: fine riga CRLF, nessuna oltre 75 byte.
        expect(ics.endsWith("\r\n")).toBe(true);
        for (const line of ics.split("\r\n")) expect(Buffer.byteLength(line)).toBeLessThanOrEqual(75);

        const calendar = new ICAL.Component(ICAL.parse(ics));
        const vtimezone = calendar.getFirstSubcomponent("vtimezone");
        expect(vtimezone).not.toBeNull();
        const timezone = new ICAL.Timezone(vtimezone!);
        const vevents = calendar.getAllSubcomponents("vevent");
        expect(vevents).toHaveLength(events.length);

        vevents.forEach((vevent, index) => {
          const source = events[index]!;
          const event = new ICAL.Event(vevent);
          expect(event.uid).toBe(source.uid);
          expect(vevent.getFirstPropertyValue("dtstamp")).toBeTruthy();
          expect(event.summary).toBe(source.title);
          if (source.location?.trim()) expect(event.location).toBe(source.location.trim());
          // L'ora di parete italiana (09:00 salvata come 09:00Z) deve diventare l'istante vero di Roma.
          const start = event.startDate;
          start.zone = timezone;
          const expectedInstant = source.start.getTime() - romeOffsetHours(new Date(source.start.getTime() - 2 * 3_600_000)) * 3_600_000;
          // Nell'ora che si ripete (25/10 tra le 02:00 e le 03:00) sono giuste entrambe le letture.
          const actual = start.toJSDate().getTime();
          const ambiguous = Math.abs(actual - expectedInstant) === 3_600_000 && source.start.getUTCHours() === 2;
          const skipped = source.start.getUTCHours() === 2 && source.start.getUTCMonth() === 2;
          if (!ambiguous && !skipped) expect(actual).toBe(expectedInstant);
        });
      }),
      { numRuns: 200 },
    );
  });

  it("un lavoro su più giorni compare una volta al giorno, ogni giorno alla stessa ora italiana (§310)", () => {
    const multiDayArb = fc
      .tuple(fc.integer({ min: 0, max: 4 * 365 }), fc.integer({ min: 0, max: 22 * 4 }), fc.integer({ min: 1, max: 8 * 4 }), fc.integer({ min: 2, max: 10 }))
      .map(([day, startQ, lengthQ, days]) => {
        const start = new Date(Date.UTC(2026, 0, 1) + day * 86_400_000 + startQ * 15 * 60_000);
        const firstEnd = new Date(Math.min(start.getTime() + lengthQ * 15 * 60_000, Date.UTC(2026, 0, 1) + (day + 1) * 86_400_000));
        return { start, end: new Date(firstEnd.getTime() + (days - 1) * 86_400_000), firstEnd, days };
      })
      // Gli orari che non esistono o si ripetono nelle notti del cambio d'ora sono provati sopra.
      .filter(({ start }) => start.getUTCHours() !== 2);
    fc.assert(
      fc.property(multiDayArb, ({ start, end, firstEnd, days }) => {
        const ics = calendarFeedIcs("Agenda", [{ uid: "booking-x@agenda", title: "Trasloco", start, end }]);
        const calendar = new ICAL.Component(ICAL.parse(ics));
        const timezone = new ICAL.Timezone(calendar.getFirstSubcomponent("vtimezone")!);
        const event = new ICAL.Event(calendar.getFirstSubcomponent("vevent")!);
        const iterator = event.iterator();
        const starts: number[] = [];
        for (let next = iterator.next(); next && starts.length < 50; next = iterator.next()) {
          next.zone = timezone;
          starts.push(next.toJSDate().getTime());
        }
        expect(starts).toHaveLength(days);
        starts.forEach((actual, i) => {
          const wall = new Date(start.getTime() + i * 86_400_000);
          expect(actual).toBe(wall.getTime() - romeOffsetHours(new Date(wall.getTime() - 2 * 3_600_000)) * 3_600_000);
        });
        // Il primo giorno finisce all'ora di parete giusta (gli altri ripetono lo stesso orario).
        const endWall = event.endDate;
        expect([endWall.year, endWall.month, endWall.day, endWall.hour, endWall.minute]).toEqual([
          firstEnd.getUTCFullYear(),
          firstEnd.getUTCMonth() + 1,
          firstEnd.getUTCDate(),
          firstEnd.getUTCHours(),
          firstEnd.getUTCMinutes(),
        ]);
      }),
      { numRuns: 300 },
    );
  });
});
