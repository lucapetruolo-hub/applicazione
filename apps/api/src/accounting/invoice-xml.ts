import { escapeXml } from "../dac7/dac7-xml.util";

/**
 * Fattura elettronica (FatturaPA 1.2.2, formato FPR12 tra privati) delle
 * nostre fatture al professionista (docs/CHANGELOG.md §378). Solo ciò che ci
 * serve: una sola aliquota (22%), nessuna ritenuta, nessun bollo.
 * - TD24 fattura differita per le trattenute del mese, pagate con
 *   trattenuta su somme già riscosse (MP22);
 * - TD01 per abbonamento, quote di passaggio e visibilità, pagati con la
 *   carta (MP08);
 * - TD04 nota di credito, collegata alla fattura che corregge.
 * Da provare nella prova di Openapi prima del lancio (checklist).
 */

export type FatturaPaAddress = {
  street: string;
  houseNumber: string | null;
  postalCode: string;
  city: string;
  province: string | null;
  country: string;
};

export type FatturaPaParty = {
  /** Ragione sociale, o null per una persona (si usano nome e cognome). */
  companyName: string | null;
  firstName: string | null;
  lastName: string | null;
  vatNumber: string | null;
  taxCode: string | null;
  address: FatturaPaAddress;
};

export type FatturaPaIssuer = FatturaPaParty & {
  taxRegime: string;
  rea: { office: string; number: string; shareCapital: string | null } | null;
};

export type FatturaPaInput = {
  /** ProgressivoInvio: fino a 10 lettere e numeri, unico per ogni invio. */
  progressive: string;
  recipientCode: string | null;
  recipientPec: string | null;
  issuer: FatturaPaIssuer;
  customer: FatturaPaParty;
  documentType: "TD01" | "TD04" | "TD24";
  date: string;
  number: string;
  lines: { description: string; taxableEurCents: number }[];
  vatRateBasisPoints: number;
  taxableEurCents: number;
  vatEurCents: number;
  roundingEurCents: number;
  totalEurCents: number;
  paymentMethod: "MP08" | "MP22";
  related: { number: string; date: string } | null;
  causale: string[];
};

function el(name: string, content: string | null | undefined): string {
  if (content === null || content === undefined || content === "") return "";
  return `<${name}>${escapeXml(content)}</${name}>`;
}

function wrap(name: string, inner: string): string {
  return inner ? `<${name}>${inner}</${name}>` : "";
}

/** Centesimi → "12.34" (sempre due decimali, punto come separatore). */
export function xmlAmount(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

/** I campi di testo della FatturaPA accettano solo caratteri Latin-1: il resto si toglie. */
export function latin1(value: string, max: number): string {
  return value
    .normalize("NFC")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/…/g, "...")
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, "")
    .trim()
    .slice(0, max);
}

function anagrafica(party: FatturaPaParty): string {
  if (party.companyName) return wrap("Anagrafica", el("Denominazione", latin1(party.companyName, 80)));
  return wrap("Anagrafica", el("Nome", latin1(party.firstName ?? "", 60)) + el("Cognome", latin1(party.lastName ?? "", 60)));
}

function idFiscaleIva(vatNumber: string | null): string {
  if (!vatNumber) return "";
  return wrap("IdFiscaleIVA", el("IdPaese", "IT") + el("IdCodice", vatNumber.replace(/^IT/i, "")));
}

function sede(address: FatturaPaAddress): string {
  return wrap(
    "Sede",
    el("Indirizzo", latin1(address.street, 60)) +
      el("NumeroCivico", address.houseNumber ? latin1(address.houseNumber, 8) : null) +
      el("CAP", address.postalCode) +
      el("Comune", latin1(address.city, 60)) +
      el("Provincia", address.country === "IT" ? address.province : null) +
      el("Nazione", address.country),
  );
}

function ratePercent(basisPoints: number): string {
  return (basisPoints / 100).toFixed(2);
}

