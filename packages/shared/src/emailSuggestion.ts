/**
 * "Forse intendevi …?" sotto il campo email dell'iscrizione
 * (docs/changelog/2026-11-02-registrazione-pro-migliorie.md): un errore di
 * battitura nel dominio ("gmial.com", "libero.ti") faceva partire il codice
 * di conferma verso un indirizzo che non esiste. Solo un suggerimento: non
 * blocca mai l'invio.
 */

/** Domini più usati in Italia: solo questi vengono proposti. */
const COMMON_DOMAINS = [
  "gmail.com",
  "libero.it",
  "hotmail.it",
  "hotmail.com",
  "outlook.it",
  "outlook.com",
  "yahoo.it",
  "yahoo.com",
  "icloud.com",
  "live.it",
  "live.com",
  "virgilio.it",
  "alice.it",
  "tiscali.it",
  "tim.it",
  "fastwebnet.it",
  "email.it",
  "me.com",
  "msn.com",
  "pec.it",
  "legalmail.it",
] as const;

/** Domini veri vicini a quelli sopra: si accettano senza proporre nulla. */
const KNOWN_DOMAINS = ["tin.it", "gmx.it", "gmx.com", "aruba.it", "poste.it", "inwind.it", "katamail.com", "protonmail.com", "proton.me", "googlemail.com"];

function splitDomain(domain: string): { name: string; tld: string } {
  const dot = domain.lastIndexOf(".");
  return dot < 0 ? { name: domain, tld: "" } : { name: domain.slice(0, dot), tld: domain.slice(dot + 1) };
}

/** Distanza di modifica con lo scambio di due lettere vicine contato come uno ("gmial"). */
function editDistance(a: string, b: string): number {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const d: number[][] = Array.from({ length: rows }, (_, i) => Array.from({ length: cols }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)));
  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let best = Math.min(d[i - 1]![j]! + 1, d[i]![j - 1]! + 1, d[i - 1]![j - 1]! + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        best = Math.min(best, d[i - 2]![j - 2]! + 1);
      }
      d[i]![j] = best;
    }
  }
  return d[a.length]![b.length]!;
}

/**
 * Indirizzo corretto da proporre, oppure null se il dominio è già giusto,
 * sconosciuto (un dominio aziendale non si tocca) o l'email è incompleta.
 */
export function suggestEmailCorrection(email: string): string | null {
  const trimmed = email.trim().toLowerCase();
  const at = trimmed.lastIndexOf("@");
  if (at <= 0 || at === trimmed.length - 1) return null;
  const local = trimmed.slice(0, at);
  // "gmail,com" o "gmail..com": la punteggiatura sbagliata conta come un errore solo.
  const typedDomain = trimmed.slice(at + 1);
  const domain = typedDomain.replace(/,/g, ".").replace(/\.{2,}/g, ".");
  const isKnown = (value: string) => (COMMON_DOMAINS as readonly string[]).includes(value) || KNOWN_DOMAINS.includes(value);
  if (isKnown(typedDomain)) return null;
  if (isKnown(domain)) return `${local}@${domain}`;

  // Nome giusto e finale sbagliato ("gmail.it", "libero.ti", "gmail"): il
  // finale più vicino tra quelli di quel nome.
  const typed = splitDomain(domain);
  const sameName = COMMON_DOMAINS.filter((candidate) => splitDomain(candidate).name === typed.name);
  if (sameName.length > 0) {
    const closest = [...sameName].sort((a, b) => editDistance(typed.tld, splitDomain(a).tld) - editDistance(typed.tld, splitDomain(b).tld))[0]!;
    return `${local}@${closest}`;
  }

  let best: { domain: string; distance: number } | null = null;
  for (const candidate of COMMON_DOMAINS) {
    const distance = editDistance(domain, candidate);
    if (!best || distance < best.distance) best = { domain: candidate, distance };
  }
  if (!best) return null;
  // Al massimo due lettere sbagliate, e mai su un dominio lontano: "studio-rossi.it" resta com'è.
  const limit = best.domain.length >= 9 ? 2 : 1;
  if (best.distance === 0 || best.distance > limit) return null;
  return `${local}@${best.domain}`;
}
