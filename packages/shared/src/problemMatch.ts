import type { ProfessionalCategorySlug } from "./categories";

/**
 * Dal problema descritto al mestiere ("Cosa è successo?", docs/CHANGELOG.md
 * §392, thread "Proporre i professionisti dalla descrizione del problema").
 * Primo strato: un dizionario di parole, istantaneo e senza servizi esterni.
 * Decide da solo gli avvisi di sicurezza (mai l'intelligenza artificiale) e
 * dice quando ha anche un minimo dubbio (`confident: false`): lì il server
 * chiede all'intelligenza artificiale (decisione dell'utente del 27/10).
 * Confini tra mestieri dal DM 37/2008 (analisi/abbinamento-problema/
 * regole-etichette.md). Banco di prova: `test-data/banco-problemi.csv`.
 */

export type ProblemSafety = "gas" | "elettrico" | "acqua-elettrico" | "monossido";

/** Lavori che nessuna nostra categoria copre: prima si cercano i professionisti che li dichiarano, poi "Ce ne occupiamo noi". */
export type ProblemOutOfService =
  | "elettrodomestici"
  | "antennista"
  | "tende-da-sole"
  | "disinfestazione"
  | "spurghi"
  | "spazzacamino"
  | "vetraio"
  | "antifurto"
  | "ascensori"
  | "badante";

export const OUT_OF_SERVICE_LABELS: Record<ProblemOutOfService, string> = {
  elettrodomestici: "Riparazione elettrodomestici",
  antennista: "Antennista",
  "tende-da-sole": "Tende da sole",
  disinfestazione: "Disinfestazione",
  spurghi: "Spurghi",
  spazzacamino: "Spazzacamino",
  vetraio: "Vetraio",
  antifurto: "Antifurto",
  ascensori: "Ascensori",
  badante: "Badante",
};

/** Parole da cercare nei servizi, nei patentini e nella descrizione dei professionisti prima di dire "fuori servizio". */
export const OUT_OF_SERVICE_KEYWORDS: Record<ProblemOutOfService, readonly string[]> = {
  elettrodomestici: ["elettrodomestic", "lavatric", "lavastovigli", "frigorifer", "asciugatric"],
  antennista: ["antenn", "parabol", "digitale terrestre"],
  "tende-da-sole": ["tende da sole", "tenda da sole", "pergotend", "tendaggi"],
  disinfestazione: ["disinfest", "derattizz", "blatte"],
  spurghi: ["spurg", "pozzo nero", "fossa biologica"],
  spazzacamino: ["spazzacamin", "canna fumaria", "canne fumarie"],
  vetraio: ["vetrai", "vetri", "vetro"],
  antifurto: ["antifurto", "allarm", "videosorveglianz"],
  ascensori: ["ascensor", "montascale"],
  badante: ["badant", "anzian"],
};

export type ProblemQuestion = {
  id: string;
  text: string;
  answers: readonly { label: string; category: ProfessionalCategorySlug }[];
};

export type ProblemMatch = {
  /** Mestieri in ordine, dal più probabile; vuoto se il testo non dice niente di riconoscibile. */
  categories: { slug: ProfessionalCategorySlug; score: number }[];
  safety: ProblemSafety | null;
  outOfService: ProblemOutOfService | null;
  /** Domanda con risposte cliccabili quando i primi due mestieri sono una coppia ambigua nota. */
  question: ProblemQuestion | null;
  /** `false` appena c'è un dubbio: il server chiede all'intelligenza artificiale. */
  confident: boolean;
};

export function normalizeProblemText(text: string): string {
  return ` ${text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()} `;
}

type Weights = Partial<Record<ProfessionalCategorySlug, number>>;
type Rule = { words: readonly string[]; weights: Weights };

