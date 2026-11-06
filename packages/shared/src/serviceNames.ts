import { POPULAR_SERVICES } from "./categories";

/**
 * Nomi delle prestazioni scritti in modo diverso nella stessa voce
 * (docs/CHANGELOG.md §392, richiesta di Luca): "riparazione perdite",
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
      // Allargata il 28/10/2026 (docs/changelog/2026-10-28-quanto-costa-sinonimi.md, richiesta di Luca): almeno qualche
      // variante comune per ogni prestazione suggerita, mai una parola che
      // può voler dire due lavori diversi (es. "caldaia" da sola).
      ["Sostituzione caldaia", ["cambio caldaia", "installazione caldaia", "nuova caldaia", "montaggio caldaia"]],
      ["Sostituzione sifone", ["cambio sifone", "sifone", "riparazione sifone"]],
      ["Sostituzione box doccia", ["cambio box doccia", "installazione box doccia", "montaggio box doccia", "box doccia"]],
      ["Installazione lavatrice e lavastoviglie", ["installazione lavatrice", "installazione lavastoviglie", "allaccio lavatrice", "allacciamento lavatrice", "allaccio lavastoviglie"]],
      ["Impianto elettrico civile", ["impianto elettrico", "rifacimento impianto elettrico", "impianti elettrici civili", "impianti civili"]],
      ["Sostituzione quadro elettrico", ["cambio quadro elettrico", "quadro elettrico", "rifacimento quadro elettrico"]],
      ["Installazione videocitofono", ["videocitofono", "citofono", "installazione citofono", "sostituzione citofono", "sostituzione videocitofono"]],
      ["Certificazione impianto", ["dichiarazione di conformita", "certificazione impianto elettrico", "dico", "dichiarazione conformita impianto"]],
      ["Sostituzione prese e interruttori", ["cambio prese", "sostituzione prese", "installazione prese", "prese e interruttori", "aggiunta prese"]],
      ["Automazione cancelli", ["automazione cancello", "motorizzazione cancello", "cancello automatico", "cancelli automatici"]],
      ["Motorizzazione tapparelle", ["tapparelle elettriche", "automazione tapparelle", "motorizzazione tapparella"]],
      ["Installazione impianto fotovoltaico", ["impianto fotovoltaico", "fotovoltaico", "installazione fotovoltaico", "installazione pannelli fotovoltaici", "installazione pannelli solari", "pannelli fotovoltaici", "pannelli solari"]],
      ["Batteria di accumulo", ["batterie di accumulo", "accumulo fotovoltaico", "sistema di accumulo", "installazione batteria di accumulo"]],
      ["Installazione wallbox", ["wallbox", "wall box", "colonnina di ricarica", "installazione colonnina di ricarica", "ricarica auto elettrica"]],
      ["Tinteggiatura esterni", ["tinteggiatura facciata", "tinteggiatura facciate", "pittura esterni", "imbiancatura esterni"]],
      ["Rasatura pareti", ["rasatura", "rasatura muri", "rasature"]],
      ["Decorazioni pareti", ["decorazioni", "pittura decorativa", "effetti decorativi", "stencil pareti"]],
      ["Verniciatura infissi", ["verniciatura finestre", "verniciatura persiane", "verniciatura porte", "verniciatura ringhiere"]],
      ["Tinteggiatura soffitti", ["imbiancatura soffitti", "pittura soffitti", "tinteggiatura soffitto"]],
      ["Stuccatura crepe", ["stuccatura", "stuccatura pareti", "riparazione crepe pareti"]],
      ["Pulizie di ufficio", ["pulizia uffici", "pulizie uffici", "pulizia ufficio"]],
      ["Pulizie di fine cantiere", ["pulizie post cantiere", "pulizia fine lavori", "pulizie fine lavori", "pulizia post ristrutturazione"]],
      ["Pulizie post-trasloco", ["pulizie dopo trasloco", "pulizia post trasloco", "pulizia dopo trasloco"]],
      ["Sanificazione ambienti", ["sanificazione", "sanificazione casa", "igienizzazione ambienti"]],
      ["Pulizie settimanali", ["pulizie periodiche", "pulizia settimanale", "pulizie regolari"]],
      ["Pulizia vetri", ["lavaggio vetri", "pulizia finestre", "lavaggio finestre"]],
      ["Pulizia profonda di cucina e bagno", ["pulizia bagno", "pulizia cucina", "pulizia profonda", "sgrassatura cucina"]],
      ["Manutenzione giardino", ["cura giardino", "giardinaggio", "manutenzione verde", "manutenzione del verde"]],
      ["Progettazione giardino", ["progetto giardino", "realizzazione giardino", "creazione giardino"]],
      ["Rimozione alberi", ["abbattimento alberi", "taglio alberi", "abbattimento albero"]],
      ["Impianto di irrigazione", ["irrigazione", "impianto irrigazione", "installazione irrigazione"]],
      ["Rimozione ceppi", ["estirpazione ceppi", "fresatura ceppi", "rimozione ceppo"]],
      ["Semina e rifacimento prato", ["rifacimento prato", "semina prato", "prato nuovo", "posa prato"]],
      ["Trasloco locale", ["trasloco", "trasloco in citta", "trasloco appartamento", "trasloco casa"]],
      ["Trasloco lunga distanza", ["trasloco fuori citta", "trasloco nazionale", "trasloco fuori regione"]],
      ["Smontaggio e montaggio mobili", ["smontaggio mobili", "smontaggio e rimontaggio mobili"]],
      ["Imballaggio oggetti", ["imballaggio", "imballaggi", "imballo"]],
      ["Trasporto con montacarichi", ["montacarichi", "noleggio montacarichi", "trasloco con montacarichi"]],
      ["Trasporto singoli mobili", ["trasporto mobili", "trasporto mobile", "consegna mobili"]],
      ["Piccoli traslochi", ["piccolo trasloco", "minitrasloco", "mini trasloco"]],
      ["Installazione cancelli", ["installazione cancello", "cancelli in ferro", "realizzazione cancelli"]],
      ["Riparazione grate", ["grate", "inferriate", "riparazione inferriate"]],
      ["Duplicazione chiavi", ["copia chiavi", "duplicato chiavi", "duplicazione chiave"]],
      ["Riparazione porte blindate", ["porta blindata", "porte blindate", "riparazione porta blindata"]],
      ["Riparazione persiane in ferro", ["persiane in ferro", "riparazione persiane ferro"]],
      ["Ricarica gas climatizzatore", ["ricarica gas", "ricarica gas condizionatore", "ricarica condizionatore"]],
      ["Assistenza guasti", ["riparazione condizionatore", "riparazione climatizzatore", "condizionatore guasto", "climatizzatore guasto"]],
      ["Riparazione caldaia", ["caldaia guasta", "assistenza caldaia", "riparazione caldaie"]],
      ["Riparazione scaldabagno", ["scaldabagno guasto", "assistenza scaldabagno", "riparazione boiler"]],
      ["Controllo fumi caldaia", ["analisi fumi", "prova fumi", "controllo fumi", "bollino caldaia"]],
      ["Sostituzione termostato", ["cambio termostato", "installazione termostato", "termostato", "cronotermostato"]],
      ["Ristrutturazione bagno", ["rifacimento bagno", "bagno completo", "ristrutturazione bagni"]],
      ["Ristrutturazione cucina", ["rifacimento cucina", "ristrutturazione cucine"]],
      ["Realizzazione cartongesso", ["cartongesso", "pareti in cartongesso", "controsoffitto", "controsoffitti", "controsoffitto in cartongesso"]],
      ["Demolizioni", ["demolizione", "demolizione muri", "abbattimento muri", "abbattimento pareti"]],
      ["Rifacimento pavimenti", ["pavimenti", "pavimentazione", "rifacimento pavimento"]],
      ["Risanamento umidità e infiltrazioni", ["umidita", "risanamento umidita", "deumidificazione muri", "umidita di risalita"]],
      ["Rifacimento fughe", ["fughe", "stuccatura fughe", "rifacimento stuccatura piastrelle"]],
      ["Riparazione crepe nei muri", ["crepe nei muri", "riparazione crepe muri", "crepe muri"]],
      ["Mobili su misura", ["arredamento su misura", "mobile su misura", "armadio su misura", "armadi su misura"]],
      ["Riparazione mobili", ["sistemazione mobili", "riparazione mobile"]],
      ["Sostituzione infissi", ["cambio infissi", "nuovi infissi", "installazione infissi", "sostituzione finestre", "cambio finestre"]],
      ["Restauro mobili", ["restauro mobili antichi", "restauro mobile", "restauro arredi"]],
      ["Riparazione porte in legno", ["riparazione porte legno", "riparazione porta in legno", "sistemazione porte in legno"]],
      ["Riparazione finestre e persiane in legno", ["riparazione finestre in legno", "riparazione persiane in legno", "riparazione infissi in legno"]],
      ["Posa e riparazione parquet", ["parquet", "posa parquet", "levigatura parquet", "riparazione parquet", "lamatura parquet"]],
      ["Piccole riparazioni domestiche", ["piccole riparazioni", "piccoli lavori", "lavoretti di casa", "piccoli lavori domestici"]],
      ["Manutenzione generale casa", ["manutenzione casa", "manutenzione ordinaria casa", "manutenzione domestica"]],
      ["Montaggio tende e bastoni", ["montaggio tende", "installazione tende", "montaggio bastoni tende", "bastoni tende"]],
      ["Sigillatura con silicone (bagno e cucina)", ["siliconatura", "silicone", "rifacimento silicone", "sigillatura silicone", "sigillatura"]],
      ["Montaggio mobili IKEA", ["montaggio ikea", "mobili ikea"]],
      ["Fissaggio a muro (mensole, quadri, TV)", ["montaggio mensole", "fissaggio tv", "installazione tv a muro", "montaggio staffa tv", "appendere quadri", "fissaggio mensole"]],
      ["Passeggiata con il cane", ["passeggiate cani", "dog walking", "portare fuori il cane", "passeggiata cane", "uscite col cane"]],
      ["Pensione per cani", ["pensione cani", "ospitalita cani", "cani in pensione", "dog boarding"]],
      ["Accudimento durante le vacanze", ["cane in vacanza", "accudimento cane vacanze", "pet sitting vacanze"]],
      ["Accompagnamento dal veterinario", ["accompagnamento veterinario", "portare dal veterinario", "visita veterinaria"]],
      ["Dogsitter durante l'orario di lavoro", ["dogsitter giornaliero", "dog sitter di giorno", "cane durante il lavoro"]],
      ["Babysitting serale", ["babysitter sera", "baby sitter serale", "babysitter di sera"]],
      ["Uscita da scuola e compiti", ["ritiro da scuola", "prendere a scuola", "aiuto compiti", "doposcuola"]],
      ["Accudimento neonati", ["neonati", "babysitter neonati", "tata neonati"]],
      ["Babysitting nel weekend", ["babysitter weekend", "baby sitter fine settimana", "babysitter sabato e domenica"]],
      ["Babysitting durante eventi", ["babysitter matrimonio", "animazione bambini eventi", "babysitter eventi", "babysitter per cerimonie"]],
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

/** Chiavi dei sinonimi di ogni nome suggerito, per cercare con le parole di chi scrive. */
const VARIANT_KEYS_BY_NAME = Object.entries(SYNONYMS).reduce((byName, [key, canonical]) => {
  byName.set(canonical, [...(byName.get(canonical) ?? []), key]);
  return byName;
}, new Map<string, string[]>());

