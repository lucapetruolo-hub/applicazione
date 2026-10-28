import { describe, expect, it, vi } from "vitest";
import { ProfessionalFiscalService } from "./professional-fiscal.service";

/** Avvisi al professionista quando Stripe attiva o sospende l'account (docs/CHANGELOG.md §241, §242). */
function build(wasEnabled: boolean) {
  const prisma = {
    professionalFiscalProfile: {
      findUnique: vi.fn().mockResolvedValue({ id: "fp-1", stripePayoutsEnabled: wasEnabled, professionalProfile: { userId: "pro-user-1" } }),
      update: vi.fn(),
    },
  };
  const notificationsService = { notify: vi.fn() };
  const service = new ProfessionalFiscalService(prisma as never, {} as never, {} as never, notificationsService as never, {} as never);
  return { service, prisma, notificationsService };
}

describe("ProfessionalFiscalService.syncStripeConnectStatus — avvisi", () => {
  it("avvisa quando l'account diventa attivo", async () => {
    const { service, notificationsService } = build(false);
    await service.syncStripeConnectStatus("acct_1", true, true, null);
    expect(notificationsService.notify).toHaveBeenCalledWith("pro-user-1", "STRIPE_ACCOUNT_ACTIVE", {});
  });

  it("avvisa quando Stripe sospende un account che era attivo", async () => {
    const { service, notificationsService } = build(true);
    await service.syncStripeConnectStatus("acct_1", false, false, "Documento da aggiornare");
    expect(notificationsService.notify).toHaveBeenCalledWith("pro-user-1", "STRIPE_ACCOUNT_RESTRICTED", {});
  });

  it("nessun avviso se lo stato non cambia", async () => {
    const off = build(false);
    await off.service.syncStripeConnectStatus("acct_1", false, false, null);
    const on = build(true);
    await on.service.syncStripeConnectStatus("acct_1", true, true, null);
    expect(off.notificationsService.notify).not.toHaveBeenCalled();
    expect(on.notificationsService.notify).not.toHaveBeenCalled();
  });
});

/** Conto non leggibile su Stripe (docs/changelog/2026-10-28-stripe-prova.md): avviso agli admin di Finanza, una volta al giorno. */
describe("ProfessionalFiscalService.refreshStripeConnectStatus — conto non leggibile", () => {
  function buildUnreadable() {
    const prisma = {
      professionalFiscalProfile: { findUnique: vi.fn().mockResolvedValue({ professionalProfile: { businessName: "Idraulica Rossi" } }) },
      user: {
        findMany: vi.fn().mockResolvedValue([
          { id: "super-1", adminRoles: ["SUPER"] },
          { id: "moderatore-1", adminRoles: ["MODERATION"] },
        ]),
      },
    };
    const notificationsService = { notify: vi.fn() };
    const service = new ProfessionalFiscalService(prisma as never, {} as never, {} as never, notificationsService as never, {} as never);
    const denied = new Error("Permission denied");
    (service as unknown as { stripe: unknown }).stripe = {
      accounts: { retrieve: vi.fn().mockRejectedValue(denied) },
      v2: { core: { accounts: { retrieve: vi.fn().mockResolvedValue({ requirements: { entries: [] } }) } } },
    };
    return { service, notificationsService };
  }

  it("avvisa solo Finanza e super admin, e non due volte nello stesso giorno", async () => {
    const { service, notificationsService } = buildUnreadable();

    await expect(service.refreshStripeConnectStatus("acct_1")).rejects.toThrow("Permission denied");
    await expect(service.refreshStripeConnectStatus("acct_1")).rejects.toThrow("Permission denied");

    expect(notificationsService.notify).toHaveBeenCalledTimes(1);
    expect(notificationsService.notify).toHaveBeenCalledWith("super-1", "ADMIN_STRIPE_ACCOUNT_UNREADABLE", {
      stripeAccountId: "acct_1",
      businessName: "Idraulica Rossi",
      error: "Permission denied",
    });
  });
});