// Ogni parola vale come inizio di parola ("rubinett" trova "rubinetto" e
// "rubinetti"); più parole separate da spazio vanno scritte vicine così.
const RULES: readonly Rule[] = [
  // Idraulico (DM 37/2008 lettera d)
  { words: ["idraulic"], weights: { idraulico: 5 } },
  { words: ["rubinett", "miscelator", "monocomando", "flessibil", "sifon", "piletta", "sanitrit", "autoclave", "passo rapido"], weights: { idraulico: 3 } },
  { words: ["wc", "water", "sciacquon", "bidet", "vaschetta", "cassetta wc", "cassetta del wc", "cassetta incassata", "tirare l acqua", "tiro l acqua"], weights: { idraulico: 3 } },
  { words: ["scaric", "intasat", "otturat", "ingorg", "stur", "disostru", "disgorg", "rigurgit", "gorgogli", "fogna", "fognatur", "pozzett", "scorre lento", "lento a scaricare"], weights: { idraulico: 3 } },
  { words: ["lavandin", "lavell", "lavabo", "acquaio", "pilozza", "doccia", "vasca", "sanitari", "soffione", "deviator doccia", "deviatore vasca"], weights: { idraulico: 2 } },
  { words: ["tubo", "tubi", "tubaz", "tubatur", "perdita d acqua", "perde acqua", "perde", "perdit", "gocciol", "allagat", "allagament", "pressione dell acqua", "pressione acqua", "poca pressione", "bassa pressione", "contatore dell acqua", "contatore acqua", "valvola", "acqua fredda"], weights: { idraulico: 2 } },
  { words: ["puzza di fogna", "odore di fogna", "puzza", "cattivo odore"], weights: { idraulico: 1 } },

  // Elettricista (lettera a)
  { words: ["elettricist"], weights: { elettricista: 5 } },
  { words: ["salvavit", "differenzial", "magnetotermic", "quadro elettric", "quadretto", "impianto elettric", "salta la corrente", "salta corrente", "saltata la corrente", "va via la corrente", "senza corrente", "manca la corrente", "corrente"], weights: { elettricista: 3 } },
  { words: ["presa", "prese", "interruttor", "lampadar", "plafonier", "punti luce", "punto luce", "faretto", "faretti", "illuminazion", "luce", "luci", "dimmer", "crepuscolar", "temporizzator", "invertitor", "cavi elettric", "cavo elettric", "fili elettric", "filo volante", "fili", "contatore", "domotic", "smart"], weights: { elettricista: 3 } },
  { words: ["citofon", "videocitofon", "campanell", "apriporta", "cicalin"], weights: { elettricista: 3 } },
  { words: ["fotocellul", "automazion", "cancello elettric", "cancello automatic", "motore", "motorizzat", "motorino", "telecomando", "elettric"], weights: { elettricista: 2 } },
  { words: ["ventilatore da soffitto", "ventilatore a soffitto", "ventilator", "fotocellul", "cancello elettric", "cancello automatic", "impianto allagato", "gruppo di continuita", "gruppo continuita", "elettroserratur"], weights: { elettricista: 5 } },
  { words: ["scossa", "scintill", "bruciat"], weights: { elettricista: 3 } },

  // Climatizzazione e caldaie (lettere c, e)
  { words: ["caldai", "bruciator", "riscaldament", "termostat", "cronotermostat", "valvola di zona", "fan coil", "pompa di calore", "canna fumaria"], weights: { climatizzazione: 4 } },
  { words: ["scarico condensa", "scarico della condensa", "tubo condensa", "monossid", "impianto canalizzato", "canalizzat"], weights: { climatizzazione: 6 } },
  { words: ["condizionator", "climatizzator", "clima", "split", "pinguino", "aria fredda", "non raffredda", "vmc"], weights: { climatizzazione: 4 } },
  { words: ["condensa"], weights: { climatizzazione: 1, muratore: 1, imbianchino: 1 } },
  { words: ["termosifon", "radiator", "calorifer", "scaldasalviett", "valvole termostatich"], weights: { climatizzazione: 2, idraulico: 2 } },
  { words: ["acqua calda", "scaldabagn", "scaldin", "boiler", "boilerin", "scaldaacqua", "accumulo"], weights: { climatizzazione: 3, idraulico: 2 } },
  { words: ["gas", "gpl", "metano", "fornell", "piano cottura", "fiamma"], weights: { climatizzazione: 2, idraulico: 2 } },

  // Muratore e ristrutturazioni
  { words: ["murator", "impresa edile", "ditta edile", "ristruttur", "rifare il bagno", "rifacimento", "demoli", "opere murarie"], weights: { muratore: 5 } },
  { words: ["crepa", "crepe", "cavillatur", "intonac", "piastrell", "mattonell", "fughe", "massetto", "sottofondo", "solaio", "tramezz", "cartongesso", "controsoffitt", "muretto", "muro di cinta", "facciata", "cappotto", "efflorescenz", "vespaio", "foratoni", "laterizi", "cemento", "calcestruzz", "gres", "klinker", "vetrocemento", "nicchia", "tracce", "traccia", "rasare", "rasatura"], weights: { muratore: 3 } },
  { words: ["infiltraz", "infiltazion", "impermeabilizz", "impermebilizz", "lastrico", "terrazz", "balcon", "poggiolo", "guaina", "comignolo", "grondai", "pluvial", "umidita", "risalita", "bocche di lupo", "sgretol"], weights: { muratore: 3 } },
  { words: ["muro", "muri", "parete", "pareti", "soffitto", "pavimento", "pavimentaz", "marciapied", "camino", "colonne", "buco nel muro", "foro nel muro"], weights: { muratore: 2 } },

  // Imbianchino
  { words: ["imbianchin", "pittor", "tinteggi", "imbianc", "pittur", "pitturare", "ridipinger", "dipinger", "vernic", "riverniciar", "sverniciar", "idropittura", "smalto", "colore", "carta da parati", "parati", "stucco veneziano", "bucciato", "sfoglia", "scrostat", "aloni gialli", "dare il bianco", "ridato il bianco", "stuccat", "ditate", "manate"], weights: { imbianchino: 4 } },
  { words: ["muffa", "antimuffa"], weights: { imbianchino: 4, muratore: 2 } },
  { words: ["macchia", "macchie"], weights: { imbianchino: 1 } },

  // Pulizie
  { words: ["pulizi", "pulire", "pulisca", "pulit", "puluzie", "sporc", "spolver", "sanificaz", "igienizz", "donna delle pulizie", "signora delle pulizie", "colf", "domestica", "stirar", "stiro", "aspirapolver", "lavare", "lavaggio", "smacchi", "aloni", "guano", "calcare", "fine cantiere", "fine lavori", "post ristrutturazione", "termine della ristrutturazione", "terminato la ristrutturazione", "dopo la ristrutturazione", "impresa di pulizie"], weights: { pulizie: 4 } },
  { words: ["pulizia completa", "pulizia accurata", "pulizia approfondita", "pulizia dettagliata", "pulizia a fondo", "pulire a fondo", "sporcata", "squadra di pulizie"], weights: { pulizie: 6 } },

  // Giardiniere
  { words: ["giardinier", "giardino", "prato", "erba", "siepe", "siepi", "potar", "potatur", "albero", "alberi", "pianta", "piante", "fiori", "aiuol", "irrigaz", "irrigator", "tagliaerba", "rasaerba", "sfalci", "ceppo", "radici", "terreno", "terriccio", "sacchi di terra", "vanga", "rastrell", "orto", "lumache", "concim", "foglie", "ibiscus", "fioriera"], weights: { giardiniere: 4 } },
  { words: ["recinzion", "staccionat"], weights: { giardiniere: 2, fabbro: 2 } },

  // Traslochi
  { words: ["trasloc", "traslocar", "traslochi", "trasferiment", "trasferisc", "trasferend"], weights: { traslochi: 5 } },
  { words: ["trasport", "furgon", "facchin", "scatol", "imball", "autoscala", "montacarichi", "stoccar", "deposito", "carico", "scaricare", "portare al", "piano senza ascensore", "senza ascensore", "con ascensore", "sgomber", "svuotar"], weights: { traslochi: 3 } },
  { words: ["spostare", "portare", "ritirare", "consegnat"], weights: { traslochi: 1 } },
  { words: ["scarico della merce", "per lo scarico", "carico e scarico", "carico e lo scarico", "lo scarico ci", "scarico dal furgone"], weights: { traslochi: 6 } },
  { words: ["materass", "letto matrimoniale", "divano", "divani", "madia", "madie", "piano terra", "piano rialzato", "trasportabil", "parcheggio", "settimo piano", "nono piano", "terzo piano"], weights: { traslochi: 2 } },

  // Fabbro
  { words: ["fabbro"], weights: { fabbro: 5 } },
  { words: ["serratur", "cilindr", "chiave", "chiavi", "mandate", "doppia mappa", "porta blindata", "blindat", "chiuso fuori", "chiusa fuori", "rimasto fuori", "rimasta fuori", "apertura porta", "aprire la porta", "furto", "scasso"], weights: { fabbro: 4 } },
  { words: ["cancell", "inferriat", "grata", "grate", "ringhier", "ferro", "saldat", "zinc", "serranda", "saracinesca", "basculante", "persiana in alluminio", "persiana alluminio", "turbovit"], weights: { fabbro: 3 } },
  { words: ["cardin", "maniglia"], weights: { fabbro: 1, falegname: 1 } },

  // Falegname
  { words: ["falegnam", "legno", "parquet", "compensato", "mdf", "osb", "intarsi", "restaur", "su misura", "scrigno", "porta scorrevole", "porte scorrevoli", "anta scorrevole", "vasistas", "persiane", "persiana", "infissi", "infisso", "serramenti", "finestra", "finestre", "portafinestra", "porta finestra", "porte finestre", "cassonetto", "casetta in legno", "lucernari", "sedia", "tavolo", "tavolino", "como", "cassetti", "cassetto"], weights: { falegname: 3 } },
  { words: ["porta", "porte", "anta", "ante", "cerniere", "battiscopa", "armadio", "armadi", "mobile", "mobili", "cucina"], weights: { falegname: 1, tuttofare: 1 } },

  // Tutto Fare
  { words: ["tuttofare", "tutto fare", "piccoli lavori", "piccoli interventi", "piccole riparazioni", "lavoretti", "lavori manuali"], weights: { tuttofare: 5 } },
  { words: ["montare", "montaggio", "montarli", "smontare", "ikea", "pax", "kallax", "mensol", "appendere", "appendiabiti", "quadri", "tende", "tenda", "bastone", "tasselli", "trapano", "fissare", "fissaggio", "ganci", "staffa", "tv a muro", "scarpiera", "libreria", "zanzarier", "tapparell", "box doccia", "fermapersiana", "dondolo", "scolapiatti", "pensili"], weights: { tuttofare: 3 } },

  // Dogsitter
  { words: ["dog sitter", "dogsitter", "pet sitter", "cane", "cani", "cagnolin", "cagnetta", "cucciol", "bassott", "maltes", "barboncin", "meticcio", "pastore tedesco", "jack russell", "segugio", "staffordshire", "stafforshire", "passeggiat", "portare a spasso", "portare fuori", "far uscire il cane", "far scendere", "pensione per cani", "stallo", "gatto", "gatti", "croccantini"], weights: { dogsitter: 5 } },

  // Babysitter
  { words: ["baby sitter", "babysitter", "babysitting", "tata", "neonat", "asilo", "uscita da scuola", "uscita dalla scuola", "prendere a scuola", "prenderli a scuola", "compiti", "ragazza alla pari", "tagesmutter"], weights: { babysitter: 5 } },
  { words: ["bambin", "bimb", "nonni"], weights: { babysitter: 3 } },
  { words: ["figlio", "figlia", "figli"], weights: { babysitter: 2 } },
];

