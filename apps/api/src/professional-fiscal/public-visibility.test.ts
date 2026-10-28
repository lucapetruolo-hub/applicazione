import { afterEach, describe, expect, it } from "vitest";
import { fiscalDataMissing, traderStatusOf } from "@professionisti/shared";
import { publicVisibilityMissing, publicVisibilityWhere, stripeVerified } from "./public-visibility";

const complete = {
  entityType: "PRIVATE_INDIVIDUAL",
  fiscalDeclarationAcceptedAt: new Date(),
  fiscalFirstName: "Mario",
  fiscalLastName: "Rossi",
  fiscalCodiceFiscale: "RSSMRA80A01E472X",
  foreignTin: null,
  dateOfBirth: new Date("1980-01-01"),
  businessName: null,
  vatNumber: null,
  registeredStreet: "Via Roma",
  registeredCity: "Latina",
  registeredPostalCode: "04100",
};

describe("visibilità pubblica con i dati fiscali (§241)", () => {
  afterEach(() => {
    delete process.env.STRIPE_SECRET_KEY;
    delete process.env.LAUNCH_DATE;
  });

  it("dal lancio gli account di prova escono dalla ricerca, prima no (§395)", () => {
    process.env.LAUNCH_DATE = "2026-12-01";
    expect(publicVisibilityWhere(new Date("2026-11-20T10:00:00Z"))).toEqual({});
    expect(publicVisibilityWhere(new Date("2026-12-02T10:00:00Z"))).toEqual({ user: { testAccountAt: null } });
    process.env.STRIPE_SECRET_KEY = "sk_test";
    const where = publicVisibilityWhere(new Date("2026-12-02T10:00:00Z"));
    expect(where.AND).toHaveLength(2);
    expect((where.AND as object[])[1]).toEqual({ user: { testAccountAt: null } });
  });

  it("senza pagamenti attivi nessun filtro", () => {
    expect(publicVisibilityWhere()).toEqual({});
    expect(publicVisibilityMissing({ isDemo: false, fiscalProfile: null })).toBe(false);
    expect(stripeVerified({ stripePayoutsEnabled: true })).toBe(false);
  });

  it("con i pagamenti attivi servono i dati fiscali, non la verifica Stripe", () => {
    process.env.STRIPE_SECRET_KEY = "sk_test";
    expect(publicVisibilityWhere()).toEqual({
      OR: [{ isDemo: true }, { fiscalProfile: { is: { fiscalDataCompleteAt: { not: null }, taxIdChecks: { none: { status: "INVALID" } } } } }],
    });
    expect(publicVisibilityMissing({ isDemo: false, fiscalProfile: null })).toBe(true);
    expect(publicVisibilityMissing({ isDemo: false, fiscalProfile: { fiscalDataCompleteAt: new Date() } })).toBe(false);
    expect(publicVisibilityMissing({ isDemo: true, fiscalProfile: null })).toBe(false);
    // Codice fiscale o P.IVA inesistenti per Openapi: fuori dalla ricerca (§253).
    expect(publicVisibilityMissing({ isDemo: false, fiscalProfile: { fiscalDataCompleteAt: new Date(), taxIdChecks: [{ status: "INVALID" }] } })).toBe(true);
    expect(stripeVerified({ stripePayoutsEnabled: false })).toBe(false);
    expect(stripeVerified({ stripePayoutsEnabled: true })).toBe(true);
  });

  it("dati minimi per ogni tipo", () => {
    expect(fiscalDataMissing(null)).toHaveLength(1);
    expect(fiscalDataMissing(complete)).toEqual([]);
    expect(fiscalDataMissing({ ...complete, fiscalCodiceFiscale: null, foreignTin: "X123" })).toEqual([]);
    expect(fiscalDataMissing({ ...complete, entityType: "SOLE_PROPRIETOR" })).toEqual(["Partita IVA"]);
    expect(fiscalDataMissing({ ...complete, entityType: "BUSINESS", businessName: "Rossi Srl", vatNumber: "01234567890" })).toEqual([]);
    expect(fiscalDataMissing({ ...complete, fiscalDeclarationAcceptedAt: null, registeredCity: " " })).toEqual(["Comune dell'indirizzo", "Dichiarazione di correttezza dei dati"]);
  });

  it("privato o professionista per il cliente", () => {
    expect(traderStatusOf("PRIVATE_INDIVIDUAL")).toBe("PRIVATE");
    expect(traderStatusOf("SOLE_PROPRIETOR")).toBe("TRADER");
    expect(traderStatusOf("BUSINESS")).toBe("TRADER");
    expect(traderStatusOf(null)).toBeNull();
  });
});
