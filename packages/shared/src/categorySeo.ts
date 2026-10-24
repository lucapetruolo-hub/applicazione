import type { ProfessionalCategorySlug } from "./categories";

/**
 * Pagine categoria+città indicizzabili solo da 3 professionisti veri in su
 * (docs/CHANGELOG.md §296, strategia SEO Latina): con meno, la pagina resta
 * visibile a chi la apre ma fuori da Google e dalla sitemap, così non si
 * creano pagine quasi vuote tutte uguali.
 */
export const MIN_PROFESSIONALS_TO_INDEX_CITY = 3;

/**
 * Come si chiama il lavoro in una domanda ("Quanto costa un idraulico a
 * Latina?") e chi cerca lavoro ("Lavoro nelle pulizie"): articolo e forma
 * che usano le persone nelle ricerche. Tipizzato
 * su tutte le categorie, così una categoria nuova non resta senza.
 */
export const CATEGORY_SEO_NOUN: Record<ProfessionalCategorySlug, { costQuestion: string; findQuestion: string; workTitle: string }> = {
  idraulico: { costQuestion: "Quanto costa un idraulico", findQuestion: "un idraulico", workTitle: "Lavoro per idraulici" },
  elettricista: { costQuestion: "Quanto costa un elettricista", findQuestion: "un elettricista", workTitle: "Lavoro per elettricisti" },
  imbianchino: { costQuestion: "Quanto costa un imbianchino", findQuestion: "un imbianchino", workTitle: "Lavoro per imbianchini" },
  pulizie: { costQuestion: "Quanto costano le pulizie", findQuestion: "un'impresa di pulizie o una colf", workTitle: "Lavoro nelle pulizie" },
  giardiniere: { costQuestion: "Quanto costa un giardiniere", findQuestion: "un giardiniere", workTitle: "Lavoro per giardinieri" },
  traslochi: { costQuestion: "Quanto costa un trasloco", findQuestion: "una ditta di traslochi", workTitle: "Lavoro nei traslochi" },
  fabbro: { costQuestion: "Quanto costa un fabbro", findQuestion: "un fabbro", workTitle: "Lavoro per fabbri" },
  climatizzazione: { costQuestion: "Quanto costa un tecnico per caldaie e climatizzatori", findQuestion: "un tecnico per caldaie e climatizzatori", workTitle: "Lavoro per tecnici di caldaie e climatizzatori" },
  muratore: { costQuestion: "Quanto costa un muratore", findQuestion: "un muratore", workTitle: "Lavoro per muratori" },
  falegname: { costQuestion: "Quanto costa un falegname", findQuestion: "un falegname", workTitle: "Lavoro per falegnami" },
  tuttofare: { costQuestion: "Quanto costa un tuttofare", findQuestion: "un tuttofare", workTitle: "Lavoro come tuttofare" },
  dogsitter: { costQuestion: "Quanto costa un dogsitter", findQuestion: "un dogsitter", workTitle: "Lavoro come dogsitter" },
  babysitter: { costQuestion: "Quanto costa una babysitter", findQuestion: "una babysitter", workTitle: "Lavoro come babysitter" },
};
