import { PROFESSIONAL_CATEGORIES, type ProfessionalCategorySlug } from "./categories";
import { matchProblem } from "./problemMatch";

/**
 * Frasi d'esempio della ricerca per problema in home (richiesta di Luca,
 * docs/changelog/2026-11-03-luci-che-accelerano.md): sotto il riquadro
 * ("Prova: …") e in cima all'elenco del campo vuoto "Cosa è successo?".
 *
 * Elenco di partenza, finché l'admin non lo cambia in "Mestieri richiesti":
 * frasi brevi che il dizionario riconosce con sicurezza, almeno una per i
 * mestieri del lancio (idraulico, elettricista, pulizie, falegname). Mai
 * frasi scritte dai clienti, che possono contenere dati personali.
 */
export const DEFAULT_PROBLEM_EXAMPLES: readonly string[] = [
  "Scarico intasato",
  "Salta la corrente",
  "Pulizie dopo i lavori",
  "Armadio in legno su misura",
  "Il rubinetto perde",
  "Impianto elettrico da rifare",
  "Caldaia in blocco",
  "Serratura bloccata",
  "Pulizia di casa a fondo",
  "Imbiancare una stanza",
  "Prato da tagliare",
  "Crepe nel muro",
  "Trasloco di un bilocale",
  "Condizionatore che non raffredda",
];

export const PROBLEM_EXAMPLE_MAX = 60;

/**
 * Ordine dei mestieri prima che ci siano ricerche vere: volumi di ricerca di
 * Google (Keyword Planner, docs/CHANGELOG.md §303), poi il catalogo.
 */
export const GOOGLE_VOLUME_ORDER: readonly ProfessionalCategorySlug[] = [
  "idraulico",
  "elettricista",
  "pulizie",
  "falegname",
  "climatizzazione",
  "fabbro",
  "imbianchino",
  "traslochi",
  "giardiniere",
  "muratore",
];

/** Nome da scrivere nel campo per un mestiere: corto, e che la ricerca riconosce. */
const TRADE_SHORT: Partial<Record<ProfessionalCategorySlug, string>> = {
  climatizzazione: "Climatizzazione",
  muratore: "Muratore",
};

export function tradeExampleName(slug: ProfessionalCategorySlug): string {
  return TRADE_SHORT[slug] ?? PROFESSIONAL_CATEGORIES.find((category) => category.slug === slug)?.label ?? slug;
}

export type ProblemExample = {
  text: string;
  /** Mestiere che il dizionario riconosce con sicurezza; null se nessuno. */
  categorySlug: ProfessionalCategorySlug | null;
  /** "Ti serve: Idraulico" sotto la frase. */
  categoryLabel: string | null;
};

/** `GET /problem-match/examples`: frasi e mestieri già nell'ordine delle ricerche. */
export type ProblemExamplesResponse = {
  examples: ProblemExample[];
  /** I mestieri più cercati, per "O scrivi solo chi cerchi:". */
  trades: { slug: ProfessionalCategorySlug; name: string }[];
};

/** Il mestiere di una frase, solo se il dizionario è sicuro. */
export function describeProblemExample(text: string): ProblemExample {
  const match = matchProblem(text);
  const first = match.outOfService || !match.confident ? undefined : match.categories[0];
  const category = first ? PROFESSIONAL_CATEGORIES.find((item) => item.slug === first.slug) : undefined;
  return { text, categorySlug: category?.slug ?? null, categoryLabel: category?.label ?? null };
}

/**
 * Frasi ordinate per mestiere più cercato (a parità, l'ordine dell'elenco) e
 * i primi tre mestieri. `order` vuoto: l'ordine dei volumi di Google.
 */
export function orderProblemExamples(texts: readonly string[], order: readonly ProfessionalCategorySlug[]): ProblemExamplesResponse {
  // Le ricerche vere prima; i mestieri mai cercati seguono l'ordine di Google.
  const ranking = [...new Set([...order, ...GOOGLE_VOLUME_ORDER])];
  const rank = new Map<string, number>(ranking.map((slug, index) => [slug, index]));
  const described = texts.map(describeProblemExample).filter((example) => example.categorySlug);
  // Una frase per mestiere prima, poi le altre: così i primi posti coprono mestieri diversi.
  const seen = new Set<string>();
  const firsts: ProblemExample[] = [];
  const rest: ProblemExample[] = [];
  for (const example of described) {
    if (example.categorySlug && !seen.has(example.categorySlug)) {
      seen.add(example.categorySlug);
      firsts.push(example);
    } else {
      rest.push(example);
    }
  }
  const byRank = (a: ProblemExample, b: ProblemExample) => (rank.get(a.categorySlug ?? "") ?? 99) - (rank.get(b.categorySlug ?? "") ?? 99);
  const examples = [...firsts.sort(byRank), ...rest.sort(byRank)];
  const trades = ranking.slice(0, 3).map((slug) => ({ slug, name: tradeExampleName(slug) }));
  return { examples, trades };
}

/** Le 5 frasi sotto il riquadro (scelta di Luca): le più utili, sempre le stesse finché non cambia l'ordine. */
export const VISIBLE_PROBLEM_EXAMPLES = 5;
/** Nel campo vuoto: 2 frasi a rotazione tra le 4 successive. */
export const FIELD_PROBLEM_EXAMPLES = 2;
export const FIELD_PROBLEM_EXAMPLES_POOL = 4;

/**
 * Frasi pronte da proporre in Admin per i mestieri senza una frase d'esempio
 * (docs/changelog/2026-11-03-automazioni-admin.md): tutte riconosciute con
 * sicurezza dal dizionario (lo controlla `problemExamples.test.ts`), la prima
 * libera è quella proposta.
 */
export const SUGGESTED_PROBLEM_EXAMPLES: Record<ProfessionalCategorySlug, readonly string[]> = {
  idraulico: ["Il rubinetto perde", "Scarico intasato", "Lo sciacquone perde acqua"],
  elettricista: ["Salta la corrente", "Impianto elettrico da rifare"],
  imbianchino: ["Imbiancare una stanza"],
  pulizie: ["Pulizia di casa a fondo", "Pulizie dopo i lavori", "Pulizia delle scale del condominio"],
  giardiniere: ["Prato da tagliare", "Potare la siepe", "Potatura degli alberi"],
  traslochi: ["Trasloco di un bilocale", "Trasportare un divano"],
  fabbro: ["Serratura bloccata", "Porta blindata che non si apre", "Cambiare la serratura"],
  climatizzazione: ["Condizionatore che non raffredda", "Caldaia in blocco", "Installare un condizionatore"],
  muratore: ["Crepe nel muro", "Rifare il bagno", "Infiltrazioni dal terrazzo"],
  falegname: ["Armadio in legno su misura"],
  tuttofare: ["Montare una mensola"],
  elettrodomestici: ["La lavatrice non scarica", "Il frigorifero non raffredda", "La lavastoviglie non lava bene"],
  dogsitter: ["Passeggiate per il cane", "Qualcuno che porti fuori il cane", "Tenere il cane nel weekend"],
  babysitter: ["Babysitter per la sera"],
};
