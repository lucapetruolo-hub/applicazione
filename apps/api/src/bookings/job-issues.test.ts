import { describe, expect, it } from "vitest";
import { JOB_ISSUE_LATE_DAYS, clientCanReview, jobIssueAssisted, jobIssueLateAllowed, jobIssueTypesAllowed, toJobIssueSummary } from "@professionisti/shared";

const DAY = 24 * 60 * 60 * 1000;
const start = new Date("2026-09-20T09:00:00Z");
const end = new Date("2026-09-20T11:00:00Z");
const base = { status: "CONFIRMED", scheduledAt: start, scheduledEndAt: end, professionalCompletedAt: null, clientConfirmedCompletedAt: null, hasIssue: false };
const at = (ms: number) => new Date(end.getTime() + ms);

describe("finestre per segnalare un problema (§164)", () => {
  it("prima dell'appuntamento: niente", () => {
    expect(jobIssueTypesAllowed(base, new Date(start.getTime() - 1000))).toEqual([]);
  });
  it("durante l'appuntamento: solo lavoro non andato bene", () => {
    expect(jobIssueTypesAllowed(base, new Date(start.getTime() + 1000))).toEqual(["BAD_WORK"]);
  });
  it("dopo la fine: entrambi fino a 7 giorni, poi niente (collaudo P-04)", () => {
    expect(jobIssueTypesAllowed(base, at(DAY))).toEqual(["NO_SHOW", "BAD_WORK"]);
    expect(jobIssueTypesAllowed(base, at(6.9 * DAY))).toEqual(["NO_SHOW", "BAD_WORK"]);
    expect(jobIssueTypesAllowed(base, at(8 * DAY))).toEqual([]);
  });
  it("i 7 giorni partono dalla chiusura del professionista, se è dopo la fine", () => {
    const closed = { ...base, status: "COMPLETED", professionalCompletedAt: at(3 * DAY) };
    expect(jobIssueTypesAllowed(closed, at(9 * DAY))).toEqual(["BAD_WORK"]);
    expect(jobIssueTypesAllowed(closed, at(11 * DAY))).toEqual([]);
  });
  it("\"Lavoro terminato\" del cliente vale come accettazione: niente più segnalazioni", () => {
    expect(jobIssueTypesAllowed({ ...base, clientConfirmedCompletedAt: at(DAY) }, at(2 * DAY))).toEqual([]);
    expect(jobIssueTypesAllowed({ ...base, status: "COMPLETED", clientConfirmedCompletedAt: at(DAY) }, at(2 * DAY))).toEqual([]);
  });
  it("la conferma d'ufficio allo scadere del termine chiude le segnalazioni (§190)", () => {
    const autoClosed = { ...base, status: "COMPLETED", professionalCompletedAt: at(DAY), clientConfirmedCompletedAt: at(8 * DAY), completionAutoClosedAt: at(8 * DAY) };
    expect(jobIssueTypesAllowed(autoClosed, at(8.5 * DAY))).toEqual([]);
  });
  it("una sola segnalazione per lavoro, niente su lavori annullati", () => {
    expect(jobIssueTypesAllowed({ ...base, hasIssue: true }, at(DAY))).toEqual([]);
    expect(jobIssueTypesAllowed({ ...base, status: "CANCELED" }, at(DAY))).toEqual([]);
  });
});

