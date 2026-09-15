/**
 * Serializzazione XML che rispecchia lo schema OECD DPI (v1) mostrato da un
 * esempio reale fornito dall'utente (elemento `<DPI_OECD>`, namespace
 * `urn:oecd:ties:dpi:v1`) — la base su cui le amministrazioni fiscali UE,
 * Italia inclusa, costruiscono la propria dichiarazione DAC7.
 *
 * **Cosa è verificato contro l'esempio fornito, cosa è dedotto per
 * analogia**: il ramo `<Individual>` (nome, indirizzo, TIN, data di
 * nascita, Consideration/NumberOfActivities per trimestre) rispecchia
 * esattamente i tag e gli attributi mostrati nell'esempio. Il ramo
 * `<Entity>` per un'impresa/società NON compariva nell'esempio fornito:
 * qui usa i nomi di tag standard della famiglia di schemi OECD (CRS/DPI:
 * `Organisation/ResCountryCode/IN/LegalRegistrationNumber`) per analogia,
 * ma non è stato verificato contro un esempio reale — da confermare contro
 * la specifica ufficiale prima di un uso reale.
 *
 * Resta, come documentato altrove in questo file, una BOZZA: non il
 * tracciato XSD ufficiale validato dall'Agenzia delle Entrate. Non tenta di
 * indovinare valori delle liste di codici OECD che l'esempio non mostra
 * (es. un secondo `MessageTypeIndic` per le correzioni) — dove un valore
 * non è mostrato nell'esempio, resta quello dell'esempio stesso (`DPI401`)
 * con una nota esplicita nel payload, mai un'invenzione silenziosa.
 */

export function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function tag(name: string, content: string | null | undefined, attrs?: Record<string, string | null | undefined>): string {
  if (content === null || content === undefined || content === "") return "";
  const attrStr = attrs
    ? Object.entries(attrs)
        .filter(([, v]) => v)
        .map(([k, v]) => ` ${k}="${escapeXml(String(v))}"`)
        .join("")
    : "";
  return `<${name}${attrStr}>${escapeXml(content)}</${name}>`;
}

function euroDecimal(cents: number): string {
  return (cents / 100).toFixed(2);
}

export type Dac7XmlQuarterAmounts = { q1: number | null; q2: number | null; q3: number | null; q4: number | null };

export type Dac7XmlIndividual = {
  firstName: string | null;
  lastName: string | null;
  birthDate: string | null; // YYYY-MM-DD
  birthPlace: string | null;
  birthCountry: string | null;
  tinType: string;
  tinIssuedBy: string;
  tinValue: string | null;
  addressCountryCode: string | null;
  addressFree: string | null;
};

export type Dac7XmlEntity = {
  name: string | null;
  legalForm: string | null;
  tinType: string;
  tinIssuedBy: string;
  tinValue: string | null;
  legalRegistrationNumber: string | null;
  leiCode: string | null;
  addressCountryCode: string | null;
  addressFree: string | null;
  additionalEuStates: string[];
};

export type Dac7XmlSeller = {
  professionalProfileId: string;
  individual: Dac7XmlIndividual | null;
  entity: Dac7XmlEntity | null;
  considerationEurCents: Dac7XmlQuarterAmounts;
  numberOfActivities: Dac7XmlQuarterAmounts;
};

export type Dac7XmlPayload = {
  sendingEntityIn: string;
  transmittingCountry: string;
  receivingCountry: string;
  messageType: string;
  messageRefId: string;
  reportingPeriodEndDate: string; // AAAA-12-31
  timestamp: string;
  platformName: string;
  platformIdType: string;
  platformIdValue: string;
  sellers: Dac7XmlSeller[];
};

function quarterBlock(name: string, amounts: Dac7XmlQuarterAmounts, isAmount: boolean): string {
  const format = (n: number | null) => (n === null ? null : isAmount ? euroDecimal(n) : String(n));
  const parts = ["q1", "q2", "q3", "q4"] as const;
  const inner = parts
    .map((q, i) => {
      const value = format(amounts[q]);
      if (value === null) return "";
      const quarterTag = isAmount ? tag("Amount", value, { currCode: "EUR" }) : escapeXml(value);
      return `<Q${i + 1}>${quarterTag}</Q${i + 1}>`;
    })
    .join("");
  return `<${name}>${inner}</${name}>`;
}

function sellerXml(seller: Dac7XmlSeller): string {
  let sellerBody = "";
  if (seller.individual) {
    const ind = seller.individual;
    const birthInfo = ind.birthDate || ind.birthPlace ? `<BirthInfo>${tag("BirthDate", ind.birthDate)}${tag("City", ind.birthPlace)}${tag("CountryInfo", ind.birthCountry)}</BirthInfo>` : "";
    sellerBody = `<Individual>
      <Name>${tag("FirstName", ind.firstName)}${tag("LastName", ind.lastName)}</Name>
      ${birthInfo}
      <Address>${tag("CountryCode", ind.addressCountryCode)}${tag("AddressFree", ind.addressFree)}</Address>
      ${tag("TIN", ind.tinValue, { type: ind.tinType, issuedBy: ind.tinIssuedBy })}
    </Individual>`;
  } else if (seller.entity) {
    const ent = seller.entity;
    const extraStates = ent.additionalEuStates.length > 0 ? `<AdditionalEUStates>${ent.additionalEuStates.map((s) => tag("ResCountryCode", s)).join("")}</AdditionalEUStates>` : "";
    sellerBody = `<Entity>
      <Name>${escapeXml(ent.name ?? "")}</Name>
      ${tag("LegalForm", ent.legalForm)}
      <Address>${tag("CountryCode", ent.addressCountryCode)}${tag("AddressFree", ent.addressFree)}</Address>
      ${tag("TIN", ent.tinValue, { type: ent.tinType, issuedBy: ent.tinIssuedBy })}
      ${tag("LegalRegistrationNumber", ent.legalRegistrationNumber)}
      ${tag("LEI", ent.leiCode)}
      ${extraStates}
    </Entity>`;
  }
  return `<ReportableSeller>
    <Seller>${sellerBody}</Seller>
    ${quarterBlock("Consideration", seller.considerationEurCents, true)}
    ${quarterBlock("NumberOfActivities", seller.numberOfActivities, false)}
  </ReportableSeller>`;
}

/** Genera la bozza XML — vedi il disclaimer in cima al file. */
export function buildDac7Xml(payload: Dac7XmlPayload): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<DPI_OECD xmlns="urn:oecd:ties:dpi:v1" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="urn:oecd:ties:dpi:v1 DPI_v1.0.xsd" version="1.0">
  <MessageSpec>
    ${tag("SendingEntityIN", payload.sendingEntityIn)}
    ${tag("TransmittingCountry", payload.transmittingCountry)}
    ${tag("ReceivingCountry", payload.receivingCountry)}
    ${tag("MessageType", payload.messageType)}
    ${tag("MessageRefId", payload.messageRefId)}
    ${tag("ReportingPeriod", payload.reportingPeriodEndDate)}
    ${tag("Timestamp", payload.timestamp)}
  </MessageSpec>
  <DPIBody>
    <Platform>
      ${tag("PlatformName", payload.platformName)}
      ${tag("PlatformID", payload.platformIdValue, { type: payload.platformIdType })}
    </Platform>
    ${payload.sellers.map(sellerXml).join("\n    ")}
  </DPIBody>
</DPI_OECD>`;
}
