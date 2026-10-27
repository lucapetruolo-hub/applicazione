import { POPULAR_SERVICES } from "./categories";

/**
 * Nomi delle prestazioni scritti in modo diverso nella stessa voce
 * (docs/CHANGELOG.md §387, richiesta di Luca): "riparazione perdite",
 * "Riparazione perdita d'acqua" e "ricerca perdita" contano come una sola
 * prestazione nella ricerca e nel "Quanto costa in media". Sul profilo resta
 * il nome scritto dal professionista.
 */

/** Minuscole, senza accenti né punteggiatura, parole in forma base (singolare/plurale uguali). */
export function serviceNameKey(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[’'`]/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((word) => word.length > 0 && !STOP_WORDS.has(word))
    .map(stem)
    .join(" ");
}

const STOP_WORDS = new Set(["di", "del", "della", "dei", "delle", "degli", "e", "ed", "a", "al", "alla", "il", "lo", "la", "i", "gli", "le", "un", "una", "per", "in", "con", "d", "l"]);

/** Radice grezza: toglie l'ultima vocale, così "perdita"/"perdite" e "mobile"/"mobili" coincidono. */
function stem(word: string): string {
  return word.length > 3 ? word.replace(/[aeio]$/, "") : word;
}

/**
 * Varianti comuni → nome suggerito di `POPULAR_SERVICES`. Chiave già passata
 * da `serviceNameKey`. Da allungare con i nomi che si ripetono (pagina admin
 * "Mestieri richiesti").
 */
const SYNONYMS: Record<string, string> = Object.fromEntries(
  (
    [
      ["Riparazione perdita d'acqua", ["riparazione perdita", "perdita acqua", "perdite", "riparazione perdite acqua", "perdita"]],
      ["Ricerca perdite e infiltrazioni", ["ricerca perdita", "ricerca perdite", "ricerca infiltrazioni"]],
      ["Sturatura scarichi", ["sturatura", "spurgo scarichi", "disostruzione scarichi", "scarico intasato", "sturare scarichi", "stura lavandino"]],
      ["Sostituzione rubinetteria", ["sostituzione rubinetto", "cambio rubinetto", "cambio rubinetti", "rubinetteria"]],
      ["Riparazione cassetta WC", ["cassetta wc", "riparazione sciacquone", "sciacquone", "cassetta scarico"]],
      ["Installazione scaldabagno", ["sostituzione scaldabagno", "montaggio scaldabagno", "scaldabagno"]],
      ["Ricerca guasti (salvavita che scatta)", ["ricerca guasti", "ricerca guasto", "salvavita", "guasti elettrici"]],
      ["Installazione punti luce", ["punti luce", "installazione lampadari", "montaggio lampadari", "lampadari"]],
      ["Installazione climatizzatore", ["installazione condizionatore", "montaggio condizionatore", "installazione aria condizionata", "montaggio climatizzatore"]],
      ["Manutenzione caldaia", ["revisione caldaia", "pulizia caldaia", "tagliando caldaia", "manutenzione ordinaria caldaia"]],
      ["Pulizia filtri climatizzatore", ["pulizia condizionatore", "sanificazione condizionatore", "pulizia climatizzatore"]],
      ["Tinteggiatura interni", ["tinteggiatura", "imbiancatura", "imbiancatura interni", "pittura pareti", "tinteggiatura pareti"]],
      ["Trattamento antimuffa", ["antimuffa", "rimozione muffa", "trattamento muffa"]],
      ["Apertura porte bloccate", ["apertura porte", "apertura porta", "apertura porta bloccata", "porta bloccata"]],
      ["Sostituzione serratura", ["cambio serratura", "cambio serrature", "sostituzione serrature"]],
      ["Sostituzione cilindro europeo", ["cambio cilindro", "sostituzione cilindro", "cilindro europeo"]],
      ["Potatura siepi", ["potatura", "taglio siepi", "taglio siepe", "potatura siepe"]],
      ["Taglio erba", ["taglio prato", "rasatura prato", "taglio erba prato"]],
      ["Montaggio mobili", ["montaggio mobile", "assemblaggio mobili", "montaggio arredi"]],
      ["Montaggio zanzariere", ["zanzariere", "installazione zanzariere", "sostituzione zanzariere", "riparazione zanzariere"]],
      ["Riparazione tapparelle", ["tapparelle", "riparazione tapparella", "cambio cinghia tapparella", "sostituzione cinghia tapparella"]],
      ["Riparazione elettrodomestici", ["riparazione lavatrice", "riparazione lavastoviglie", "riparazione frigorifero", "elettrodomestici", "assistenza elettrodomestici"]],
      ["Pulizie di casa", ["pulizia casa", "pulizie domestiche", "pulizie appartamento", "pulizia appartamento"]],
      ["Sgombero cantine e appartamenti", ["sgombero", "sgomberi", "sgombero cantina", "svuota cantine"]],
      ["Posa piastrelle", ["piastrellista", "posa pavimenti", "posa rivestimenti"]],
      ["Impermeabilizzazione terrazzi e balconi", ["impermeabilizzazione", "impermeabilizzazione terrazzo", "impermeabilizzazione balcone"]],
    ] as const
  ).flatMap(([canonical, variants]) => variants.map((variant) => [serviceNameKey(variant), canonical])),
);

const SUGGESTED_BY_KEY = new Map(
  Object.values(POPULAR_SERVICES)
    .flat()
    .map((name) => [serviceNameKey(name), name]),
);

/**
 * Nome con cui contare la prestazione: il nome suggerito se il testo ne è una
 * variante, altrimenti il nome ripulito (stessa chiave = stessa voce).
 */
export function canonicalServiceName(name: string): string {
  const key = serviceNameKey(name);
  return SUGGESTED_BY_KEY.get(key) ?? SYNONYMS[key] ?? name.trim().replace(/\s+/g, " ");
}

/** Tutti i nomi suggeriti, senza doppioni, per i suggerimenti mentre si scrive. */
export const ALL_SUGGESTED_SERVICES: readonly string[] = [...new Set(Object.values(POPULAR_SERVICES).flat())].sort((a, b) =>
  a.localeCompare(b, "it"),
);