describe("segnalazione dopo il termine, senza rimborso (decisione di Luca del 30/10/2026)", () => {
  it("dentro i 7 giorni si usa la segnalazione normale", () => {
    expect(jobIssueLateAllowed(base, at(DAY))).toBe(false);
  });
  it("dopo i 7 giorni o dopo \"Lavoro terminato\" resta, fino al limite", () => {
    expect(jobIssueLateAllowed(base, at(8 * DAY))).toBe(true);
    const accepted = { ...base, status: "COMPLETED", clientConfirmedCompletedAt: at(DAY) };
    expect(jobIssueLateAllowed(accepted, at(2 * DAY))).toBe(true);
    expect(jobIssueLateAllowed(accepted, at((JOB_ISSUE_LATE_DAYS + 2) * DAY))).toBe(false);
  });
  it("mai prima dell'appuntamento, su lavori annullati o con una segnalazione già fatta", () => {
    expect(jobIssueLateAllowed(base, new Date(start.getTime() - 1000))).toBe(false);
    expect(jobIssueLateAllowed({ ...base, status: "CANCELED" }, at(8 * DAY))).toBe(false);
    expect(jobIssueLateAllowed({ ...base, hasIssue: true }, at(8 * DAY))).toBe(false);
  });
  it("resta tra le parti anche con il pagamento online", () => {
    expect(jobIssueAssisted("MANOVIA", true)).toBe(false);
    expect(jobIssueAssisted("MANOVIA", false)).toBe(true);
    expect(jobIssueAssisted("DIRECT", false)).toBe(false);
    const row = {
      id: "i1", type: "BAD_WORK" as const, description: "x", photoUrls: [], status: "CHAT" as const, createdAt: at(8 * DAY),
      professionalResponse: null, professionalRespondedAt: null, resolutionNote: null, resolvedAt: null, escalatedAt: null, escalationReason: null,
      infoRequestText: null, infoRequestedAt: null, infoResponse: null, infoRespondedAt: null, autoDecision: null, sanction: null,
      appealedAt: null, appealText: null, appealDecision: null, appealNote: null, redispatchedGuidedRequestId: null, late: true,
    };
    const summary = toJobIssueSummary(row, { paidOnline: true, assisted: true }, at(12 * DAY));
    expect(summary?.late).toBe(true);
    expect(summary?.assisted).toBe(false);
    expect(summary?.chatReplyDueAt).toBeNull();
    // Senza team: il cliente chiude la segnalazione quando vuole.
    expect(summary?.canEscalate).toBe(true);
  });
});

describe("quando il cliente può recensire", () => {
  it("lavoro completato e confermato, senza segnalazioni", () => {
    expect(clientCanReview({ status: "COMPLETED", clientConfirmedCompletedAt: at(0), hasReview: false, issueStatus: null })).toBe(true);
  });
  it("subito dopo il proprio \"lavoro terminato\", anche se il professionista non l'ha ancora segnato (§189)", () => {
    expect(clientCanReview({ status: "CONFIRMED", clientConfirmedCompletedAt: at(0), hasReview: false, issueStatus: null })).toBe(true);
  });
  it("non prima di aver cliccato \"lavoro terminato\", né su un lavoro annullato", () => {
    expect(clientCanReview({ status: "COMPLETED", clientConfirmedCompletedAt: null, hasReview: false, issueStatus: null })).toBe(false);
    expect(clientCanReview({ status: "CANCELED", clientConfirmedCompletedAt: at(0), hasReview: false, issueStatus: null })).toBe(false);
  });
  it("mai con una segnalazione aperta, in chat o in esame", () => {
    expect(clientCanReview({ status: "COMPLETED", clientConfirmedCompletedAt: at(0), hasReview: false, issueStatus: "OPEN" })).toBe(false);
    expect(clientCanReview({ status: "COMPLETED", clientConfirmedCompletedAt: at(0), hasReview: false, issueStatus: "CHAT" })).toBe(false);
  });
  it("dopo un accordo in chat", () => {
    expect(clientCanReview({ status: "CONFIRMED", clientConfirmedCompletedAt: null, hasReview: false, issueStatus: "RESOLVED" })).toBe(true);
  });
  it("dopo la decisione, anche su un lavoro mai chiuso", () => {
    expect(clientCanReview({ status: "CONFIRMED", clientConfirmedCompletedAt: null, hasReview: false, issueStatus: "UPHELD" })).toBe(true);
    expect(clientCanReview({ status: "CONFIRMED", clientConfirmedCompletedAt: null, hasReview: true, issueStatus: "REJECTED" })).toBe(false);
  });
});
