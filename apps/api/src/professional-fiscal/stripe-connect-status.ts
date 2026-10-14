import type Stripe from "stripe";

export interface StripeConnectStatus {
  /** L'account può ricevere i trasferimenti dalla piattaforma (`stripe_transfers` attivo). */
  transfersActive: boolean;
  /** Riassunto dei dati che Stripe chiede ancora al professionista, null se non manca nulla. */
  requirements: string | null;
}

/**
 * Stato dell'account Stripe del professionista letto con le API Accounts v2
 * (docs/CHANGELOG.md §236): per un marketplace che tiene i soldi e poi li
 * trasferisce conta solo `configuration.recipient...stripe_transfers.status`,
 * non i vecchi `charges_enabled`/`payouts_enabled`. Si rilegge da Stripe
 * prima di ogni trasferimento e quando il professionista torna dalla
 * verifica, così il sito non dipende solo dall'arrivo del webhook.
 */
export async function readStripeConnectStatus(stripe: Stripe, accountId: string): Promise<StripeConnectStatus> {
  const account = await stripe.v2.core.accounts.retrieve(accountId, { include: ["configuration.recipient", "requirements"] });
  const transfersActive = account.configuration?.recipient?.capabilities?.stripe_balance?.stripe_transfers?.status === "active";
  const due = (account.requirements?.entries ?? [])
    .filter((entry) => entry.awaiting_action_from === "user" && entry.minimum_deadline.status !== "eventually_due")
    .map((entry) => entry.description);
  return { transfersActive, requirements: due.length ? due.join(", ").slice(0, 1000) : null };
}
