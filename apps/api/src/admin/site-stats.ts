import {
  GOOGLE_OPENING_TARGETS,
  GUIDE_GREEN_SHARE,
  GUIDE_QUOTE_HOURS,
  MIN_CASES_PER_ROW,
  MISSING_SERVICE_MIN_PROFESSIONALS,
  POPULAR_SERVICES,
  PRICE_ADVICE_MIN_DAYS_FROM_LAUNCH,
  PRICE_ADVICE_MIN_PAYING,
  PROFESSIONAL_CATEGORIES,
  REQUEST_STEP_SHORT,
  SEARCH_RADIUS_KM,
  SERVICE_GAP_MAX_OFFERED,
  SERVICE_GAP_MIN_SEARCHES,
  SUBMIT_FORM_LABEL,
  guideCellStatus,
  isPopularService,
  normalizeServiceName,
  offersPopularService,
  ratioLabel,
  romeWeekStart,
  type AdminSiteStats,
  type ChurnKind,
  type ChurnReason,
  type GuideCellStatus,
  type ProfessionalCategorySlug,
  type RequestStepKey,
  type SiteAdvice,
  type SubmitFailureKind,
  type SubmitFormKey,
} from "@professionisti/shared";
import { categoryLabel, searchCityLabel, type SearchDemandZone } from "./professional-stats";

/**
 * Andamento del sito (docs/CHANGELOG.md §372): conti e consigli senza
 * database, così si provano con dati scritti a mano. Il servizio legge le
 * righe e i contatori, qui si decide cosa dire al super admin.
 */

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/** Una richiesta, per il numero guida. `groupKey`: le richieste mandate insieme (più lavori) sono un invio solo. */
export type SiteRequestRow = {
  groupKey: string;
  clientId: string;
  categorySlug: string;
  city: string;
  createdAt: Date;
  firstQuoteAt: Date | null;
  deletedByClientAt: Date | null;
  accepted: boolean;
  completed: boolean;
  reviewed: boolean;
};

/**
 * Come conta una richiesta nel numero guida: "yes" con un preventivo entro
 * GUIDE_QUOTE_HOURS ore, "no" senza, `null` se non conta. Non conta una
 * richiesta ancora nelle sue prime 24 ore senza preventivo (non si sa
 * ancora) né una eliminata dal cliente prima delle 24 ore senza preventivo.
 */
export function guideOutcome(row: SiteRequestRow, now: Date): "yes" | "no" | null {
  const deadline = row.createdAt.getTime() + GUIDE_QUOTE_HOURS * HOUR_MS;
  if (row.firstQuoteAt && row.firstQuoteAt.getTime() <= deadline) return "yes";
  if (now.getTime() < deadline) return null;
  if (row.deletedByClientAt && row.deletedByClientAt.getTime() < deadline) return null;
  return "no";
}

const norm = (city: string) => city.trim().toLowerCase();

type VisiblePro = { city: string; categorySlugs: string[] };

/**
 * Caselle lavoro × città (ultimi giorni già filtrati dal chiamante): prima le
 * rosse e quelle senza professionisti, poi le gialle. Le caselle con meno di
 * MIN_CASES_PER_ROW richieste e ricerche senza nessuno vicino si accorpano.
 */
