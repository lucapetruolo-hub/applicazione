import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { agendaToPreviewDays, searchAgendaCompleteUntil, trimSearchAgenda } from "./searchAgenda";

const slot = (homeAvailable: boolean, onlineAvailable: boolean) => ({
  time: "09:00",
  endTime: "10:00",
  allowsHome: true,
  allowsOnline: true,
  homeAvailable,
  onlineAvailable,
});

describe("agenda leggera della ricerca", () => {
  it("la prima settimana arriva intera", () => {
    assert.equal(searchAgendaCompleteUntil("2026-11-16"), "2026-11-22");
  });

  it("dopo la prima settimana solo il primo giorno libero a domicilio e quello online", () => {
    const days = [
      { date: "2026-11-16", times: [slot(false, false)] },
      { date: "2026-11-22", times: [slot(false, false)] },
      { date: "2026-11-23", times: [slot(false, false)] },
      { date: "2026-11-25", times: [slot(false, true)] },
      { date: "2026-11-27", times: [slot(true, false)] },
      { date: "2026-11-30", times: [slot(true, true)] },
    ];
    assert.deepEqual(trimSearchAgenda(days, "2026-11-16").map((day) => day.date), ["2026-11-16", "2026-11-22", "2026-11-25", "2026-11-27"]);
  });

  it("lo stesso giorno libero per tutte e due le modalità compare una volta", () => {
    const days = [{ date: "2026-12-01", times: [slot(true, true)] }];
    assert.equal(trimSearchAgenda(days, "2026-11-16").length, 1);
  });

  it("l'agenda del profilo diventa quella della scheda", () => {
    const agenda = {
      days: [
        {
          date: "2026-11-30",
          dayOfWeek: 1,
          slots: [{ startTime: "09:00", endTime: "10:00", home: { maxBookings: 1, bookedCount: 1 }, online: { maxBookings: 2, bookedCount: 1 } }],
        },
        { date: "2026-12-01", dayOfWeek: 2, slots: [] },
      ],
    };
    assert.deepEqual(agendaToPreviewDays(agenda), [
      { date: "2026-11-30", times: [{ time: "09:00", endTime: "10:00", allowsHome: true, allowsOnline: true, homeAvailable: false, onlineAvailable: true }] },
    ]);
  });
});
