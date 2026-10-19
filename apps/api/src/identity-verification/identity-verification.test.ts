import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DiditIdentityProvider, canonicalJson, diditDecision } from "./didit.provider";
import { matchDocumentToFiscal } from "./identity-match";
import { identityVerificationNeeded } from "./identity-provider-env";
import { IdentityVerificationService, STANDBY_PROVIDER_STATUS, expectedPerson, reminderDue } from "./identity-verification.service";

/** Verifica di documento e selfie con Didit (docs/CHANGELOG.md §253). */
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

  it("documento che non coincide: niente badge, il professionista sa cosa correggere (nessun admin)", async () => {
    const { service, row, verification, notifications } = build();
    const updated = await service.apply(row as never, {
      providerStatus: "Approved",
      outcome: "APPROVED",
      person: { firstName: "Luigi", lastName: "Bianchi", dateOfBirth: "1985-02-02", personalNumber: null },
    });
    expect(updated.status).toBe("DECLINED");
    expect(updated.reason).toContain("correggilo");
    expect(verification.markVerifiedByProvider).not.toHaveBeenCalled();
    expect(notifications.notify).toHaveBeenCalledWith("u-1", "IDENTITY_VERIFICATION_DECLINED", expect.anything());
  });

  it("rifiutata o da rivedere per il fornitore: avviso al professionista, che riprova da solo", async () => {
    const { service, row, notifications } = build();
    await service.apply(row as never, { providerStatus: "Declined", outcome: "DECLINED", person: null });
    expect(notifications.notify).toHaveBeenCalledWith("u-1", "IDENTITY_VERIFICATION_DECLINED", expect.anything());
    const inReview = await service.apply(row as never, { providerStatus: "In Review", outcome: "REVIEW", person: null });
    expect(inReview.status).toBe("DECLINED");
  });
});

describe("servizio di verifica che non risponde (§256)", () => {
  const fiscal = { entityType: "PRIVATE_INDIVIDUAL", fiscalFirstName: "Mario", fiscalLastName: "Rossi", dateOfBirth: new Date("1980-01-01"), fiscalCodiceFiscale: "RSSMRA80A01H501U", fiscalDataCompleteAt: new Date(), fiscalDeclarationAcceptedAt: new Date(), foreignTin: null, businessName: null, vatNumber: null, registeredStreet: "Via Roma 1", registeredCity: "Milano", registeredPostalCode: "20100", taxIdChecks: [], representative: null };

  function build(createSession: () => Promise<{ sessionId: string; url: string }>) {
    const rows: Record<string, unknown>[] = [];
    const prisma = {
      professionalProfile: { findUnique: vi.fn().mockResolvedValue({ id: "pp-1", userId: "u-1", isDemo: false, verified: false, deletedAt: null, fiscalProfile: fiscal }) },
      identityVerification: {
        findFirst: vi.fn(async () => rows[rows.length - 1] ?? null),
        count: vi.fn().mockResolvedValue(0),
        create: vi.fn(async ({ data }) => {
          const row = { id: `iv-${rows.length + 1}`, status: "STARTED", createdAt: new Date(), updatedAt: new Date(), ...data };
          rows.push(row);
          return row;
        }),
        update: vi.fn(async ({ where, data }) => Object.assign(rows.find((r) => r.id === where.id) ?? {}, data)),
        findMany: vi.fn(async ({ where }) =>
          where.providerStatus === STANDBY_PROVIDER_STATUS
            ? rows.filter((r) => r.providerStatus === STANDBY_PROVIDER_STATUS).map((r) => ({ ...r, professionalProfile: { userId: "u-1", verified: false, deletedAt: null } }))
            : [],
        ),
      },
    };
    const notifications = { notify: vi.fn() };
    const service = new IdentityVerificationService(prisma as never, { record: vi.fn() } as never, notifications as never, {} as never);
    const provider = { name: "didit", createSession: vi.fn(createSession), getDecision: vi.fn(), verifyWebhook: vi.fn(), consoleUrl: () => null };
    (service as unknown as { provider: unknown }).provider = provider;
    return { service, rows, provider, notifications };
  }

  it("non dà errore: la verifica resta in attesa e si riprende appena il servizio torna, con un avviso", async () => {
    let up = false;
    const { service, rows, provider, notifications } = build(async () => {
      if (!up) throw new Error("down");
      return { sessionId: "sess-9", url: "https://didit/sess-9" };
    });
    await expect(service.start("u-1")).resolves.toEqual({ url: null, standby: true });
    expect(rows[0]).toMatchObject({ providerStatus: STANDBY_PROVIDER_STATUS, sessionUrl: null });

    await service.followUp();
    expect(notifications.notify).not.toHaveBeenCalled();

    up = true;
    await service.followUp();
    expect(rows[0]).toMatchObject({ providerSessionId: "sess-9", sessionUrl: "https://didit/sess-9", providerStatus: null });
    expect(notifications.notify).toHaveBeenCalledWith("u-1", "IDENTITY_VERIFICATION_READY", {});
    expect(rows).toHaveLength(1);
    expect(provider.createSession).toHaveBeenCalledTimes(3);
  });

  it("riprovando a mano dalla pagina si riusa lo stesso tentativo", async () => {
    let up = false;
    const { service, rows } = build(async () => {
      if (!up) throw new Error("down");
      return { sessionId: "sess-2", url: "https://didit/sess-2" };
    });
    await service.start("u-1");
    up = true;
    await expect(service.start("u-1")).resolves.toEqual({ url: "https://didit/sess-2", standby: false });
    expect(rows).toHaveLength(1);
  });
});

describe("promemoria a chi non ha fatto la verifica (§256)", () => {
  const day = 24 * 60 * 60_000;
  const now = new Date("2026-10-20T10:00:00Z");
  const ago = (days: number) => new Date(now.getTime() - days * day);

  it("il primo dopo 3 giorni, il secondo dopo un'altra settimana, poi basta", () => {
    expect(reminderDue({ profileCreatedAt: ago(2), sent: 0, lastSentAt: null, now })).toBe(false);
    expect(reminderDue({ profileCreatedAt: ago(3), sent: 0, lastSentAt: null, now })).toBe(true);
    expect(reminderDue({ profileCreatedAt: ago(8), sent: 1, lastSentAt: ago(5), now })).toBe(false);
    expect(reminderDue({ profileCreatedAt: ago(10), sent: 1, lastSentAt: ago(7), now })).toBe(true);
    expect(reminderDue({ profileCreatedAt: ago(30), sent: 2, lastSentAt: ago(20), now })).toBe(false);
  });
});
