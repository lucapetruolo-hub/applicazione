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