/** L'XML completo della fattura, pronto per lo SdI. */
export function buildFatturaPaXml(input: FatturaPaInput): string {
  const { issuer, customer } = input;
  const recipientCode = input.recipientCode ?? "0000000";
  const header =
    wrap(
      "DatiTrasmissione",
      wrap("IdTrasmittente", el("IdPaese", "IT") + el("IdCodice", issuer.taxCode ?? issuer.vatNumber ?? "")) +
        el("ProgressivoInvio", input.progressive) +
        el("FormatoTrasmissione", "FPR12") +
        el("CodiceDestinatario", recipientCode) +
        (recipientCode === "0000000" ? el("PECDestinatario", input.recipientPec) : ""),
    ) +
    wrap(
      "CedentePrestatore",
      wrap("DatiAnagrafici", idFiscaleIva(issuer.vatNumber) + el("CodiceFiscale", issuer.taxCode) + anagrafica(issuer) + el("RegimeFiscale", issuer.taxRegime)) +
        sede(issuer.address) +
        (issuer.rea
          ? wrap(
              "IscrizioneREA",
              el("Ufficio", issuer.rea.office) + el("NumeroREA", issuer.rea.number) + el("CapitaleSociale", issuer.rea.shareCapital) + el("StatoLiquidazione", "LN"),
            )
          : ""),
    ) +
    wrap(
      "CessionarioCommittente",
      // Con la partita IVA il codice fiscale è facoltativo: per le società non lo chiediamo.
      wrap("DatiAnagrafici", idFiscaleIva(customer.vatNumber) + el("CodiceFiscale", customer.taxCode) + anagrafica(customer)) + sede(customer.address),
    );

  const rate = ratePercent(input.vatRateBasisPoints);
  const generali =
    wrap(
      "DatiGeneraliDocumento",
      el("TipoDocumento", input.documentType) +
        el("Divisa", "EUR") +
        el("Data", input.date) +
        el("Numero", input.number) +
        el("ImportoTotaleDocumento", xmlAmount(input.totalEurCents)) +
        (input.roundingEurCents !== 0 ? el("Arrotondamento", xmlAmount(input.roundingEurCents)) : "") +
        input.causale.map((line) => el("Causale", latin1(line, 200))).join(""),
    ) + (input.related ? wrap("DatiFattureCollegate", el("IdDocumento", input.related.number) + el("Data", input.related.date)) : "");

  const lines = input.lines
    .map((line, index) =>
      wrap(
        "DettaglioLinee",
        el("NumeroLinea", String(index + 1)) +
          el("Descrizione", latin1(line.description, 1000)) +
          el("PrezzoUnitario", xmlAmount(line.taxableEurCents)) +
          el("PrezzoTotale", xmlAmount(line.taxableEurCents)) +
          el("AliquotaIVA", rate),
      ),
    )
    .join("");
  const riepilogo = wrap(
    "DatiRiepilogo",
    el("AliquotaIVA", rate) + el("ImponibileImporto", xmlAmount(input.taxableEurCents)) + el("Imposta", xmlAmount(input.vatEurCents)) + el("EsigibilitaIVA", "I"),
  );
  const pagamento = wrap(
    "DatiPagamento",
    el("CondizioniPagamento", "TP02") + wrap("DettaglioPagamento", el("ModalitaPagamento", input.paymentMethod) + el("ImportoPagamento", xmlAmount(input.totalEurCents))),
  );

  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<p:FatturaElettronica versione="FPR12" xmlns:ds="http://www.w3.org/2000/09/xmldsig#" xmlns:p="http://ivaservizi.agenziaentrate.gov.it/docs/xsd/fatture/v1.2" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://ivaservizi.agenziaentrate.gov.it/docs/xsd/fatture/v1.2 http://www.fatturapa.gov.it/export/fatturazione/sdi/fatturapa/v1.2/Schema_del_file_xml_FatturaPA_versione_1.2.xsd">' +
    wrap("FatturaElettronicaHeader", header) +
    wrap("FatturaElettronicaBody", wrap("DatiGenerali", generali) + wrap("DatiBeniServizi", lines + riepilogo) + pagamento) +
    "</p:FatturaElettronica>\n"
  );
}

/** Nome del file per lo SdI: IT + codice del trasmittente + "_" + progressivo. */
export function fatturaPaFileName(issuerCode: string, progressive: string): string {
  return `IT${issuerCode}_${progressive}.xml`;
}