export function buildGuideCells(
  requests: SiteRequestRow[],
  searchDays: { categorySlug: string; city: string; emptyCount: number }[],
  visible: VisiblePro[],
  now: Date,
): Pick<AdminSiteStats, "cells" | "otherCells"> {
  const cells = new Map<string, { categorySlug: string; city: string; requests: number; withQuote: number; emptySearches: number }>();
  const cell = (categorySlug: string, city: string) => {
    const key = `${categorySlug}|${norm(city)}`;
    const found = cells.get(key) ?? { categorySlug, city: city.trim(), requests: 0, withQuote: 0, emptySearches: 0 };
    cells.set(key, found);
    return found;
  };
  for (const row of requests) {
    if (!row.city.trim()) continue;
    const outcome = guideOutcome(row, now);
    if (outcome === null) continue;
    const c = cell(row.categorySlug, row.city);
    c.requests += 1;
    if (outcome === "yes") c.withQuote += 1;
  }
  for (const day of searchDays) {
    if (!day.city.trim() || day.emptyCount === 0) continue;
    cell(day.categorySlug, day.city).emptySearches += day.emptyCount;
  }
  const order: Record<GuideCellStatus, number> = { RED: 0, NO_PROFESSIONALS: 1, YELLOW: 2, GREEN: 3 };
  const all = [...cells.values()].map((c) => {
    const professionals = visible.filter((p) => norm(p.city) === norm(c.city) && p.categorySlugs.includes(c.categorySlug)).length;
    return {
      ...c,
      city: searchCityLabel(c.city),
      categoryLabel: categoryLabel(c.categorySlug),
      professionals,
      status: guideCellStatus(c.requests, c.withQuote, professionals),
    };
  });
  const shown = all.filter((c) => c.requests >= MIN_CASES_PER_ROW || c.emptySearches >= MIN_CASES_PER_ROW);
  const others = all.filter((c) => !shown.includes(c));
  return {
    cells: shown.sort(
      (a, b) => order[a.status] - order[b.status] || b.requests - b.withQuote - (a.requests - a.withQuote) || b.emptySearches - a.emptySearches || a.city.localeCompare(b.city, "it"),
    ),
    otherCells: others.length
      ? { cells: others.length, requests: others.reduce((s, c) => s + c.requests, 0), withQuote: others.reduce((s, c) => s + c.withQuote, 0) }
      : null,
  };
}

