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
 * Stato dell'account Stripe del professionista (docs/CHANGELOG.md §236, §268):
 * con l'addebito diretto conta `card_payments`; `transfers` serve solo ai
 * pagamenti registrati prima (addebito a destinazione o custodia). Si rilegge
 * da Stripe prima di ogni pagamento e quando il professionista torna dalla
 * verifica, così il sito non dipende solo dall'arrivo del webhook.
 *
 * Le capacità si leggono dalla scheda v1 dell'account e non da
 * `configuration.merchant`/`configuration.recipient` delle API v2: con la
 * Dashboard Express, finita l'iscrizione, Stripe nega alla piattaforma la
 * lettura delle configurazioni ("Permission denied ... mconf_..."), mentre la
 * scheda v1 e i requisiti v2 restano leggibili (docs/changelog/2026-10-28-stripe-prova.md).
 */
export async function readStripeConnectStatus(stripe: Stripe, accountId: string): Promise<StripeConnectStatus> {
  const [account, withRequirements] = await Promise.all([
    stripe.accounts.retrieve(accountId),
    stripe.v2.core.accounts.retrieve(accountId, { include: ["requirements"] }),
  ]);
  const cardPaymentsActive = account.capabilities?.card_payments === "active";
  const transfersActive = account.capabilities?.transfers === "active";
  const due = (withRequirements.requirements?.entries ?? [])
    .filter((entry) => entry.awaiting_action_from === "user" && entry.minimum_deadline?.status !== "eventually_due")
    .map((entry) => entry.description);
  return { cardPaymentsActive, transfersActive, requirements: due.length ? due.join(", ").slice(0, 1000) : null };
}
