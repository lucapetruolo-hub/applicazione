import { describe, expect, it, vi } from "vitest";
import { AdminService } from "./admin.service";

/**
 * "Risolvi" deve applicare davvero la misura (docs/CHANGELOG.md §144, DSA
 * art. 17): prima cambiava solo lo stato e il contenuto restava online.
 */
function buildService(report: Record<string, unknown>, overrides: Record<string, unknown> = {}) {
  const tx = {
    review: { update: vi.fn().mockResolvedValue({ booking: { professionalProfileId: "pro-1" } }) },
    guidedRequest: { findUnique: vi.fn().mockResolvedValue({ status: "OPEN" }), update: vi.fn() },
    professionalProfile: { update: vi.fn(), updateMany: vi.fn() },
    user: { update: vi.fn(), updateMany: vi.fn() },
    contentReport: { update: vi.fn() },
  };
  const prisma = {
    contentReport: {
      findUnique: vi.fn().mockResolvedValue({ id: "rep-1", reporterId: "reporter-1", status: "OPEN", targetId: "target-1", ...report }),
      update: vi.fn(),
    },
    review: {
      count: vi.fn().mockResolvedValue(1),
      findUnique: vi.fn().mockResolvedValue({ booking: { clientId: "author-1" } }),
    },
    guidedRequest: { count: vi.fn().mockResolvedValue(1), findUnique: vi.fn().mockResolvedValue({ clientId: "author-1" }) },
    professionalProfile: { count: vi.fn().mockResolvedValue(1), findUnique: vi.fn().mockResolvedValue({ userId: "author-1" }) },
    $transaction: vi.fn(async (fn: (client: typeof tx) => unknown) => fn(tx)),
    ...overrides,
  };
  const notifications = { notify: vi.fn() };
  const metrics = { recomputeReviews: vi.fn() };
  const audit = { record: vi.fn() };
  const service = new AdminService(prisma as never, notifications as never, metrics as never, audit as never, {} as never, {} as never);
  return { service, prisma, tx, notifications, metrics, audit };
}