type OutRule = { words: readonly string[]; kind: ProblemOutOfService };

// Guasti degli elettrodomestici: solo con un verbo da guasto. Installarli o
// collegarli resta all'idraulico, all'elettricista o al Tutto Fare.
const APPLIANCES = ["lavatric", "lavastovigli", "lavapiatti", "frigo", "frigorifer", "congelator", "asciugatric", "microonde", "forno", "piano a induzione", "piastra induzione", "piano induzione", "purificator", "aspirapolvere", "elettrodomestic", "cappa aspirante"];
const APPLIANCE_FAULT = ["non scarica", "non parte", "non si accende", "non funziona", "non lava", "non raffredda", "non congela", "non asciuga", "non scalda", "si blocca", "errore", "codice", "rumor", "fa scattare", "fumo", "ghiacci", "spegnerla", "lava male", "pompa", "ventola", "temperatur", "instabilit", "non mi scarica", "non aspira", "non carica", "non si apre"];

const OUT_RULES: readonly OutRule[] = [
  { words: ["antenn", "parabol", "canali tv", "non prende i canali", "non prende tutti i canali", "segnale dall antenna", "decoder"], kind: "antennista" },
  { words: ["tende da sole", "tenda da sole", "pergotend", "tende a bracci", "tenda a bracci"], kind: "tende-da-sole" },
  { words: ["blatte", "scarafagg", "topi", "ratti", "disinfest", "derattizz", "tarme", "termiti", "vespe", "calabroni", "cimici"], kind: "disinfestazione" },
  { words: ["pozzo nero", "spurg", "fossa biologica", "fossa settica", "autospurgo"], kind: "spurghi" },
  { words: ["spazzacamin", "camino fa fumo", "camino che fa fumo", "fuliggine"], kind: "spazzacamino" },
  { words: ["vetraio", "vetro rotto", "vetro si e rotto", "si rompe un vetro", "vetro rotto", "riparare un vetro", "cambiare il vetro"], kind: "vetraio" },
  { words: ["antifurto", "allarme", "allarmi", "videosorveglianz", "telecamere"], kind: "antifurto" },
  { words: ["ascensore bloccato", "ascensore fermo", "ascensore rotto", "ascensore non", "ascensore guasto", "montascale"], kind: "ascensori" },
  { words: ["badant", "persona anziana", "assistenza anzian", "di 80 anni", "di 90 anni", "autosufficient"], kind: "badante" },
];

