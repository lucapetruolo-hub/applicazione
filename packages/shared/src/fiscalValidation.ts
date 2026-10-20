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

// --- Coerenza del codice fiscale con nome, cognome e data di nascita ------
// (docs/CHANGELOG.md §253) Gratis, nel browser e sul server: blocca chi
// scrive un codice fiscale non suo o sbaglia una lettera del nome. Il sesso
// non lo chiediamo, quindi per il giorno di nascita valgono sia il giorno sia
// il giorno + 40 (donne). Gestisce l'omocodia (cifre sostituite da lettere).

const OMOCODIA_DIGIT: Record<string, string> = { L: "0", M: "1", N: "2", P: "3", Q: "4", R: "5", S: "6", T: "7", U: "8", V: "9" };
const OMOCODIA_POSITIONS = [6, 7, 9, 10, 12, 13, 14];
const CF_MONTHS = "ABCDEHLMPRST";

function lettersOf(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z]/g, "");
}

function splitLetters(value: string): { consonants: string; vowels: string } {
  const letters = lettersOf(value);
  return { consonants: letters.replace(/[AEIOU]/g, ""), vowels: letters.replace(/[^AEIOU]/g, "") };
}

/** Le 3 lettere del cognome nel codice fiscale. */
export function codiceFiscaleSurnameCode(lastName: string): string {
  const { consonants, vowels } = splitLetters(lastName);
  return `${consonants}${vowels}XXX`.slice(0, 3);
}

/** Le 3 lettere del nome nel codice fiscale (con 4 o più consonanti si salta la seconda). */
export function codiceFiscaleNameCode(firstName: string): string {
  const { consonants, vowels } = splitLetters(firstName);
  if (consonants.length >= 4) return `${consonants[0]}${consonants[2]}${consonants[3]}`;
  return `${consonants}${vowels}XXX`.slice(0, 3);
}

/** Anno (ultime 2 cifre), mese e giorno scritti nel codice fiscale; `null` se il codice non è valido. */
export function codiceFiscaleBirth(value: string): { year2: number; month: number; day: number; female: boolean } | null {
  const cf = normalize(value);
  if (!isValidCodiceFiscale(cf)) return null;
  const chars = cf.split("");
  for (const position of OMOCODIA_POSITIONS) {
    const char = chars[position] ?? "";
    if (OMOCODIA_DIGIT[char]) chars[position] = OMOCODIA_DIGIT[char];
  }
  const decoded = chars.join("");
  const rawDay = Number(decoded.slice(9, 11));
  return {
    year2: Number(decoded.slice(6, 8)),
    month: CF_MONTHS.indexOf(decoded.charAt(8)) + 1,
    day: rawDay > 40 ? rawDay - 40 : rawDay,
    female: rawDay > 40,
  };
}

export type CodiceFiscalePerson = { firstName?: string | null; lastName?: string | null; dateOfBirth?: string | Date | null };

/**
 * Cosa non torna tra il codice fiscale e la persona: "cognome", "nome",
 * "data di nascita". Vuoto se tutto coincide, se il codice non è un codice
 * fiscale italiano valido (lo segnala già `checkFiscalId`) o se manca il dato
 * da confrontare.
 */
export function codiceFiscaleMismatches(codiceFiscale: string | null | undefined, person: CodiceFiscalePerson): string[] {
  const cf = normalize(codiceFiscale ?? "");
  if (!cf || !isValidCodiceFiscale(cf)) return [];
  const mismatches: string[] = [];
  if (person.lastName && lettersOf(person.lastName) && codiceFiscaleSurnameCode(person.lastName) !== cf.slice(0, 3)) mismatches.push("cognome");
  if (person.firstName && lettersOf(person.firstName) && codiceFiscaleNameCode(person.firstName) !== cf.slice(3, 6)) mismatches.push("nome");
  const birth = codiceFiscaleBirth(cf);
  const date = person.dateOfBirth ? new Date(person.dateOfBirth) : null;
  if (birth && date && !Number.isNaN(date.getTime())) {
    const sameDate = date.getUTCFullYear() % 100 === birth.year2 && date.getUTCMonth() + 1 === birth.month && date.getUTCDate() === birth.day;
    if (!sameDate) mismatches.push("data di nascita");
  }
  return mismatches;
}