/**
 * La voce `name` risponde a quello che si sta scrivendo (docs/changelog/2026-10-28-quanto-costa-sinonimi.md): senza badare
 * ad accenti, maiuscole e plurali ("perdite" trova "Riparazione perdita
 * d'acqua", "umidita" trova "Risanamento umidità") e con i sinonimi
 * ("imbiancatura" trova "Tinteggiatura interni"). Funziona anche a parola
 * non finita.
 */
export function serviceNameMatches(name: string, query: string): boolean {
  const key = serviceNameKey(query);
  if (!key) return true;
  const canonical = canonicalServiceName(name);
  if (canonicalServiceName(query) === canonical) return true;
  return [serviceNameKey(name), ...(VARIANT_KEYS_BY_NAME.get(canonical) ?? [])].some((candidate) => candidate.includes(key));
}

/** Tutti i nomi suggeriti, senza doppioni, per i suggerimenti mentre si scrive. */
export const ALL_SUGGESTED_SERVICES: readonly string[] = [...new Set(Object.values(POPULAR_SERVICES).flat())].sort((a, b) =>
  a.localeCompare(b, "it"),
);

/** Lettere da cambiare per passare da una parola all'altra (distanza di Levenshtein). */
function editDistance(a: string, b: string): number {
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) {
      current[j] = Math.min(previous[j]! + 1, current[j - 1]! + 1, previous[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    previous = current;
  }
  return previous[b.length]!;
}

/**
 * Due nomi di prestazione quasi uguali, da proporre di unire in Admin
 * (docs/changelog/2026-11-03-automazioni-admin.md): stesse parole in un
 * altro ordine ("Caldaia pulizia") o un errore di battitura ("Pulzia
 * caldaia"). Articoli e plurali li unisce già `serviceNameKey`. Mai due nomi
 * corti: "Taglio siepi" e "Taglio sieps" sì, "Posa" e "Pose" no.
 */
export function nearlySameServiceName(a: string, b: string): boolean {
  const keyA = serviceNameKey(a);
  const keyB = serviceNameKey(b);
  if (!keyA || !keyB || keyA === keyB) return false;
  const sorted = (key: string) => key.split(" ").sort().join(" ");
  if (sorted(keyA) === sorted(keyB)) return true;
  const shorter = Math.min(keyA.length, keyB.length);
  const allowed = shorter >= 14 ? 2 : shorter >= 8 ? 1 : 0;
  // Un numero diverso è un'altra prestazione ("Trasloco 2 locali" e "Trasloco 3 locali").
  if (allowed === 0 || keyA.replace(/\D/g, "") !== keyB.replace(/\D/g, "")) return false;
  return editDistance(keyA, keyB) <= allowed;
}

/**
 * Mestiere di una prestazione, per mostrarle divise per mestiere
 * (docs/changelog/2026-11-05-registrazione-colonna-unica.md): quello salvato
 * se è ancora tra i mestieri del profilo; per le prestazioni di prima (senza
 * mestiere) quello che la suggerisce, altrimenti il principale.
 * `suggestedFor` di serie usa POPULAR_SERVICES; il profilo aggiunge le
 * prestazioni standard dell'admin.
 */
export function serviceCategoryOf<Slug extends keyof typeof POPULAR_SERVICES>(
  service: { name: string; categorySlug?: string | null },
  categorySlugs: readonly Slug[],
  suggestedFor: (slug: Slug) => readonly string[] = (slug) => POPULAR_SERVICES[slug],
): Slug | undefined {
  const saved = categorySlugs.find((slug) => slug === service.categorySlug);
  if (saved) return saved;
  const name = canonicalServiceName(service.name);
  return categorySlugs.find((slug) => suggestedFor(slug).includes(name)) ?? categorySlugs[0];
}