// Avvisi di sicurezza: un avviso in più su una frase innocua va bene, uno in
// meno no (100% sul banco di prova).
const SAFETY_RULES: readonly { kind: ProblemSafety; test: (t: string) => boolean }[] = [
  {
    kind: "monossido",
    test: (t) => /\smonossid|\sfiamma gialla|\s(camino|stufa|caminetto)\s(\w+\s){0,4}fumo|\s(caldaia|stufa)\s(\w+\s){0,3}(fa|emette|esce|fanno)\s(\w+\s){0,2}fumo|\sfumo\s(\w+\s){0,2}(dalla |della )?caldaia|\sodore (di |acre di )?fuliggine/.test(t),
  },
  {
    kind: "gas",
    test: (t) =>
      /\s(odore|puzza|sento|sente|sentire|perdita|perdite|fuga|fughe|fuoriuscita)\s(\w+\s){0,3}gas\s/.test(t) && !/condizionator|climatizzator|refrigerant|\sclima\s|split/.test(t),
  },
  {
    kind: "acqua-elettrico",
    test: (t) =>
      // "Quando piove" e "umido" vicino a una presa contano come acqua (collaudo del 29/10/2026, M-11).
      (/\s(acqua|bagnat|allagat|alluvion|infiltraz|inondat|piov|pioggia|umid|gocciol)/.test(t) && /\s(prese?\s|presa\s|presa elettric|quadro|impianto elettric|ciabatt|interruttor|senza corrente|corrente\s)/.test(t)) ||
      /\simpianto allagato/.test(t),
  },
  {
    kind: "elettrico",
    test: (t) =>
      (/\sscintill/.test(t) && !/\s(fiamma|accension|piezo|bruciatore)/.test(t)) ||
      /\s(scossa|bruciat|plastica fusa|fumo dalla presa|fumo dal quadro|fumo e)|\s(odore|puzza)\s(\w+\s){0,6}(presa|prese|interrut|quadro|scatola)|\s(cavo|filo|cavi|presa|spina)\s(\w+\s){0,3}(si scald|scotta|fuma)|\sfa fumo|\sfuma\s/.test(t),
  },
];

