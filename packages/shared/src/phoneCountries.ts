/**
 * Prefissi telefonici internazionali per il campo "Numero di telefono"
 * (richiesta esplicita dell'utente: tutti i paesi del mondo, l'Italia
 * preimpostata e in cima quelli più usati, come fanno gli altri siti).
 * Solo sigla ISO 3166 e prefisso: il nome del paese in italiano si ricava
 * con `Intl.DisplayNames`, così non c'è un elenco di nomi da tenere aggiornato.
 */
export type PhoneCountry = { iso: string; dial: string };

export const DEFAULT_PHONE_COUNTRY_ISO = "IT";

/** In cima all'elenco, in quest'ordine: i paesi vicini e quelli delle comunità straniere più numerose in Italia. */
export const COMMON_PHONE_COUNTRY_ISOS = ["IT", "SM", "VA", "CH", "FR", "DE", "ES", "GB", "RO", "AL", "MA", "UA", "CN", "US"] as const;

export const PHONE_COUNTRIES: PhoneCountry[] = [
  { iso: "AF", dial: "93" }, { iso: "AL", dial: "355" }, { iso: "DZ", dial: "213" }, { iso: "AS", dial: "1684" },
  { iso: "AD", dial: "376" }, { iso: "AO", dial: "244" }, { iso: "AI", dial: "1264" }, { iso: "AG", dial: "1268" },
  { iso: "AR", dial: "54" }, { iso: "AM", dial: "374" }, { iso: "AW", dial: "297" }, { iso: "AU", dial: "61" },
  { iso: "AT", dial: "43" }, { iso: "AZ", dial: "994" }, { iso: "BS", dial: "1242" }, { iso: "BH", dial: "973" },
  { iso: "BD", dial: "880" }, { iso: "BB", dial: "1246" }, { iso: "BY", dial: "375" }, { iso: "BE", dial: "32" },
  { iso: "BZ", dial: "501" }, { iso: "BJ", dial: "229" }, { iso: "BM", dial: "1441" }, { iso: "BT", dial: "975" },
  { iso: "BO", dial: "591" }, { iso: "BA", dial: "387" }, { iso: "BW", dial: "267" }, { iso: "BR", dial: "55" },
  { iso: "IO", dial: "246" }, { iso: "VG", dial: "1284" }, { iso: "BN", dial: "673" }, { iso: "BG", dial: "359" },
  { iso: "BF", dial: "226" }, { iso: "BI", dial: "257" }, { iso: "KH", dial: "855" }, { iso: "CM", dial: "237" },
  { iso: "CA", dial: "1" }, { iso: "CV", dial: "238" }, { iso: "BQ", dial: "599" }, { iso: "KY", dial: "1345" },
  { iso: "CF", dial: "236" }, { iso: "TD", dial: "235" }, { iso: "CL", dial: "56" }, { iso: "CN", dial: "86" },
  { iso: "CO", dial: "57" }, { iso: "KM", dial: "269" }, { iso: "CG", dial: "242" }, { iso: "CD", dial: "243" },
  { iso: "CK", dial: "682" }, { iso: "CR", dial: "506" }, { iso: "CI", dial: "225" }, { iso: "HR", dial: "385" },
  { iso: "CU", dial: "53" }, { iso: "CW", dial: "599" }, { iso: "CY", dial: "357" }, { iso: "CZ", dial: "420" },
  { iso: "DK", dial: "45" }, { iso: "DJ", dial: "253" }, { iso: "DM", dial: "1767" }, { iso: "DO", dial: "1809" },
  { iso: "EC", dial: "593" }, { iso: "EG", dial: "20" }, { iso: "SV", dial: "503" }, { iso: "GQ", dial: "240" },
  { iso: "ER", dial: "291" }, { iso: "EE", dial: "372" }, { iso: "SZ", dial: "268" }, { iso: "ET", dial: "251" },
  { iso: "FK", dial: "500" }, { iso: "FO", dial: "298" }, { iso: "FJ", dial: "679" }, { iso: "FI", dial: "358" },
  { iso: "FR", dial: "33" }, { iso: "GF", dial: "594" }, { iso: "PF", dial: "689" }, { iso: "GA", dial: "241" },
  { iso: "GM", dial: "220" }, { iso: "GE", dial: "995" }, { iso: "DE", dial: "49" }, { iso: "GH", dial: "233" },
  { iso: "GI", dial: "350" }, { iso: "GR", dial: "30" }, { iso: "GL", dial: "299" }, { iso: "GD", dial: "1473" },
  { iso: "GP", dial: "590" }, { iso: "GU", dial: "1671" }, { iso: "GT", dial: "502" }, { iso: "GG", dial: "44" },
  { iso: "GN", dial: "224" }, { iso: "GW", dial: "245" }, { iso: "GY", dial: "592" }, { iso: "HT", dial: "509" },
  { iso: "HN", dial: "504" }, { iso: "HK", dial: "852" }, { iso: "HU", dial: "36" }, { iso: "IS", dial: "354" },
  { iso: "IN", dial: "91" }, { iso: "ID", dial: "62" }, { iso: "IR", dial: "98" }, { iso: "IQ", dial: "964" },
  { iso: "IE", dial: "353" }, { iso: "IM", dial: "44" }, { iso: "IL", dial: "972" }, { iso: "IT", dial: "39" },
  { iso: "JM", dial: "1876" }, { iso: "JP", dial: "81" }, { iso: "JE", dial: "44" }, { iso: "JO", dial: "962" },
  { iso: "KZ", dial: "7" }, { iso: "KE", dial: "254" }, { iso: "KI", dial: "686" }, { iso: "XK", dial: "383" },
  { iso: "KW", dial: "965" }, { iso: "KG", dial: "996" }, { iso: "LA", dial: "856" }, { iso: "LV", dial: "371" },
  { iso: "LB", dial: "961" }, { iso: "LS", dial: "266" }, { iso: "LR", dial: "231" }, { iso: "LY", dial: "218" },
  { iso: "LI", dial: "423" }, { iso: "LT", dial: "370" }, { iso: "LU", dial: "352" }, { iso: "MO", dial: "853" },
  { iso: "MG", dial: "261" }, { iso: "MW", dial: "265" }, { iso: "MY", dial: "60" }, { iso: "MV", dial: "960" },
  { iso: "ML", dial: "223" }, { iso: "MT", dial: "356" }, { iso: "MH", dial: "692" }, { iso: "MQ", dial: "596" },
  { iso: "MR", dial: "222" }, { iso: "MU", dial: "230" }, { iso: "YT", dial: "262" }, { iso: "MX", dial: "52" },
  { iso: "FM", dial: "691" }, { iso: "MD", dial: "373" }, { iso: "MC", dial: "377" }, { iso: "MN", dial: "976" },
  { iso: "ME", dial: "382" }, { iso: "MS", dial: "1664" }, { iso: "MA", dial: "212" }, { iso: "MZ", dial: "258" },
  { iso: "MM", dial: "95" }, { iso: "NA", dial: "264" }, { iso: "NR", dial: "674" }, { iso: "NP", dial: "977" },
  { iso: "NL", dial: "31" }, { iso: "NC", dial: "687" }, { iso: "NZ", dial: "64" }, { iso: "NI", dial: "505" },
  { iso: "NE", dial: "227" }, { iso: "NG", dial: "234" }, { iso: "NU", dial: "683" }, { iso: "NF", dial: "672" },
  { iso: "KP", dial: "850" }, { iso: "MK", dial: "389" }, { iso: "MP", dial: "1670" }, { iso: "NO", dial: "47" },
  { iso: "OM", dial: "968" }, { iso: "PK", dial: "92" }, { iso: "PW", dial: "680" }, { iso: "PS", dial: "970" },
  { iso: "PA", dial: "507" }, { iso: "PG", dial: "675" }, { iso: "PY", dial: "595" }, { iso: "PE", dial: "51" },
  { iso: "PH", dial: "63" }, { iso: "PL", dial: "48" }, { iso: "PT", dial: "351" }, { iso: "PR", dial: "1787" },
  { iso: "QA", dial: "974" }, { iso: "RE", dial: "262" }, { iso: "RO", dial: "40" }, { iso: "RU", dial: "7" },
  { iso: "RW", dial: "250" }, { iso: "BL", dial: "590" }, { iso: "SH", dial: "290" }, { iso: "KN", dial: "1869" },
  { iso: "LC", dial: "1758" }, { iso: "MF", dial: "590" }, { iso: "PM", dial: "508" }, { iso: "VC", dial: "1784" },
  { iso: "WS", dial: "685" }, { iso: "SM", dial: "378" }, { iso: "ST", dial: "239" }, { iso: "SA", dial: "966" },
  { iso: "SN", dial: "221" }, { iso: "RS", dial: "381" }, { iso: "SC", dial: "248" }, { iso: "SL", dial: "232" },
  { iso: "SG", dial: "65" }, { iso: "SX", dial: "1721" }, { iso: "SK", dial: "421" }, { iso: "SI", dial: "386" },
  { iso: "SB", dial: "677" }, { iso: "SO", dial: "252" }, { iso: "ZA", dial: "27" }, { iso: "KR", dial: "82" },
  { iso: "SS", dial: "211" }, { iso: "ES", dial: "34" }, { iso: "LK", dial: "94" }, { iso: "SD", dial: "249" },
  { iso: "SR", dial: "597" }, { iso: "SE", dial: "46" }, { iso: "CH", dial: "41" }, { iso: "SY", dial: "963" },
  { iso: "TW", dial: "886" }, { iso: "TJ", dial: "992" }, { iso: "TZ", dial: "255" }, { iso: "TH", dial: "66" },
  { iso: "TL", dial: "670" }, { iso: "TG", dial: "228" }, { iso: "TK", dial: "690" }, { iso: "TO", dial: "676" },
  { iso: "TT", dial: "1868" }, { iso: "TN", dial: "216" }, { iso: "TR", dial: "90" }, { iso: "TM", dial: "993" },
  { iso: "TC", dial: "1649" }, { iso: "TV", dial: "688" }, { iso: "VI", dial: "1340" }, { iso: "UG", dial: "256" },
  { iso: "UA", dial: "380" }, { iso: "AE", dial: "971" }, { iso: "GB", dial: "44" }, { iso: "US", dial: "1" },
  { iso: "UY", dial: "598" }, { iso: "UZ", dial: "998" }, { iso: "VU", dial: "678" }, { iso: "VA", dial: "39" },
  { iso: "VE", dial: "58" }, { iso: "VN", dial: "84" }, { iso: "WF", dial: "681" }, { iso: "EH", dial: "212" },
  { iso: "YE", dial: "967" }, { iso: "ZM", dial: "260" }, { iso: "ZW", dial: "263" },
];

