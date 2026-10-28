import type Stripe from "stripe";
import { BRAND, professionalPath } from "@professionisti/shared";

/**
 * Codice dell'attività (MCC) per Stripe, dalla categoria principale
 * (docs/changelog/2026-10-28-stripe-prova.md): Stripe lo chiede a ogni conto
 * prima di accettare le carte. Una categoria nuova senza codice lascia la
 * domanda a Stripe.
 */
const CATEGORY_MCC: Record<string, string> = {
  idraulico: "1711", // impianti idraulici, riscaldamento e climatizzazione
  climatizzazione: "1711",
  elettricista: "1731", // impianti elettrici
  muratore: "1740", // muratura e opere edili
  falegname: "1750", // falegnameria
  imbianchino: "1799", // altri lavori specializzati (tinteggiatura)
  fabbro: "7699", // riparazioni varie (serrature)
  tuttofare: "7699",
  pulizie: "7349", // pulizia e manutenzione
  giardiniere: "0780", // giardinaggio e paesaggistica
  traslochi: "4214", // trasporti e traslochi
  dogsitter: "7299", // altri servizi alla persona
  babysitter: "8351", // assistenza all'infanzia
};

export type StripeAccountPrefillInput = {
  email: string | null;
  phone: string | null;
  profile: { id: string; businessName: string; city: string; category: { slug: string; label: string } | null };
  fiscal: {
    entityType: string | null;
    fiscalFirstName: string | null;
    fiscalLastName: string | null;
    fiscalCodiceFiscale: string | null;
    dateOfBirth: Date | null;
    businessName: string | null;
    vatNumber: string | null;
    registeredStreet: string | null;
    registeredHouseNumber: string | null;
    registeredCity: string | null;
    registeredPostalCode: string | null;
    registeredCountry: string | null;
  };
  frontendUrl: string;
};

type Prefill = Pick<Stripe.V2.Core.AccountCreateParams, "contact_email" | "display_name" | "identity" | "defaults"> & { mcc?: string };

const clean = (value: string | null | undefined): string | undefined => value?.trim() || undefined;

/**
 * Dati che il professionista ci ha già dato, mandati a Stripe alla creazione
 * del conto (richiesta di Luca, docs/changelog/2026-10-28-stripe-prova.md):
 * l'iscrizione su Stripe li trova già scritti e chiede solo il resto
 * (nazionalità, IBAN, accettazione dei termini, titolari per le aziende).
 * Solo campi che Stripe accetta dalla piattaforma su un conto Express; nulla
 * di ciò che manca viene inventato.
 */
export function stripeAccountPrefill(input: StripeAccountPrefillInput): Prefill {
  const { fiscal, profile } = input;
  const country = clean(fiscal.registeredCountry)?.toUpperCase() ?? "IT";
  const street = clean(fiscal.registeredStreet);
  const address = street
    ? {
        country,
        line1: [street, clean(fiscal.registeredHouseNumber)].filter(Boolean).join(" "),
        postal_code: clean(fiscal.registeredPostalCode),
        city: clean(fiscal.registeredCity),
      }
    : undefined;
  // Stripe vuole il formato internazionale (+39...): un numero senza prefisso lo chiede lui.
  const phone = input.phone?.trim().startsWith("+") ? input.phone.trim() : undefined;
  const isCompany = fiscal.entityType === "BUSINESS";
  const categoryLabel = profile.category?.label;

  const identity: Stripe.V2.Core.AccountCreateParams.Identity = {
    country: "IT",
    entity_type: isCompany ? "company" : "individual",
  };
  if (isCompany) {
    const vat = clean(fiscal.vatNumber)?.replace(/^IT/i, "");
    identity.business_details = {
      registered_name: clean(fiscal.businessName),
      address,
      phone,
      id_numbers: vat ? [{ type: "it_vat", value: vat }] : undefined,
    };
  } else {
    const birth = fiscal.dateOfBirth;
    const codiceFiscale = clean(fiscal.fiscalCodiceFiscale)?.toUpperCase();
    identity.individual = {
      given_name: clean(fiscal.fiscalFirstName),
      surname: clean(fiscal.fiscalLastName),
      email: clean(input.email),
      phone,
      address,
      date_of_birth: birth ? { day: birth.getUTCDate(), month: birth.getUTCMonth() + 1, year: birth.getUTCFullYear() } : undefined,
      id_numbers: codiceFiscale ? [{ type: "it_cf", value: codiceFiscale }] : undefined,
    };
  }

  return {
    contact_email: clean(input.email),
    display_name: clean(profile.businessName),
    identity,
    defaults: {
      profile: {
        business_url: `${input.frontendUrl.replace(/\/+$/, "")}${professionalPath(profile)}`,
        doing_business_as: clean(profile.businessName),
        product_description: categoryLabel
          ? `${categoryLabel} a ${profile.city}: interventi richiesti e pagati tramite ${BRAND.name}.`
          : `Lavori a ${profile.city} richiesti e pagati tramite ${BRAND.name}.`,
      },
    },
    mcc: profile.category ? CATEGORY_MCC[profile.category.slug] : undefined,
  };
}
