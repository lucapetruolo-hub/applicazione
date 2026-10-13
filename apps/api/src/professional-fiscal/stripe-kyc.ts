import type { Prisma } from "@professionisti/database";
import { onlinePaymentsEnabled } from "../job-payments/online-payments-enabled";

/**
 * Profilo pubblico solo dopo la verifica di identità su Stripe (KYC per i
 * privati, KYB per ditte e società), decisione dell'utente del 13/10/2026
 * (docs/CHANGELOG.md §236): finché Stripe non attiva l'account, il
 * professionista non compare in ricerca, non riceve richieste né
 * prenotazioni e la sua pagina non si apre. Vale per tutti, anche per chi
 * vuole solo il pagamento diretto.
 *
 * Come la pausa dell'abbonamento (§162) vale solo con i pagamenti attivi su
 * questo ambiente (`STRIPE_SECRET_KEY`): senza, nessuno potrebbe
 * verificarsi e la ricerca resterebbe vuota. I profili dimostrativi restano
 * visibili.
 */
export function stripeKycRequired(): boolean {
  return onlinePaymentsEnabled();
}

/** Filtro Prisma da aggiungere (in un `AND`) a ogni punto pubblico sui professionisti. */
export function stripeKycWhere(): Prisma.ProfessionalProfileWhereInput {
  if (!stripeKycRequired()) return {};
  return { OR: [{ isDemo: true }, { fiscalProfile: { is: { stripePayoutsEnabled: true } } }] };
}

/** Selezione minima per `stripeKycMissing`. */
export const STRIPE_KYC_SELECT = { isDemo: true, fiscalProfile: { select: { stripePayoutsEnabled: true } } } as const;

/** Il professionista deve ancora completare la verifica su Stripe per essere visibile? */
export function stripeKycMissing(profile: { isDemo: boolean; fiscalProfile: { stripePayoutsEnabled: boolean } | null }): boolean {
  return stripeKycRequired() && !profile.isDemo && !profile.fiscalProfile?.stripePayoutsEnabled;
}
