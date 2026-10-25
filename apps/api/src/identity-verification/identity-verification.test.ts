import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DiditIdentityProvider, canonicalJson, diditDecision, diditReason } from "./didit.provider";
import { matchDocumentToFiscal } from "./identity-match";
import { identityVerificationNeeded } from "./identity-provider-env";
import { EXPIRED_BADGE_REASON, IdentityVerificationService, SANDBOX_BADGE_REASON, STANDBY_PROVIDER_STATUS, badgeOverTime, documentExpiry, expectedPerson, startOfRomeDay, profileSetupMissing, reminderDue, setupReminderDue } from "./identity-verification.service";

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
    // Lo stato può arrivare anche in maiuscolo con il trattino basso.
    expect(diditDecision({ status: "APPROVED" }).outcome).toBe("APPROVED");
    expect(diditDecision({ status: "IN_REVIEW" }).outcome).toBe("REVIEW");
  });

  it("motivo per il professionista dai codici degli avvisi", () => {
    expect(diditReason(["IMAGE_TOO_BLURRY"])).toContain("sfocata");
    expect(diditReason(["IMAGE_TOO_BLURRY", "DOCUMENT_EXPIRED"])).toContain("scaduto");
    expect(diditReason(["LOW_FRONT_CAMERA_FACE_MATCH_SIMILARITY"])).toContain("selfie");
    expect(diditReason(["POSSIBLE_DUPLICATED_USER"])).toContain("già usati");
    expect(diditReason(["DOB_MISMATCH_WITH_PROVIDED"])).toContain("dati fiscali");
    expect(diditReason(["CODICE_SCONOSCIUTO"])).toBeNull();
    // Gli avvisi solo informativi non contano.
    expect(diditDecision({ status: "Declined", warnings: [{ risk: "DOCUMENT_BACK_SIDE_NOT_AVAILABLE", log_type: "information" }] }).warnings).toEqual([]);
  });

  it("manda a Didit nome e data attesi, così confronta anche lui", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async () => new Response(JSON.stringify({ session_id: "s1", url: "https://verify.didit.me/s1" }), { status: 201 }));
    await provider.createSession({ reference: "pp-1", callbackUrl: "https://x/ritorno", expected: { firstName: "Mario", lastName: "Rossi", dateOfBirth: "1980-01-01" } });
    const sent = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(sent.expected_details).toEqual({ first_name: "Mario", last_name: "Rossi", date_of_birth: "1980-01-01" });
    // In prova niente dati attesi: la data finta di Didit farebbe rifiutare tutto.
    await new DiditIdentityProvider("key", "workflow", secret, true).createSession({ reference: "pp-1", callbackUrl: "https://x/ritorno", expected: { firstName: "Mario", lastName: "Rossi", dateOfBirth: "1980-01-01" } });
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body)).expected_details).toBeUndefined();
    fetchMock.mockRestore();
  });

  it("legge i codici degli avvisi che spiegano un rifiuto", () => {
    const decision = diditDecision({
      status: "Declined",
      id_verifications: [{ status: "Declined", warnings: [{ risk: "DOCUMENT_EXPIRED", short_description: "Documento scaduto" }] }],
      face_matches: [{ warnings: [{ risk: "LOW_FACE_MATCH_SIMILARITY" }] }],
    });
    expect(decision.warnings).toEqual(["DOCUMENT_EXPIRED", "LOW_FACE_MATCH_SIMILARITY"]);
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
    expect(identityVerificationNeeded({ isDemo: false, verified: false, identityExpiredAt: null })).toBe(false);
    process.env.DIDIT_API_KEY = "k";
    process.env.DIDIT_WORKFLOW_ID = "w";
    expect(identityVerificationNeeded({ isDemo: false, verified: false, identityExpiredAt: null })).toBe(true);
    expect(identityVerificationNeeded({ isDemo: true, verified: false, identityExpiredAt: null })).toBe(false);
    expect(identityVerificationNeeded({ isDemo: false, verified: true, identityExpiredAt: null })).toBe(false);
    // Badge tolto per documento scaduto (§335): si continua a inviare preventivi mentre si rifà la verifica.
    expect(identityVerificationNeeded({ isDemo: false, verified: false, identityExpiredAt: new Date() })).toBe(false);
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
      warnings: [],
      reason: null,
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
      warnings: [],
      reason: null,
    });
    expect(updated.status).toBe("DECLINED");
    expect(updated.reason).toContain("correggilo");
    expect(verification.markVerifiedByProvider).not.toHaveBeenCalled();
    expect(notifications.notify).toHaveBeenCalledWith("u-1", "IDENTITY_VERIFICATION_DECLINED", expect.anything());
  });

  it("rifiutata o da rivedere per il fornitore: avviso al professionista, che riprova da solo", async () => {
    const { service, row, notifications } = build();
    await service.apply(row as never, { providerStatus: "Declined", outcome: "DECLINED", person: null, warnings: [], reason: null });
    expect(notifications.notify).toHaveBeenCalledWith("u-1", "IDENTITY_VERIFICATION_DECLINED", expect.anything());
    const inReview = await service.apply(row as never, { providerStatus: "In Review", outcome: "REVIEW", person: null, warnings: [], reason: null });
    expect(inReview.status).toBe("DECLINED");
  });

  it("il motivo preciso del fornitore arriva al professionista (§272)", async () => {
    const { service, row } = build();
    const updated = await service.apply(row as never, { providerStatus: "Declined", outcome: "DECLINED", person: null, warnings: ["DOCUMENT_EXPIRED"], reason: "Il documento è scaduto." });
    expect(updated.reason).toBe("Il documento è scaduto.");
  });

  it("ambiente di prova di Didit: approvata anche con i dati finti del documento", async () => {
    const { service, row, verification } = build();
    (service as unknown as { provider: unknown }).provider = { name: "didit", sandbox: true };
    const updated = await service.apply(row as never, {
      providerStatus: "Approved",
      outcome: "APPROVED",
      person: { firstName: "Gustavo", lastName: "Matsumoto", dateOfBirth: "1990-06-15", personalNumber: null },
      warnings: [],
      reason: null,
    });
    expect(updated.status).toBe("APPROVED");
    expect(verification.markVerifiedByProvider).toHaveBeenCalled();
  });
});

