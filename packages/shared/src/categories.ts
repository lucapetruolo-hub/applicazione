/**
 * Categorie professionisti MVP e relativi sotto-tag di specializzazione.
 * Fonte di verità: CLAUDE.md §6. Ogni nuova categoria va aggiunta qui prima,
 * poi propagata allo schema Prisma (packages/database) e ai client.
 *
 * `icon`: chiave di `packages/ui/src/icons.tsx`/`icons.web.tsx` (nome icona
 * Lucide in kebab-case, es. "wrench"), non più un glifo emoji — questo
 * package resta senza dipendenze UI, quindi porta solo la chiave testuale;
 * la resa vera avviene in `<Icon name={category.icon} />` lato consumer
 * (redesign "Scheda Intervento", Fase 2: CLAUDE.md §10).
 */

export const PROFESSIONAL_CATEGORIES = [
  {
    slug: "idraulico",
    label: "Idraulico",
    icon: "wrench",
    subTags: ["riparazioni-urgenti", "caldaie", "impianti-sanitari"],
  },
  {
    slug: "elettricista",
    label: "Elettricista",
    icon: "zap",
    subTags: ["impianti-civili", "domotica", "certificazioni"],
  },
  {
    slug: "imbianchino",
    label: "Imbianchino",
    icon: "paint-roller",
    subTags: ["interni", "esterni", "decorazioni"],
  },
  {
    slug: "pulizie",
    label: "Pulizie",
    icon: "spray-can",
    subTags: ["casa", "ufficio", "fine-cantiere"],
  },
  {
    slug: "giardiniere",
    label: "Giardiniere",
    icon: "trees",
    subTags: ["manutenzione", "potatura", "progettazione"],
  },
  {
    slug: "traslochi",
    label: "Traslochi",
    icon: "truck",
    subTags: ["locali", "lunga-distanza", "smontaggio-mobili"],
  },
  {
    slug: "fabbro",
    label: "Fabbro",
    icon: "key-round",
    subTags: ["apertura-porte", "serrature", "cancelli"],
  },
  {
    slug: "climatizzazione",
    label: "Climatizzazione e caldaie",
    icon: "thermometer",
    subTags: ["installazione", "manutenzione", "assistenza"],
  },
  {
    slug: "muratore",
    label: "Muratore e ristrutturazioni",
    icon: "hard-hat",
    subTags: ["ristrutturazioni", "opere-murarie", "cartongesso"],
  },
  {
    slug: "falegname",
    label: "Falegname",
    icon: "hammer",
    subTags: ["mobili-su-misura", "riparazioni", "infissi"],
  },
  {
    slug: "tuttofare",
    label: "Tutto Fare",
    icon: "drill",
    subTags: ["piccole-riparazioni", "montaggio-mobili", "manutenzione-generale"],
  },
  {
    slug: "oss",
    label: "OSS",
    icon: "stethoscope",
    subTags: ["assistenza-domiciliare", "assistenza-ospedaliera", "mobilizzazione-pazienti"],
  },
  {
    slug: "badanti",
    label: "Badanti",
    icon: "heart-handshake",
    subTags: ["assistenza-anziani", "convivenza", "compagnia"],
  },
] as const;

export type ProfessionalCategorySlug = (typeof PROFESSIONAL_CATEGORIES)[number]["slug"];

export function isProfessionalCategorySlug(value: string): value is ProfessionalCategorySlug {
  return PROFESSIONAL_CATEGORIES.some((category) => category.slug === value);
}

/**
 * Prestazioni più richieste per categoria, suggerite in /dashboard/profilo
 * come scorciatoia per aggiungere una prestazione senza doverne scrivere il
 * nome da zero — il prezzo (range) resta comunque da compilare a mano,
 * queste sono solo il nome. `Record<ProfessionalCategorySlug, ...>` così il
 * compilatore segnala se manca una categoria quando se ne aggiunge una nuova.
 */
