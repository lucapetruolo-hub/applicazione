import { describe, expect, it } from "vitest";
import { stripeAccountPrefill, type StripeAccountPrefillInput } from "./stripe-account-prefill";

const base: StripeAccountPrefillInput = {
  email: "mario@example.com",
  phone: "+393331234567",
  profile: { id: "d37441d5-278f-4043-b448-35e72df2ee4b", businessName: "Idraulica Rossi", city: "Latina", category: { slug: "idraulico", label: "Idraulico" } },
  fiscal: {
    entityType: "PRIVATE_INDIVIDUAL",
    fiscalFirstName: "Mario",
    fiscalLastName: "Rossi",
    fiscalCodiceFiscale: "rssmra90a01e472b",
    dateOfBirth: new Date("1990-01-01T00:00:00.000Z"),
    businessName: null,
    vatNumber: null,
    registeredStreet: "Via Roma",
    registeredHouseNumber: "1",
    registeredCity: "Latina",
    registeredPostalCode: "04100",
    registeredCountry: "IT",
  },
  frontendUrl: "https://applicazione-web.vercel.app/",
};

describe("stripeAccountPrefill", () => {
  it("manda a Stripe i dati della persona già scritti nei dati fiscali", () => {
    const prefill = stripeAccountPrefill(base);

    expect(prefill.identity).toEqual({
      country: "IT",
      entity_type: "individual",
      individual: {
        given_name: "Mario",
        surname: "Rossi",
        email: "mario@example.com",
        phone: "+393331234567",
        address: { country: "IT", line1: "Via Roma 1", postal_code: "04100", city: "Latina" },
        date_of_birth: { day: 1, month: 1, year: 1990 },
        id_numbers: [{ type: "it_cf", value: "RSSMRA90A01E472B" }],
      },
    });
    expect(prefill.mcc).toBe("1711");
    expect(prefill.defaults?.profile).toEqual({
      business_url: "https://applicazione-web.vercel.app/professionista/idraulica-rossi-latina-d37441d5-278f-4043-b448-35e72df2ee4b",
      doing_business_as: "Idraulica Rossi",
      product_description: "Idraulico a Latina: interventi richiesti e pagati tramite Professionisti.",
    });
  });

  it("non inventa ciò che manca: telefono senza prefisso e indirizzo vuoto li chiede Stripe", () => {
    const prefill = stripeAccountPrefill({ ...base, phone: "3331234567", fiscal: { ...base.fiscal, registeredStreet: null } });

    expect(prefill.identity?.individual?.phone).toBeUndefined();
    expect(prefill.identity?.individual?.address).toBeUndefined();
  });

  it("per un'azienda manda ragione sociale, sede e partita IVA, non i dati della persona", () => {
    const prefill = stripeAccountPrefill({
      ...base,
      fiscal: { ...base.fiscal, entityType: "BUSINESS", businessName: "Rossi Impianti Srl", vatNumber: "IT01234567890" },
    });

    expect(prefill.identity?.entity_type).toBe("company");
    expect(prefill.identity?.individual).toBeUndefined();
    expect(prefill.identity?.business_details).toEqual({
      registered_name: "Rossi Impianti Srl",
      address: { country: "IT", line1: "Via Roma 1", postal_code: "04100", city: "Latina" },
      phone: "+393331234567",
      id_numbers: [{ type: "it_vat", value: "01234567890" }],
    });
  });
});
