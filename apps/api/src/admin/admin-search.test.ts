import { describe, expect, it } from "vitest";
import { bookingSearchWhere, searchEurCents, userSearchWhere } from "./admin-search";
import { emailFingerprint } from "../common/email-fingerprint";

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

/** Ricerca delle persone (docs/changelog/2026-10-30-admin-persone.md). */
describe("ricerca delle persone in Admin", () => {
  it("con nome e cognome ogni parola deve trovarsi in un campo", () => {
    const where = userSearchWhere("Vera Russo") as { AND: unknown[] };
    expect(where.AND).toHaveLength(2);
    expect(JSON.stringify(where)).toContain('"surname":{"contains":"Russo"');
  });

  it("con un'email esatta cerca anche l'account chiuso dall'impronta, mai dall'email", () => {
    const json = JSON.stringify(userSearchWhere("Vera.Russo@Example.it"));
    expect(json).toContain(emailFingerprint("vera.russo@example.it"));
    expect(JSON.stringify(userSearchWhere("vera"))).not.toContain("deletedEmailHash");
  });

  it("l'impronta non dipende da maiuscole e spazi e non contiene l'email", () => {
    expect(emailFingerprint(" Vera@Example.it ")).toBe(emailFingerprint("vera@example.it"));
    expect(emailFingerprint("vera@example.it")).not.toContain("vera");
  });
});
