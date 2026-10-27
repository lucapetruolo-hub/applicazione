import {
  PLATFORM_VAT_RATE_BASIS_POINTS,
  formatEurCents,
  professionalChargesVat,
  vatOnEurCents,
  type InvoiceParty,
  type PlatformInvoiceLine,
} from "@professionisti/shared";
import type { FatturaPaIssuer, FatturaPaParty } from "./invoice-xml";

/** I nostri dati fotografati sulla fattura. */
export type IssuerSnapshot = {
  companyName: string;
  vatNumber: string;
  taxCode: string | null;
  street: string;
  houseNumber: string | null;
  postalCode: string;
  city: string;
  province: string | null;
  country: string;
  taxRegime: string;
  reaOffice: string | null;
  reaNumber: string | null;
  shareCapital: string | null;
  pecEmail: string | null;
};

/** I dati del professionista fotografati sulla fattura (codice fiscale cifrato nel database). */
export type RecipientSnapshot = {
  entityType: string | null;
  companyName: string | null;
  firstName: string | null;
  lastName: string | null;
  vatNumber: string | null;
  taxCode: string | null;
  street: string | null;
  houseNumber: string | null;
  postalCode: string | null;
  city: string | null;
  province: string | null;
  country: string;
  sdiRecipientCode: string | null;
  pecEmail: string | null;
  chargesVat: boolean | null;
};

type SettingsRow = {
  companyName: string | null;
  vatNumber: string | null;
  taxCode: string | null;
  street: string | null;
  houseNumber: string | null;
  postalCode: string | null;
  city: string | null;
  province: string | null;
  country: string;
  taxRegime: string;
  reaOffice: string | null;
  reaNumber: string | null;
  shareCapital: string | null;
  pecEmail: string | null;
};

/** I dati della nostra società, o null se mancano quelli che servono a una fattura. */
export function issuerSnapshot(row: SettingsRow | null): IssuerSnapshot | null {
  if (!row?.companyName || !row.vatNumber || !row.street || !row.postalCode || !row.city) return null;
  return {
    companyName: row.companyName,
    vatNumber: row.vatNumber,
    taxCode: row.taxCode,
    street: row.street,
    houseNumber: row.houseNumber,
    postalCode: row.postalCode,
    city: row.city,
    province: row.province,
    country: row.country,
    taxRegime: row.taxRegime,
    reaOffice: row.reaOffice,
    reaNumber: row.reaNumber,
    shareCapital: row.shareCapital,
    pecEmail: row.pecEmail,
  };
}

type FiscalRow = {
  entityType: string | null;
  fiscalFirstName: string | null;
  fiscalLastName: string | null;
  fiscalCodiceFiscale: string | null;
  businessName: string | null;
  vatNumber: string | null;
  registeredStreet: string | null;
  registeredHouseNumber: string | null;
  registeredCity: string | null;
  registeredPostalCode: string | null;
  registeredProvince: string | null;
  registeredCountry: string | null;
  sdiRecipientCode: string | null;
  pecEmail: string | null;
  chargesVat: boolean | null;
};

/**
 * Intestazione della fattura dai dati fiscali: la società con ragione
 * sociale e partita IVA (il codice fiscale non lo chiediamo), la ditta
 * individuale con nome, cognome, partita IVA e codice fiscale, il privato
 * con nome, cognome e codice fiscale.
 */
export function recipientFromFiscal(fiscal: FiscalRow | null, fallbackName: string): RecipientSnapshot {
  const entityType = fiscal?.entityType ?? null;
  const business = entityType === "BUSINESS";
  const hasPersonName = !!fiscal?.fiscalFirstName && !!fiscal?.fiscalLastName;
  return {
    entityType,
    companyName: business || !hasPersonName ? fiscal?.businessName || fallbackName : null,
    firstName: business ? null : (fiscal?.fiscalFirstName ?? null),
    lastName: business ? null : (fiscal?.fiscalLastName ?? null),
    vatNumber: entityType === "PRIVATE_INDIVIDUAL" ? null : (fiscal?.vatNumber?.replace(/^IT/i, "") ?? null),
    taxCode: business ? null : (fiscal?.fiscalCodiceFiscale ?? null),
    street: fiscal?.registeredStreet ?? null,
    houseNumber: fiscal?.registeredHouseNumber ?? null,
    postalCode: fiscal?.registeredPostalCode ?? null,
    city: fiscal?.registeredCity ?? null,
    province: fiscal?.registeredProvince ?? null,
    country: (fiscal?.registeredCountry || "IT").toUpperCase(),
    // Il codice destinatario e la PEC servono solo a chi ha la partita IVA.
    sdiRecipientCode: entityType === "PRIVATE_INDIVIDUAL" ? null : (fiscal?.sdiRecipientCode ?? null),
    pecEmail: entityType === "PRIVATE_INDIVIDUAL" ? null : (fiscal?.pecEmail ?? null),
    chargesVat: professionalChargesVat(entityType, fiscal?.chargesVat),
  };
}

/** Ci sono i dati che lo SdI chiede (nome, indirizzo, partita IVA o codice fiscale)? */
export function recipientComplete(r: RecipientSnapshot): boolean {
  const named = !!r.companyName || (!!r.firstName && !!r.lastName);
  return named && !!r.street && !!r.postalCode && !!r.city && (!!r.vatNumber || !!r.taxCode);
}

