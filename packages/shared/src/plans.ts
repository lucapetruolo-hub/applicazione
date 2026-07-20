/**
 * Piani di abbonamento SaaS per il professionista.
 * Fonte di verità: CLAUDE.md §6.
 */

export const SUBSCRIPTION_PLANS = [
  {
    slug: "free",
    label: "Free",
    priceEurCents: 0,
    features: ["profilo-base", "ricezione-richieste"],
  },
  {
    slug: "pro",
    label: "Pro",
    priceEurCents: 2900,
    features: ["profilo-base", "ricezione-richieste", "agenda-digitale", "promemoria-automatici", "badge-verificato"],
  },
  {
    slug: "business",
    label: "Business",
    priceEurCents: 5900,
    features: [
      "profilo-base",
      "ricezione-richieste",
      "agenda-digitale",
      "promemoria-automatici",
      "badge-verificato",
      "fatturazione",
      "multi-operatore",
      "statistiche-comparative",
    ],
  },
] as const;

export type SubscriptionPlanSlug = (typeof SUBSCRIPTION_PLANS)[number]["slug"];
