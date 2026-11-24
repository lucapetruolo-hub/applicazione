import { describe, expect, it, vi } from "vitest";
import { CASE_ADVICE_DECISIONS } from "@professionisti/shared";
import {
  CaseAdviceService,
  MONEY_RULES,
  adviceCaseId,
  adviceInstructions,
  cleanAnswer,
  jobIssueAdviceId,
  kindStats,
  moneyAdminDecision,
  moneyAgrees,
  unpaidAdviceId,
  type AdviceCase,
} from "./case-advice.service";

/** L'IA propone la decisione nei casi di Da fare (docs/changelog/2026-11-13-admin-ia-propone.md). */
const report: AdviceCase = { kind: "CONTENT_REPORT", caseId: "r1", text: "", allowed: ["DISMISS", "WARN", "HIDE_CONTENT"] };

describe("cleanAnswer", () => {
  it("scarta una decisione fuori elenco", () => {
    expect(cleanAnswer(report, { decision: "SUSPEND_USER", reason: "x" })).toBeNull();
  });

  it("con Lascia toglie regola e spiegazione", () => {
    expect(cleanAnswer(report, { decision: "DISMISS", reason: " ok ", ground: "recensione-falsa-truffa", note: "testo" })).toEqual({ decision: "DISMISS", reason: "ok", ground: null, note: null, draft: null });
  });

  it("con una conseguenza tiene regola e spiegazione", () => {
    const a = cleanAnswer(report, { decision: "HIDE_CONTENT", reason: "insulto", ground: "insulti-minacce", note: "Hai scritto un insulto." });
    expect(a).toMatchObject({ ground: "insulti-minacce", note: "Hai scritto un insulto." });
  });

  it("nei casi di soldi tiene la motivazione e mai una regola", () => {
    const c: AdviceCase = { kind: "JOB_ISSUE", caseId: "i1", text: "", allowed: CASE_ADVICE_DECISIONS.JOB_ISSUE };
    expect(cleanAnswer(c, { decision: "ASK_INFO", reason: "mancano le foto", ground: "insulti-minacce", note: "Manda le foto del lavoro finito." })).toMatchObject({
      ground: null,
      note: "Manda le foto del lavoro finito.",
    });
    const refund: AdviceCase = { kind: "REFUND", caseId: "f1", text: "", allowed: CASE_ADVICE_DECISIONS.REFUND };
    expect(cleanAnswer(refund, { decision: "REFUND_APPROVED", reason: "d'accordo", note: "Accordo tra le parti." })?.note).toBe("Accordo tra le parti.");
  });

  it("per i messaggi solo la bozza, mai una spiegazione", () => {
    const c: AdviceCase = { kind: "CONTACT_MESSAGE", caseId: "m1", text: "", allowed: CASE_ADVICE_DECISIONS.CONTACT_MESSAGE };
    expect(cleanAnswer(c, { decision: "REPLY", reason: "domanda", draft: " Ciao! ", note: "x" })).toMatchObject({ draft: "Ciao!", note: null });
    expect(cleanAnswer(c, { decision: "NO_REPLY", reason: "pubblicità", draft: "Ciao" })?.draft).toBeNull();
  });
});

describe("istruzioni", () => {
  it("i casi di soldi hanno le nostre regole", () => {
    for (const kind of ["JOB_ISSUE", "JOB_ISSUE_APPEAL", "REFUND", "DISPUTE", "BANK_DISPUTE", "UNPAID_BALANCE"] as const) {
      expect(adviceInstructions({ kind, caseId: "x", text: "", allowed: CASE_ADVICE_DECISIONS[kind] })).toContain(MONEY_RULES);
    }
    expect(MONEY_RULES).toContain("100%");
    expect(MONEY_RULES).toContain("le decide il sito da solo");
  });
});

describe("problemi sul lavoro: un giro per volta", () => {
  it("dopo le informazioni chieste serve una proposta nuova", () => {
    expect(jobIssueAdviceId({ id: "i1", infoRespondedAt: null })).toBe("i1");
    const id = jobIssueAdviceId({ id: "i1", infoRespondedAt: new Date("2026-11-13T10:00:00Z") });
    expect(id).not.toBe("i1");
    expect(adviceCaseId(id)).toBe("i1");
  });
});

