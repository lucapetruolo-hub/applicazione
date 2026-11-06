/**
 * Dati fiscali minimi per essere pubblici (decisione dell'utente del
 * 13/10/2026, docs/CHANGELOG.md §241): il profilo compare in ricerca appena
 * il professionista ha scelto il tipo (privato, professionista con P.IVA,
 * azienda) e compilato i dati che la DAC7 ci chiede di raccogliere per
 * tutti, anche per chi incassa solo in diretto: nome o ragione sociale,
 * indirizzo, codice fiscale o P.IVA, data di nascita per le persone.
 * La verifica su Stripe serve solo per l'acconto online e il badge.
 */
export type FiscalCompletenessInput = {
  entityType: string | null;
  fiscalDeclarationAcceptedAt: Date | string | null;
  fiscalFirstName: string | null;
  fiscalLastName: string | null;
  fiscalCodiceFiscale: string | null;
  foreignTin: string | null;
  dateOfBirth: Date | string | null;
  businessName: string | null;
  vatNumber: string | null;
  registeredStreet: string | null;
  registeredCity: string | null;
  registeredPostalCode: string | null;
};

const filled = (v: string | Date | null | undefined) => (typeof v === "string" ? v.trim().length > 0 : v != null);

/** Etichette dei dati che mancano (vuoto = profilo pubblicabile). Stesse etichette del modulo in Dati fiscali. */
export function fiscalDataMissing(p: FiscalCompletenessInput | null): string[] {
  if (!p || !p.entityType) return ["Tipo (privato, professionista o azienda)"];
  const missing: string[] = [];
  if (p.entityType === "BUSINESS") {
    if (!filled(p.businessName)) missing.push("Ragione sociale");
    if (!filled(p.vatNumber)) missing.push("Partita IVA");
  } else {
    if (!filled(p.fiscalFirstName)) missing.push("Nome");
    if (!filled(p.fiscalLastName)) missing.push("Cognome");
    if (!filled(p.fiscalCodiceFiscale) && !filled(p.foreignTin)) missing.push("Codice fiscale");
    if (!filled(p.dateOfBirth)) missing.push("Data di nascita");
    if (p.entityType === "SOLE_PROPRIETOR" && !filled(p.vatNumber)) missing.push("Partita IVA");
  }
  if (!filled(p.registeredStreet)) missing.push("Via dell'indirizzo");
  if (!filled(p.registeredCity)) missing.push("Comune dell'indirizzo");
  if (!filled(p.registeredPostalCode)) missing.push("CAP dell'indirizzo");
  if (!p.fiscalDeclarationAcceptedAt) missing.push("Dichiarazione di correttezza dei dati");
  return missing;
}

/**
 * Come si presenta il professionista al cliente (Codice del consumo, art.
 * 49-bis, docs/CHANGELOG.md §241): con un privato senza P.IVA il cliente non
 * ha i diritti del consumatore verso di lui, e glielo dobbiamo dire.
 */
export type ProfessionalTraderStatus = "PRIVATE" | "TRADER";

export function traderStatusOf(entityType: string | null | undefined): ProfessionalTraderStatus | null {
  if (entityType === "PRIVATE_INDIVIDUAL") return "PRIVATE";
  if (entityType === "SOLE_PROPRIETOR" || entityType === "BUSINESS") return "TRADER";
  return null;
}

/**
 * Il nome ha la forma di una società ("S.R.L.", "SRLS", "S.p.A.", "S.N.C.",
 * "S.A.S.", "società cooperativa")? Un privato senza partita IVA non può
 * presentarsi così (collaudo A-11, M-03: "Luca idraulica S.R.L." compariva
 * come "Privato", con la frase che toglie al cliente i diritti del consumatore).
 */
export function looksLikeCompanyName(name: string | null | undefined): boolean {
  const text = (name ?? "").trim();
  if (!text) return false;
  if (/(^|[\s,.(-])s\.?\s?r\.?\s?l\.?(\s?s\.?)?($|[\s,.)])/i.test(text)) return true;
  if (/(^|[\s,.(-])s\.?\s?n\.?\s?c\.?($|[\s,.)])/i.test(text)) return true;
  // "Spa" e "Sas" sono anche parole comuni: solo con i punti o in maiuscolo.
  if (/(^|[\s,(-])(s\.\s?p\.\s?a\.?|s\.\s?a\.\s?s\.?)($|[\s,)])/i.test(text)) return true;
  if (/(^|[\s,(-])(SpA|SPA|SAS)($|[\s,.)])/.test(text)) return true;
  return /\bsociet[aà]\s+(cooperativa|a\s+responsabilit|in\s+nome\s+collettivo|in\s+accomandita|per\s+azioni)/i.test(text) || /\bsoc\.\s?coop/i.test(text);
}

/**
 * Lo stato da mostrare al cliente (art. 49-bis Codice del consumo): quello
 * dichiarato, tranne quando il nome dice il contrario. In quel caso non si
 * mostra "Privato" né la frase sui diritti del consumatore: nel dubbio mai
 * togliere al cliente diritti che può avere (collaudo M-03).
 */
export function publicTraderStatusOf(entityType: string | null | undefined, businessName: string | null | undefined): ProfessionalTraderStatus | null {
  const status = traderStatusOf(entityType);
  return status === "PRIVATE" && looksLikeCompanyName(businessName) ? null : status;
}

export function publicProfessionalKindOf(entityType: string | null | undefined, businessName: string | null | undefined): ProfessionalKind | null {
  const kind = professionalKindOf(entityType);
  return kind === "PRIVATE" && looksLikeCompanyName(businessName) ? null : kind;
}

/** Come si è iscritto il professionista, mostrato come badge nel profilo e nei risultati (docs/CHANGELOG.md §338). */
export type ProfessionalKind = "PRIVATE" | "VAT" | "BUSINESS";

export function professionalKindOf(entityType: string | null | undefined): ProfessionalKind | null {
  if (entityType === "PRIVATE_INDIVIDUAL") return "PRIVATE";
  if (entityType === "SOLE_PROPRIETOR") return "VAT";
  if (entityType === "BUSINESS") return "BUSINESS";
  return null;
}

export const TRADER_STATUS_COPY: Record<ProfessionalTraderStatus, { label: string; note: string }> = {
  PRIVATE: {
    label: "Privato senza partita IVA",
    note: "Lavora come privato, non come professionista: i diritti del consumatore (per esempio il recesso) non si applicano ai lavori fatti con questa persona.",
  },
  TRADER: {
    label: "Professionista con partita IVA",
    note: "Lavora come professionista o azienda: si applicano i diritti del consumatore previsti dalla legge.",
  },
};

/** Testo del badge per chi ha completato la verifica di identità su Stripe (§241). */
export const STRIPE_VERIFIED_BADGE = {
  label: "Pagamenti online",
  note: "Si può pagare online con carta: Stripe, il fornitore dei pagamenti, ha controllato i dati del professionista per farlo incassare. Non è una garanzia sulla qualità del lavoro.",
};
