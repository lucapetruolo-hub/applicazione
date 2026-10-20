import type Stripe from "stripe";

export interface StripeConnectStatus {
  /**
   * L'account può ricevere pagamenti con carta addebitati direttamente su di
   * lui (`card_payments` della configurazione merchant, §268): è lo stato
   * che rende attivi i pagamenti online del professionista.
   */
  cardPaymentsActive: boolean;
  /** L'account può ricevere i trasferimenti dalla piattaforma (`stripe_transfers` attivo), per i pagamenti dei modelli precedenti. */
  transfersActive: boolean;
  /** Riassunto dei dati che Stripe chiede ancora al professionista, null se non manca nulla. */
  requirements: string | null;
}

/**
 * Stato dell'account Stripe del professionista letto con le API Accounts v2
 * (docs/CHANGELOG.md §236, §268): con l'addebito diretto conta
 * `configuration.merchant...card_payments.status`; `stripe_transfers` serve
 * solo ai pagamenti registrati prima (addebito a destinazione o custodia).
 * Si rilegge da Stripe prima di ogni pagamento e quando il professionista
 * torna dalla verifica, così il sito non dipende solo dall'arrivo del webhook.
 */
export async function readStripeConnectStatus(stripe: Stripe, accountId: string): Promise<StripeConnectStatus> {
  const account = await stripe.v2.core.accounts.retrieve(accountId, { include: ["configuration.merchant", "configuration.recipient", "requirements"] });
  const cardPaymentsActive = account.configuration?.merchant?.capabilities?.card_payments?.status === "active";
  const transfersActive = account.configuration?.recipient?.capabilities?.stripe_balance?.stripe_transfers?.status === "active";
  const due = (account.requirements?.entries ?? [])
    .filter((entry) => entry.awaiting_action_from === "user" && entry.minimum_deadline.status !== "eventually_due")
    .map((entry) => entry.description);
  return { cardPaymentsActive, transfersActive, requirements: due.length ? due.join(", ").slice(0, 1000) : null };
}