export function recipientName(r: RecipientSnapshot): string {
  return r.companyName ?? [r.firstName, r.lastName].filter(Boolean).join(" ");
}

function addressLines(p: { street: string | null; houseNumber: string | null; postalCode: string | null; city: string | null; province: string | null }): string[] {
  const street = [p.street, p.houseNumber].filter(Boolean).join(" ");
  const city = [p.postalCode, p.city, p.province ? `(${p.province})` : null].filter(Boolean).join(" ");
  return [street, city].filter(Boolean);
}

export function issuerParty(i: IssuerSnapshot): InvoiceParty {
  return {
    name: i.companyName,
    lines: [
      `P.IVA ${i.vatNumber}`,
      i.taxCode && i.taxCode !== i.vatNumber ? `Codice fiscale ${i.taxCode}` : null,
      ...addressLines(i),
      i.reaOffice && i.reaNumber ? `REA ${i.reaOffice} ${i.reaNumber}` : null,
      i.shareCapital ? `Capitale sociale ${i.shareCapital} €` : null,
      i.pecEmail ? `PEC ${i.pecEmail}` : null,
    ].filter((line): line is string => !!line),
  };
}

export function recipientParty(r: RecipientSnapshot): InvoiceParty {
  return {
    name: recipientName(r),
    lines: [
      r.vatNumber ? `P.IVA ${r.vatNumber}` : null,
      r.taxCode ? `Codice fiscale ${r.taxCode}` : null,
      ...addressLines(r),
      r.sdiRecipientCode ? `Codice destinatario ${r.sdiRecipientCode}` : r.pecEmail ? `PEC ${r.pecEmail}` : null,
    ].filter((line): line is string => !!line),
  };
}

export function fatturaPaIssuer(i: IssuerSnapshot): FatturaPaIssuer {
  return {
    companyName: i.companyName,
    firstName: null,
    lastName: null,
    vatNumber: i.vatNumber,
    taxCode: i.taxCode,
    address: { street: i.street, houseNumber: i.houseNumber, postalCode: i.postalCode, city: i.city, province: i.province, country: i.country },
    taxRegime: i.taxRegime,
    rea: i.reaOffice && i.reaNumber ? { office: i.reaOffice, number: i.reaNumber, shareCapital: i.shareCapital } : null,
  };
}

export function fatturaPaCustomer(r: RecipientSnapshot): FatturaPaParty {
  return {
    companyName: r.companyName,
    firstName: r.firstName,
    lastName: r.lastName,
    vatNumber: r.vatNumber,
    taxCode: r.taxCode,
    address: { street: r.street ?? "", houseNumber: r.houseNumber, postalCode: r.postalCode ?? "", city: r.city ?? "", province: r.province, country: r.country },
  };
}

/** Imponibile = somma delle righe, IVA sull'imponibile, e il centesimo che non torna col totale pagato. */
export function invoiceTotals(lines: PlatformInvoiceLine[], grossEurCents: number): { taxableEurCents: number; vatEurCents: number; roundingEurCents: number } {
  const taxableEurCents = lines.reduce((sum, line) => sum + line.taxableEurCents, 0);
  const vatEurCents = vatOnEurCents(taxableEurCents, PLATFORM_VAT_RATE_BASIS_POINTS);
  return { taxableEurCents, vatEurCents, roundingEurCents: grossEurCents - taxableEurCents - vatEurCents };
}

/** Un movimento della trattenuta con l'etichetta del suo lavoro. */
export type FeeEntryForInvoice = { description: string; grossEurCents: number; taxableEurCents: number; paymentEurCents: number; jobLabel: string };

/**
 * Fattura delle trattenute del mese: una riga per movimento, raggruppate per
 * lavoro. Totale negativo (più restituito che trattenuto) = nota di credito,
 * con le righe di segno opposto; totale zero = nessun documento.
 */
export function monthlyFeeInvoiceDraft(entries: FeeEntryForInvoice[]): { creditNote: boolean; grossEurCents: number; lines: PlatformInvoiceLine[]; onlinePaidEurCents: number } | null {
  const gross = entries.reduce((sum, e) => sum + e.grossEurCents, 0);
  if (gross === 0) return null;
  const sign = gross < 0 ? -1 : 1;
  const lines = entries.map((e) => ({
    description: e.description,
    detail: e.paymentEurCents > 0 ? `su ${formatEurCents(e.paymentEurCents)} pagati online` : null,
    group: e.jobLabel,
    taxableEurCents: sign * e.taxableEurCents,
  }));
  return { creditNote: gross < 0, grossEurCents: Math.abs(gross), lines, onlinePaidEurCents: entries.reduce((sum, e) => sum + e.paymentEurCents, 0) };
}

/** Descrizione di una riga per la fattura elettronica: lavoro, movimento e importo pagato. */
export function xmlLineDescription(line: PlatformInvoiceLine): string {
  return [line.group, line.description, line.detail].filter(Boolean).join(" - ");
}

/** ProgressivoInvio: lettera della serie, anno a due cifre, numero (es. "C2600017"), più due caratteri a ogni nuovo invio. */
export function sdiProgressive(series: string, year: number, number: number, attempt: number): string {
  const base = `${series.slice(0, 1)}${String(year).slice(2)}${String(number).padStart(5, "0")}`;
  return attempt > 0 ? `${base}${attempt.toString(36).toUpperCase().padStart(2, "0").slice(-2)}` : base;
}