export const POPULAR_SERVICES: Record<ProfessionalCategorySlug, string[]> = {
  idraulico: [
    "Riparazione perdita d'acqua",
    "Sostituzione rubinetteria",
    "Sturatura scarichi",
    "Installazione scaldabagno",
    "Sostituzione caldaia",
  ],
  elettricista: [
    "Impianto elettrico civile",
    "Installazione punti luce",
    "Sostituzione quadro elettrico",
    "Installazione videocitofono",
    "Certificazione impianto",
  ],
  imbianchino: [
    "Tinteggiatura interni",
    "Tinteggiatura esterni",
    "Rasatura pareti",
    "Decorazioni pareti",
    "Verniciatura infissi",
  ],
  pulizie: [
    "Pulizie di casa",
    "Pulizie di ufficio",
    "Pulizie di fine cantiere",
    "Pulizie post-trasloco",
    "Sanificazione ambienti",
  ],
  giardiniere: [
    "Manutenzione giardino",
    "Potatura siepi",
    "Taglio erba",
    "Progettazione giardino",
    "Rimozione alberi",
  ],
  traslochi: [
    "Trasloco locale",
    "Trasloco lunga distanza",
    "Smontaggio e montaggio mobili",
    "Imballaggio oggetti",
    "Trasporto con montacarichi",
  ],
  fabbro: [
    "Apertura porte bloccate",
    "Sostituzione serratura",
    "Installazione cancelli",
    "Riparazione grate",
    "Duplicazione chiavi",
  ],
  climatizzazione: [
    "Installazione climatizzatore",
    "Manutenzione caldaia",
    "Ricarica gas climatizzatore",
    "Pulizia filtri climatizzatore",
    "Assistenza guasti",
  ],
  muratore: [
    "Ristrutturazione bagno",
    "Ristrutturazione cucina",
    "Realizzazione cartongesso",
    "Demolizioni",
    "Rifacimento pavimenti",
  ],
  falegname: [
    "Mobili su misura",
    "Riparazione mobili",
    "Sostituzione infissi",
    "Montaggio mobili",
    "Restauro mobili",
  ],
  tuttofare: [
    "Piccole riparazioni domestiche",
    "Montaggio mobili",
    "Manutenzione generale casa",
    "Piccoli lavori idraulici",
    "Piccoli lavori elettrici",
  ],
  oss: [
    "Assistenza domiciliare",
    "Assistenza ospedaliera",
    "Mobilizzazione pazienti",
    "Igiene personale",
    "Somministrazione terapie",
  ],
  badanti: [
    "Assistenza anziani",
    "Compagnia e supporto",
    "Aiuto nelle faccende domestiche",
    "Accompagnamento a visite mediche",
    "Convivenza h24",
  ],
};

/**
 * Testo di esempio (placeholder) del campo "Descrivi il lavoro" nella
 * richiesta guidata (`/preventivo`), specifico per categoria — richiesta
 * esplicita dell'utente: prima era un unico esempio fisso (a tema
 * idraulico) indipendente dalla categoria scelta. `Record<ProfessionalCategorySlug, ...>`
 * stesso principio già in uso per `POPULAR_SERVICES` sopra. Usato solo
 * quando una categoria è già selezionata: prima di quel momento il
 * chiamante mostra un placeholder generico, mai un esempio inventato per
 * una categoria non ancora scelta.
 */
export const CATEGORY_DESCRIPTION_EXAMPLES: Record<ProfessionalCategorySlug, string> = {
  idraulico:
    "Es. Perdita d'acqua sotto il lavandino della cucina: si forma una pozzanghera ogni volta che apro il rubinetto, penso sia il sifone da sostituire. Nessuna urgenza immediata, ma vorrei un intervento nei prossimi giorni.",
  elettricista:
    "Es. Il differenziale scatta ogni volta che accendo forno e lavatrice insieme, l'impianto ha più di 20 anni e non è mai stato revisionato. Vorrei anche un preventivo per aggiungere qualche presa in soggiorno.",
  imbianchino:
    "Es. Tinteggiatura di due camere da letto (circa 30 mq totali), le pareti hanno alcune crepe da stuccare prima di dipingere. Colore chiaro, vorrei iniziare entro il mese.",
  pulizie:
    "Es. Pulizie di fine cantiere in un appartamento di 80 mq appena ristrutturato: polvere ovunque, vetri e pavimenti da sgrassare prima di trasferirci. Serve un intervento entro la settimana.",
  giardiniere:
    "Es. Siepe di circa 15 metri da potare e prato di 200 mq da tagliare, non viene curato da qualche mese. Vorrei anche un consiglio su come sistemare un'aiuola secca vicino all'ingresso.",
  traslochi:
    "Es. Trasloco da un bilocale al terzo piano senza ascensore a una casa al piano terra a 20 km di distanza, circa 40 scatoloni più un divano e un armadio da smontare. Data prevista tra due settimane.",
  fabbro:
    "Es. La serratura della porta di casa gira a vuoto e non riesco più ad aprire dall'interno, penso vada sostituita insieme al cilindro. Vorrei anche un preventivo per una seconda mandata di sicurezza.",
  climatizzazione:
    "Es. Climatizzatore in camera da letto che non raffredda più come prima, penso serva la ricarica del gas o una pulizia dei filtri. Impianto installato circa 6 anni fa, mai fatto manutenzione.",
  muratore:
    "Es. Ristrutturazione del bagno: sostituzione di sanitari e piastrelle, spostamento del lavandino di circa un metro. Circa 6 mq, vorrei un preventivo comprensivo di smaltimento macerie.",
  falegname:
    "Es. Armadio su misura per una camera mansardata con soffitto inclinato, larghezza circa 2,5 metri. Vorrei anche sistemare un cassetto rotto di un altro mobile mentre siete qui.",
  tuttofare:
    "Es. Montaggio di un armadio e di una libreria appena acquistati, più il fissaggio di due mensole in bagno. Piccoli lavori da completare in una mattina.",
  oss: "Es. Assistenza domiciliare per un familiare anziano dopo un intervento chirurgico: aiuto nell'igiene personale e nella mobilizzazione, alcune ore al giorno per le prossime 2-3 settimane.",
  badanti:
    "Es. Cerco assistenza per mia madre, 82 anni, autosufficiente ma che non deve restare sola: compagnia, aiuto nelle faccende domestiche e accompagnamento a qualche visita medica, alcune ore al pomeriggio.",
};