describe("servizio di verifica che non risponde (§256)", () => {
  const fiscal = { entityType: "PRIVATE_INDIVIDUAL", fiscalFirstName: "Mario", fiscalLastName: "Rossi", dateOfBirth: new Date("1980-01-01"), fiscalCodiceFiscale: "RSSMRA80A01H501U", fiscalDataCompleteAt: new Date(), fiscalDeclarationAcceptedAt: new Date(), foreignTin: null, businessName: null, vatNumber: null, registeredStreet: "Via Roma 1", registeredCity: "Milano", registeredPostalCode: "20100", taxIdChecks: [], representative: null };

  function build(createSession: () => Promise<{ sessionId: string; url: string }>) {
    const rows: Record<string, unknown>[] = [];
    const prisma = {
      professionalProfile: { findUnique: vi.fn().mockResolvedValue({ id: "pp-1", userId: "u-1", isDemo: false, verified: false, deletedAt: null, fiscalProfile: fiscal }) },
      professionalFiscalProfile: { findUnique: vi.fn().mockResolvedValue(fiscal) },
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
    const provider = { name: "didit", sandbox: false, createSession: vi.fn(createSession), getDecision: vi.fn(), verifyWebhook: vi.fn(), consoleUrl: () => null };
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

describe("email \"Completa il profilo\" (§261)", () => {
  it("elenca solo quello che manca, i pagamenti online solo dove sono attivi", () => {
    expect(profileSetupMissing({ publicVisible: false, canSendQuotes: false }, false, true)).toEqual(["SEARCH", "QUOTES"]);
    expect(profileSetupMissing({ publicVisible: true, canSendQuotes: true }, false, true)).toEqual(["ONLINE_PAYMENTS"]);
    expect(profileSetupMissing({ publicVisible: true, canSendQuotes: false }, false, false)).toEqual(["QUOTES"]);
    expect(profileSetupMissing({ publicVisible: true, canSendQuotes: true }, true, true)).toEqual([]);
  });

  it("il giorno dopo l'iscrizione e dopo una settimana, mai di più (§262)", () => {
    const day = 24 * 60 * 60_000;
    const now = new Date("2026-10-20T09:00:00Z");
    const ago = (days: number) => new Date(now.getTime() - days * day);
    expect(setupReminderDue({ profileCreatedAt: ago(0.5), sent: 0, lastSentAt: null, now })).toBe(false);
    expect(setupReminderDue({ profileCreatedAt: ago(1), sent: 0, lastSentAt: null, now })).toBe(true);
    expect(setupReminderDue({ profileCreatedAt: ago(2), sent: 1, lastSentAt: ago(1), now })).toBe(false);
    expect(setupReminderDue({ profileCreatedAt: ago(5), sent: 1, lastSentAt: ago(4), now })).toBe(false);
    expect(setupReminderDue({ profileCreatedAt: ago(7), sent: 1, lastSentAt: ago(6), now })).toBe(true);
    expect(setupReminderDue({ profileCreatedAt: ago(8), sent: 2, lastSentAt: ago(1), now })).toBe(false);
    expect(setupReminderDue({ profileCreatedAt: ago(12), sent: 1, lastSentAt: ago(11), now })).toBe(false);
  });
});

describe("tentativi del giorno (§276)", () => {
  it("si contano dalla mezzanotte di Roma, non dalle ultime 24 ore", () => {
    // Ora legale (UTC+2): le 14:48 del 21 ottobre a Roma.
    expect(startOfRomeDay(new Date("2026-10-21T12:48:00Z")).toISOString()).toBe("2026-10-20T22:00:00.000Z");
    // Ora solare (UTC+1).
    expect(startOfRomeDay(new Date("2026-12-05T08:00:00Z")).toISOString()).toBe("2026-12-04T23:00:00.000Z");
    // Le 00:30 a Roma sono già il giorno nuovo.
    expect(startOfRomeDay(new Date("2026-12-04T23:30:00Z")).toISOString()).toBe("2026-12-04T23:00:00.000Z");
    // Giorno del cambio d'ora (25 ottobre): mezzanotte era ancora in ora legale.
    expect(startOfRomeDay(new Date("2026-10-25T12:00:00Z")).toISOString()).toBe("2026-10-24T22:00:00.000Z");
  });
});

describe("badge Verificato nel tempo (§335)", () => {
  const now = new Date("2026-11-01T08:00:00Z");
  const approved = (fields: Partial<{ decidedAt: Date; documentExpiresAt: Date | null; expiryRemindedAt: Date | null }>) => ({
    createdAt: new Date("2026-10-25T10:00:00Z"),
    decidedAt: new Date("2026-10-25T10:00:00Z"),
    documentExpiresAt: null,
    expiryRemindedAt: null,
    ...fields,
  });

  it("dal documento si legge solo la scadenza", () => {
    const decision = diditDecision({ status: "Approved", id_verifications: [{ first_name: "Mario", expiration_date: "2031-03-15" }] });
    expect(decision.documentExpiresAt).toBe("2031-03-15");
    expect(diditDecision({ status: "Approved", id_verifications: [{ date_of_expiry: "2030-01-02T00:00:00Z" }] }).documentExpiresAt).toBe("2030-01-02");
    expect(diditDecision({ status: "Approved" }).documentExpiresAt ?? null).toBeNull();
    expect(documentExpiry("2031-03-15")?.toISOString().slice(0, 10)).toBe("2031-03-15");
    expect(documentExpiry("non è una data")).toBeNull();
  });

  it("senza una verifica approvata con le chiavi vere il badge cade", () => {
    expect(badgeOverTime(null, now)).toBe("REVOKE_SANDBOX");
  });

  it("avviso 30 giorni prima della scadenza, una volta sola, poi badge tolto", () => {
    expect(badgeOverTime(approved({ documentExpiresAt: new Date("2027-05-01T00:00:00Z") }), now)).toBe("KEEP");
    expect(badgeOverTime(approved({ documentExpiresAt: new Date("2026-11-20T00:00:00Z") }), now)).toBe("REMIND");
    expect(badgeOverTime(approved({ documentExpiresAt: new Date("2026-11-20T00:00:00Z"), expiryRemindedAt: now }), now)).toBe("KEEP");
    expect(badgeOverTime(approved({ documentExpiresAt: new Date("2026-10-31T00:00:00Z"), expiryRemindedAt: now }), now)).toBe("REVOKE_EXPIRED");
  });

  it("senza data di scadenza la verifica vale 5 anni", () => {
    const old = approved({ decidedAt: new Date("2021-10-30T10:00:00Z") });
    expect(badgeOverTime(old, now)).toBe("REVOKE_EXPIRED");
    expect(badgeOverTime(approved({ decidedAt: new Date("2021-11-20T10:00:00Z") }), now)).toBe("REMIND");
  });

  function buildCron(sandbox: boolean, rows: Record<string, unknown>) {
    const prisma = {
      professionalProfile: { findMany: vi.fn().mockResolvedValue(Object.keys(rows).map((id) => ({ id, userId: `u-${id}` }))) },
      identityVerification: {
        findFirst: vi.fn(async ({ where }: { where: { professionalProfileId: string; sandbox: boolean } }) => {
          expect(where.sandbox).toBe(false);
          return rows[where.professionalProfileId] ?? null;
        }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const verification = { revokeOverTime: vi.fn() };
    const notifications = { notify: vi.fn() };
    const service = new IdentityVerificationService(prisma as never, { record: vi.fn() } as never, notifications as never, verification as never);
    (service as unknown as { provider: unknown }).provider = { name: "didit", sandbox };
    return { service, prisma, verification, notifications };
  }

  it("con le chiavi vere: badge di prova e documenti scaduti tolti, avviso a chi scade presto", async () => {
    const { service, verification, notifications } = buildCron(false, {
      prova: null,
      scaduto: { id: "iv-s", ...approved({ documentExpiresAt: new Date("2026-10-30T00:00:00Z") }) },
      inScadenza: { id: "iv-i", ...approved({ documentExpiresAt: new Date("2026-11-20T00:00:00Z") }) },
      valido: { id: "iv-v", ...approved({ documentExpiresAt: new Date("2030-01-01T00:00:00Z") }) },
    });
    await service.checkBadgesOverTime(now);
    expect(verification.revokeOverTime).toHaveBeenCalledWith("prova", SANDBOX_BADGE_REASON, false);
    expect(verification.revokeOverTime).toHaveBeenCalledWith("scaduto", EXPIRED_BADGE_REASON, true);
    expect(verification.revokeOverTime).toHaveBeenCalledTimes(2);
    expect(notifications.notify).toHaveBeenCalledTimes(1);
    expect(notifications.notify).toHaveBeenCalledWith("u-inScadenza", "IDENTITY_VERIFICATION_EXPIRING", { expiresOn: "2026-11-20T00:00:00.000Z" });
  });

  it("in prova (DIDIT_SANDBOX) non si tocca nessun badge", async () => {
    const { service, prisma, verification } = buildCron(true, { prova: null });
    await service.checkBadgesOverTime(now);
    expect(prisma.professionalProfile.findMany).not.toHaveBeenCalled();
    expect(verification.revokeOverTime).not.toHaveBeenCalled();
  });

  it("verifica approvata: si salva la scadenza del documento", async () => {
    const row = { id: "iv-1", professionalProfileId: "pp-1", provider: "didit", providerSessionId: "s", status: "STARTED", providerStatus: null, decidedAt: null };
    const update = vi.fn(async ({ data }) => ({ ...row, ...data }));
    const prisma = {
      professionalProfile: {
        findUnique: vi.fn().mockResolvedValue({
          id: "pp-1",
          userId: "u-1",
          verified: false,
          fiscalProfile: { entityType: "PRIVATE_INDIVIDUAL", fiscalFirstName: "Mario", fiscalLastName: "Rossi", dateOfBirth: new Date("1980-01-01"), fiscalCodiceFiscale: null },
        }),
      },
      identityVerification: { update },
    };
    const service = new IdentityVerificationService(prisma as never, { record: vi.fn() } as never, { notify: vi.fn() } as never, { markVerifiedByProvider: vi.fn() } as never);
    await service.apply(row as never, {
      providerStatus: "Approved",
      outcome: "APPROVED",
      person: { firstName: "Mario", lastName: "Rossi", dateOfBirth: "1980-01-01", personalNumber: null },
      warnings: [],
      reason: null,
      documentExpiresAt: "2031-03-15",
    });
    expect(update.mock.calls[0]![0].data.documentExpiresAt?.toISOString().slice(0, 10)).toBe("2031-03-15");
  });
});