describe("AdminService.resolveContentReport — misure reali", () => {
  it("nasconde una recensione, ricalcola la media e manda la motivazione con la misura all'autore", async () => {
    const { service, tx, notifications, metrics } = buildService({ targetType: "REVIEW", claimsIllegal: true });
    await service.resolveContentReport("rep-1", { status: "RESOLVED", action: "HIDE_CONTENT", ground: "legge-diffamazione", resolutionNote: "Insulti" });

    expect(tx.review.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "target-1" }, data: { hiddenAt: expect.any(Date), heldAt: null } }));
    expect(tx.contentReport.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "RESOLVED", action: "HIDE_CONTENT", contentOwnerId: "author-1" }) }),
    );
    expect(metrics.recomputeReviews).toHaveBeenCalledWith("pro-1");
    expect(notifications.notify).toHaveBeenCalledWith(
      "author-1",
      "CONTENT_REPORT_UPHELD",
      expect.objectContaining({ action: "HIDE_CONTENT", ground: "legge-diffamazione", note: "Insulti" }),
    );
    expect(tx.contentReport.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ ground: "legge-diffamazione" }) }));
    // Esito a chi segnala un contenuto illegale (DSA art. 16 c. 5): mai la motivazione (docs/CHANGELOG.md §319).
    expect(notifications.notify).toHaveBeenCalledWith("reporter-1", "CONTENT_REPORT_DECISION", { targetType: "REVIEW", status: "RESOLVED" });
  });

  it("a chi segnala una violazione dei Termini non manda l'esito: basta la presa in carico", async () => {
    const { service, notifications } = buildService({ targetType: "REVIEW", claimsIllegal: false });
    await service.resolveContentReport("rep-1", { status: "RESOLVED", action: "HIDE_CONTENT", ground: "termini-contenuti", resolutionNote: "Spam" });
    expect(notifications.notify).not.toHaveBeenCalledWith("reporter-1", expect.anything(), expect.anything());
    expect(notifications.notify).toHaveBeenCalledWith("author-1", "CONTENT_REPORT_UPHELD", expect.objectContaining({ ground: "termini-contenuti" }));
  });

  it("toglie un profilo dalla ricerca con SUSPEND_PROFILE", async () => {
    const { service, tx } = buildService({ targetType: "PROFESSIONAL_PROFILE" });
    await service.resolveContentReport("rep-1", { status: "RESOLVED", action: "SUSPEND_PROFILE", ground: "termini-contenuti", resolutionNote: "Dati falsi" });
    expect(tx.professionalProfile.update).toHaveBeenCalledWith({ where: { id: "target-1" }, data: { suspendedAt: expect.any(Date) } });
    expect(tx.user.update).not.toHaveBeenCalled();
  });

  it("sospende l'autore e nasconde anche il contenuto segnalato con SUSPEND_USER", async () => {
    const { service, tx } = buildService({ targetType: "GUIDED_REQUEST" });
    await service.resolveContentReport("rep-1", { status: "RESOLVED", action: "SUSPEND_USER", ground: "termini-contenuti", resolutionNote: "Minacce" });
    expect(tx.user.update).toHaveBeenCalledWith({ where: { id: "author-1" }, data: { suspendedAt: expect.any(Date) } });
    expect(tx.guidedRequest.update).toHaveBeenCalledWith({ where: { id: "target-1" }, data: { hiddenAt: expect.any(Date), status: "CLOSED" } });
  });

  it("rifiuta una decisione senza la regola o la legge violata", async () => {
    const { service, prisma } = buildService({ targetType: "REVIEW" });
    await expect(service.resolveContentReport("rep-1", { status: "RESOLVED", action: "HIDE_CONTENT", resolutionNote: "Insulti" })).rejects.toThrow("regola o la legge");
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("rifiuta una misura non compatibile con il tipo di contenuto", async () => {
    const { service, prisma } = buildService({ targetType: "REVIEW" });
    await expect(service.resolveContentReport("rep-1", { status: "RESOLVED", action: "SUSPEND_PROFILE", ground: "termini-contenuti", resolutionNote: "x" })).rejects.toThrow(
      "Misura non valida",
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("un avvertimento non tocca il contenuto", async () => {
    const { service, tx } = buildService({ targetType: "REVIEW" });
    await service.resolveContentReport("rep-1", { status: "RESOLVED", action: "WARN", ground: "termini-contenuti", resolutionNote: "Tono" });
    expect(tx.review.update).not.toHaveBeenCalled();
    expect(tx.user.update).not.toHaveBeenCalled();
  });

  it("ignorare una segnalazione non applica misure e non avvisa l'autore", async () => {
    const { service, tx, notifications } = buildService({ targetType: "REVIEW", claimsIllegal: true });
    await service.resolveContentReport("rep-1", { status: "DISMISSED" });
    expect(tx.review.update).not.toHaveBeenCalled();
    expect(notifications.notify).toHaveBeenCalledTimes(1);
    expect(notifications.notify).toHaveBeenCalledWith("reporter-1", "CONTENT_REPORT_DECISION", { targetType: "REVIEW", status: "DISMISSED" });
  });

  it("non decide due volte la stessa segnalazione", async () => {
    const { service } = buildService({ targetType: "REVIEW", status: "RESOLVED" });
    await expect(service.resolveContentReport("rep-1", { status: "DISMISSED" })).rejects.toThrow("già stata decisa");
  });
});

describe("AdminService.revertContentReport — annulla misura", () => {
  it("ripristina la recensione, ricalcola la media e avvisa l'autore", async () => {
    const { service, tx, metrics, notifications } = buildService({
      targetType: "REVIEW",
      status: "RESOLVED",
      action: "HIDE_CONTENT",
      contentOwnerId: "author-1",
      revertedAt: null,
    });
    await service.revertContentReport("rep-1", "Ricorso accolto");
    expect(tx.review.update).toHaveBeenCalledWith(expect.objectContaining({ data: { hiddenAt: null, heldAt: null } }));
    expect(metrics.recomputeReviews).toHaveBeenCalledWith("pro-1");
    expect(notifications.notify).toHaveBeenCalledWith("author-1", "CONTENT_REPORT_REVERTED", expect.objectContaining({ note: "Ricorso accolto" }));
  });

  it("riattiva l'account sospeso", async () => {
    const { service, tx } = buildService({
      targetType: "PROFESSIONAL_PROFILE",
      status: "RESOLVED",
      action: "SUSPEND_USER",
      contentOwnerId: "author-1",
      revertedAt: null,
    });
    await service.revertContentReport("rep-1", "Errore");
    expect(tx.user.updateMany).toHaveBeenCalledWith({ where: { id: "author-1" }, data: { suspendedAt: null } });
    expect(tx.professionalProfile.updateMany).toHaveBeenCalledWith({ where: { userId: "author-1" }, data: { suspendedAt: null } });
  });
});

describe("AdminService — sospensione dalla scheda utente e ruoli admin (docs/CHANGELOG.md §145)", () => {
  function build(target: Record<string, unknown> | null, superCount = 2) {
    const prisma = {
      user: {
        findUnique: vi.fn().mockResolvedValue(target),
        update: vi.fn().mockReturnValue("user-update"),
        count: vi.fn().mockResolvedValue(superCount),
      },
      professionalProfile: { updateMany: vi.fn().mockReturnValue("profile-update") },
      $transaction: vi.fn().mockResolvedValue([]),
    };
    const notifications = { notify: vi.fn() };
    const audit = { record: vi.fn() };
    const securityAlerts = { adminRolesChanged: vi.fn().mockResolvedValue(undefined) };
    const service = new AdminService(prisma as never, notifications as never, {} as never, audit as never, {} as never, securityAlerts as never);
    return { service, prisma, notifications, audit, securityAlerts };
  }

  const measure = (note: string, extra: Partial<{ measure: "SUSPEND" | "CLOSE_WITH_NOTICE" }> = {}) => ({ measure: "SUSPEND" as const, ground: "termini-pagamenti" as const, note, ...extra });

  it("sospende, avvisa l'utente con fatti e regola violata e registra l'azione (E4-03)", async () => {
    const { service, prisma, notifications, audit } = build({ id: "u2", role: "CLIENT", suspendedAt: null });
    await service.suspendUser("admin-1", "u2", measure("Saldo non pagato dal 2 novembre"));
    expect(prisma.$transaction).toHaveBeenCalledWith(["user-update", "profile-update"]);
    expect(prisma.user.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ suspensionGround: "termini-pagamenti" }) }));
    expect(notifications.notify).toHaveBeenCalledWith("u2", "ACCOUNT_SUSPENDED", { note: "Saldo non pagato dal 2 novembre", ground: "termini-pagamenti" });
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ entityType: "User", entityId: "u2", changedByUserId: "admin-1" }));
  });

  it("chiusura con preavviso: l'account resta attivo e la data è tra 30 giorni (E4-03)", async () => {
    const { service, prisma, notifications } = build({ id: "u2", role: "PROFESSIONAL", suspendedAt: null, closureScheduledAt: null });
    const before = Date.now();
    const result = await service.suspendUser("admin-1", "u2", measure("Due account con la stessa P.IVA", { measure: "CLOSE_WITH_NOTICE" }));
    expect(prisma.$transaction).not.toHaveBeenCalled();
    const closureAt = new Date(result.closureScheduledAt!).getTime();
    expect(closureAt - before).toBeGreaterThanOrEqual(30 * 24 * 60 * 60 * 1000 - 1000);
    expect(notifications.notify).toHaveBeenCalledWith("u2", "ACCOUNT_CLOSURE_SCHEDULED", expect.objectContaining({ ground: "termini-pagamenti", closureAt: result.closureScheduledAt }));
  });

  it("annullare una chiusura fissata toglie la data senza toccare il profilo", async () => {
    const { service, prisma, notifications } = build({ id: "u2", suspendedAt: null, closureScheduledAt: new Date("2026-12-08") });
    await service.reactivateUser("admin-1", "u2", "Chiarito al telefono");
    expect(prisma.$transaction).toHaveBeenCalledWith(["user-update"]);
    expect(notifications.notify).toHaveBeenCalledWith("u2", "ACCOUNT_REACTIVATED", { note: "Chiarito al telefono", closureCanceled: true });
  });

  it("non sospende un admin né se stessi", async () => {
    await expect(build({ id: "u2", role: "ADMIN", suspendedAt: null }).service.suspendUser("admin-1", "u2", measure("x"))).rejects.toThrow("ruolo di amministratore");
    await expect(build({ id: "admin-1", role: "CLIENT", suspendedAt: null }).service.suspendUser("admin-1", "admin-1", measure("x"))).rejects.toThrow("stesso account");
  });

  it("non toglie l'ultimo super admin", async () => {
    const { service } = build({ id: "u2", role: "ADMIN", adminRoles: ["SUPER"], deletedAt: null, professionalProfile: null }, 1);
    await expect(service.setAdminRoles("admin-1", "u2", ["MODERATOR"], "Prova: motivo del cambio di ruolo")).rejects.toThrow("almeno un super admin");
  });

  it("togliendo i ruoli admin a un professionista torna professionista", async () => {
    const { service, prisma } = build({ id: "u2", role: "ADMIN", adminRoles: ["MODERATOR"], deletedAt: null, professionalProfile: { id: "p1" } });
    await service.setAdminRoles("admin-1", "u2", [], "Prova: motivo del cambio di ruolo");
    expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: "u2" }, data: { role: "PROFESSIONAL", adminRoles: [] } });
  });

  it("assegna insieme moderatore e finanza (docs/CHANGELOG.md §146)", async () => {
    const { service, prisma, securityAlerts } = build({ id: "u2", role: "CLIENT", adminRoles: [], deletedAt: null, professionalProfile: null });
    await service.setAdminRoles("admin-1", "u2", ["FINANCE", "MODERATOR"], "Prova: motivo del cambio di ruolo");
    expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: "u2" }, data: { role: "ADMIN", adminRoles: ["MODERATOR", "FINANCE"] } });
    // Avviso a tutti i super admin (docs/CHANGELOG.md §359).
    expect(securityAlerts.adminRolesChanged).toHaveBeenCalledWith("admin-1", "u2", ["MODERATOR", "FINANCE"]);
  });

  it("nessuno cambia il proprio ruolo", async () => {
    const { service } = build({ id: "admin-1", role: "ADMIN", adminRoles: ["SUPER"], deletedAt: null, professionalProfile: null });
    await expect(service.setAdminRoles("admin-1", "admin-1", [], "Prova: motivo del cambio di ruolo")).rejects.toThrow("tuo stesso ruolo");
  });
});