describe("com'è finito un caso di soldi", () => {
  const createdAt = new Date("2026-11-13T10:00:00Z");
  const issue = { kind: "JOB_ISSUE" as const, status: "OPEN", refundPercent: null, paidOnline: true, autoDecision: null, infoRequestedAt: null };

  it("problema sul lavoro", () => {
    expect(moneyAdminDecision(issue, createdAt)).toBeUndefined();
    expect(moneyAdminDecision({ ...issue, infoRequestedAt: new Date("2026-11-13T11:00:00Z") }, createdAt)).toBe("ASK_INFO");
    expect(moneyAdminDecision({ ...issue, infoRequestedAt: new Date("2026-11-13T09:00:00Z") }, createdAt)).toBeUndefined();
    expect(moneyAdminDecision({ ...issue, status: "UPHELD", refundPercent: 50 }, createdAt)).toBe("UPHELD_50");
    expect(moneyAdminDecision({ ...issue, status: "UPHELD", refundPercent: 100, paidOnline: false }, createdAt)).toBe("UPHELD");
    expect(moneyAdminDecision({ ...issue, status: "REJECTED" }, createdAt)).toBe("REJECTED");
    // Decisa dal sito perché il professionista non ha risposto: non si conta.
    expect(moneyAdminDecision({ ...issue, status: "UPHELD", autoDecision: "NO_EVIDENCE" }, createdAt)).toBeNull();
    expect(moneyAdminDecision({ ...issue, status: "RESOLVED" }, createdAt)).toBeNull();
    expect(moneyAdminDecision(null, createdAt)).toBeNull();
  });

  it("richiesta di rivedere, rimborso, contestazione", () => {
    expect(moneyAdminDecision({ kind: "JOB_ISSUE_APPEAL", appealDecision: null }, createdAt)).toBeUndefined();
    expect(moneyAdminDecision({ kind: "JOB_ISSUE_APPEAL", appealDecision: "ACCEPTED" }, createdAt)).toBe("APPEAL_ACCEPTED");
    expect(moneyAdminDecision({ kind: "REFUND", status: "REQUESTED" }, createdAt)).toBeUndefined();
    expect(moneyAdminDecision({ kind: "REFUND", status: "PROCESSED" }, createdAt)).toBe("REFUND_APPROVED");
    expect(moneyAdminDecision({ kind: "REFUND", status: "REJECTED" }, createdAt)).toBe("REFUND_REJECTED");
    expect(moneyAdminDecision({ kind: "DISPUTE", status: "UNDER_REVIEW" }, createdAt)).toBeUndefined();
    expect(moneyAdminDecision({ kind: "DISPUTE", status: "CLOSED" }, createdAt)).toBe("CLOSED");
  });

  it("contestazione in banca e saldo non pagato", () => {
    expect(moneyAdminDecision({ kind: "BANK_DISPUTE", evidenceSent: false, open: true }, createdAt)).toBeUndefined();
    expect(moneyAdminDecision({ kind: "BANK_DISPUTE", evidenceSent: true, open: false }, createdAt)).toBe("CONTEST");
    expect(moneyAdminDecision({ kind: "BANK_DISPUTE", evidenceSent: false, open: false }, createdAt)).toBe("DONT_CONTEST");
    expect(moneyAdminDecision({ kind: "UNPAID_BALANCE", stillUnpaid: true, paidByClient: false }, createdAt)).toBeUndefined();
    expect(moneyAdminDecision({ kind: "UNPAID_BALANCE", stillUnpaid: false, paidByClient: true }, createdAt)).toBe("WAIT");
    expect(moneyAdminDecision({ kind: "UNPAID_BALANCE", stillUnpaid: false, paidByClient: false }, createdAt)).toBe("CLOSE");
    const id = unpaidAdviceId({ id: "j1", balanceUnpaidAt: createdAt });
    expect(adviceCaseId(id)).toBe("j1");
  });

  it("con il pagamento diretto conta solo accogli o respingi", () => {
    expect(moneyAgrees("UPHELD_100", "UPHELD")).toBe(true);
    expect(moneyAgrees("UPHELD_50", "UPHELD_100")).toBe(false);
    expect(moneyAgrees("REJECTED", "UPHELD")).toBe(false);
  });
});

describe("kindStats", () => {
  it("conta le decisioni e tiene le ultime diverse", () => {
    const at = new Date("2026-11-13T10:00:00Z");
    const stats = kindStats("REFUND", [
      { caseId: "a", decision: "REFUND_APPROVED", adminDecision: "REFUND_APPROVED", agrees: true, reason: "r", adminDecidedAt: at },
      { caseId: "b", decision: "REFUND_APPROVED", adminDecision: "REFUND_REJECTED", agrees: false, reason: "r", adminDecidedAt: at },
      { caseId: "c", decision: "REFUND_APPROVED", adminDecision: null, agrees: null, reason: "r", adminDecidedAt: at },
    ]);
    expect(stats).toMatchObject({ decided: 2, agreed: 1 });
    expect(stats.disagreements.map((d) => d.caseId)).toEqual(["b"]);
  });
});

