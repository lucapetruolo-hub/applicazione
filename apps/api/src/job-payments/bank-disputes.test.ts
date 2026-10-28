import { describe, expect, it, vi } from "vitest";
import { bankDisputeEvidenceSchema, bankDisputeReasonLabel } from "@professionisti/shared";
import { BankDisputesService } from "./bank-disputes.service";

/**
 * Contestazioni in banca mandate da Admin → Pagamenti (richiesta di Luca del
 * 28/10/2026, docs/changelog/2026-10-28-stripe-prova.md).
 */
const job = {
  id: "jp-1",
  bookingId: "bk-1",
  stripeDisputeId: "du_1",
  stripeDisputeStatus: "needs_response",
  stripeDirectCharge: true,
  stripeDestinationAccountId: "acct_pro",
  paidEurCents: 22000,
  depositEurCents: 5000,
  refundedEurCents: 0,
  depositPaidAt: new Date("2026-10-28T13:25:00Z"),
  balancePaidAt: new Date("2026-10-31T10:00:00Z"),
  booking: {
    id: "bk-1",
    createdAt: new Date("2026-10-28T13:25:00Z"),
    scheduledAt: new Date("2026-10-31T09:00:00Z"),
    serviceMode: "HOME",
    city: "Latina",
    finalAmountEurCents: 22000,
    professionalCompletedAt: new Date("2026-10-31T11:00:00Z"),
    clientConfirmedCompletedAt: new Date("2026-10-31T12:00:00Z"),
    completionAutoClosedAt: null,
    professionalCompletionNote: null,
    professionalProfileId: "pro-1",
    client: { name: "Mario", surname: "Bianchi", email: "mario@example.com" },
    professionalProfile: { businessName: "Idraulica Rossi", city: "Latina" },
    finalItems: [{ name: "Riparazione perdita", priceEurCents: 22000 }],
    issue: null,
    quote: {
      createdAt: new Date("2026-10-27T10:00:00Z"),
      notes: null,
      items: [{ name: "Riparazione perdita", priceMinEurCents: 20000, priceMaxEurCents: 25000 }],
      guidedRequest: { id: "gr-1", description: "Perdita sotto il lavandino", createdAt: new Date("2026-10-27T09:00:00Z"), category: { label: "Idraulico" } },
    },
  },
};

function setup(status = "needs_response") {
  const prisma = {
    jobPayment: { findMany: vi.fn().mockResolvedValue([job]), findUnique: vi.fn().mockResolvedValue(job), update: vi.fn() },
    conversationEvent: { findMany: vi.fn().mockResolvedValue([{ actor: "CLIENT", message: "Grazie, tutto a posto", mediaUrls: [], createdAt: new Date("2026-10-31T12:05:00Z") }]) },
  };
  const auditLogService = { record: vi.fn() };
  const service = new BankDisputesService(prisma as never, auditLogService as never);
  const dispute = { id: "du_1", status, reason: "fraudulent", amount: 22000, evidence_details: { due_by: 1_762_300_800 } };
  const stripe = {
    disputes: { retrieve: vi.fn().mockResolvedValue(dispute), update: vi.fn().mockResolvedValue({ ...dispute, status: "under_review" }) },
    files: { create: vi.fn().mockResolvedValue({ id: "file_1" }) },
  };
  (service as unknown as { stripe: unknown }).stripe = stripe;
  return { service, prisma, stripe, auditLogService };
}

const input = { productDescription: "Idraulico a domicilio", explanation: "Il cliente ha confermato il lavoro sul sito.", submit: true };

describe("BankDisputesService", () => {
  it("elenca le contestazioni con scadenza e prove già scritte dal sito", async () => {
    const { service, stripe } = setup();
    const [row] = await service.listOpen();
    expect(stripe.disputes.retrieve).toHaveBeenCalledWith("du_1", {}, { stripeAccount: "acct_pro" });
    expect(row).toMatchObject({ jobPaymentId: "jp-1", businessName: "Idraulica Rossi", clientName: "Mario Bianchi", submitted: false, dueBy: "2025-11-05T00:00:00.000Z" });
    expect(row!.draft.customerEmail).toBe("mario@example.com");
    expect(row!.draft.serviceDate).toBe("2026-10-31");
    expect(row!.draft.explanation).toMatch(/Il cliente ha confermato sul sito che il lavoro era terminato il 31 ottobre 2026/);
    // Pagamento "non fatto da me": si ricorda che è partito dal suo account.
    expect(row!.draft.explanation).toMatch(/dall'account del cliente/);
  });

  it("allega il PDF del lavoro e manda le prove sul conto del professionista", async () => {
    const { service, stripe, prisma, auditLogService } = setup();
    const result = await service.saveEvidence("admin-1", "jp-1", input);
    expect(stripe.files.create).toHaveBeenCalledWith(
      { purpose: "dispute_evidence", file: expect.objectContaining({ type: "application/pdf", data: expect.any(Buffer) }) },
      { stripeAccount: "acct_pro" },
    );
    expect(stripe.disputes.update).toHaveBeenCalledWith(
      "du_1",
      { evidence: expect.objectContaining({ product_description: "Idraulico a domicilio", service_documentation: "file_1" }), submit: true },
      { stripeAccount: "acct_pro" },
    );
    expect(prisma.jobPayment.update).toHaveBeenCalledWith({ where: { id: "jp-1" }, data: { stripeDisputeStatus: "under_review" } });
    expect(auditLogService.record).toHaveBeenCalledWith(expect.objectContaining({ changedByUserId: "admin-1", fieldName: "stripeDisputeEvidence" }));
    expect(result.submitted).toBe(true);
  });

  it("non rimanda prove già consegnate alla banca", async () => {
    const { service, stripe } = setup("under_review");
    await expect(service.saveEvidence("admin-1", "jp-1", input)).rejects.toThrow(/già state mandate/);
    expect(stripe.disputes.update).not.toHaveBeenCalled();
  });

  it("il PDF contiene anche i messaggi tra cliente e professionista", async () => {
    const { service } = setup();
    const model = await service.documentationWithMessages(job as never);
    expect(model.blocks.at(-1)).toMatchObject({ type: "text", lines: [expect.stringContaining("Mario Bianchi: Grazie, tutto a posto")] });
  });

  it("motivi in parole semplici e spiegazione obbligatoria", () => {
    expect(bankDisputeReasonLabel("product_not_received")).toBe("Il cliente dice che il lavoro non è stato fatto");
    expect(bankDisputeEvidenceSchema.safeParse({ ...input, explanation: "corta" }).success).toBe(false);
  });
});
