import { describe, expect, it } from "vitest";
import { weekTemplateDatesKept, weekTemplateSync, type AgendaWeekTemplate, type WeekTemplateExistingSlot } from "@professionisti/shared";

// Lunedì 2 novembre 2026 → domenica 8 novembre.
const WEEK = ["2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06", "2026-11-07", "2026-11-08"];
const MORNING = { start: "08:00", end: "13:00", allowsHome: true, allowsOnline: false, homeMax: 1, onlineMax: null };
const AFTERNOON = { start: "14:00", end: "18:00", allowsHome: true, allowsOnline: false, homeMax: 1, onlineMax: null };
// Dal lunedì al venerdì mattina e pomeriggio.
const WEEKDAYS: AgendaWeekTemplate = { days: [0, 1, 2, 3, 4, 5, 6].map((d) => (d === 0 || d === 6 ? [] : [MORNING, AFTERNOON])) };
const ONLY_MORNINGS: AgendaWeekTemplate = { days: [0, 1, 2, 3, 4, 5, 6].map((d) => (d === 0 || d === 6 ? [] : [MORNING])) };

let nextId = 0;
function slot(date: string, s: typeof MORNING, fromWeekTemplate: boolean): WeekTemplateExistingSlot {
  return { ...s, id: `s${nextId++}`, date, dayOfWeek: new Date(`${date}T00:00:00.000Z`).getUTCDay(), fromWeekTemplate };
}
const none = new Set<string>();

