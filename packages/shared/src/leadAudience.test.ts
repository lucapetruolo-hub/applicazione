import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { leadAudience, leadAudienceLabel } from "./leadAudience";

describe("leadAudience", () => {
  const general = { professionalProfileId: null, forwardedAt: null, chosenProfileIds: [] };

  it("diretta a me, poi inoltrata", () => {
    assert.deepEqual(leadAudience({ ...general, professionalProfileId: "me" }, "me"), { kind: "direct" });
    assert.deepEqual(leadAudience({ ...general, professionalProfileId: "me", forwardedAt: new Date() }, "me"), { kind: "direct_forwarded" });
  });

  it("diretta a un collega e inoltrata a me: a più professionisti", () => {
    assert.deepEqual(leadAudience({ ...general, professionalProfileId: "altro", forwardedAt: new Date() }, "me"), { kind: "shared" });
  });

  it("scelto tra pochi", () => {
    assert.deepEqual(leadAudience({ ...general, chosenProfileIds: ["a", "me", "b"] }, "me"), { kind: "chosen", among: 3 });
  });

  it("richiesta generale", () => {
    assert.deepEqual(leadAudience(general, "me"), { kind: "shared" });
  });

  it("testi dei bollini", () => {
    assert.equal(leadAudienceLabel({ kind: "direct" }), "Solo per te");
    assert.equal(leadAudienceLabel({ kind: "direct_forwarded" }), "Inoltrata anche ad altri");
    assert.equal(leadAudienceLabel({ kind: "chosen", among: 3 }), "Scelto tra 3");
    assert.equal(leadAudienceLabel({ kind: "shared" }), "A più professionisti");
  });
});
