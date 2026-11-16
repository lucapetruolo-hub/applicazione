import { describe, expect, it } from "vitest";
import type { RealtimeEvent } from "@professionisti/shared";
import { RealtimeService } from "./realtime.service";

/** Tabella `realtime_events` finta, condivisa tra due copie dell'API. */
function sharedTable() {
  const rows: { id: bigint; userId: string; payload: unknown; origin: string; createdAt: Date }[] = [];
  let next = 1n;
  return {
    rows,
    realtimeEvent: {
      create: async ({ data }: { data: { userId: string; payload: unknown; origin: string } }) => {
        const row = { id: next++, createdAt: new Date(), ...data };
        rows.push(row);
        return row;
      },
      findFirst: async () => (rows.length ? { id: rows[rows.length - 1]!.id } : null),
      findMany: async ({ where }: { where: { id: { gt: bigint } } }) => rows.filter((row) => row.id > where.id.gt),
      deleteMany: async () => ({ count: 0 }),
    },
  };
}

const event = { type: "notification" } as unknown as RealtimeEvent;

describe("Tempo reale con più copie dell'API (docs/changelog/2026-11-16-traffico-elevato.md)", () => {
  it("un evento pubblicato su una copia arriva a chi è collegato all'altra, una volta sola", async () => {
    const table = sharedTable();
    const first = new RealtimeService(table as never);
    const second = new RealtimeService(table as never);
    await second.pollOtherInstances();
    const received: RealtimeEvent[] = [];
    second.stream("u-1").subscribe((e) => received.push(e));
    first.publish("u-1", event);
    await new Promise((resolve) => setTimeout(resolve, 0));
    await second.pollOtherInstances();
    await second.pollOtherInstances();
    expect(received).toEqual([event]);
  });

  it("chi pubblica consegna subito ai suoi collegati e non li ripete dalla tabella", async () => {
    const table = sharedTable();
    const service = new RealtimeService(table as never);
    await service.pollOtherInstances();
    const received: RealtimeEvent[] = [];
    service.stream("u-1").subscribe((e) => received.push(e));
    service.publish("u-1", event);
    await new Promise((resolve) => setTimeout(resolve, 0));
    await service.pollOtherInstances();
    expect(received).toEqual([event]);
  });

  it("al primo giro non riconsegna gli eventi vecchi", async () => {
    const table = sharedTable();
    new RealtimeService(table as never).publish("u-1", event);
    await new Promise((resolve) => setTimeout(resolve, 0));
    const late = new RealtimeService(table as never);
    const received: RealtimeEvent[] = [];
    late.stream("u-1").subscribe((e) => received.push(e));
    await late.pollOtherInstances();
    await late.pollOtherInstances();
    expect(received).toEqual([]);
  });
});
