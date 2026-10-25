import type { Prisma } from "@professionisti/database";
import { onlinePaymentsEnabled } from "../job-payments/online-payments-enabled";

/**
 * Profilo pubblico appena il professionista ha scelto il tipo e compilato i
 * dati fiscali minimi (`fiscalDataMissing`, decisione dell'utente del
 * 13/10/2026, docs/CHANGELOG.md §241, che sostituisce la verifica Stripe
 * obbligatoria di §239): la DAC7 ci chiede quei dati per tutti, anche per
 * chi incassa solo in diretto. La verifica su Stripe (KYC/KYB) serve solo
 * per offrire l'acconto online e per il badge "Identità verificata da
 * Stripe" (`stripeVerified`).
 *
 * Codice fiscale e P.IVA risultati inesistenti con il controllo Openapi
 * (§253) tolgono il profilo dalla ricerca finché non si correggono.
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
  return {
    OR: [
      { isDemo: true },
      // Codice fiscale o P.IVA inesistenti all'Agenzia delle Entrate (Openapi,
      // docs/CHANGELOG.md §253): fuori finché non si correggono. Un controllo
      // ancora in corso o non riuscito non blocca.
      { fiscalProfile: { is: { fiscalDataCompleteAt: { not: null }, taxIdChecks: { none: { status: "INVALID" } } } } },
    ],
  };
}

/** Selezione minima per `publicVisibilityMissing`. */
export const PUBLIC_VISIBILITY_SELECT = {
  isDemo: true,
  fiscalProfile: { select: { fiscalDataCompleteAt: true, taxIdChecks: { where: { status: "INVALID" }, select: { status: true } } } },
} as const;

/** Il professionista deve ancora compilare (o correggere) i dati fiscali per essere visibile? */
export function publicVisibilityMissing(profile: {
  isDemo: boolean;
  fiscalProfile: { fiscalDataCompleteAt: Date | null; taxIdChecks?: { status: string }[] } | null;
}): boolean {
  if (!fiscalDataRequired() || profile.isDemo) return false;
  const fiscal = profile.fiscalProfile;
  if (!fiscal?.fiscalDataCompleteAt) return true;
  return (fiscal.taxIdChecks ?? []).some((check) => check.status === "INVALID");
}

/**
 * Badge "Verificato" mostrato ai clienti: solo per una persona vera che ha
 * superato documento e selfie, mai su un profilo dimostrativo (docs/CHANGELOG.md
 * §337: un badge su un profilo finto è un'approvazione falsa).
 */
export function publicVerified(profile: { verified: boolean; isDemo: boolean }): boolean {
  return profile.verified && !profile.isDemo;
}

/** Account Stripe attivo: può ricevere l'acconto online e mostra il badge. */
export function stripeVerified(fiscalProfile: { stripePayoutsEnabled: boolean } | null | undefined): boolean {
  return onlinePaymentsEnabled() && !!fiscalProfile?.stripePayoutsEnabled;
}
