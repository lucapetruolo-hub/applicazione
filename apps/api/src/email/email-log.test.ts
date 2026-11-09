import { describe, expect, it } from "vitest";
import { recipientForLog } from "./email.service";

describe("recipientForLog (controllo dell'08/11, E2-05/E1-04)", () => {
  it("nel log niente email in chiaro, solo impronta e dominio", () => {
    const line = recipientForLog("mario.rossi@gmail.com");
    expect(line).not.toContain("mario");
    expect(line).toMatch(/^destinatario [0-9a-f]{12} \(@gmail\.com\)$/);
    expect(recipientForLog("Mario.Rossi@gmail.com")).toBe(line);
  });
});
