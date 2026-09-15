/**
 * Validazione in tempo reale dei documenti fiscali raccolti in
 * `/dashboard/fiscale` (CLAUDE.md §88/§89 — MANOVIA/DAC7). Funzioni pure,
 * usate sia lato client (feedback immediato mentre si digita, mai un round-
 * trip di rete per un controllo di formato) sia — dove serve — lato server.
 *
 * Deliberatamente NON include una validazione IBAN: Manovia non raccoglie
 * mai un IBAN direttamente (l'onboarding Stripe Connect lo chiede sulla
 * pagina ospitata da Stripe stessa, che lo valida già in tempo reale) — un
 * secondo punto di raccolta/validazione qui duplicherebbe un dato sensibile
 * che la piattaforma ha scelto esplicitamente di non toccare mai. Vedi
 * CLAUDE.md per la decisione.
 */

/** Normalizza per il confronto: maiuscolo, spazi/trattini rimossi. */
function normalize(value: string): string {
  return value.trim().toUpperCase().replace(/[\s-]/g, "");
}

// --- Codice Fiscale (persona fisica italiana) ---------------------------
// Algoritmo ufficiale: 15 caratteri (posizioni 1-15, alternanza valore
// pari/dispari) + 1 carattere di controllo (posizione 16), tabelle di
// conversione standard del Ministero delle Finanze.
const CF_ODD_VALUES: Record<string, number> = {
  "0": 1, "1": 0, "2": 5, "3": 7, "4": 9, "5": 13, "6": 15, "7": 17, "8": 19, "9": 21,
  A: 1, B: 0, C: 5, D: 7, E: 9, F: 13, G: 15, H: 17, I: 19, J: 21, K: 2, L: 4, M: 18, N: 20,
  O: 11, P: 3, Q: 6, R: 8, S: 12, T: 14, U: 16, V: 10, W: 22, X: 25, Y: 24, Z: 23,
};
const CF_EVEN_VALUES: Record<string, number> = {
  "0": 0, "1": 1, "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7, "8": 8, "9": 9,
  A: 0, B: 1, C: 2, D: 3, E: 4, F: 5, G: 6, H: 7, I: 8, J: 9, K: 10, L: 11, M: 12, N: 13,
  O: 14, P: 15, Q: 16, R: 17, S: 18, T: 19, U: 20, V: 21, W: 22, X: 23, Y: 24, Z: 25,
};
const CF_REMAINDER_LETTER = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const CF_PATTERN = /^[A-Z]{6}[0-9LMNPQRSTUV]{2}[ABCDEHLMPRST]{1}[0-9LMNPQRSTUV]{2}[A-Z][0-9LMNPQRSTUV]{3}[A-Z]$/;

/**
 * `true` solo se `value` è un Codice Fiscale italiano formalmente valido
 * (formato + carattere di controllo corretto) — non verifica che
 * corrisponda a una persona reale, solo che sia costruito correttamente.
 */
export function isValidCodiceFiscale(value: string): boolean {
  const cf = normalize(value);
  if (!CF_PATTERN.test(cf)) return false;
  let sum = 0;
  for (let i = 0; i < 15; i += 1) {
    const char = cf.charAt(i);
    sum += i % 2 === 0 ? (CF_ODD_VALUES[char] ?? 0) : (CF_EVEN_VALUES[char] ?? 0);
  }
  const expectedCheckChar = CF_REMAINDER_LETTER[sum % 26];
  return cf[15] === expectedCheckChar;
}

// --- Partita IVA italiana -------------------------------------------------
// 11 cifre, ultima è un carattere di controllo (variante dell'algoritmo di
// Luhn: le cifre in posizione dispari raddoppiate, sottratto 9 se >9).
export function isValidPartitaIva(value: string): boolean {
  const piva = normalize(value);
  if (!/^\d{11}$/.test(piva)) return false;
  let sum = 0;
  for (let i = 0; i < 10; i += 1) {
    let digit = Number(piva[i]);
    if (i % 2 === 1) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
  }
  const checkDigit = (10 - (sum % 10)) % 10;
  return checkDigit === Number(piva[10]);
}

/**
 * Controllo di forma generico per un NIF/TIN estero (nessun paese UE ha un
 * algoritmo di validazione unico e pubblico come quello italiano — una
 * validazione per-paese completa non è realistica in questo scope): solo
 * lunghezza e alfabeto ragionevoli, mai un falso senso di certezza.
 */
export function looksLikeForeignTin(value: string): boolean {
  const tin = value.trim();
  return tin.length >= 4 && tin.length <= 28 && /^[A-Za-z0-9]+$/.test(tin.replace(/[\s-]/g, ""));
}

export type FiscalIdCheck = { valid: boolean; message: string | null };

/**
 * Dispatcher usato dalla UI: se il paese di rilascio è l'Italia applica
 * l'algoritmo esatto (codice fiscale per una persona fisica, partita IVA
 * per un'impresa) — altrimenti solo il controllo di forma generico.
 * `value` vuoto è sempre `valid: true` (un campo vuoto non è "invalido",
 * è solo non ancora compilato — mai bloccare su un dato assente).
 */
export function checkFiscalId(value: string, issuingCountry: string | undefined, kind: "codiceFiscale" | "vatNumber"): FiscalIdCheck {
  const trimmed = value.trim();
  if (!trimmed) return { valid: true, message: null };
  const country = (issuingCountry || "IT").trim().toUpperCase();
  if (country === "IT" || country === "") {
    if (kind === "codiceFiscale") {
      return isValidCodiceFiscale(trimmed)
        ? { valid: true, message: null }
        : { valid: false, message: "Il codice fiscale non sembra valido (formato o carattere di controllo errato)." };
    }
    return isValidPartitaIva(trimmed)
      ? { valid: true, message: null }
      : { valid: false, message: "La partita IVA non sembra valida (11 cifre, carattere di controllo errato)." };
  }
  return looksLikeForeignTin(trimmed)
    ? { valid: true, message: null }
    : { valid: false, message: "Il formato non sembra valido per un identificativo fiscale estero." };
}
