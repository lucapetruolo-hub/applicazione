/**
 * Pagamento online dei lavori disponibile su questo ambiente
 * (docs/CHANGELOG.md §170): serve la chiave Stripe. Senza, il sito offre solo
 * il pagamento diretto e l'API rifiuta la scelta "online", così non nasce mai
 * un lavoro "pagato online" che non si può pagare.
 */
export function onlinePaymentsEnabled(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}
