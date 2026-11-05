import { describe, expect, it } from "vitest";
import { describeStripeRequirements } from "./stripe-connect-status";

describe("describeStripeRequirements", () => {
  it("dice in parole semplici cosa chiede Stripe, senza doppioni", () => {
    expect(
      describeStripeRequirements([
        "identity.individual.address.city",
        "identity.individual.address.line1",
        "identity.individual.address.postal_code",
        "identity.individual.date_of_birth.day",
        "identity.individual.date_of_birth.month",
        "identity.individual.date_of_birth.year",
        "identity.individual.given_name",
        "identity.individual.phone",
        "identity.individual.surname",
      ]),
    ).toBe("indirizzo, data di nascita, nome e cognome, telefono");
  });

  it("mette in fondo i campi sconosciuti e non mostra nulla se non manca niente", () => {
    expect(describeStripeRequirements(["qualcosa.di.nuovo", "external_account"])).toBe("conto per i bonifici (IBAN), altri dati");
    expect(describeStripeRequirements([])).toBeNull();
  });
});
