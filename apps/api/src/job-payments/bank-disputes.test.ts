import { afterEach, describe, expect, it, vi } from "vitest";
import { bankDisputeEvidenceSchema, bankDisputeReasonLabel, toJobPaymentSummary } from "@professionisti/shared";
import { BankDisputesService, stripeTestKeyword } from "./bank-disputes.service";
import { OnlineMoneyService } from "./online-money.service";
import { renderDocumentPdf } from "../accounting/document-pdf";

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
  stripeDisputeDueBy: null as Date | null,
  disputeProNote: null as string | null,
  disputeProPhotoUrls: [] as string[],
  disputeProNoteAt: null as Date | null,
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
    professionalCompletionPhotoUrls: [] as string[],
    clientCompletionPhotoUrls: [] as string[],
    clientCompletionNote: null as string | null,
    professionalProfileId: "pro-1",
    client: { name: "Mario", surname: "Bianchi", email: "mario@example.com" },
    professionalProfile: { businessName: "Idraulica Rossi", city: "Latina", userId: "pro-user-1" },
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

function setup(status = "needs_response", row: typeof job = job) {
  const prisma = {
    jobPayment: { findMany: vi.fn().mockResolvedValue([row]), findUnique: vi.fn().mockResolvedValue(row), update: vi.fn().mockResolvedValue({}) },
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
    // Archivio: le prove come le ha scritte l'admin, il PDF caricato, chi e quando.
    expect(prisma.jobPayment.update).toHaveBeenCalledWith({
      where: { id: "jp-1" },
      data: {
        stripeDisputeStatus: "under_review",
        disputeEvidence: { productDescription: "Idraulico a domicilio", explanation: "Il cliente ha confermato il lavoro sul sito." },
        disputeEvidenceFileId: "file_1",
        disputeEvidenceSentAt: expect.any(Date),
        disputeEvidenceSentById: "admin-1",
      },
    });
    expect(auditLogService.record).toHaveBeenCalledWith(expect.objectContaining({ changedByUserId: "admin-1", fieldName: "stripeDisputeEvidence" }));
    expect(result.submitted).toBe(true);
    expect(result.sentExplanation).toBe("Il cliente ha confermato il lavoro sul sito.");
  });

  it("salvate senza mandarle, le prove tornano nel modulo e non risultano mandate", async () => {
    const { service, prisma } = setup();
    await service.saveEvidence("admin-1", "jp-1", { ...input, submit: false });
    const data = prisma.jobPayment.update.mock.calls[0]![0].data;
    expect(data.disputeEvidenceSentAt).toBeUndefined();
    const saved = { ...job, disputeEvidence: data.disputeEvidence };
    prisma.jobPayment.findMany.mockResolvedValue([saved]);
    const [row] = await service.listOpen();
    expect(row!.draft).toEqual({ productDescription: "Idraulico a domicilio", explanation: "Il cliente ha confermato il lavoro sul sito." });
    expect(row!.sentExplanation).toBeNull();
  });

  it("archivio: cerca anche per nome e cognome e per cifra, con chi ha mandato le prove e la cronologia", async () => {
    const { service, prisma } = setup();
    const closed = {
      ...job,
      stripeDisputeStatus: "lost",
      stripeDisputeReason: "fraudulent",
      stripeDisputedAt: new Date("2026-11-01T10:00:00Z"),
      stripeDisputeClosedAt: new Date("2026-11-20T10:00:00Z"),
      disputeEvidence: { productDescription: "Idraulico", explanation: "Spiegazione mandata", stripeText: "losing_evidence" },
      disputeEvidenceSentAt: new Date("2026-11-02T10:00:00Z"),
      disputeEvidenceSentById: "admin-1",
      disputeEvidenceFileId: "file_1",
    };
    prisma.jobPayment.findMany.mockResolvedValue([closed]);
    Object.assign(prisma, {
      auditLog: { findMany: vi.fn().mockResolvedValue([{ entityId: "jp-1", reason: "Prove della contestazione mandate alla banca.", changedByUserId: "admin-1", createdAt: new Date("2026-11-02T10:00:00Z") }]) },
      user: { findMany: vi.fn().mockResolvedValue([{ id: "admin-1", email: "luca@example.com" }]) },
    });
    const [row] = await service.archive("Mario Bianchi");
    const where = prisma.jobPayment.findMany.mock.calls[0]![0].where;
    expect(JSON.stringify(where)).toContain("Bianchi");
    expect(row).toMatchObject({
      status: "lost",
      reason: "fraudulent",
      closedAt: "2026-11-20T10:00:00.000Z",
      evidenceSentBy: "luca@example.com",
      hasSentPdf: true,
      evidence: { explanation: "Spiegazione mandata", stripeText: "losing_evidence" },
      history: [{ text: "Prove della contestazione mandate alla banca.", by: "luca@example.com" }],
    });
    await service.archive("220,00 €");
    expect(JSON.stringify(prisma.jobPayment.findMany.mock.calls[1]![0].where)).toContain('"paidEurCents":22000');
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

  it("salva la scadenza delle prove letta da Stripe, per l'avviso dei 3 giorni", async () => {
    const { service, prisma } = setup();
    await service.listOpen();
    expect(prisma.jobPayment.update).toHaveBeenCalledWith({ where: { id: "jp-1" }, data: { stripeDisputeDueBy: new Date(1_762_300_800_000) } });
  });
});