/**
 * Variante per la richiesta urgente (`/urgente`, `isUrgent: true`), stesso
 * principio di `CATEGORY_DESCRIPTION_EXAMPLES` ma con esempi che riflettono
 * un'emergenza reale della categoria invece di un lavoro programmabile.
 */
export const CATEGORY_URGENT_DESCRIPTION_EXAMPLES: Record<ProfessionalCategorySlug, string> = {
  idraulico:
    "Es. Tubo rotto sotto il lavello della cucina, l'acqua continua a uscire nonostante abbia chiuso il rubinetto generale: rischio di allagare anche il vicino di sotto, serve un intervento immediato.",
  elettricista:
    "Es. Metà casa è rimasta senza corrente dopo un blackout localizzato e sento un leggero odore di bruciato vicino al contatore: per sicurezza serve un intervento immediato.",
  imbianchino:
    "Es. Infiltrazione d'acqua dal soffitto ha lasciato una macchia scura che si sta allargando, temo si formi muffa: vorrei un intervento rapido per trattarla e ridipingere prima che peggiori.",
  pulizie:
    "Es. Una perdita ha allagato parte del salotto, serve un'asciugatura e sanificazione urgente prima che si formi muffa sul pavimento.",
  giardiniere:
    "Es. Un albero del giardino è caduto durante il temporale di stanotte e blocca l'accesso al garage, serve rimozione urgente prima di domani mattina.",
  traslochi:
    "Es. Devo lasciare l'appartamento entro domani per un problema con il proprietario e non ho ancora imballato nulla: cerco un trasloco lampo, anche solo per salvare i mobili principali.",
  fabbro:
    "Es. Sono rimasto chiuso fuori casa, la porta blindata si è chiusa da sola e le chiavi sono rimaste dentro: serve un intervento immediato per l'apertura.",
  climatizzazione:
    "Es. La caldaia si è spenta e non riparte, in casa ci sono bambini piccoli e fa freddo: serve un intervento immediato per riaccenderla o capire il guasto.",
  muratore:
    "Es. Una crepa nel muro del garage si è allargata visibilmente dopo un piccolo smottamento del terreno: vorrei un sopralluogo urgente per capire se è pericolosa.",
  falegname:
    "Es. La porta d'ingresso si è scardinata dai cardini e non chiude più, la casa resta di fatto senza protezione: serve una riparazione urgente.",
  tuttofare:
    "Es. Una tapparella è rimasta bloccata a metà e non riesco a chiuderla né alzarla, è previsto forte vento nelle prossime ore: serve un intervento rapido.",
  oss: "Es. Mio padre è stato dimesso oggi dall'ospedale dopo una caduta e non può restare solo questa notte: cerco assistenza domiciliare urgente, anche solo per le prossime 24 ore.",
  badanti:
    "Es. La badante di mia nonna si è ammalata all'improvviso e non può venire nei prossimi giorni: cerco una sostituzione urgente, anche solo per qualche giorno.",
};

function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(new RegExp("[\\u0300-\\u036f]", "g"), "")
    .trim();
}

/** Trova la categoria più vicina a un testo libero digitato nella search bar. */
export function findCategoryByQuery(query: string) {
  const normalizedQuery = normalize(query);
  if (!normalizedQuery) return undefined;

  return PROFESSIONAL_CATEGORIES.find((category) => {
    if (normalize(category.slug).includes(normalizedQuery)) return true;
    if (normalize(category.label).includes(normalizedQuery)) return true;
    return category.subTags.some((tag) => normalize(tag).includes(normalizedQuery));
  });
}
