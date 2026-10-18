import type { DocumentPerson } from "./identity-provider";

export type ExpectedPerson = {
  firstName: string | null;
  lastName: string | null;
  /** AAAA-MM-GG */
  dateOfBirth: string | null;
  codiceFiscale: string | null;
};

const tokens = (value: string | null) =>
  (value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z ]/g, " ")
    .split(/\s+/)
    .filter(Boolean);

/** Tutte le parole di uno stanno nell'altro: "Maria" e "Maria Grazia" vanno bene, "Mario" e "Maria" no. */
function sameNames(a: string | null, b: string | null): boolean {
  const left = tokens(a);
  const right = tokens(b);
  if (left.length === 0 || right.length === 0) return false;
  if (left.join("") === right.join("")) return true;
  return left.every((t) => right.includes(t)) || right.every((t) => left.includes(t));
}

/**
 * Il documento appartiene alla persona dei dati fiscali? (docs/CHANGELOG.md
 * §246) Prima il codice fiscale stampato sulla CIE, poi nome, cognome e data
 * di nascita. Quello che non torna torna al professionista con il motivo,
 * che corregge e riprova da solo (§248, nessun admin).
 */
export function matchDocumentToFiscal(document: DocumentPerson | null, expected: ExpectedPerson): { matched: boolean; reason: string | null } {
  if (!document) return { matched: false, reason: "Non siamo riusciti a leggere i dati del documento: rifai la verifica con una foto più nitida, con buona luce e senza riflessi." };
  const cf = (expected.codiceFiscale ?? "").toUpperCase().replace(/\s/g, "");
  const personal = (document.personalNumber ?? "").toUpperCase().replace(/\s/g, "");
  if (cf && personal && cf === personal) return { matched: true, reason: null };
  if (!expected.firstName || !expected.lastName) return { matched: false, reason: "Completa nome e cognome nei dati fiscali, poi rifai la verifica." };
  const mismatches: string[] = [];
  if (!sameNames(document.lastName, expected.lastName)) mismatches.push("cognome");
  if (!sameNames(document.firstName, expected.firstName)) mismatches.push("nome");
  if (expected.dateOfBirth && document.dateOfBirth && expected.dateOfBirth.slice(0, 10) !== document.dateOfBirth.slice(0, 10)) mismatches.push("data di nascita");
  if (expected.dateOfBirth && !document.dateOfBirth) mismatches.push("data di nascita (non letta)");
  if (mismatches.length === 0) return { matched: true, reason: null };
  return {
    matched: false,
    reason: `Il documento non coincide con i dati fiscali (${mismatches.join(", ")}). Se nei dati fiscali c'è un errore correggilo scrivendoli come sul documento, poi rifai la verifica.`,
  };
}