/** Lunedì delle ultime `weeks` settimane (ora di Roma), dal più vecchio. */
export function weekStarts(now: Date, weeks: number): string[] {
  const current = romeWeekStart(now);
  return Array.from({ length: weeks }, (_, i) => {
    const d = new Date(`${current}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - (weeks - 1 - i) * 7);
    return d.toISOString().slice(0, 10);
  });
}

export function buildGuideWeekly(requests: SiteRequestRow[], now: Date, weeks: number): AdminSiteStats["guideWeekly"] {
  const starts = weekStarts(now, weeks);
  const byWeek = new Map(starts.map((w) => [w, { weekStart: w, requests: 0, withQuote: 0 }]));
  for (const row of requests) {
    const week = byWeek.get(romeWeekStart(row.createdAt));
    const outcome = guideOutcome(row, now);
    if (!week || outcome === null) continue;
    week.requests += 1;
    if (outcome === "yes") week.withQuote += 1;
  }
  return starts.map((w) => byWeek.get(w)!);
}

/** Settimane intere di fila, dalla più recente, con il numero guida verde (e almeno una richiesta). */
export function greenWeeksInARow(weekly: AdminSiteStats["guideWeekly"]): number {
  let count = 0;
  // L'ultima settimana è quella in corso: non è ancora finita.
  for (const week of weekly.slice(0, -1).reverse()) {
    if (week.requests === 0 || week.withQuote / week.requests < GUIDE_GREEN_SHARE) break;
    count += 1;
  }
  return count;
}

/**
 * Coorti dei clienti per settimana della prima richiesta: quanti hanno avuto
 * un preventivo in tempo, un lavoro accettato, una recensione, e quanti
 * sono tornati con un'altra richiesta entro 90 giorni.
 */
export function buildClientCohorts(requests: SiteRequestRow[], firstRequestAt: Map<string, Date>, now: Date, weeks: number): AdminSiteStats["clientCohorts"] {
  const starts = weekStarts(now, weeks);
  const cohorts = new Map(starts.map((w) => [w, { weekStart: w, clients: 0, withQuote: 0, accepted: 0, reviewed: 0, returned: 0 }]));
  const byClient = new Map<string, SiteRequestRow[]>();
  for (const row of requests) byClient.set(row.clientId, [...(byClient.get(row.clientId) ?? []), row]);
  for (const [clientId, first] of firstRequestAt) {
    const cohort = cohorts.get(romeWeekStart(first));
    if (!cohort) continue;
    const rows = byClient.get(clientId) ?? [];
    const firstGroup = rows.filter((r) => r.createdAt.getTime() === first.getTime()).map((r) => r.groupKey)[0];
    const firstRows = rows.filter((r) => r.groupKey === firstGroup);
    cohort.clients += 1;
    if (firstRows.some((r) => guideOutcome(r, now) === "yes")) cohort.withQuote += 1;
    if (rows.some((r) => r.accepted)) cohort.accepted += 1;
    if (rows.some((r) => r.reviewed)) cohort.reviewed += 1;
    const others = new Set(rows.filter((r) => r.groupKey !== firstGroup && r.createdAt.getTime() - first.getTime() <= 90 * DAY_MS).map((r) => r.groupKey));
    if (others.size > 0) cohort.returned += 1;
  }
  return starts.map((w) => cohorts.get(w)!);
}

export type SiteProRow = {
  createdAt: Date;
  fiscalDone: boolean;
  identityDone: boolean;
  firstQuoteAt: Date | null;
  activeLast30d: boolean;
};

/** Coorti dei professionisti per settimana d'iscrizione. Primo preventivo: entro 14 giorni dall'iscrizione. */
export function buildProfessionalCohorts(pros: SiteProRow[], now: Date, weeks: number): AdminSiteStats["professionalCohorts"] {
  const starts = weekStarts(now, weeks);
  const cohorts = new Map(starts.map((w) => [w, { weekStart: w, registered: 0, fiscal: 0, identity: 0, firstQuote: 0, active: 0 }]));
  for (const pro of pros) {
    const cohort = cohorts.get(romeWeekStart(pro.createdAt));
    if (!cohort) continue;
    cohort.registered += 1;
    if (pro.fiscalDone) cohort.fiscal += 1;
    if (pro.identityDone) cohort.identity += 1;
    if (pro.firstQuoteAt && pro.firstQuoteAt.getTime() - pro.createdAt.getTime() <= 14 * DAY_MS) cohort.firstQuote += 1;
    if (pro.activeLast30d) cohort.active += 1;
  }
  return starts.map((w) => cohorts.get(w)!);
}

// ---------------------------------------------------------------------------
// Consigli
// ---------------------------------------------------------------------------

/** Passi della richiesta confrontati per dire dove ci si ferma. */
const STEP_TRANSITIONS: [RequestStepKey, RequestStepKey][] = [
  ["LAVORO", "DOVE"],
  ["DOVE", "RIEPILOGO"],
  ["ACCESSO", "ACCESSO_FATTO"],
];
/** Persone arrivate a un passo prima di dire che ci si ferma lì. */
export const STEP_ADVICE_MIN_ENTERED = 30;
/** Quota che si ferma oltre la quale conviene semplificare il passo. */
export const STEP_ADVICE_MIN_DROP = 0.5;
/** Visite ai profili prima di dire che i profili non portano richieste. */
export const PROFILE_ADVICE_MIN_VIEWS = 100;
/** Sotto questa quota di richieste iniziate dal profilo sulle visite, i profili non convincono. */
export const PROFILE_ADVICE_MAX_SHARE = 0.03;
/** Invii non riusciti in 7 giorni per un "errore del sito". */
export const FAILURE_ADVICE_SERVER = 5;
export const FAILURE_ADVICE_OTHER = 10;
/** Motivi uguali scelti negli ultimi 90 giorni per farne un consiglio. */
export const CHURN_ADVICE_MIN = 3;
/** Richieste nell'ultimo periodo per consigliare di reclutare in una casella. */
export const RECRUIT_MIN_REQUESTS = 3;
const MAX_ADVICE = 8;

export type StalledProfessional = { name: string; step: "FISCAL" | "IDENTITY"; days: number; href: string };
export type SilentProfessional = { name: string; requests: number; href: string };

export type SiteAdviceInput = {
  now: Date;
  launch: Date | null;
  cells: AdminSiteStats["cells"];
  /** Zone con ricerche senza nessuno vicino negli ultimi 7 giorni (§371). */
  searchZones: SearchDemandZone[];
  requestSteps: { key: RequestStepKey; count: number; fromProfile: number }[];
  /** Visite ai profili pubblici nelle ultime 4 settimane. */
  profileViews: number;
  /** Ultimi 7 giorni. */
  failures: { form: SubmitFormKey; kind: SubmitFailureKind; count: number }[];
  unknownJobs: AdminSiteStats["unknownJobs"];
  popularServices: AdminSiteStats["popularServices"];
  missingServices: AdminSiteStats["missingServices"];
  churnReasons: { kind: ChurnKind; reason: ChurnReason; count: number }[];
  stalled: StalledProfessional[];
  silent: SilentProfessional[];
  launchStatus: AdminSiteStats["launch"];
  reconciliation: AdminSiteStats["reconciliation"];
  requestsInWindow: number;
  prices: { paying: number; atLimit30d: number; trialsEnded: number; trialsConverted: number };
};

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const RECRUIT_LINK = { label: "Crea un profilo e mandagli il link", href: "/admin/professionisti" };

/**
 * Cosa fare questa settimana, in parole semplici (richiesta di Luca: "far
 * arrivare già le soluzioni al superadmin, facendo finta che possa prendere
 * decisioni anche non capendo niente di tutti quei numeri"). Ogni regola ha
 * una soglia scritta qui sopra; prima i "Fallo subito".
 */
/** Una prestazione scritta da un professionista, con i suoi lavori (il principale per primo). */
export type SiteServiceRow = { profileId: string; name: string; categorySlugs: string[] };

const isCategorySlug = (slug: string): slug is ProfessionalCategorySlug => slug in POPULAR_SERVICES;

/**
 * Prestazioni dell'elenco cercate negli ultimi 90 giorni, per lavoro (§378),
 * con quanti professionisti di quel lavoro le offrono. Prima i lavori più cercati.
 */
export function buildPopularServices(searches: { categorySlug: string; service: string; searches: number }[], services: SiteServiceRow[]): AdminSiteStats["popularServices"] {
  const byCategory = new Map<string, { service: string; searches: number; offeredBy: number }[]>();
  for (const s of searches) {
    if (!isCategorySlug(s.categorySlug) || !POPULAR_SERVICES[s.categorySlug].includes(s.service) || s.searches <= 0) continue;
    const offeredBy = new Set(
      services.filter((row) => row.categorySlugs.includes(s.categorySlug) && offersPopularService(row.name, s.service)).map((row) => row.profileId),
    ).size;
    byCategory.set(s.categorySlug, [...(byCategory.get(s.categorySlug) ?? []), { service: s.service, searches: s.searches, offeredBy }]);
  }
  return [...byCategory.entries()]
    .map(([slug, list]) => ({
      categorySlug: slug,
      categoryLabel: categoryLabel(slug),
      services: list.sort((a, b) => b.searches - a.searches || a.service.localeCompare(b.service, "it")),
    }))
    .sort((a, b) => b.services.reduce((n, s) => n + s.searches, 0) - a.services.reduce((n, s) => n + s.searches, 0));
}

/**
 * Prestazioni scritte a mano da almeno MISSING_SERVICE_MIN_PROFESSIONALS
 * professionisti e che non ci sono tra quelle suggerite dei loro lavori
 * (§378): vanno aggiunte all'elenco, così si scelgono con un clic e i prezzi
 * medi si sommano. Il lavoro è quello più comune tra chi l'ha scritta.
 */
export function buildMissingServices(services: SiteServiceRow[]): AdminSiteStats["missingServices"] {
  const groups = new Map<string, { names: Map<string, number>; profiles: Set<string>; slugs: Map<string, number> }>();
  for (const row of services) {
    const key = normalizeServiceName(row.name);
    if (key.length < 4 || key.length > 60 || key === "consulenza online") continue;
    const slugs = row.categorySlugs.filter(isCategorySlug);
    if (slugs.length === 0 || slugs.some((slug) => isPopularService(row.name, slug))) continue;
    const group = groups.get(key) ?? { names: new Map(), profiles: new Set(), slugs: new Map() };
    if (!group.profiles.has(row.profileId)) {
      group.profiles.add(row.profileId);
      for (const slug of slugs) group.slugs.set(slug, (group.slugs.get(slug) ?? 0) + 1);
    }
    const shown = row.name.trim();
    group.names.set(shown, (group.names.get(shown) ?? 0) + 1);
    groups.set(key, group);
  }
  const mostCommon = (map: Map<string, number>) => [...map.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "it"))[0]?.[0] ?? "";
  return [...groups.values()]
    .filter((g) => g.profiles.size >= MISSING_SERVICE_MIN_PROFESSIONALS)
    .map((g) => {
      const slug = mostCommon(g.slugs);
      const name = mostCommon(g.names);
      return { categorySlug: slug, categoryLabel: categoryLabel(slug), name: name.charAt(0).toUpperCase() + name.slice(1), professionals: g.profiles.size };
    })
    .sort((a, b) => b.professionals - a.professionals || a.name.localeCompare(b.name, "it"))
    .slice(0, 20);
}

export function buildSiteAdvice(input: SiteAdviceInput): SiteAdvice[] {
  const advice: SiteAdvice[] = [];

  // Invii che non riescono: qualcosa è rotto.
  const failuresBy = new Map<SubmitFormKey, Record<SubmitFailureKind, number>>();
  for (const f of input.failures) {
    const row = failuresBy.get(f.form) ?? { RETE: 0, SERVER: 0, DATI: 0 };
    row[f.kind] += f.count;
    failuresBy.set(f.form, row);
  }
  for (const [form, counts] of failuresBy) {
    const label = SUBMIT_FORM_LABEL[form];
    if (counts.SERVER >= FAILURE_ADVICE_SERVER) {
      advice.push({
        key: `failure-server:${form}`,
        level: "URGENT",
        title: `${label}: l'invio non riesce`,
        why: `Negli ultimi 7 giorni ${plural(counts.SERVER, "invio è fallito", "invii sono falliti")} per un errore del sito.`,
        todo: "Chiedi a chi segue il sito di controllare subito: le persone provano e non ci riescono.",
      });
    } else if (counts.DATI >= FAILURE_ADVICE_OTHER) {
      advice.push({
        key: `failure-data:${form}`,
        level: "IMPORTANT",
        title: `${label}: molti invii rifiutati`,
        why: `Negli ultimi 7 giorni il modulo ha rifiutato ${counts.DATI} invii perché i dati non andavano bene.`,
        todo: "Il modulo confonde: va reso più chiaro (campi, esempi, messaggi d'errore).",
      });
    } else if (counts.RETE >= FAILURE_ADVICE_OTHER) {
      advice.push({
        key: `failure-network:${form}`,
        level: "TIP",
        title: `${label}: invii persi per la connessione`,
        why: `Negli ultimi 7 giorni ${counts.RETE} invii non sono partiti per la connessione assente.`,
        todo: "Di solito è il telefono senza rete. Se continua, chiedi di salvare il modulo e riprovarlo da solo.",
      });
    }
  }

  // Dove reclutare: caselle rosse o senza professionisti, con richieste vere.
  const recruitKeys = new Set<string>();
  for (const cell of input.cells) {
    if ((cell.status !== "RED" && cell.status !== "NO_PROFESSIONALS") || cell.requests < RECRUIT_MIN_REQUESTS) continue;
    recruitKeys.add(`${cell.categorySlug}|${norm(cell.city)}`);
    advice.push({
      key: `recruit:${cell.categorySlug}:${norm(cell.city)}`,
      level: "URGENT",
      title: `${cell.categoryLabel} a ${cell.city}: servono più professionisti`,
      why:
        cell.professionals === 0
          ? `Nelle ultime 4 settimane ${plural(cell.requests, "richiesta", "richieste")} e nessun professionista visibile lì.`
          : `Nelle ultime 4 settimane solo ${ratioLabel(cell.withQuote, cell.requests)} richieste hanno avuto un preventivo entro un giorno. Professionisti visibili lì: ${cell.professionals}.`,
      todo: `Cerca professionisti (${cell.categoryLabel.toLowerCase()}) a ${cell.city}: telefona, crea il profilo e mandagli il link.`,
      link: RECRUIT_LINK,
    });
  }
  for (const zone of input.searchZones) {
    const slug = PROFESSIONAL_CATEGORIES.find((c) => c.label === zone.categoryLabel)?.slug ?? zone.categoryLabel.toLowerCase();
    if (recruitKeys.has(`${slug}|${norm(zone.city)}`)) continue;
    advice.push({
      key: `search:${slug}:${norm(zone.city)}`,
      level: "IMPORTANT",
      title: `${zone.categoryLabel} a ${zone.city}: cercano e non trovano nessuno`,
      why: `Negli ultimi 7 giorni ${plural(zone.empty, "ricerca", "ricerche")} senza nessun professionista entro ${SEARCH_RADIUS_KM} km.`,
      todo: `Lì c'è domanda: cerca professionisti (${zone.categoryLabel.toLowerCase()}) a ${zone.city}.`,
      link: RECRUIT_LINK,
    });
  }

  // Professionisti da chiamare.
  if (input.silent.length > 0) {
    advice.push({
      key: "silent-professionals",
      level: "IMPORTANT",
      title: `${plural(input.silent.length, "professionista non risponde", "professionisti non rispondono")} alle richieste`,
      why: "Negli ultimi 14 giorni hanno ricevuto almeno 3 richieste e non hanno risposto a nessuna: i clienti restano senza preventivo.",
      todo: "Chiamali: chiedi se le notifiche arrivano o se hanno troppo lavoro. Se non vogliono più richieste, possono mettersi in pausa dal profilo.",
      items: input.silent.map((p) => ({ label: p.name, detail: `${p.requests} richieste senza risposta`, href: p.href })),
    });
  }
  if (input.stalled.length > 0) {
    advice.push({
      key: "stalled-professionals",
      level: "IMPORTANT",
      title: `${plural(input.stalled.length, "professionista è fermo", "professionisti sono fermi")} a metà iscrizione`,
      why: "Si sono iscritti da più di 7 giorni ma non sono ancora visibili ai clienti.",
      todo: "Chiamali e aiutali a finire: spesso basta spiegare a cosa servono i dati richiesti.",
      items: input.stalled.map((p) => ({
        label: p.name,
        detail: `${p.step === "FISCAL" ? "Mancano i dati fiscali" : "Manca la verifica dell'identità"} · iscritto da ${p.days} giorni`,
        href: p.href,
      })),
    });
  }

  // Dove ci si ferma nella richiesta.
  const steps = new Map(input.requestSteps.map((s) => [s.key, s.count]));
  for (const [from, to] of STEP_TRANSITIONS) {
    const entered = steps.get(from) ?? 0;
    const passed = Math.min(entered, steps.get(to) ?? 0);
    if (entered < STEP_ADVICE_MIN_ENTERED || (entered - passed) / entered < STEP_ADVICE_MIN_DROP) continue;
    const isAccess = from === "ACCESSO";
    advice.push({
      key: `step:${from}`,
      level: "IMPORTANT",
      title: isAccess ? "Molti si fermano quando devono registrarsi" : `Molti si fermano al passo «${REQUEST_STEP_SHORT[from]}» della richiesta`,
      why: `Nelle ultime 4 settimane ${entered} persone ci sono arrivate e ${entered - passed} non sono andate avanti.`,
      todo: isAccess
        ? "Rendi la registrazione più corta o fai capire meglio perché serve. Tra 4 settimane guarda se il numero è sceso."
        : "Semplifica quel passo: meno campi e frasi più chiare. Tra 4 settimane guarda se il numero è sceso.",
    });
  }

  // Profili visti ma senza richieste: la pagina del professionista non convince.
  const fromProfile = input.requestSteps.find((st) => st.key === "LAVORO")?.fromProfile ?? 0;
  if (input.profileViews >= PROFILE_ADVICE_MIN_VIEWS && fromProfile / input.profileViews < PROFILE_ADVICE_MAX_SHARE) {
    advice.push({
      key: "profiles-no-requests",
      level: "TIP",
      title: "Molti guardano i profili ma pochi chiedono un preventivo",
      why: `Nelle ultime 4 settimane i profili sono stati aperti ${input.profileViews} volte e solo ${fromProfile} volte qualcuno ha iniziato una richiesta da lì.`,
      todo: "Chiedi ai professionisti di completare il profilo: foto, prezzi delle prestazioni e orari dell'agenda. Un profilo completo convince di più.",
      link: { label: "Vedi i profili incompleti", href: "/admin/numeri-professionisti" },
    });
  }

  // Chi se ne va e perché.
  const churn = (kinds: ChurnKind[], reason: ChurnReason) =>
    input.churnReasons.filter((c) => kinds.includes(c.kind) && c.reason === reason).reduce((s, c) => s + c.count, 0);
  const fewRequests = churn(["PRO_ACCOUNT", "SUBSCRIPTION"], "FEW_REQUESTS");
  if (fewRequests >= CHURN_ADVICE_MIN) {
    advice.push({
      key: "churn:few-requests",
      level: "IMPORTANT",
      title: "Professionisti se ne vanno perché ricevono poche richieste",
      why: `Negli ultimi 90 giorni ${fewRequests} lo hanno indicato come motivo.`,
      todo: "Porta clienti nelle loro zone: chiedi di condividere il link del profilo con i loro clienti e di metterlo nella scheda Google.",
    });
  }
  const hard = churn(["CLIENT_ACCOUNT", "PRO_ACCOUNT", "SUBSCRIPTION"], "HARD_TO_USE");
  if (hard >= CHURN_ADVICE_MIN) {
    advice.push({
      key: "churn:hard",
      level: "IMPORTANT",
      title: "Chi se ne va dice che il sito è difficile",
      why: `Negli ultimi 90 giorni ${hard} persone lo hanno indicato come motivo.`,
      todo: "Fai provare il sito a 5 persone che non lo conoscono e guarda dove si bloccano.",
    });
  }

  // Prezzi: solo quando i numeri bastano.
  const launchAge = input.launch ? (input.now.getTime() - input.launch.getTime()) / DAY_MS : 0;
  if (input.launch && launchAge >= PRICE_ADVICE_MIN_DAYS_FROM_LAUNCH && input.prices.paying >= PRICE_ADVICE_MIN_PAYING) {
    if (input.prices.atLimit30d / input.prices.paying >= 0.3) {
      advice.push({
        key: "price:limit",
        level: "IMPORTANT",
        title: "Molti professionisti finiscono i lavori del mese",
        why: `Negli ultimi 30 giorni ${input.prices.atLimit30d} professionisti su ${input.prices.paying} paganti sono arrivati al limite.`,
        todo: "Valuta di alzare i lavori inclusi nei livelli, o di spiegare meglio il passaggio al livello sopra.",
      });
    }
    if (input.prices.trialsEnded >= 10 && input.prices.trialsConverted / input.prices.trialsEnded < 0.3) {
      advice.push({
        key: "price:trial",
        level: "IMPORTANT",
        title: "Pochi scelgono un livello dopo il periodo gratuito",
        why: `Negli ultimi 60 giorni ${input.prices.trialsConverted} su ${input.prices.trialsEnded} hanno scelto un livello a fine prova.`,
        todo: "Valuta un prezzo d'ingresso più basso o una prova più lunga.",
      });
    }
    const expensive = churn(["PRO_ACCOUNT", "SUBSCRIPTION"], "TOO_EXPENSIVE");
    if (expensive >= CHURN_ADVICE_MIN) {
      advice.push({
        key: "price:expensive",
        level: "IMPORTANT",
        title: "Chi annulla dice che costa troppo",
        why: `Negli ultimi 90 giorni ${expensive} professionisti lo hanno indicato come motivo.`,
        todo: "Valuta un livello più economico o uno sconto sull'annuale.",
      });
    }
  }

  // Lavori che mancano sul sito.
  for (const job of input.unknownJobs.slice(0, 3)) {
    advice.push({
      key: `unknown-job:${job.term}`,
      level: "TIP",
      title: `Cercano «${job.term}», un lavoro che non c'è`,
      why: `Cercato in ${job.days} giorni diversi negli ultimi 90.`,
      todo: "Valuta se aggiungerlo: guarda quanto è cercato su Google (Keyword Planner) e se trovi professionisti a Latina.",
    });
  }

  // Prestazioni (§378): cercate ma offerte da pochi, e scritte a mano ma non suggerite.
  const gaps = input.popularServices
    .flatMap((c) => c.services.map((s) => ({ ...s, categorySlug: c.categorySlug, categoryLabel: c.categoryLabel })))
    .filter((s) => s.searches >= SERVICE_GAP_MIN_SEARCHES && s.offeredBy <= SERVICE_GAP_MAX_OFFERED)
    .sort((a, b) => b.searches - a.searches)
    .slice(0, 2);
  for (const gap of gaps) {
    advice.push({
      key: `service-gap:${gap.categorySlug}:${normalizeServiceName(gap.service)}`,
      level: "TIP",
      title: `Cercano «${gap.service}», pochi la offrono`,
      why: `Cercata ${plural(gap.searches, "volta", "volte")} negli ultimi 90 giorni; tra i professionisti di ${gap.categoryLabel} la offrono in ${gap.offeredBy}.`,
      todo: `Quando senti i professionisti di ${gap.categoryLabel}, chiedi se la fanno e falla aggiungere al profilo con il prezzo: così compaiono a chi la cerca.`,
    });
  }
  for (const missing of input.missingServices.slice(0, 2)) {
    advice.push({
      key: `missing-service:${missing.categorySlug}:${normalizeServiceName(missing.name)}`,
      level: "TIP",
      title: `Aggiungi «${missing.name}» alle prestazioni suggerite di ${missing.categoryLabel}`,
      why: `L'hanno scritta a mano ${missing.professionals} professionisti, ma non è tra quelle che il sito propone.`,
      todo: "Chiedi di aggiungerla all'elenco delle prestazioni suggerite: chi si iscrive la sceglie con un clic e i prezzi medi di «Quanto costa» si sommano bene.",
    });
  }

  // Aprire il sito a Google.
  if (input.launchStatus.ready) {
    advice.push({
      key: "google-ready",
      level: "IMPORTANT",
      title: "Puoi aprire il sito a Google",
      why: `Hai raggiunto i numeri della tappa silenziosa e le richieste ricevono un preventivo in tempo da ${input.launchStatus.greenWeeks} settimane.`,
      todo: "Se non l'hai già fatto: su Vercel imposta NEXT_PUBLIC_SITE_INDEXABLE=true e rifai il deploy.",
    });
  }

  // Conteggi che non tornano.
  if (!input.reconciliation.ok && input.reconciliation.saved >= 10) {
    advice.push({
      key: "counts-mismatch",
      level: "TIP",
      title: "I conteggi del sito non tornano",
      why: `Negli ultimi ${input.reconciliation.days} giorni il sito ha contato ${input.reconciliation.counted} richieste inviate, ma ne ha salvate ${input.reconciliation.saved}.`,
      todo: "Chiedi a chi segue il sito di controllare: i numeri dei passi della richiesta potrebbero essere sbagliati.",
    });
  }

  if (advice.length === 0 && input.requestsInWindow === 0 && input.launch && input.now >= input.launch) {
    advice.push({
      key: "no-requests",
      level: "IMPORTANT",
      title: "Nelle ultime 4 settimane nessuna richiesta di preventivo",
      why: "Senza richieste non si può capire cosa migliorare nel sito.",
      todo: "Porta i primi clienti: chiedi ai professionisti di condividere il link del loro profilo con i loro clienti.",
    });
  }

  const rank = { URGENT: 0, IMPORTANT: 1, TIP: 2 } as const;
  return advice.sort((a, b) => rank[a.level] - rank[b.level]).slice(0, MAX_ADVICE);
}

/** La tappa silenziosa è raggiunta? (GOOGLE_OPENING_TARGETS) */
export function launchReady(status: Omit<AdminSiteStats["launch"], "ready">): boolean {
  const t = GOOGLE_OPENING_TARGETS;
  return (
    status.visibleProfessionals >= t.visibleProfessionals &&
    status.clientsWithRequest >= t.clientsWithRequest &&
    status.acceptedJobs >= t.acceptedJobs &&
    status.paidOnline >= t.paidOnline &&
    status.greenWeeks >= t.greenWeeks
  );
}

/**
 * Richieste inviate contate dal browser contro quelle salvate. Il browser ne
 * conta sempre un po' meno (chi prova il sito con "Non contare", blocchi):
 * tornano se ne conta fino al 25% in meno o al 10% in più (minimo 2).
 * Di più in più vuol dire un conteggio doppio, molto meno un conteggio rotto.
 */
export function reconcile(counted: number, saved: number, days: number): AdminSiteStats["reconciliation"] {
  const ok = counted - saved <= Math.max(2, Math.round(saved * 0.1)) && saved - counted <= Math.max(2, Math.round(saved * 0.25));
  return { days, counted, saved, ok };
}
