import { describe, expect, it } from "vitest";
import { ageInYears, clientNameForProfessional, publicClientName } from "./client-name.util";

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

  it("senza cognome salvato tiene solo la prima parola del nome", () => {
    expect(clientNameForProfessional({ name: "Mario Rossi", surname: null }, false)).toBe("Mario");
    expect(clientNameForProfessional({ name: "Maria Grazia", surname: "De Luca" }, false)).toBe("Maria Grazia");
    expect(clientNameForProfessional({ name: "Mario Rossi", surname: null }, true)).toBe("Mario Rossi");
  });
});

describe("publicClientName", () => {
  it("mostra nome e iniziale del cognome", () => {
    expect(publicClientName({ name: "Mario", surname: "rossi" })).toBe("Mario R.");
    expect(publicClientName({ name: "Mario", surname: null })).toBe("Mario");
    expect(publicClientName({ name: null, surname: "Rossi" })).toBeNull();
    expect(publicClientName({ name: "Mario Rossi", surname: null })).toBe("Mario");
  });
});

describe("ageInYears", () => {
  it("conta gli anni compiuti", () => {
    const now = new Date("2026-10-11T12:00:00Z");
    expect(ageInYears(new Date("1990-10-11"), now)).toBe(36);
    expect(ageInYears(new Date("1990-10-12"), now)).toBe(35);
  });
});