type Pair = readonly [ProfessionalCategorySlug, ProfessionalCategorySlug];

// Domande per le coppie ambigue più frequenti del banco di prova
// (analisi/abbinamento-problema/fase1-numeri.md). Una sola domanda, risposte
// cliccabili; il mestiere proposto si può sempre cambiare.
const GAS_QUESTION: ProblemQuestion = {
  id: "gas",
  text: "Dove senti l'odore di gas?",
  answers: [
    { label: "Vicino alla caldaia o allo scaldabagno", category: "climatizzazione" },
    { label: "In cucina o vicino ai tubi del gas", category: "idraulico" },
  ],
};

const QUESTIONS: readonly { pairs: readonly Pair[]; question: ProblemQuestion }[] = [
  {
    pairs: [["idraulico", "muratore"], ["imbianchino", "muratore"], ["idraulico", "imbianchino"]],
    question: {
      id: "macchia",
      text: "Da dove sembra arrivare l'acqua o l'umidità?",
      answers: [
        { label: "Da un tubo, un bagno o la casa di sopra", category: "idraulico" },
        { label: "Da fuori, quando piove", category: "muratore" },
        { label: "È muffa, senza perdite", category: "imbianchino" },
      ],
    },
  },
  {
    pairs: [["climatizzazione", "idraulico"]],
    question: {
      id: "acqua-calda",
      text: "Che cosa scalda l'acqua o la casa?",
      answers: [
        { label: "Una caldaia o uno scaldabagno a gas", category: "climatizzazione" },
        { label: "Uno scaldabagno elettrico", category: "idraulico" },
        { label: "Il problema è nei tubi o nei rubinetti", category: "idraulico" },
      ],
    },
  },
  {
    pairs: [["tuttofare", "falegname"], ["falegname", "fabbro"], ["tuttofare", "fabbro"]],
    question: {
      id: "porte-tapparelle",
      text: "Cosa non va?",
      answers: [
        { label: "La serratura o la chiave", category: "fabbro" },
        { label: "Il legno: la porta o la finestra struscia, non chiude", category: "falegname" },
        { label: "Va solo sistemata o montata", category: "tuttofare" },
      ],
    },
  },
  {
    pairs: [["tuttofare", "elettricista"], ["elettricista", "fabbro"], ["falegname", "elettricista"]],
    question: {
      id: "motore",
      text: "Funziona con la corrente?",
      answers: [
        { label: "Sì: motore, luce, interruttore o telecomando", category: "elettricista" },
        { label: "No, è solo da sistemare o montare", category: "tuttofare" },
      ],
    },
  },
  {
    pairs: [["traslochi", "tuttofare"]],
    question: {
      id: "trasporto",
      text: "Serve anche portare le cose da un posto all'altro?",
      answers: [
        { label: "Sì, servono trasporto o facchini", category: "traslochi" },
        { label: "No, solo da montare o sistemare in casa", category: "tuttofare" },
      ],
    },
  },
];