describe("foto del lavoro nel PDF", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  const withPhotos = {
    ...job,
    disputeProPhotoUrls: ["https://res.cloudinary.com/demo/image/upload/v1/pro.jpg"],
    booking: {
      ...job.booking,
      professionalCompletionPhotoUrls: ["https://res.cloudinary.com/demo/image/upload/v1/fine.png"],
      clientCompletionPhotoUrls: ["https://esempio.it/foto.jpg"],
    },
  };

  it("scarica solo dal nostro Cloudinary, in JPEG ridotto, e lascia il link di quelle che non arrivano", async () => {
    vi.stubEnv("CLOUDINARY_CLOUD_NAME", "demo");
    const fetchMock = vi.fn().mockImplementation(async () => new Response(new Uint8Array([1, 2, 3]), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const { service } = setup("needs_response", withPhotos);
    const model = await service.documentationWithMessages(withPhotos as never);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]![0]).toBe("https://res.cloudinary.com/demo/image/upload/c_limit,w_1000,h_1000,q_70,f_jpg/v1/fine.png");
    const images = model.blocks.find((b) => b.type === "images");
    expect(images).toMatchObject({ images: [{ caption: expect.stringContaining("foto del professionista") }, { caption: "Foto aggiunta dal professionista" }] });
    expect(model.blocks).toContainEqual({ type: "text", lines: [expect.stringContaining("https://esempio.it/foto.jpg")], muted: true });
  });

  it("la spiegazione del professionista entra nelle prove e nel PDF", async () => {
    const row = { ...job, disputeProNote: "Sono andato il 31 e il cliente ha provato l'acqua.", disputeProNoteAt: new Date("2026-11-01T10:00:00Z") };
    const { service } = setup("needs_response", row);
    const [listed] = await service.listOpen();
    expect(listed!.professionalNote).toMatchObject({ text: row.disputeProNote, at: "2026-11-01T10:00:00.000Z" });
    expect(listed!.draft.explanation).toContain(`Il professionista spiega: "${row.disputeProNote}"`);
    expect(service.documentation(row as never).blocks).toContainEqual({ type: "text", lines: [row.disputeProNote] });
  });
});

describe("spiegazione del professionista dalla sua area", () => {
  const note = { note: "Ho finito il lavoro il 31 e il cliente era contento.", photoUrls: ["https://res.cloudinary.com/demo/image/upload/v1/a.jpg"] };

  it("la salva sul pagamento finché le prove non sono partite", async () => {
    const { service, prisma, auditLogService } = setup();
    const result = await service.saveProfessionalNote("pro-user-1", "bk-1", note);
    expect(prisma.jobPayment.update).toHaveBeenCalledWith({
      where: { id: "jp-1" },
      data: { disputeProNote: note.note, disputeProPhotoUrls: note.photoUrls, disputeProNoteAt: expect.any(Date) },
    });
    expect(auditLogService.record).toHaveBeenCalledWith(expect.objectContaining({ fieldName: "disputeProNote", changedByUserId: "pro-user-1" }));
    expect(result).toMatchObject({ open: true, note: note.note });
  });

  it("solo il professionista del lavoro, e non dopo l'invio alla banca", async () => {
    await expect(setup().service.saveProfessionalNote("altro-utente", "bk-1", note)).rejects.toThrow(/non è tuo/);
    const sent = { ...job, stripeDisputeStatus: "under_review" };
    await expect(setup("under_review", sent).service.saveProfessionalNote("pro-user-1", "bk-1", note)).rejects.toThrow(/già state mandate/);
  });

  it("il professionista vede la contestazione nel riepilogo del pagamento, il cliente no", () => {
    const row = { ...job, paymentMethod: "MANOVIA", balanceDirect: false, onlineStage: "PAID", platformFeeEurCents: 0, stripeFeeEurCents: 0, netAmountEurCents: 0, releaseDueAt: null, releasedAt: null, balanceUnpaidAt: null, stripeDisputeDueBy: new Date("2026-11-20T00:00:00Z") };
    expect(toJobPaymentSummary(row, 22000, true)!.bankDispute).toEqual({ open: true, status: "needs_response", dueBy: "2026-11-20T00:00:00.000Z", note: null, photoUrls: [], noteAt: null });
    expect(toJobPaymentSummary(row, 22000)!.bankDispute).toBeUndefined();
  });

  it("motivi in parole semplici e spiegazione obbligatoria", () => {
    expect(bankDisputeReasonLabel("product_not_received")).toBe("Il cliente dice che il lavoro non è stato fatto");
    expect(bankDisputeEvidenceSchema.safeParse({ ...input, explanation: "corta" }).success).toBe(false);
  });
});

