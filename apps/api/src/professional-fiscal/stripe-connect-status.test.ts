import { describe, expect, it, vi } from "vitest";
import { readStripeConnectStatus } from "./stripe-connect-status";

function stripeWith(capabilities: Record<string, string>, entries: unknown[] = []) {
  return {
    accounts: { retrieve: vi.fn().mockResolvedValue({ capabilities }) },
    v2: { core: { accounts: { retrieve: vi.fn().mockResolvedValue({ requirements: { entries } }) } } },
  };
}

describe("readStripeConnectStatus", () => {
  it("legge le capacità dalla scheda v1 e chiede alle API v2 solo i requisiti", async () => {
    const stripe = stripeWith({ card_payments: "active", transfers: "active" });

    await expect(readStripeConnectStatus(stripe as never, "acct_1")).resolves.toEqual({ cardPaymentsActive: true, transfersActive: true, requirements: null });

    // Mai le configurazioni v2: con la Dashboard Express Stripe le nega alla piattaforma dopo l'iscrizione.
    expect(stripe.v2.core.accounts.retrieve).toHaveBeenCalledWith("acct_1", { include: ["requirements"] });
  });

  it("riassume solo i dati che il professionista deve ancora dare", async () => {
    const stripe = stripeWith({ card_payments: "inactive" }, [
      { awaiting_action_from: "user", description: "external_account", minimum_deadline: { status: "currently_due" } },
      { awaiting_action_from: "user", description: "identity.individual.phone", minimum_deadline: { status: "eventually_due" } },
      { awaiting_action_from: "stripe", description: "identity.individual.verification", minimum_deadline: { status: "currently_due" } },
      { awaiting_action_from: "user", description: "identity.individual.nationalities", minimum_deadline: null },
    ]);

    await expect(readStripeConnectStatus(stripe as never, "acct_1")).resolves.toEqual({
      cardPaymentsActive: false,
      transfersActive: false,
      requirements: "external_account, identity.individual.nationalities",
    });
  });
});
