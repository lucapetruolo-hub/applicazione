import { writeFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { renderDocumentPdf } from "../accounting/document-pdf";
import { InvitePartnersService } from "./invite-partners.service";

/** Scheda da stampare per i partner (docs/changelog/2026-11-09-passaparola.md). */
describe("scheda del partner", () => {
  function service(partner: Record<string, unknown> | null) {
    const prisma = { invitePartner: { findUnique: vi.fn().mockResolvedValue(partner) } };
    return new InvitePartnersService(prisma as never);
  }

  it("ha il nome del partner, il suo link con il QR e nessuna offerta a tempo", async () => {
    const { model, fileName } = await service({ id: "p1", name: "Studio Bianchi", code: "k7m2qab", archivedAt: null }).sheet("p1");
    const text = JSON.stringify(model);
    expect(text).toContain("Studio Bianchi");
    expect(text).toContain("/per-professionisti?invito=k7m2qab");
    expect(model.blocks.some((b) => b.type === "qr")).toBe(true);
    expect(text).not.toMatch(/gratis|mesi|sconto|nostri professionisti/i);
    expect(fileName).toContain("Studio Bianchi");
    const pdf = await renderDocumentPdf(model);
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    if (process.env.SCHEDA_PDF_OUT) writeFileSync(process.env.SCHEDA_PDF_OUT, pdf);
  });

  it("un partner tolto o inesistente non ha la scheda", async () => {
    await expect(service(null).sheet("x")).rejects.toThrow();
    await expect(service({ id: "p1", name: "S", code: "k7m2qab", archivedAt: new Date() }).sheet("p1")).rejects.toThrow();
  });
});