const countriesByIso = new Map(PHONE_COUNTRIES.map((c) => [c.iso, c]));

export function findPhoneCountry(iso: string): PhoneCountry | undefined {
  return countriesByIso.get(iso);
}

/**
 * Prefisso più probabile per ogni prefisso condiviso da più paesi: "+1" →
 * Stati Uniti, "+7" → Russia, "+44" → Regno Unito, "+39" → Italia.
 */
const PREFERRED_ISO_FOR_DIAL: Record<string, string> = { "1": "US", "7": "RU", "44": "GB", "39": "IT", "590": "GP", "262": "RE", "599": "CW", "212": "MA" };

/**
 * Divide un numero salvato in prefisso e numero nazionale. I numeri salvati
 * prima dei prefissi (senza "+" né "00") sono italiani. Un paese già scelto
 * (`preferIso`) vince se il prefisso è condiviso, così "+1" resta Canada se
 * l'utente aveva scelto il Canada.
 */
export function splitPhoneNumber(value: string, preferIso?: string): { iso: string; national: string } {
  const trimmed = value.trim();
  const international = trimmed.startsWith("+") ? trimmed.slice(1) : trimmed.startsWith("00") ? trimmed.slice(2) : null;
  if (international === null) return { iso: preferIso ?? DEFAULT_PHONE_COUNTRY_ISO, national: trimmed };
  const digits = international.replace(/\D/g, "");
  // Prefissi da 4 cifre a 1: vince il più lungo (es. "+1876" Giamaica prima di "+1").
  for (let length = 4; length >= 1; length--) {
    const dial = digits.slice(0, length);
    const matches = PHONE_COUNTRIES.filter((c) => c.dial === dial);
    if (matches.length === 0) continue;
    const preferred =
      matches.find((c) => c.iso === preferIso) ?? matches.find((c) => c.iso === PREFERRED_ISO_FOR_DIAL[dial]) ?? matches[0]!;
    return { iso: preferred.iso, national: digits.slice(length) };
  }
  return { iso: preferIso ?? DEFAULT_PHONE_COUNTRY_ISO, national: digits };
}

