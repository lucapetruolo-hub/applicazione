import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { adminPersonName, isClosedAccountEmail } from "./adminNames";
import { moderationTemplatesFor } from "./moderation";

describe("adminPersonName", () => {
  it("mette insieme attività e persona", () => {
    assert.equal(adminPersonName({ businessName: "Bianchi Impianti Elettrici", name: "Luigi", surname: "Bianchi" }), "Bianchi Impianti Elettrici · Luigi Bianchi");
  });
  it("non ripete il nome se attività e persona coincidono", () => {
    assert.equal(adminPersonName({ businessName: "Luigi Bianchi", name: "Luigi", surname: "Bianchi" }), "Luigi Bianchi");
  });
  it("mai l'email finta di un account chiuso", () => {
    assert.equal(isClosedAccountEmail("deleted-1043bd11@deleted.invalid"), true);
    assert.equal(adminPersonName({ email: "deleted-1043bd11@deleted.invalid" }), "Account chiuso");
    assert.equal(adminPersonName({ email: null, deletedAt: new Date() }), "Account chiuso");
    assert.equal(adminPersonName({ email: "vera@prova.it" }), "vera@prova.it");
  });
});

describe("moderationTemplatesFor", () => {
  it("niente spiegazioni da recensione per un profilo", () => {
    assert.ok(!moderationTemplatesFor("PROFESSIONAL_PROFILE").some((t) => t.label === "Recensione non genuina"));
    assert.ok(moderationTemplatesFor("REVIEW").some((t) => t.label === "Recensione non genuina"));
    assert.ok(!moderationTemplatesFor("REVIEW").some((t) => t.label === "Profilo doppio o copiato"));
  });
});
