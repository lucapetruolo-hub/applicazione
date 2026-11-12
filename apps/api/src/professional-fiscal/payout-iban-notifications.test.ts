import { describe, expect, it, vi } from "vitest";
import { PayoutAccountService } from "./payout-account.service";

/**
 * Avvisi sull'IBAN quando Stripe cambia l'account
 * (docs/changelog/2026-11-12-notifiche-positive-verdi.md): una sola notifica
 * anche con più webhook insieme, le ultime 4 cifre dei due conti, e la buona
 * notizia quando il conto torna uguale.
 */
function build(previous: string | null, stripeLast4: string) {
  // Stato condiviso come in Postgres: la seconda scrittura vede la prima.
  const row = { stripeCheck: previous };
  const prisma = {
    professionalFiscalProfile: {
      findUnique: vi.fn().mockImplementation(async () => ({
        id: "fp-1",
        payoutAccount: { id: "pa-1", ibanCountry: "IT", ibanLast4: "1234", stripeCheck: previous },
        professionalProfile: { userId: "pro-user-1" },
      })),
    },
    professionalPayoutAccount: {
      updateMany: vi.fn().mockImplementation(async ({ data }: { data: { stripeCheck: string } }) => {
        if (row.stripeCheck === data.stripeCheck) return { count: 0 };
        row.stripeCheck = data.stripeCheck;
        return { count: 1 };
      }),
      update: vi.fn(),
    },
  };
  const notificationsService = { notify: vi.fn() };
  const service = new PayoutAccountService(prisma as never, {} as never, notificationsService as never);
  (service as unknown as { stripe: unknown }).stripe = {
    accounts: { listExternalAccounts: vi.fn().mockResolvedValue({ data: [{ object: "bank_account", country: "it", last4: stripeLast4 }] }) },
  };
  return { service, notificationsService };
}

describe("PayoutAccountService.recheckForStripeAccount — avvisi IBAN", () => {
  it("due webhook insieme: una sola notifica, con le ultime 4 cifre dei due conti", async () => {
    const { service, notificationsService } = build("UNAVAILABLE", "9876");
    await Promise.all([service.recheckForStripeAccount("acct_1"), service.recheckForStripeAccount("acct_1")]);
    expect(notificationsService.notify).toHaveBeenCalledTimes(1);
    expect(notificationsService.notify).toHaveBeenCalledWith("pro-user-1", "PAYOUT_IBAN_MISMATCH", { ibanLast4: "1234", stripeLast4: "9876" });
  });

  it("conto sistemato su Stripe: notizia buona", async () => {
    const { service, notificationsService } = build("MISMATCH", "1234");
    await service.recheckForStripeAccount("acct_1");
    expect(notificationsService.notify).toHaveBeenCalledWith("pro-user-1", "PAYOUT_IBAN_MATCHED", { ibanLast4: "1234" });
  });

  it("primo controllo che corrisponde: nessun avviso", async () => {
    const { service, notificationsService } = build(null, "1234");
    await service.recheckForStripeAccount("acct_1");
    expect(notificationsService.notify).not.toHaveBeenCalled();
  });
});
