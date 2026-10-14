import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DiditIdentityProvider, canonicalJson, diditDecision } from "./didit.provider";
import { matchDocumentToFiscal } from "./identity-match";
import { identityVerificationNeeded } from "./identity-provider-env";
import { IdentityVerificationService, expectedPerson } from "./identity-verification.service";

/** Verifica di documento e selfie con Didit (docs/CHANGELOG.md §243). */
describe("Didit", () => {
  const secret = "whsec_prova";
  const provider = new DiditIdentityProvider("key", "workflow", secret);
  const now = new Date("2026-10-14T20:00:00Z");
  const timestamp = String(Math.floor(now.getTime() / 1000));
  const body = JSON.stringify({ session_id: "sess-1", status: "Approved", webhook_type: "status.updated", decision: { b: 1, a: "è" } });

  it("accetta solo webhook firmati e recenti", () => {
    const raw = createHmac("sha256", secret).update(body).digest("hex");
    expect(provider.verifyWebhook(Buffer.from(body), { "x-signature": raw, "x-timestamp": timestamp }, now)).toBe("sess-1");
    const v2 = createHmac("sha256", secret).update(canonicalJson(JSON.parse(body))).digest("hex");
    expect(provider.verifyWebhook(Buffer.from(body), { "x-signature-v2": v2, "x-timestamp": timestamp }, now)).toBe("sess-1");
    expect(provider.verifyWebhook(Buffer.from(body), { "x-signature": "0".repeat(64), "x-timestamp": timestamp }, now)).toBeNull();
    const old = String(Math.floor(now.getTime() / 1000) - 600);
    expect(provider.verifyWebhook(Buffer.from(body), { "x-signature": raw, "x-timestamp": old }, now)).toBeNull();
    expect(new DiditIdentityProvider("key", "workflow", null).verifyWebhook(Buffer.from(body), { "x-signature": raw, "x-timestamp": timestamp }, now)).toBeNull();
  });

  it("JSON canonico con chiavi ordinate", () => {
    expect(canonicalJson({ b: 1, a: [{ d: null, c: "è" }] })).toBe('{"a":[{"c":"è","d":null}],"b":1}');
  });

  it("legge esito e dati del documento", () => {
    const decision = diditDecision({
      status: "Approved",
      id_verifications: [{ first_name: "Mario", last_name: "Rossi", date_of_birth: "1980-01-01", personal_number: "RSSMRA80A01H501U" }],
    });
    expect(decision.outcome).toBe("APPROVED");
    expect(decision.person).toEqual({ firstName: "Mario", lastName: "Rossi", dateOfBirth: "1980-01-01", personalNumber: "RSSMRA80A01H501U" });
    expect(diditDecision({ status: "Declined" }).outcome).toBe("DECLINED");
    expect(diditDecision({ status: "In Review" }).outcome).toBe("REVIEW");
    expect(diditDecision({ status: "Abandoned" }).outcome).toBe("EXPIRED");
    expect(diditDecision({ status: "In Progress" }).outcome).toBe("IN_PROGRESS");
  });
});

describe("il documento è della persona dei dati fiscali?", () => {
  const expected = { firstName: "Maria Grazia", lastName: "De Luca", dateOfBirth: "1990-05-12", codiceFiscale: "DLCMGR90E52L219X" };

  it("basta il codice fiscale stampato sulla CIE", () => {
    expect(matchDocumentToFiscal({ firstName: "X", lastName: "Y", dateOfBirth: null, personalNumber: "DLCMGR90E52L219X" }, expected).matched).toBe(true);
  });

  it("altrimenti nome, cognome e data, senza badare ad accenti, spazi e secondi nomi", () => {
    expect(matchDocumentToFiscal({ firstName: "MARIA", lastName: "DELUCA", dateOfBirth: "1990-05-12", personalNumber: null }, expected).matched).toBe(true);
    const wrong = matchDocumentToFiscal({ firstName: "Mario", lastName: "De Luca", dateOfBirth: "1990-05-13", personalNumber: null }, expected);
    expect(wrong.matched).toBe(false);
    expect(wrong.reason).toContain("nome, data di nascita");
    expect(matchDocumentToFiscal(null, expected).matched).toBe(false);
  });

  it("per un'azienda si confronta il legale rappresentante", () => {
    const person = expectedPerson({
      entityType: "BUSINESS",
      representative: { firstName: "Mario", lastName: "Rossi", codiceFiscale: "rssmra80a01h501u" },
    } as never);
    expect(person).toEqual({ firstName: "Mario", lastName: "Rossi", dateOfBirth: "1980-01-01", codiceFiscale: "RSSMRA80A01H501U" });
  });
});

