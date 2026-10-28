import { describe, expect, it } from "vitest";
import { auditLabel } from "./audit-label";

const row = (entityType: string, fieldName: string | null, newValue: unknown) => ({
  entityType,
  fieldName,
  newValue: newValue === null ? null : JSON.stringify(newValue),
});

describe("auditLabel (registro azioni admin, §350)", () => {
  it("non mostra mai JSON grezzo per i pagamenti", () => {
    expect(auditLabel(row("JobPayment", null, { paymentMethod: "DIRECT", depositEurCents: null, balanceDirect: false }))).toBe(
      "Pagamento scelto: diretto al professionista",
    );
    expect(auditLabel(row("JobPayment", null, { paymentMethod: "MANOVIA", depositEurCents: 2000, balanceDirect: true }))).toBe(
      "Pagamento scelto: online, acconto 20 €, saldo diretto",
    );
    expect(auditLabel(row("JobPayment", null, { paymentMethod: "DIRECT", grossAmountEurCents: 43050 }))).toBe(
      "Importo finale dichiarato: 430,50 € (pagamento diretto)",
    );
    expect(auditLabel(row("JobPayment", "onlineStage", { stage: "RELEASED", payout: 18000 }))).toBe(
      "Pagamento online: soldi sbloccati al professionista, 180 € al professionista",
    );
  });

  it("dati fiscali con il nome del campo in italiano", () => {
    expect(auditLabel(row("ProfessionalFiscalProfile", "registeredCity", "Latina"))).toBe('Dati fiscali: città "Latina"');
    expect(auditLabel(row("ProfessionalFiscalProfile", "entityType", "PRIVATE_INDIVIDUAL"))).toBe('Dati fiscali: tipo di attività "lavoro occasionale"');
    expect(auditLabel(row("ProfessionalFiscalProfile", "dateOfBirth", "1990-07-21T00:00:00.000Z"))).toBe('Dati fiscali: data di nascita "21 luglio 1990"');
    expect(auditLabel(row("ProfessionalFiscalProfile", "taxIdCheck.partitaIva", "INVALID"))).toBe("Controllo partita IVA: non valido");
  });

  it("moderazione, ruoli e verifiche come prima", () => {
    expect(auditLabel({ entityType: "ContentReport", fieldName: "status", newValue: JSON.stringify("RESOLVED:HIDE_CONTENT") })).toBe(
      "Segnalazione accolta: contenuto nascosto",
    );
    expect(auditLabel({ entityType: "User", fieldName: "suspendedAt", newValue: JSON.stringify("SUSPENDED") })).toBe("Account sospeso");
    expect(auditLabel({ entityType: "User", fieldName: "adminRoles", newValue: JSON.stringify("MODERATOR+FINANCE") })).toBe(
      "Ruolo cambiato in moderatore + finanza",
    );
    expect(auditLabel(row("ProfessionalProfile", "verified", false))).toBe('Badge "Verificato" tolto');
    expect(auditLabel(row("Conversation", "read", null))).toBe("Conversazione letta da un admin");
    expect(auditLabel(row("CourtesyDocument", "read", null))).toBe("Documento dato al cliente aperto da un admin");
  });

  it("un campo sconosciuto non mostra il valore grezzo", () => {
    expect(auditLabel(row("Qualcosa", "nuovoCampo", { a: 1 }))).toBe("Modifica registrata");
  });
});
