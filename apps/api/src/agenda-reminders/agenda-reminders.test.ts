import { describe, expect, it } from "vitest";
import { agendaAttention } from "@professionisti/shared";
import { agendaReminderDue } from "./agenda-reminders.service";

const now = new Date("2026-10-21T09:00:00Z");
const daysAgo = (days: number) => new Date(now.getTime() - days * 24 * 60 * 60_000);

describe("agendaAttention", () => {
  it("vuota senza fasce o con sole fasce passate", () => {
    expect(agendaAttention([], now)).toBe("EMPTY");
    expect(agendaAttention([{ date: "2026-10-20" }], now)).toBe("EMPTY");
  });
  it("in esaurimento con fasce solo oltre 7 giorni", () => {
    expect(agendaAttention([{ date: "2026-10-28" }], now)).toBe("RUNNING_LOW");
  });
  it("a posto con una fascia nei prossimi 7 giorni o ricorrente", () => {
    expect(agendaAttention([{ date: "2026-10-21" }], now)).toBeNull();
    expect(agendaAttention([{ date: "2026-10-27" }], now)).toBeNull();
    expect(agendaAttention([{ date: null }], now)).toBeNull();
  });
});

describe("agendaReminderDue", () => {
  it("agenda vuota: dopo 3 giorni, poi dopo una settimana, al massimo due volte", () => {
    expect(agendaReminderDue({ attention: "EMPTY", profileCreatedAt: daysAgo(2), sent: [], now })).toBe(false);
    expect(agendaReminderDue({ attention: "EMPTY", profileCreatedAt: daysAgo(3), sent: [], now })).toBe(true);
    const one = [{ attention: "EMPTY", createdAt: daysAgo(6) }];
    expect(agendaReminderDue({ attention: "EMPTY", profileCreatedAt: daysAgo(10), sent: one, now })).toBe(false);
    expect(agendaReminderDue({ attention: "EMPTY", profileCreatedAt: daysAgo(10), sent: [{ attention: "EMPTY", createdAt: daysAgo(7) }], now })).toBe(true);
    const two = [
      { attention: "EMPTY", createdAt: daysAgo(10) },
      { attention: "EMPTY", createdAt: daysAgo(20) },
    ];
    expect(agendaReminderDue({ attention: "EMPTY", profileCreatedAt: daysAgo(30), sent: two, now })).toBe(false);
  });
  it("in esaurimento: al massimo uno ogni 14 giorni", () => {
    expect(agendaReminderDue({ attention: "RUNNING_LOW", profileCreatedAt: daysAgo(30), sent: [], now })).toBe(true);
    expect(agendaReminderDue({ attention: "RUNNING_LOW", profileCreatedAt: daysAgo(30), sent: [{ attention: "RUNNING_LOW", createdAt: daysAgo(13) }], now })).toBe(false);
    expect(agendaReminderDue({ attention: "RUNNING_LOW", profileCreatedAt: daysAgo(30), sent: [{ attention: "EMPTY", createdAt: daysAgo(14) }], now })).toBe(true);
  });
  it("niente se l'agenda va bene", () => {
    expect(agendaReminderDue({ attention: null, profileCreatedAt: daysAgo(30), sent: [], now })).toBe(false);
  });
});
