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