describe("chi vede le proposte", () => {
  it("la finanza vede rimborsi e problemi sul lavoro, non le segnalazioni", async () => {
    const prisma = { user: { findUnique: vi.fn().mockResolvedValue({ adminRoles: ["FINANCE"] }) } };
    const kinds = await new CaseAdviceService(prisma as never).kindsFor("u1");
    expect(kinds).toEqual(expect.arrayContaining(["REFUND", "DISPUTE", "BANK_DISPUTE", "UNPAID_BALANCE", "JOB_ISSUE", "JOB_ISSUE_APPEAL"]));
    expect(kinds).not.toContain("CONTENT_REPORT");
  });
});

/** Proposte sempre visibili, anche col piano gratuito di Render (docs/changelog/2026-11-24-proposte-ia-sempre.md). */
describe("giro delle proposte", () => {
  const caseA: AdviceCase = { kind: "CONTENT_REPORT", caseId: "a", text: "", allowed: ["DISMISS", "HIDE_CONTENT"] };
  const caseB: AdviceCase = { kind: "CONTACT_MESSAGE", caseId: "b", text: "", allowed: ["REPLY", "NO_REPLY"] };

  function service(answers: Record<string, unknown>) {
    const upsert = vi.fn().mockResolvedValue({});
    const prisma = { adminCaseAdvice: { upsert, findMany: vi.fn().mockResolvedValue([]), findFirst: vi.fn().mockResolvedValue(null) } };
    const s = new CaseAdviceService(prisma as never);
    vi.spyOn(s, "reconcileMoney").mockResolvedValue();
    (s as unknown as { ask: (c: AdviceCase) => Promise<unknown> }).ask = async (c) => answers[c.caseId];
    return { s, upsert, prisma };
  }

  it("un caso che non va non ferma gli altri e il giro dice com'è andata", async () => {
    process.env.ANTHROPIC_API_KEY = "prova";
    const { s, upsert } = service({ a: { ok: false, error: "l'IA non risponde" }, b: { ok: true, answer: { decision: "NO_REPLY", reason: "pubblicità", draft: null } } });
    vi.spyOn(s, "casesWithoutAdvice").mockResolvedValue([caseA, caseB]);
    const log = vi.spyOn((s as unknown as { logger: { log: (m: string) => void } }).logger, "log").mockImplementation(() => undefined);
    expect(await s.runAdvice("prova")).toBe(1);
    expect(upsert).toHaveBeenCalledTimes(1);
    expect(log.mock.calls[0]?.[0]).toContain("2 casi senza proposta, 1 pronte, 1 non riuscite");
  });

  it("un giro alla volta: la seconda chiamata aspetta la prima", async () => {
    process.env.ANTHROPIC_API_KEY = "prova";
    const { s } = service({});
    const cases = vi.spyOn(s, "casesWithoutAdvice").mockResolvedValue([]);
    await Promise.all([s.runAdvice("uno"), s.runAdvice("due")]);
    expect(cases).toHaveBeenCalledTimes(1);
  });

  it("chiesta a mano: senza proposta dice il perché", async () => {
    process.env.ANTHROPIC_API_KEY = "prova";
    const { s } = service({ a: { ok: false, error: "l'IA ha proposto \"SUSPEND_USER\", che per questo caso non si può scegliere" } });
    vi.spyOn(s, "casesWithoutAdvice").mockResolvedValue([caseA]);
    expect(await s.adviseNow("CONTENT_REPORT", "a")).toEqual({ ok: false, error: "l'IA ha proposto \"SUSPEND_USER\", che per questo caso non si può scegliere" });
  });

  it("chiesta a mano su un caso già deciso", async () => {
    process.env.ANTHROPIC_API_KEY = "prova";
    const { s } = service({});
    vi.spyOn(s, "casesWithoutAdvice").mockResolvedValue([]);
    expect(await s.adviseNow("CONTENT_REPORT", "x")).toEqual({ ok: false, error: "il caso non è più da decidere, oppure il contenuto non c'è più" });
  });
});

describe("giro all'apertura di Admin", () => {
  it("non parte se un giro è partito da meno di 5 minuti", () => {
    process.env.ANTHROPIC_API_KEY = "prova";
    const s = new CaseAdviceService({} as never);
    const run = vi.spyOn(s, "runAdvice").mockResolvedValue(0);
    s.kickIfIdle(new Date(Date.now() - 60_000));
    expect(run).not.toHaveBeenCalled();
  });
});
