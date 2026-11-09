import { describe, expect, it } from "vitest";
import { buildClientBook, type ClientBookBooking, type ClientBookExternalJob } from "./client-book";

/** Rubrica "I miei clienti" (docs/changelog/2026-11-08-rubrica-clienti.md). */
const NOW = new Date("2026-11-08T12:00:00Z");
const booking = (over: Partial<ClientBookBooking> = {}): ClientBookBooking => ({
  id: "b-1",
  clientId: "c-1",
  status: "COMPLETED",
  scheduledAt: new Date("2026-10-01T09:00:00Z"),
  finalAmountEurCents: 12000,
  recipientPhone: null,
  street: "Via Roma",
  houseNumber: "1",
  addressExtra: null,
  postalCode: "04100",
  city: "Latina",
  province: "LT",
  client: { name: "Maria", surname: "Rossi", phone: "3331112222", email: "maria@example.com", deletedAt: null },
  quote: { guidedRequestId: "gr-1", items: [{ name: "Sostituzione sifone" }], guidedRequest: { category: { label: "Idraulico" } } },
  ...over,
});
const external = (over: Partial<ClientBookExternalJob> = {}): ClientBookExternalJob => ({
  id: "e-1",
  clientName: "Luigi Bianchi",
  clientPhone: "+39 333 999 8888",
  address: "Via Milano 3",
  description: "Caldaia",
  scheduledAt: new Date("2026-09-01T09:00:00Z"),
  priceEurCents: 8000,
  status: "COMPLETED",
  ...over,
});

describe("buildClientBook", () => {
  it("un cliente del sito con storico, totale dei lavori terminati e contatti", () => {
    const [client] = buildClientBook(
      [booking(), booking({ id: "b-2", scheduledAt: new Date("2026-11-20T09:00:00Z"), status: "CONFIRMED", finalAmountEurCents: null, quote: { guidedRequestId: "gr-2", items: [], guidedRequest: { category: { label: "Idraulico" } } } })],
      [],
      new Map([["u:c-1", "Citofono rotto"]]),
      NOW,
    );
    expect(client).toMatchObject({
      key: "u:c-1",
      kind: "SITE",
      name: "Maria Rossi",
      phone: "3331112222",
      address: "Via Roma 1 — 04100 Latina (LT)",
      jobsDone: 1,
      totalEurCents: 12000,
      nextJobAt: "2026-11-20T09:00:00.000Z",
      lastJobAt: "2026-10-01T09:00:00.000Z",
      note: "Citofono rotto",
      chatGuidedRequestId: "gr-2",
    });
    expect(client!.jobs.map((j) => j.label)).toEqual(["Idraulico", "Sostituzione sifone"]);
  });

  it("mai i contatti senza un lavoro accettato, mai chi ha chiuso l'account", () => {
    const clients = buildClientBook(
      [booking({ status: "CANCELED" }), booking({ id: "b-3", clientId: "c-2", client: { name: "Ex", surname: null, phone: null, email: null, deletedAt: new Date() } })],
      [],
      new Map(),
      NOW,
    );
    expect(clients).toEqual([]);
  });

  it("i lavori esterni dello stesso numero sono un cliente solo", () => {
    const clients = buildClientBook([], [external(), external({ id: "e-2", clientName: "Luigi", clientPhone: "3339998888", scheduledAt: new Date("2026-10-15T09:00:00Z"), priceEurCents: 5000 })], new Map(), NOW);
    expect(clients).toHaveLength(1);
    expect(clients[0]).toMatchObject({ kind: "EXTERNAL", name: "Luigi Bianchi", jobsDone: 2, totalEurCents: 13000 });
  });

  it("prima chi ha un appuntamento in arrivo, poi l'ultimo lavoro più recente", () => {
    const clients = buildClientBook(
      [booking()],
      [external(), external({ id: "e-3", clientName: "Anna", clientPhone: null, scheduledAt: new Date("2026-12-01T09:00:00Z"), status: "SCHEDULED" })],
      new Map(),
      NOW,
    );
    expect(clients.map((c) => c.name)).toEqual(["Anna", "Maria Rossi", "Luigi Bianchi"]);
  });
});