describe("avviso 3 giorni prima della scadenza delle prove", () => {
  const NOW = new Date("2026-11-10T12:00:00Z");

  function reminderSetup(claimed = 1) {
    const prisma = {
      jobPayment: {
        findMany: vi
          .fn()
          .mockResolvedValueOnce([{ id: "jp-1", bookingId: "bk-1", stripeDisputeDueBy: new Date("2026-11-12T23:59:59Z"), disputeProNoteAt: null, booking: { quote: { guidedRequestId: "gr-1" } } }])
          .mockResolvedValueOnce([]),
        updateMany: vi.fn().mockResolvedValue({ count: claimed }),
      },
      user: { findMany: vi.fn().mockResolvedValue([{ id: "admin-1", adminRoles: ["FINANCE"] }, { id: "admin-2", adminRoles: ["SUPPORT"] }]) },
    };
    const notificationsService = { notify: vi.fn() };
    const service = new OnlineMoneyService(prisma as never, { record: vi.fn() } as never, notificationsService as never);
    return { prisma, notificationsService, service };
  }

  it("cerca le contestazioni aperte che scadono entro 3 giorni e avvisa una volta il team Finanza", async () => {
    const { service, prisma, notificationsService } = reminderSetup();
    expect(await service.remindDisputeDeadlines(NOW)).toBe(1);
    expect(prisma.jobPayment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          stripeDisputeStatus: { in: ["needs_response", "warning_needs_response"] },
          disputeReminderSentAt: null,
          stripeDisputeDueBy: { gt: NOW, lte: new Date("2026-11-13T12:00:00Z") },
        }),
      }),
    );
    expect(prisma.jobPayment.updateMany).toHaveBeenCalledWith({ where: { id: "jp-1", disputeReminderSentAt: null }, data: { disputeReminderSentAt: NOW } });
    expect(notificationsService.notify).toHaveBeenCalledTimes(1);
    expect(notificationsService.notify).toHaveBeenCalledWith("admin-1", "ADMIN_STRIPE_DISPUTE_DUE", expect.objectContaining({ bookingId: "bk-1", professionalNote: false }));
  });

  it("ricorda al professionista che non ha scritto, 5 giorni prima, una volta sola", async () => {
    const { service, prisma, notificationsService } = reminderSetup();
    prisma.jobPayment.findMany.mockReset().mockResolvedValue([
      { id: "jp-2", bookingId: "bk-2", stripeDisputeDueBy: new Date("2026-11-14T23:59:59Z"), booking: { professionalProfile: { userId: "pro-user-1" }, quote: { guidedRequestId: "gr-2" } } },
    ]);
    expect(await service.remindProfessionalDisputeNotes(NOW)).toBe(1);
    expect(prisma.jobPayment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ disputeProNoteAt: null, disputeProReminderSentAt: null, stripeDisputeDueBy: { gt: NOW, lte: new Date("2026-11-15T12:00:00Z") } }),
      }),
    );
    expect(prisma.jobPayment.updateMany).toHaveBeenCalledWith({ where: { id: "jp-2", disputeProReminderSentAt: null }, data: { disputeProReminderSentAt: NOW } });
    expect(notificationsService.notify).toHaveBeenCalledWith("pro-user-1", "JOB_STRIPE_DISPUTE_NOTE_DUE", { bookingId: "bk-2", guidedRequestId: "gr-2", dueBy: "2026-11-14T23:59:59.000Z" });
  });

  it("non ripete l'avviso già mandato", async () => {
    const { service, notificationsService } = reminderSetup(0);
    expect(await service.remindDisputeDeadlines(NOW)).toBe(0);
    expect(notificationsService.notify).not.toHaveBeenCalled();
  });
});

describe("foto nel PDF", () => {
  // PNG 1x1 vero.
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");

  it("disegna le foto e non si ferma su una foto illeggibile", async () => {
    const pdf = await renderDocumentPdf({ title: "Riepilogo", blocks: [{ type: "images", images: [{ data: png, caption: "Lavoro terminato" }, { data: Buffer.from("non è una foto"), caption: "Rotta" }, { data: png }] }] });
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pdf.toString("latin1")).toContain("/Subtype /Image");
  });
});

describe("parole di prova di Stripe", () => {
  it("con le chiavi di prova manda solo la parola, con quelle vere mai", () => {
    expect(stripeTestKeyword("losing_evidence: prova della contestazione persa", "sk_test_123")).toBe("losing_evidence");
    expect(stripeTestKeyword("Prova winning_evidence da admin", "rk_test_123")).toBe("winning_evidence");
    expect(stripeTestKeyword("losing_evidence: prova", "sk_live_123")).toBeNull();
    expect(stripeTestKeyword("Spiegazione normale del lavoro", "sk_test_123")).toBeNull();
    // Scritta da telefono: maiuscola, spazio o trattino.
    expect(stripeTestKeyword("Winning_evidence prova da telefono", "sk_test_123")).toBe("winning_evidence");
    expect(stripeTestKeyword("prova winning evidence da telefono", "sk_test_123")).toBe("winning_evidence");
    expect(stripeTestKeyword("LOSING-EVIDENCE prova da telefono", "sk_test_123")).toBe("losing_evidence");
    expect(stripeTestKeyword("Winning evidence prova da telefono", "sk_live_123")).toBeNull();
  });
});