// Tarate sul mucchio di lavoro: con questi valori il dizionario non ha mai
// sbagliato quando si diceva sicuro (286 su 287); tutto il resto, circa
// metà delle descrizioni, passa all'intelligenza artificiale.
const CONFIDENT_MIN = 4;
const CONFIDENT_GAP = 5;

function containsWord(text: string, word: string): boolean {
  return text.includes(` ${word}`);
}

export function matchProblem(description: string): ProblemMatch {
  const text = normalizeProblemText(description);
  const scores = new Map<ProfessionalCategorySlug, number>();
  const add = (slug: ProfessionalCategorySlug, points: number) => scores.set(slug, (scores.get(slug) ?? 0) + points);
  for (const rule of RULES) {
    // Più parole dello stesso gruppo contano di più, fino al doppio: una
    // descrizione lunga con "mensole, ganci, tenda, trapano" è del Tutto Fare.
    const hits = rule.words.filter((word) => containsWord(text, word)).length;
    if (hits === 0) continue;
    for (const [slug, weight] of Object.entries(rule.weights) as [ProfessionalCategorySlug, number][]) add(slug, weight * Math.min(hits, 2));
  }
  const safety = SAFETY_RULES.find((rule) => rule.test(text))?.kind ?? null;
  // Un pericolo indica anche chi deve intervenire (DM 37/2008).
  if (safety === "gas") {
    add("idraulico", 4);
    add("climatizzazione", 4);
  } else if (safety === "monossido") {
    add("climatizzazione", 6);
  } else if (safety === "elettrico" || safety === "acqua-elettrico") {
    add("elettricista", 6);
  }
  const categories = [...scores.entries()]
    .map(([slug, score]) => ({ slug, score }))
    .sort((a, b) => b.score - a.score);

  const applianceFault =
    APPLIANCES.some((word) => containsWord(text, word)) && APPLIANCE_FAULT.some((word) => containsWord(text, word));
  const outOfService: ProblemOutOfService | null = applianceFault
    ? "elettrodomestici"
    : (OUT_RULES.find((rule) => rule.words.some((word) => containsWord(text, word)))?.kind ?? null);

  const [first, second] = categories;
  let question: ProblemQuestion | null = null;
  if (safety === "gas" && first && second && second.score >= first.score / 2) {
    // Con il gas la domanda dell'acqua calda non c'entra: conta dove si sente l'odore.
    question = GAS_QUESTION;
  } else if (first && second && second.score >= first.score / 2) {
    question =
      QUESTIONS.find((entry) =>
        entry.pairs.some(([a, b]) => (a === first.slug && b === second.slug) || (a === second.slug && b === first.slug)),
      )?.question ?? null;
  }

  // Sicuro solo se un mestiere stacca nettamente gli altri e non c'è niente
  // che lo contraddica: ogni altro caso passa all'intelligenza artificiale.
  const confident =
    first !== undefined && first.score >= CONFIDENT_MIN && (second === undefined || first.score - second.score >= CONFIDENT_GAP) && outOfService === null && question === null;

  return { categories, safety, outOfService, question, confident };
}

