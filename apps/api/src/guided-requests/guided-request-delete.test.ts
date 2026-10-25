import { describe, expect, it, vi } from "vitest";
import { GuidedRequestsService } from "./guided-requests.service";

/**
 * "Elimina richiesta" del cliente (docs/CHANGELOG.md §337): una richiesta
 * aperta si elimina subito solo se nessuno ha mandato un preventivo; con un
 * preventivo va prima annullata, con una prenotazione mai.
 */
function buildService({ status = "OPEN", quotes = 0, bookings = 0 } = {}) {
  const prisma = {
    guidedRequest: { findUnique: vi.fn().mockResolvedValue({ id: "gr-1", clientId: "client-1", status }), delete: vi.fn() },
    quote: { count: vi.fn().mockResolvedValue(quotes) },
    booking: { count: vi.fn().mockResolvedValue(bookings) },
    notification: { deleteMany: vi.fn() },
    $transaction: vi.fn().mockResolvedValue([]),
  };
  const service = new GuidedRequestsService(prisma as never, {} as never, {} as never, {} as never, {} as never);
  return { service, prisma };
}

describe("GuidedRequestsService.permanentlyDelete", () => {
  it("elimina subito una richiesta aperta senza preventivi", async () => {
    const { service, prisma } = buildService();
    await service.permanentlyDelete("client-1", "gr-1");
    expect(prisma.$transaction).toHaveBeenCalled();
    expect(prisma.guidedRequest.delete).toHaveBeenCalledWith({ where: { id: "gr-1" } });
  });

  it("chiede di annullare prima una richiesta aperta con un preventivo", async () => {
    const { service, prisma } = buildService({ quotes: 1 });
    await expect(service.permanentlyDelete("client-1", "gr-1")).rejects.toThrow("annulla la richiesta prima di eliminarla");
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("non elimina una richiesta che ha portato a una prenotazione", async () => {
    const { service, prisma } = buildService({ status: "CLOSED", quotes: 1, bookings: 1 });
    await expect(service.permanentlyDelete("client-1", "gr-1")).rejects.toThrow("prenotazione");
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("rifiuta chi non è il cliente", async () => {
    const { service } = buildService();
    await expect(service.permanentlyDelete("altro", "gr-1")).rejects.toThrow("Questa richiesta non è tua.");
  });
});
