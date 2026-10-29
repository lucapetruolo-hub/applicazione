import { describe, expect, it } from "vitest";
import { bookingSearchWhere, searchEurCents } from "./admin-search";

/** Ricerca negli archivi admin (docs/changelog/2026-10-28-stripe-prova.md). */
describe("ricerca negli archivi admin", () => {
  it("senza testo non filtra nulla", () => {
    expect(bookingSearchWhere("   ")).toBeNull();
  });

  it("cerca cliente, professionista, descrizione e codice, e nome e cognome insieme", () => {
    const where = JSON.stringify(bookingSearchWhere("Mario Bianchi"));
    expect(where).toContain('"businessName":{"contains":"Mario Bianchi"');
    expect(where).toContain('"description":{"contains":"Mario Bianchi"');
    expect(where).toContain('"surname":{"contains":"Bianchi"');
    expect(JSON.stringify(bookingSearchWhere("mario"))).not.toContain('"AND"');
  });

  it("riconosce le cifre in euro scritte in modi diversi", () => {
    expect(searchEurCents("220")).toBe(22000);
    expect(searchEurCents("220,50 €")).toBe(22050);
    expect(searchEurCents("1.200")).toBe(120000);
    expect(searchEurCents("Mario")).toBeNull();
    expect(searchEurCents("0")).toBeNull();
  });
});
