import { jobPaymentOfferText } from "@professionisti/shared";
import { describe, expect, it } from "vitest";
import { EMPTY_EMAIL_CONTEXT, notificationEmail } from "./notification-emails";

// Come si paga il preventivo, già prima di accettarlo (docs/CHANGELOG.md §337).
describe("jobPaymentOfferText", () => {
  it("un solo modo: dice quale", () => {
    expect(jobPaymentOfferText(["DIRECT"])?.short).toBe("Pagamento diretto");
    expect(jobPaymentOfferText(["ONLINE"], 30)?.long).toContain("acconto del 30%");
    expect(jobPaymentOfferText(["ONLINE"], 100)?.long).toBe("tutto online con carta, accettando");
    expect(jobPaymentOfferText(["MIXED"], 20)?.short).toBe("Acconto online");
  });

  it("più modi: a scelta del cliente", () => {
    expect(jobPaymentOfferText(["ONLINE", "DIRECT"])?.short).toBe("Online o diretto");
  });

  it("nessun modo utilizzabile: niente testo", () => {
    expect(jobPaymentOfferText([])).toBeNull();
  });
});

describe("email Nuovo preventivo", () => {
  const ctx = { ...EMPTY_EMAIL_CONTEXT, name: "Anna", businessName: "Idraulica Rossi" };

  it("mostra come si paga", () => {
    const email = notificationEmail("NEW_QUOTE", { payment: "direttamente al professionista" }, ctx);
    expect(email?.details).toContainEqual({ label: "Pagamento", value: "Direttamente al professionista" });
  });

  it("senza modo nel payload (notifiche vecchie) non mostra la riga", () => {
    const email = notificationEmail("NEW_QUOTE", {}, ctx);
    expect(email?.details?.some((row) => row.label === "Pagamento")).toBe(false);
  });
});