describe("obbligo prima dei preventivi", () => {
  afterEach(() => {
    delete process.env.DIDIT_API_KEY;
    delete process.env.DIDIT_WORKFLOW_ID;
  });

  it("solo dove la verifica è attiva, mai per demo o profili già verificati", () => {
    expect(identityVerificationNeeded({ isDemo: false, verified: false })).toBe(false);
    process.env.DIDIT_API_KEY = "k";
    process.env.DIDIT_WORKFLOW_ID = "w";
    expect(identityVerificationNeeded({ isDemo: false, verified: false })).toBe(true);
    expect(identityVerificationNeeded({ isDemo: true, verified: false })).toBe(false);
    expect(identityVerificationNeeded({ isDemo: false, verified: true })).toBe(false);
  });
});

describe("esito applicato", () => {
  function build() {
    const row = { id: "iv-1", professionalProfileId: "pp-1", provider: "didit", providerSessionId: "s", status: "STARTED", providerStatus: null, reviewedByUserId: null, decidedAt: null };
    const prisma = {
      professionalProfile: {
        findUnique: vi.fn().mockResolvedValue({
          id: "pp-1",
          userId: "u-1",
          verified: false,
          fiscalProfile: { entityType: "PRIVATE_INDIVIDUAL", fiscalFirstName: "Mario", fiscalLastName: "Rossi", dateOfBirth: new Date("1980-01-01"), fiscalCodiceFiscale: "RSSMRA80A01H501U" },
        }),
      },
      identityVerification: { update: vi.fn(async ({ data }) => ({ ...row, ...data })) },
    };
    const verification = { markVerifiedByProvider: vi.fn() };
    const notifications = { notify: vi.fn() };
    const service = new IdentityVerificationService(prisma as never, { record: vi.fn() } as never, notifications as never, verification as never);
    return { service, row, prisma, verification, notifications };
  }

  it("documento giusto: badge Verificato senza admin", async () => {
    const { service, row, verification } = build();
    const updated = await service.apply(row as never, {
      providerStatus: "Approved",
      outcome: "APPROVED",
      person: { firstName: "Mario", lastName: "Rossi", dateOfBirth: "1980-01-01", personalNumber: null },
    });
    expect(updated.status).toBe("APPROVED");
    expect(verification.markVerifiedByProvider).toHaveBeenCalledWith("pp-1", "didit");
  });

  it("documento di un'altra persona: va all'admin, niente badge", async () => {
    const { service, row, verification } = build();
    const updated = await service.apply(row as never, {
      providerStatus: "Approved",
      outcome: "APPROVED",
      person: { firstName: "Luigi", lastName: "Bianchi", dateOfBirth: "1985-02-02", personalNumber: null },
    });
    expect(updated.status).toBe("NEEDS_REVIEW");
    expect(verification.markVerifiedByProvider).not.toHaveBeenCalled();
  });

  it("rifiutata: avviso al professionista; decisione dell'admin mai sovrascritta", async () => {
    const { service, row, notifications, prisma } = build();
    await service.apply(row as never, { providerStatus: "Declined", outcome: "DECLINED", person: null });
    expect(notifications.notify).toHaveBeenCalledWith("u-1", "IDENTITY_VERIFICATION_DECLINED", expect.anything());
    prisma.identityVerification.update.mockClear();
    await service.apply({ ...row, reviewedByUserId: "admin" } as never, { providerStatus: "Approved", outcome: "APPROVED", person: null });
    expect(prisma.identityVerification.update).not.toHaveBeenCalled();
  });
});