/** Messaggio per l'utente quando il codice fiscale non corrisponde: dice cosa controllare. */
export function codiceFiscaleMismatchMessage(mismatches: string[]): string | null {
  if (mismatches.length === 0) return null;
  const list = mismatches.length === 1 ? mismatches[0] : `${mismatches.slice(0, -1).join(", ")} e ${mismatches[mismatches.length - 1]}`;
  const hint = mismatches.includes("nome") ? " Se hai più nomi scrivili tutti, come sul documento." : "";
  return `Il codice fiscale non corrisponde a ${list}: controlla di averli scritti come sul documento.${hint}`;
}

/** Data di nascita (AAAA-MM-GG) da un codice fiscale valido; il secolo si deduce dall'età (18-100 anni). */
export function birthDateFromCodiceFiscale(value: string, today: Date = new Date()): string | null {
  const birth = codiceFiscaleBirth(value);
  if (!birth || birth.month < 1 || birth.day < 1 || birth.day > 31) return null;
  // Chi lavora sulla piattaforma ha almeno 18 anni: se nel 2000 sarebbe più giovane, è nato nel 1900.
  const year = 2000 + birth.year2 > today.getUTCFullYear() - 18 ? 1900 + birth.year2 : 2000 + birth.year2;
  return `${year}-${String(birth.month).padStart(2, "0")}-${String(birth.day).padStart(2, "0")}`;
}

export type FiscalFieldError = { field: string; message: string };

export type FiscalValidationInput = {
  entityType?: string | null;
  fiscalIdIssuingCountry?: string | null;
  fiscalFirstName?: string | null;
  fiscalLastName?: string | null;
  fiscalCodiceFiscale?: string | null;
  dateOfBirth?: string | Date | null;
  vatNumber?: string | null;
  representative?: { firstName?: string | null; lastName?: string | null; codiceFiscale?: string | null } | null;
};

/**
 * Tutti i controlli gratuiti sui dati fiscali, uguali nel browser e sul
 * server (docs/CHANGELOG.md §253): prima il server non li ripeteva e una
 * chiamata diretta all'API poteva salvare un codice sbagliato.
 */
export function fiscalFieldErrors(input: FiscalValidationInput): FiscalFieldError[] {
  const errors: FiscalFieldError[] = [];
  const country = input.fiscalIdIssuingCountry ?? undefined;
  const isPerson = input.entityType === "PRIVATE_INDIVIDUAL" || input.entityType === "SOLE_PROPRIETOR";
  const cf = (input.fiscalCodiceFiscale ?? "").trim();
  if (isPerson && cf) {
    const check = checkFiscalId(cf, country, "codiceFiscale");
    if (!check.valid) errors.push({ field: "fiscalCodiceFiscale", message: check.message ?? "Codice fiscale non valido." });
    else if ((country ?? "IT").toUpperCase() === "IT") {
      const message = codiceFiscaleMismatchMessage(
        codiceFiscaleMismatches(cf, { firstName: input.fiscalFirstName, lastName: input.fiscalLastName, dateOfBirth: input.dateOfBirth }),
      );
      if (message) errors.push({ field: "fiscalCodiceFiscale", message });
    }
  }
  if (input.dateOfBirth) {
    const date = new Date(input.dateOfBirth);
    if (Number.isNaN(date.getTime())) errors.push({ field: "dateOfBirth", message: "La data di nascita non è valida." });
    else if (date.getTime() > Date.now()) errors.push({ field: "dateOfBirth", message: "La data di nascita non può essere nel futuro." });
  }
  const vat = (input.vatNumber ?? "").trim();
  if ((input.entityType === "SOLE_PROPRIETOR" || input.entityType === "BUSINESS") && vat) {
    const check = checkFiscalId(vat, country, "vatNumber");
    if (!check.valid) errors.push({ field: "vatNumber", message: check.message ?? "Partita IVA non valida." });
  }
  const rep = input.representative;
  const repCf = (rep?.codiceFiscale ?? "").trim();
  if (input.entityType === "BUSINESS" && repCf) {
    if (!isValidCodiceFiscale(repCf)) {
      errors.push({ field: "representative.codiceFiscale", message: "Il codice fiscale del legale rappresentante non sembra valido." });
    } else {
      const mismatches = codiceFiscaleMismatches(repCf, { firstName: rep?.firstName, lastName: rep?.lastName });
      if (mismatches.length > 0) {
        errors.push({
          field: "representative.codiceFiscale",
          message: `Il codice fiscale del legale rappresentante non corrisponde a ${mismatches.join(" e ")}.`,
        });
      }
    }
  }
  return errors;
}