/** Risposta di `POST /problem-match`: il dizionario, corretto dall'intelligenza artificiale quando ha un dubbio. */
export type ProblemMatchResult = {
  /** Da uno a tre mestieri in ordine; vuoto se non si capisce o se nessun mestiere va bene. */
  categories: ProfessionalCategorySlug[];
  /** Sempre e solo dal dizionario, mai dall'intelligenza artificiale. */
  safety: ProblemSafety | null;
  outOfService: ProblemOutOfService | null;
  question: ProblemQuestion | null;
  /** Riga "Perché" breve, solo quando risponde l'intelligenza artificiale. */
  reason: string | null;
  source: "dizionario" | "parola" | "ia";
};

export const PROBLEM_DESCRIPTION_MAX = 1000;

/** Pagina admin "Mestieri richiesti". */
export type ProblemWordAdmin = { id: string; word: string; categorySlug: string | null; outOfService: string | null };
export type ProblemMatchAdminOverview = {
  /** Ultimi 30 giorni; i mestieri contano il primo proposto. */
  lastMonth: {
    total: number;
    safety: number;
    ai: number;
    none: number;
    byCategory: { key: string; count: number }[];
    byOutOfService: { key: string; count: number }[];
  };
  descriptions: {
    id: string;
    text: string;
    city: string | null;
    categories: string[];
    safety: string | null;
    outOfService: string | null;
    source: string;
    createdAt: string;
  }[];
  words: ProblemWordAdmin[];
};
export type ServiceNamesAdminOverview = {
  minProfessionals: number;
  /** Tutti i nomi standard, per "Unisci a…". */
  suggested: readonly string[];
  /** "Prestazioni per mestiere" (§388). */
  categories: {
    slug: string;
    label: string;
    /** `id` solo per quelle aggiunte dall'admin (si possono togliere). */
    standard: { name: string; id: string | null; professionalCount: number }[];
    handwritten: { name: string; variants: string[]; professionalCount: number }[];
  }[];
  aliases: { key: string; canonical: string }[];
};
export type StandardServiceAdmin = { id: string; categorySlug: string; name: string };
/** Prestazioni standard aggiunte dall'admin, per categoria (`GET /service-names/standard`). */
export type StandardServicesByCategory = Partial<Record<string, string[]>>;
/** Pagina admin "Richieste da seguire". */
export type ProblemTakeoverAdmin = {
  id: string;
  description: string;
  city: string | null;
  outOfService: string | null;
  status: "OPEN" | "DONE";
  createdAt: string;
  handledAt: string | null;
  client: { name: string | null; email: string | null; phone: string | null };
};
