import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { bookingToClose, chatTurnOfProfessional, invoiceToDo, issueToDoForProfessional } from "./todayToDo";
import type { JobIssueSummary } from "./jobIssues";

const at = (hour: number) => new Date(Date.UTC(2026, 10, 18, hour));
const ev = (actor: "CLIENT" | "PROFESSIONAL" | "SYSTEM", hour: number, extra: { automatic?: boolean; hidden?: boolean } = {}) => ({
  actor,
  createdAt: at(hour),
  automatic: extra.automatic ?? false,
  hidden: extra.hidden ?? false,
});

describe("chatTurnOfProfessional", () => {
  it("ultimo messaggio scritto dal cliente: tocca al professionista, da quando ha iniziato a scrivere", () => {
    const turn = chatTurnOfProfessional([ev("CLIENT", 12), ev("CLIENT", 10), ev("PROFESSIONAL", 9), ev("CLIENT", 8)]);
    assert.equal(turn?.count, 2);
    assert.equal(turn?.waitingSince.toISOString(), at(10).toISOString());
    assert.equal(turn?.last.createdAt.toISOString(), at(12).toISOString());
  });
  it("il professionista ha risposto per ultimo: niente", () => {
    assert.equal(chatTurnOfProfessional([ev("PROFESSIONAL", 12), ev("CLIENT", 10)]), null);
  });
  it("anche un evento automatico del professionista (preventivo inviato) è una risposta", () => {
    assert.equal(chatTurnOfProfessional([ev("PROFESSIONAL", 12, { automatic: true }), ev("CLIENT", 10)]), null);
  });
  it("messaggi automatici del cliente, del sistema e nascosti non chiedono risposta", () => {
    assert.equal(chatTurnOfProfessional([ev("CLIENT", 13, { automatic: true }), ev("SYSTEM", 12), ev("CLIENT", 11, { hidden: true }), ev("PROFESSIONAL", 9)]), null);
    assert.equal(chatTurnOfProfessional([ev("CLIENT", 13, { automatic: true }), ev("CLIENT", 11)])?.count, 1);
  });
});

const issue = (over: Partial<JobIssueSummary>): JobIssueSummary => ({ status: "CHAT", proRepliedInChat: false, chatReplyDueAt: "2026-11-20T10:00:00.000Z", reviewPhase: null, phaseDueAt: null, ...over }) as JobIssueSummary;

describe("issueToDoForProfessional", () => {
  it("in chat senza risposta del professionista", () => {
    assert.equal(issueToDoForProfessional(issue({}))?.kind, "CHAT_REPLY");
    assert.equal(issueToDoForProfessional(issue({ proRepliedInChat: true })), null);
  });
  it("passata al nostro team: versione o informazioni", () => {
    assert.equal(issueToDoForProfessional(issue({ status: "OPEN", reviewPhase: "AWAITING_EVIDENCE" }))?.kind, "VERSION");
    assert.equal(issueToDoForProfessional(issue({ status: "OPEN", reviewPhase: "AWAITING_INFO" }))?.kind, "INFO");
    assert.equal(issueToDoForProfessional(issue({ status: "OPEN", reviewPhase: "TO_DECIDE" })), null);
    assert.equal(issueToDoForProfessional(issue({ status: "RESOLVED" })), null);
  });
});

describe("bookingToClose", () => {
  const base = { status: "CONFIRMED", scheduledAt: "2026-11-18T08:00:00.000Z", scheduledEndAt: "2026-11-18T12:00:00.000Z", issue: null, refundRequested: false };
  it("confermato e fascia finita", () => {
    assert.equal(bookingToClose(base, at(13)), true);
    assert.equal(bookingToClose(base, at(11)), false);
  });
  it("già chiuso, con un problema aperto o un rimborso chiesto: no", () => {
    assert.equal(bookingToClose({ ...base, status: "COMPLETED" }, at(13)), false);
    assert.equal(bookingToClose({ ...base, refundRequested: true }, at(13)), false);
    assert.equal(bookingToClose({ ...base, issue: issue({}) }, at(13)), false);
  });
});

describe("invoiceToDo", () => {
  it("fattura chiesta a lavoro terminato finché non è fatta", () => {
    assert.equal(invoiceToDo({ status: "COMPLETED", invoiceRequest: { doneAt: null }, clientDocumentKind: "INVOICE" }), true);
    assert.equal(invoiceToDo({ status: "COMPLETED", invoiceRequest: { doneAt: "2026-11-18T10:00:00.000Z" }, clientDocumentKind: "INVOICE" }), false);
    assert.equal(invoiceToDo({ status: "CONFIRMED", invoiceRequest: { doneAt: null }, clientDocumentKind: "INVOICE" }), false);
    assert.equal(invoiceToDo({ status: "COMPLETED", invoiceRequest: null }), false);
  });
  it("ricevuta: sparisce col PDF scaricato, torna se l'importo cambia", () => {
    const receipt = { status: "COMPLETED", invoiceRequest: { doneAt: null }, clientDocumentKind: "RECEIPT" as const };
    assert.equal(invoiceToDo({ ...receipt, courtesyDocument: null }), true);
    assert.equal(invoiceToDo({ ...receipt, courtesyDocument: { pdfDownloadedAt: "x", amountChanged: false } }), false);
    assert.equal(invoiceToDo({ ...receipt, courtesyDocument: { pdfDownloadedAt: "x", amountChanged: true } }), true);
  });
});
