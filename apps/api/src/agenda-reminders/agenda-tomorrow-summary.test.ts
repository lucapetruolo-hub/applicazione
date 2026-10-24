import { describe, expect, it } from "vitest";
import { tomorrowSummaryItems } from "./agenda-tomorrow-summary.service";

describe("tomorrowSummaryItems", () => {
  it("mette in ordine di orario lavori e lavori esterni, con l'ora italiana", () => {
    const items = tomorrowSummaryItems(
      [
        {
          scheduledAt: new Date("2026-10-23T11:00:00.000Z"),
          scheduledEndAt: new Date("2026-10-23T13:00:00.000Z"),
          city: "Latina",
          serviceMode: "HOME",
          recipientName: "Luca",
          recipientSurname: "Neri",
          client: { name: "Mario", surname: "Rossi" },
        },
        {
          scheduledAt: new Date("2026-10-23T15:00:00.000Z"),
          scheduledEndAt: null,
          city: null,
          serviceMode: "ONLINE",
          recipientName: null,
          recipientSurname: null,
          client: { name: "Anna", surname: null },
        },
      ],
      [{ scheduledAt: new Date("2026-10-23T08:00:00.000Z"), scheduledEndAt: new Date("2026-10-23T09:30:00.000Z"), clientName: "Giulia", address: "Via Roma 10" }],
    );
    expect(items).toEqual([
      { time: "08:00–09:30", name: "Giulia", place: "Via Roma 10" },
      { time: "11:00–13:00", name: "Luca Neri", place: "Latina" },
      { time: "15:00", name: "Anna", place: "online" },
    ]);
  });
});