/** Account di prova eliminati dal super admin (richiesta di Luca, docs/CHANGELOG.md §372). */
describe("AdminService.deleteTestAccount", () => {
  function build(user: Record<string, unknown> | null, paidOnline = 0) {
    return buildService(
      {},
      {
        user: { findUnique: vi.fn().mockResolvedValue(user), delete: vi.fn().mockResolvedValue({}) },
        jobPayment: { count: vi.fn().mockResolvedValue(paidOnline) },
      },
    );
  }

  it("elimina l'account e lo scrive nel registro", async () => {
    const { service, prisma, audit } = build({ id: "u-1", role: "CLIENT", email: "prova@example.com", testAccountAt: new Date(), deletedAt: null, professionalProfile: null });
    await expect(service.deleteTestAccount("admin-1", "u-1")).resolves.toEqual({ id: "u-1", deleted: true });
    expect((prisma as unknown as { user: { delete: ReturnType<typeof vi.fn> } }).user.delete).toHaveBeenCalledWith({ where: { id: "u-1" } });
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ fieldName: "testAccount", newValue: "DELETED", changedByUserId: "admin-1" }));
  });

  it("rifiuta un admin, sé stessi e chi ha pagamenti online veri", async () => {
    await expect(build({ id: "a-2", role: "ADMIN", email: null, professionalProfile: null }).service.deleteTestAccount("admin-1", "a-2")).rejects.toThrow(/amministratore/);
    await expect(build({ id: "admin-1", role: "CLIENT", email: null, professionalProfile: null }).service.deleteTestAccount("admin-1", "admin-1")).rejects.toThrow(/stesso/);
    const paid = build({ id: "u-2", role: "PROFESSIONAL", email: null, testAccountAt: new Date(), deletedAt: null, professionalProfile: { id: "p-2" } }, 1);
    await expect(paid.service.deleteTestAccount("admin-1", "u-2")).rejects.toThrow(/pagamenti online/);
    expect((paid.prisma as unknown as { user: { delete: ReturnType<typeof vi.fn> } }).user.delete).not.toHaveBeenCalled();
  });

  it("rifiuta un account non segnato come di prova o già chiuso", async () => {
    const real = build({ id: "u-3", role: "CLIENT", email: "vero@example.com", testAccountAt: null, deletedAt: null, professionalProfile: null });
    await expect(real.service.deleteTestAccount("admin-1", "u-3")).rejects.toThrow(/account di prova/);
    expect((real.prisma as unknown as { user: { delete: ReturnType<typeof vi.fn> } }).user.delete).not.toHaveBeenCalled();
    const closed = build({ id: "u-4", role: "CLIENT", email: null, testAccountAt: new Date(), deletedAt: new Date(), professionalProfile: null });
    await expect(closed.service.deleteTestAccount("admin-1", "u-4")).rejects.toThrow(/account di prova/);
  });
});
