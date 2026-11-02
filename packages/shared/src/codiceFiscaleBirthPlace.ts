import { CODICI_CATASTALI_DATA } from "./data/codiciCatastaliCompatti";
import { codiceFiscaleBirthPlaceCode } from "./fiscalValidation";

let codiciCatastaliMap: Map<string, string> | null = null;
/** Codice catastale → "nome|provincia", costruita al primo uso (docs/CHANGELOG.md §320). */
function codiciCatastali(): Map<string, string> {
  if (!codiciCatastaliMap) {
    codiciCatastaliMap = new Map(CODICI_CATASTALI_DATA.split("\n").map((line) => [line.slice(0, 4), line.slice(5)]));
  }
  return codiciCatastaliMap;
}

/**
 * Comune di nascita da un codice fiscale valido (docs/CHANGELOG.md §272):
 * `{ name, province }` per i comuni di oggi (elenco ISTAT con i codici
 * catastali), `abroad` per chi è nato all'estero (codice "Z"), `null` per un
 * comune che non esiste più o un codice non valido.
 */
export function birthPlaceFromCodiceFiscale(value: string): { name: string; province: string } | "abroad" | null {
  const code = codiceFiscaleBirthPlaceCode(value);
  if (!code) return null;
  if (code.startsWith("Z")) return "abroad";
  const entry = codiciCatastali().get(code);
  if (!entry) return null;
  const [name = "", province = ""] = entry.split("|");
  return { name, province };
}
