import { NotFoundException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { CompanyAccountantService, companyAccountantZipEmail } from "./company-accountant.service";

/** Zip delle fatture del mese al commercialista della società (docs/changelog/2026-11-24-fatture-del-mese-zip.md). */
function build(settings: { accountantEmail: string | null; accountantZipAt: Date | null; accountantZipMonth: string | null } | null, opts: { claim?: number; zip?: unknown; emailOk?: boolean } = {}) {
  const prisma = {
    platformInvoiceSettings: {
      findUnique: vi.fn().mockResolvedValue(settings),
      updateMany: vi.fn().mockResolvedValue({ count: opts.claim ?? 1 }),
      upsert: vi.fn(),
    },
    fiscalSendLog: { create: vi.fn() },
  };
  const email = { send: vi.fn().mockResolvedValue(opts.emailOk ?? true) };
  const zip = opts.zip instanceof Error ? vi.fn().mockRejectedValue(opts.zip) : vi.fn().mockResolvedValue(opts.zip ?? { fileName: "fatture-2026-10.zip", zip: Buffer.from("PK"), count: 3, missingXml: 0 });
  const notifyFinanceAdmins = vi.fn();
  const service = new CompanyAccountantService(prisma as never, email as never, { adminMonthZip: zip, notifyFinanceAdmins } as never);
  return { service, prisma, email, zip, notifyFinanceAdmins };
}

const on = { accountantEmail: "studio@example.com", accountantZipAt: new Date("2026-11-01"), accountantZipMonth: "2026-09" };

describe("CompanyAccountantService", () => {
  it("il 5 manda lo zip del mese prima, una volta sola", async () => {
    const { service, prisma, email } = build(on);
    expect(await service.sendMonthly(new Date("2026-11-05T08:00:00Z"))).toBe("sent");
    expect(prisma.platformInvoiceSettings.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { accountantZipMonth: "2026-10" } }));
    expect(email.send).toHaveBeenCalledWith(expect.objectContaining({ to: "studio@example.com", attachments: [expect.objectContaining({ filename: "fatture-2026-10.zip", contentType: "application/zip" })] }));
    // Nel Registro invii, come giro automatico.
    expect(prisma.fiscalSendLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ kind: "ACCOUNTANT_ZIP", month: "2026-10", recipient: "studio@example.com", result: "sent", detail: "3 fatture", createdByUserId: null }),
    });
  });

  it("senza spunta o senza email non manda niente", async () => {
    expect(await build({ ...on, accountantZipAt: null }).service.sendFor("2026-10")).toBe("off");
    expect(await build({ ...on, accountantEmail: null }).service.sendFor("2026-10")).toBe("off");
    expect(await build(null).service.sendFor("2026-10")).toBe("off");
  });

  it("mese già mandato (o da un'altra copia dell'API): niente doppioni", async () => {
    const { service, email } = build(on, { claim: 0 });
    expect(await service.sendFor("2026-10")).toBe("already");
    expect(email.send).not.toHaveBeenCalled();
  });

  it("mese senza fatture o invio non riuscito: rimette il mese, così si può riprovare", async () => {
    const empty = build(on, { zip: new NotFoundException("Nessuna fattura in quel mese.") });
    expect(await empty.service.sendFor("2026-10")).toBe("empty");
    expect(empty.prisma.platformInvoiceSettings.updateMany).toHaveBeenLastCalledWith({ where: { id: "default", accountantZipMonth: "2026-10" }, data: { accountantZipMonth: "2026-09" } });
    const failed = build(on, { emailOk: false });
    expect(await failed.service.sendFor("2026-10")).toBe("failed");
    expect(failed.prisma.platformInvoiceSettings.updateMany).toHaveBeenCalledTimes(2);
  });

  it("se il 5 l'invio non riesce avvisa gli admin della Finanza", async () => {
    const { service, notifyFinanceAdmins } = build(on, { emailOk: false });
    expect(await service.sendMonthly(new Date("2026-11-05T08:00:00Z"))).toBe("failed");
    expect(notifyFinanceAdmins).toHaveBeenCalledWith("ADMIN_FEE_RECONCILIATION", expect.objectContaining({ kind: "accountant-zip", month: "2026-10" }));
    const ok = build(on);
    await ok.service.sendMonthly(new Date("2026-11-05T08:00:00Z"));
    expect(ok.notifyFinanceAdmins).not.toHaveBeenCalled();
  });

  it("\"Mandalo adesso\" parte anche senza spunta e per un mese già mandato", async () => {
    const { service, prisma, email } = build({ ...on, accountantZipAt: null, accountantZipMonth: "2026-10" }, { claim: 0 });
    expect(await service.sendFor("2026-10", new Date(), { manual: true })).toBe("sent");
    expect(email.send).toHaveBeenCalledTimes(1);
    expect(await build({ ...on, accountantEmail: null }).service.sendFor("2026-10", new Date(), { manual: true })).toBe("off");
    // Nessun "segno" prima di mandare: solo l'ultimo mese aggiornato dopo.
    expect(prisma.platformInvoiceSettings.updateMany).toHaveBeenCalledTimes(1);
  });

  it("la spunta tiene la data in cui è stata messa la prima volta", async () => {
    const { service, prisma } = build(on);
    await service.update({ email: "studio@example.com", enabled: true });
    expect(prisma.platformInvoiceSettings.upsert).toHaveBeenCalledWith(expect.objectContaining({ update: { accountantEmail: "studio@example.com", accountantZipAt: on.accountantZipAt } }));
    await service.update({ email: "", enabled: false });
    expect(prisma.platformInvoiceSettings.upsert).toHaveBeenLastCalledWith(expect.objectContaining({ update: { accountantEmail: null, accountantZipAt: null } }));
  });

  it("l'email dice quante fatture e quali non hanno ancora il file XML", () => {
    const email = companyAccountantZipEmail("2026-10", 3, 1);
    expect(email.subject).toContain("ottobre 2026");
    expect(email.paragraphs.join(" ")).toContain("3 fatture");
    expect(email.paragraphs.join(" ")).toContain("Una fattura non ha ancora il file XML");
  });
});
