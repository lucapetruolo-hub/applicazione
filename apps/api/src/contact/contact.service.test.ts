import { describe, expect, it, vi } from "vitest";
import { contactMessageSchema } from "@professionisti/shared";
import { ContactService } from "./contact.service";

/** Segnalazione di un contenuto illegale senza account (DSA art. 16 c. 1 e 4, docs/CHANGELOG.md §319). */
describe("Contatti: segnalazione di un contenuto illegale", () => {
  const base = { role: "REPORT_ILLEGAL", email: "anna@example.it", content: "https://sito/professionista/1 mi accusa di furto" };

  it("richiede la buona fede e una descrizione", () => {
    expect(contactMessageSchema.safeParse(base).success).toBe(false);
    expect(contactMessageSchema.safeParse({ ...base, goodFaith: true, content: "breve" }).success).toBe(false);
    expect(contactMessageSchema.safeParse({ ...base, goodFaith: true }).success).toBe(true);
    expect(contactMessageSchema.safeParse({ role: "CLIENT", email: "a@b.it", content: "ciao" }).success).toBe(true);
  });

  it("salva il messaggio e manda la presa in carico", async () => {
    const prisma = { contactMessage: { create: vi.fn() } };
    const notifications = { emailContactReportReceived: vi.fn() };
    const service = new ContactService(prisma as never, notifications as never);
    await service.send({ ...base, role: "REPORT_ILLEGAL", goodFaith: true });
    expect(prisma.contactMessage.create).toHaveBeenCalledWith({ data: expect.objectContaining({ role: "REPORT_ILLEGAL", content: expect.stringContaining("buona fede") }) });
    expect(notifications.emailContactReportReceived).toHaveBeenCalledWith("anna@example.it");
  });

  it("un messaggio normale non manda nulla", async () => {
    const prisma = { contactMessage: { create: vi.fn() } };
    const notifications = { emailContactReportReceived: vi.fn() };
    await new ContactService(prisma as never, notifications as never).send({ role: "CLIENT", email: "a@b.it", content: "ciao" });
    expect(notifications.emailContactReportReceived).not.toHaveBeenCalled();
  });
});