/** Numero completo da salvare: "+39 3331234567" (solo cifre dopo il prefisso). Vuoto se il numero nazionale è vuoto. */
export function joinPhoneNumber(iso: string, national: string): string {
  const digits = national.replace(/\D/g, "");
  if (!digits) return "";
  const dial = findPhoneCountry(iso)?.dial ?? "39";
  return `+${dial} ${digits}`;
}

/** Stesso numero scritto in modi diversi ("333 1234567", "+39 3331234567") → stessa stringa, per i confronti. */
export function normalizePhoneNumber(value: string): string {
  if (!value.trim()) return "";
  const { iso, national } = splitPhoneNumber(value);
  return joinPhoneNumber(iso, national);
}

/** Lunghezza plausibile del numero nazionale: 6-15 cifre (limite E.164), per l'Italia 6-11. */
export function isPlausiblePhoneNumber(value: string): boolean {
  const { iso, national } = splitPhoneNumber(value);
  const digits = national.replace(/\D/g, "");
  // Il numero completo deve stare nei 20 caratteri accettati dall'API (`recipientPhone`).
  if (joinPhoneNumber(iso, digits).length > 20) return false;
  return iso === "IT" ? digits.length >= 6 && digits.length <= 11 : digits.length >= 6 && digits.length <= 15;
}

/** Bandiera emoji dalla sigla ISO (le due lettere come "indicatori regionali" Unicode). */
export function phoneCountryFlag(iso: string): string {
  return String.fromCodePoint(...[...iso.toUpperCase()].map((ch) => 0x1f1e6 + ch.charCodeAt(0) - 65));
}
