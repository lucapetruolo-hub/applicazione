import { describe, expect, it, vi } from "vitest";
import { AdminSecurityAlertsService, personLabel, roleChangeAlert } from "./admin-security-alerts.service";

/** Avvisi ai super admin (docs/CHANGELOG.md §359). */
const marta = { name: "Marta", surname: "Rossi", email: "marta@esempio.it" };
const luca = { name: "Luca", surname: null, email: "luca@esempio.it" };

describe("testi degli avvisi", () => {
  it("nomina chi riceve il ruolo e chi l'ha deciso", () => {
    expect(roleChangeAlert(marta, luca, ["MODERATOR", "FINANCE"]).text).toBe(
      "Marta Rossi (marta@esempio.it) ora è admin (Moderatore + Finanza). L'ha deciso Luca (luca@esempio.it)",
    );
    expect(roleChangeAlert(marta, luca, []).title).toBe("Amministratore tolto");
  });
  it("si arrangia senza nome o senza account", () => {
    expect(personLabel({ name: null, surname: null, email: "x@esempio.it" })).toBe("x@esempio.it");
    expect(personLabel(null)).toBe("un account eliminato");
  });
});

describe("invio", () => {
  it("scrive a ogni super admin e non blocca l'azione se l'email fallisce", async () => {
    const send = vi.fn().mockRejectedValueOnce(new Error("Resend giù")).mockResolvedValue(undefined);
    const prisma = {
      user: {
        findUnique: vi.fn().mockResolvedValueOnce(luca).mockResolvedValueOnce(marta),
        findMany: vi.fn().mockResolvedValue([{ name: "Luca", email: "luca@esempio.it" }, { name: "Anna", email: "anna@esempio.it" }]),
      },
    };
    const service = new AdminSecurityAlertsService(prisma as never, { send } as never);
    await expect(service.adminRolesChanged("luca", "marta", ["MODERATOR"])).resolves.toBeUndefined();
    const where = prisma.user.findMany.mock.calls[0]![0].where;
    expect(where.role).toBe("ADMIN");
    expect(send).toHaveBeenCalledTimes(1);
  });
});
