import type { Prisma } from "@professionisti/database";
import { onlinePaymentsEnabled } from "../job-payments/online-payments-enabled";

/**
 * Profilo pubblico appena il professionista ha scelto il tipo e compilato i
 * dati fiscali minimi (`fiscalDataMissing`, decisione dell'utente del
 * 13/10/2026, docs/CHANGELOG.md §238, che sostituisce la verifica Stripe
 * obbligatoria di §236): la DAC7 ci chiede quei dati per tutti, anche per
 * chi incassa solo in diretto. La verifica su Stripe (KYC/KYB) serve solo
 * per offrire l'acconto online e per il badge "Identità verificata da
 * Stripe" (`stripeVerified`).
 *
 * Come la pausa dell'abbonamento (§162) vale solo con i pagamenti attivi su
 * questo ambiente (`STRIPE_SECRET_KEY`), cioè dal lancio. I profili
 * dimostrativi restano visibili.
 */
export function fiscalDataRequired(): boolean {
  return onlinePaymentsEnabled();
}

/** Filtro Prisma da aggiungere (in un `AND`) a ogni punto pubblico sui professionisti. */
export function publicVisibilityWhere(): Prisma.ProfessionalProfileWhereInput {
  if (!fiscalDataRequired()) return {};
  return { OR: [{ isDemo: true }, { fiscalProfile: { is: { fiscalDataCompleteAt: { not: null } } } }] };
}

/** Selezione minima per `publicVisibilityMissing`. */
export const PUBLIC_VISIBILITY_SELECT = { isDemo: true, fiscalProfile: { select: { fiscalDataCompleteAt: true } } } as const;

/** Il professionista deve ancora compilare i dati fiscali per essere visibile? */
export function publicVisibilityMissing(profile: { isDemo: boolean; fiscalProfile: { fiscalDataCompleteAt: Date | null } | null }): boolean {
  return fiscalDataRequired() && !profile.isDemo && !profile.fiscalProfile?.fiscalDataCompleteAt;
}

/** Account Stripe attivo: può ricevere l'acconto online e mostra il badge. */
export function stripeVerified(fiscalProfile: { stripePayoutsEnabled: boolean } | null | undefined): boolean {
  return onlinePaymentsEnabled() && !!fiscalProfile?.stripePayoutsEnabled;
}