describe("settimana tipo per tutte le settimane (§323)", () => {
  it("la prima volta riempie i giorni vuoti e lascia quelli con orari messi a mano", () => {
    const manual = slot("2026-11-03", { ...MORNING, start: "09:00" }, false);
    const sync = weekTemplateSync({ template: WEEKDAYS, previous: null, dates: WEEK, filledUntil: null, existing: [manual], closedDates: none, bookedDates: none });
    expect(sync.deleteIds).toEqual([]);
    expect(new Set(sync.added.map((a) => a.date))).toEqual(new Set(["2026-11-02", "2026-11-04", "2026-11-05", "2026-11-06"]));
    expect(sync.added).toHaveLength(8);
    expect(sync.changedDays).toBe(4);
  });

  it("i giorni chiusi e quelli con vecchie fasce ricorrenti restano come sono", () => {
    const recurring: WeekTemplateExistingSlot = { ...MORNING, id: "r", date: null, dayOfWeek: 1, fromWeekTemplate: false };
    const sync = weekTemplateSync({
      template: WEEKDAYS,
      previous: null,
      dates: WEEK,
      filledUntil: null,
      existing: [recurring],
      closedDates: new Set(["2026-11-04"]),
      bookedDates: none,
    });
    expect(sync.added.map((a) => a.date)).not.toContain("2026-11-02");
    expect(sync.added.map((a) => a.date)).not.toContain("2026-11-04");
  });

  it("cambiando la settimana tipo cambiano i giorni suoi, non quelli cambiati a mano o con lavori fissati", () => {
    const existing = [
      slot("2026-11-02", MORNING, true),
      slot("2026-11-02", AFTERNOON, true),
      slot("2026-11-03", MORNING, true),
      slot("2026-11-03", AFTERNOON, true),
      slot("2026-11-04", { ...MORNING, end: "12:00" }, false),
    ];
    const sync = weekTemplateSync({
      template: ONLY_MORNINGS,
      previous: WEEKDAYS,
      dates: WEEK,
      filledUntil: "2026-11-08",
      existing,
      closedDates: none,
      bookedDates: new Set(["2026-11-03"]),
    });
    expect(sync.deleteIds.sort()).toEqual([existing[0]!.id, existing[1]!.id].sort());
    expect(sync.added).toEqual([{ ...MORNING, dayOfWeek: 1, date: "2026-11-02" }]);
  });

  it("un giorno svuotato a mano resta vuoto, un giorno libero che diventa di lavoro si riempie", () => {
    const withSaturday: AgendaWeekTemplate = { days: WEEKDAYS.days.map((d, i) => (i === 6 ? [MORNING] : d)) };
    const sync = weekTemplateSync({
      template: withSaturday,
      previous: WEEKDAYS,
      dates: WEEK,
      filledUntil: "2026-11-08",
      existing: [],
      closedDates: none,
      bookedDates: none,
    });
    expect(sync.added).toEqual([{ ...MORNING, dayOfWeek: 6, date: "2026-11-07" }]);
  });

  it("i giorni nuovi oltre l'ultimo riempito prendono la settimana tipo", () => {
    const sync = weekTemplateSync({ template: ONLY_MORNINGS, previous: ONLY_MORNINGS, dates: WEEK, filledUntil: "2026-11-05", existing: [], closedDates: none, bookedDates: none });
    expect(sync.added.map((a) => a.date)).toEqual(["2026-11-06"]);
  });

  it("salvando Giorno per giorno un giorno resta della settimana tipo solo se non è cambiato", () => {
    const kept = weekTemplateDatesKept(
      [
        { date: "2026-11-02", fromWeekTemplate: true, slot: MORNING },
        { date: "2026-11-03", fromWeekTemplate: true, slot: MORNING },
        { date: "2026-11-04", fromWeekTemplate: false, slot: MORNING },
      ],
      [
        { date: "2026-11-02", slot: MORNING },
        { date: "2026-11-03", slot: { ...MORNING, end: "12:00" } },
        { date: "2026-11-04", slot: MORNING },
      ],
    );
    expect([...kept]).toEqual(["2026-11-02"]);
  });

  describe("giorni cambiati a mano (docs/changelog/2026-11-10-eccezioni-settimana.md)", () => {
    const base = { previous: WEEKDAYS, dates: WEEK, filledUntil: "2026-11-08", closedDates: none };
    const manualTue = () => slot("2026-11-03", { ...MORNING, start: "09:00" }, false);

    it("li elenca e li lascia com'erano, se non si sceglie di cambiarli", () => {
      const manual = manualTue();
      const sync = weekTemplateSync({ ...base, template: ONLY_MORNINGS, existing: [manual], bookedDates: none });
      expect(sync.deleteIds).not.toContain(manual.id);
      expect(sync.manualDays).toEqual([{ date: "2026-11-03", current: [{ start: "09:00", end: "13:00" }], wanted: [{ start: "08:00", end: "13:00" }] }]);
    });

    it("con \"Cambia anche questi\" prendono la settimana nuova", () => {
      const manual = manualTue();
      const sync = weekTemplateSync({ ...base, template: ONLY_MORNINGS, existing: [manual], bookedDates: none, applyToManual: true });
      expect(sync.deleteIds).toEqual([manual.id]);
      expect(sync.added).toContainEqual({ ...MORNING, dayOfWeek: 2, date: "2026-11-03" });
      expect(sync.changedDays).toBe(1);
    });

    it("con i giorni spuntati cambiano solo quelli", () => {
      const tue = manualTue();
      const wed = slot("2026-11-04", { ...MORNING, end: "12:00" }, false);
      const sync = weekTemplateSync({ ...base, template: ONLY_MORNINGS, existing: [tue, wed], bookedDates: none, applyToManual: new Set(["2026-11-04"]) });
      expect(sync.deleteIds).toEqual([wed.id]);
      expect(sync.manualDays.map((d) => d.date)).toEqual(["2026-11-03", "2026-11-04"]);
    });

    it("un giorno della settimana tipo rimasto diverso per un lavoro fissato diventa un'eccezione", () => {
      const booked = slot("2026-11-03", MORNING, true);
      const afternoon = slot("2026-11-03", AFTERNOON, true);
      const sync = weekTemplateSync({ ...base, template: ONLY_MORNINGS, existing: [booked, afternoon], bookedDates: new Set(["2026-11-03"]) });
      expect(sync.deleteIds).toEqual([]);
      expect(sync.demoteIds.sort()).toEqual([booked.id, afternoon.id].sort());
    });

    it("un giorno con lavori fissati non si tocca mai, neanche con \"Cambia anche questi\"", () => {
      const manual = manualTue();
      const sync = weekTemplateSync({ ...base, template: ONLY_MORNINGS, existing: [manual], bookedDates: new Set(["2026-11-03"]), applyToManual: true });
      expect(sync.deleteIds).toEqual([]);
      expect(sync.manualDays).toEqual([]);
      expect(sync.bookedDaysKept).toBe(1);
    });

    it("un'eccezione uguale alla settimana tipo torna sua e perde il bollino", () => {
      const manual = slot("2026-11-03", MORNING, false);
      const sync = weekTemplateSync({ ...base, template: ONLY_MORNINGS, existing: [manual], bookedDates: none });
      expect(sync.adoptIds).toEqual([manual.id]);
      expect(sync.manualDays).toEqual([]);
      expect(sync.deleteIds).toEqual([]);
    });

    it("salvando Giorno per giorno, un giorno rimesso uguale alla settimana tipo torna suo", () => {
      const kept = weekTemplateDatesKept(
        [{ date: "2026-11-03", fromWeekTemplate: false, slot: { ...MORNING, start: "09:00" } }],
        [
          { date: "2026-11-03", slot: MORNING },
          { date: "2026-11-04", slot: { ...MORNING, end: "12:00" } },
        ],
        ONLY_MORNINGS,
      );
      expect([...kept]).toEqual(["2026-11-03"]);
    });
  });
});
