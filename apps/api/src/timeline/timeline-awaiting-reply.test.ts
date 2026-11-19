import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@professionisti/database";
import { TimelineService } from "./timeline.service";

/**
 * "Ti stanno aspettando" nella pagina Oggi
 * (docs/changelog/2026-11-18-oggi-ti-stanno-aspettando.md): solo le chat in
 * cui l'ultima parola è del cliente, su lavori ancora vivi, una riga per chat.
 */
const now = new Date("2026-11-18T12:00:00.000Z");
const hoursAgo = (h: number) => new Date(now.getTime() - h * 3_600_000);
const event = (guidedRequestId: string, actor: "CLIENT" | "PROFESSIONAL" | "SYSTEM", h: number, extra: { automatic?: boolean; message?: string } = {}) => ({
  guidedRequestId,
  actor,
  automatic: extra.automatic ?? false,
  hiddenAt: null,
  createdAt: hoursAgo(h),
  message: extra.message ?? "ciao",
  mediaUrls: [],
});
const request = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  deletedByClientAt: null,
  closedReason: null,
  client: { name: "Mario", surname: "Rossi", deletedAt: null },
  category: { label: "Idraulico" },
  leads: [{ status: "PENDING" }],
  quotes: [],
  chatReplyDismissals: [],
  ...over,
});

function service(events: ReturnType<typeof event>[], requests: ReturnType<typeof request>[]) {
  const findMany = vi.fn().mockResolvedValue(requests);
  const prisma = {
    professionalProfile: { findUnique: vi.fn().mockResolvedValue({ id: "p" }) },
    // Come Prisma: dal più recente.
    conversationEvent: { findMany: vi.fn().mockResolvedValue([...events].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())) },
    guidedRequest: { findMany },
  };
  return { svc: new TimelineService(prisma as unknown as PrismaClient, {} as never, {} as never), findMany };
}

describe("chat che aspettano la risposta del professionista", () => {
  it("una riga per chat, da quando il cliente aspetta, chi aspetta di più per primo", async () => {
    const { svc } = service(
      [event("a", "CLIENT", 2, { message: "Va bene giovedì?" }), event("a", "CLIENT", 3), event("a", "PROFESSIONAL", 5), event("b", "CLIENT", 30)],
      [request("a"), request("b")],
    );
    const rows = await svc.listAwaitingReplyForProfessional("u", now);
    expect(rows.map((r) => r.guidedRequestId)).toEqual(["b", "a"]);
    expect(rows[1]).toMatchObject({ messageCount: 2, lastMessage: "Va bene giovedì?", waitingSince: hoursAgo(3).toISOString(), clientName: "Mario" });
  });

  it("niente se ha già risposto il professionista o se il cliente ha solo accettato", async () => {
    const { svc, findMany } = service([event("a", "PROFESSIONAL", 1), event("a", "CLIENT", 2), event("b", "CLIENT", 1, { automatic: true })], []);
    expect(await svc.listAwaitingReplyForProfessional("u", now)).toEqual([]);
    expect(findMany).not.toHaveBeenCalled();
  });

  it("niente sui lavori chiusi: presi da un altro, scaduti, eliminati, annullati, o 'Non serve risposta'", async () => {
    const { svc } = service(
      ["a", "b", "c", "d", "e", "f"].map((id) => event(id, "CLIENT", 2)),
      [
        request("a", { quotes: [{ professionalProfileId: "altro", status: "ACCEPTED", booking: { status: "CONFIRMED" } }] }),
        request("b", { leads: [{ status: "EXPIRED" }] }),
        request("c", { deletedByClientAt: hoursAgo(1) }),
        request("d", { quotes: [{ professionalProfileId: "p", status: "ACCEPTED", booking: { status: "CANCELED" } }] }),
        request("e", { chatReplyDismissals: [{ dismissedAt: hoursAgo(1) }] }),
        request("f", { quotes: [{ professionalProfileId: "p", status: "ACCEPTED", booking: { status: "CONFIRMED" } }] }),
      ],
    );
    const rows = await svc.listAwaitingReplyForProfessional("u", now);
    // Solo il lavoro fissato: lì il cognome si vede (§216).
    expect(rows.map((r) => [r.guidedRequestId, r.clientName])).toEqual([["f", "Mario Rossi"]]);
  });

  it("dopo 'Non serve risposta' torna con un messaggio nuovo del cliente", async () => {
    const { svc } = service([event("a", "CLIENT", 1)], [request("a", { chatReplyDismissals: [{ dismissedAt: hoursAgo(3) }] })]);
    expect(await svc.listAwaitingReplyForProfessional("u", now)).toHaveLength(1);
  });
});
