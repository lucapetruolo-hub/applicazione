import { describe, expect, it } from "vitest";
import {
  jobIssueAutoDecision,
  jobIssueAutoEscalation,
  jobIssueCanAppeal,
  jobIssueCanEscalate,
  jobIssueReviewPhase,
  jobIssueOutcomeText,
  jobIssueSanctionFor,
  professionalRestrictions,
  reportJobIssueSchema,
} from "@professionisti/shared";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const created = new Date("2026-09-20T09:00:00Z");
const after = (ms: number) => new Date(created.getTime() + ms);

describe("scadenze sul modello Amazon A-Z (§167)", () => {
  const chat = { status: "CHAT", createdAt: created, proRepliedAt: null as Date | null };
  it("chat: il professionista ha 48 ore, poi passa da sola al team", () => {
    expect(jobIssueAutoEscalation(chat, after(47 * HOUR))).toBeNull();
    expect(jobIssueAutoEscalation(chat, after(48 * HOUR))).toBe("PRO_NO_REPLY");
    expect(jobIssueAutoEscalation({ ...chat, proRepliedAt: after(HOUR) }, after(10 * DAY))).toBeNull();
  });
  it("il cliente passa al team dopo una risposta non soddisfacente o dopo 48 ore", () => {
    expect(jobIssueCanEscalate(chat, after(HOUR))).toBe(false);
    expect(jobIssueCanEscalate({ ...chat, proRepliedAt: after(HOUR) }, after(2 * HOUR))).toBe(true);
    expect(jobIssueCanEscalate(chat, after(48 * HOUR))).toBe(true);
  });
  const open = { status: "OPEN", escalatedAt: created, professionalRespondedAt: null as Date | null, infoRequestedAt: null as Date | null, infoRespondedAt: null as Date | null };
  it("in esame: 72 ore per la versione del professionista, poi accolta automaticamente", () => {
    expect(jobIssueReviewPhase(open)).toEqual({ phase: "AWAITING_EVIDENCE", dueAt: after(72 * HOUR) });
    expect(jobIssueAutoDecision(open, after(71 * HOUR))).toBeNull();
    expect(jobIssueAutoDecision(open, after(72 * HOUR))).toBe("NO_EVIDENCE");
  });
  it("con la versione del professionista l'admin decide entro 2 giorni, niente decisione automatica", () => {
    const answered = { ...open, professionalRespondedAt: after(10 * HOUR) };
    expect(jobIssueReviewPhase(answered)).toEqual({ phase: "TO_DECIDE", dueAt: after(58 * HOUR) });
    expect(jobIssueAutoDecision(answered, after(30 * DAY))).toBeNull();
  });
  it("informazioni richieste: 72 ore, poi accolta automaticamente", () => {
    const asked = { ...open, professionalRespondedAt: after(HOUR), infoRequestedAt: after(DAY) };
    expect(jobIssueReviewPhase(asked)).toEqual({ phase: "AWAITING_INFO", dueAt: after(DAY + 72 * HOUR) });
    expect(jobIssueAutoDecision(asked, after(DAY + 72 * HOUR))).toBe("NO_INFO");
    const replied = { ...asked, infoRespondedAt: after(2 * DAY) };
    expect(jobIssueReviewPhase(replied)).toEqual({ phase: "TO_DECIDE", dueAt: after(4 * DAY) });
  });
  it("la risposta alle informazioni vale come versione del professionista", () => {
    const onlyInfo = { ...open, infoRequestedAt: after(HOUR), infoRespondedAt: after(2 * HOUR) };
    expect(jobIssueReviewPhase(onlyInfo)).toEqual({ phase: "TO_DECIDE", dueAt: after(50 * HOUR) });
    expect(jobIssueAutoDecision(onlyInfo, after(10 * DAY))).toBeNull();
  });
});

describe("misure progressive (§167)", () => {
  it("1ª avvertimento, 2ª più in basso, 3ª e oltre niente nuove richieste", () => {
    expect(jobIssueSanctionFor(1)).toBe("WARNING");
    expect(jobIssueSanctionFor(2)).toBe("DEMOTED");
    expect(jobIssueSanctionFor(3)).toBe("BLOCKED");
    expect(jobIssueSanctionFor(5)).toBe("BLOCKED");
  });
  it("le restrizioni valgono solo fino alla scadenza", () => {
    const p = { demotedUntil: after(14 * DAY), requestsBlockedUntil: null };
    expect(professionalRestrictions(p, after(DAY))).toEqual({ demoted: true, blocked: false });
    expect(professionalRestrictions(p, after(15 * DAY))).toEqual({ demoted: false, blocked: false });
  });
});

describe("ricorso del professionista (§167)", () => {
  const upheld = { status: "UPHELD", resolvedAt: created, appealedAt: null };
  it("entro 30 giorni da una decisione accolta", () => {
    expect(jobIssueCanAppeal(upheld, after(29 * DAY))).toBe(true);
    expect(jobIssueCanAppeal(upheld, after(31 * DAY))).toBe(false);
  });
  it("una sola volta, e mai su una respinta", () => {
    expect(jobIssueCanAppeal({ ...upheld, appealedAt: after(DAY) }, after(2 * DAY))).toBe(false);
    expect(jobIssueCanAppeal({ ...upheld, status: "REJECTED" }, after(DAY))).toBe(false);
  });
});

describe("prove minime ed esito standard (§167)", () => {
  it("lavoro non andato bene: serve almeno una foto", () => {
    expect(reportJobIssueSchema.safeParse({ type: "BAD_WORK", description: "Perdite dal lavandino", photoUrls: [] }).success).toBe(false);
    expect(
      reportJobIssueSchema.safeParse({ type: "BAD_WORK", description: "Perdite dal lavandino", photoUrls: ["https://x.it/a.jpg"] }).success,
    ).toBe(true);
    expect(reportJobIssueSchema.safeParse({ type: "NO_SHOW", description: "Non è mai arrivato", photoUrls: [] }).success).toBe(true);
  });
  it("il professionista con esito accolto legge del ricorso, tutti leggono di mediazione e giudice", () => {
    const pro = jobIssueOutcomeText({ type: "NO_SHOW", decision: "UPHELD", note: "Nessuna risposta.", audience: "professional" });
    const client = jobIssueOutcomeText({ type: "NO_SHOW", decision: "UPHELD", note: "Nessuna risposta.", audience: "client" });
    expect(pro).toContain("ricorso");
    expect(client).not.toContain("ricorso");
    expect(client).toContain("giudice");
  });
  it("pagato sul sito con Stripe: il cliente legge del rimborso", () => {
    const online = jobIssueOutcomeText({ type: "BAD_WORK", decision: "UPHELD", note: "Difetti.", audience: "client", paidOnline: true });
    const direct = jobIssueOutcomeText({ type: "BAD_WORK", decision: "UPHELD", note: "Difetti.", audience: "client" });
    expect(online).toContain("rimborsiamo");
    expect(direct).not.toContain("rimborsiamo");
  });
});
