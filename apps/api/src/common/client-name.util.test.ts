import { describe, expect, it } from "vitest";
import { clientNameForProfessional } from "./client-name.util";

describe("clientNameForProfessional", () => {
  it("prima dell'accettazione mostra solo il nome", () => {
    expect(clientNameForProfessional({ name: "Mario", surname: "Rossi" }, false)).toBe("Mario");
  });

  it("dopo l'accettazione mostra nome e cognome", () => {
    expect(clientNameForProfessional({ name: "Mario", surname: "Rossi" }, true)).toBe("Mario Rossi");
  });

  it("senza nome non ricade mai sul cognome prima dell'accettazione", () => {
    expect(clientNameForProfessional({ name: null, surname: "Rossi" }, false)).toBeNull();
    expect(clientNameForProfessional({ name: "  ", surname: "Rossi" }, false)).toBeNull();
  });
});
