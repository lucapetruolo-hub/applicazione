import {
  PROFESSIONAL_CATEGORIES,
  PROFESSIONAL_COMPLETENESS_KEYS,
  PROFESSIONAL_ENTITY_KEYS,
  PROFESSIONAL_FUNNEL_KEYS,
  PROFESSIONAL_PLAN_KEYS,
  PROFESSIONAL_STATUS_KEYS,
  type AdminProfessionalStats,
  type ProfessionalCompletenessKey,
  type ProfessionalEntityKey,
  type ProfessionalFunnelKey,
  type ProfessionalPlanKey,
  type ProfessionalStatusKey,
  SEARCH_DEMAND_ALERT_MIN_EMPTY,
  SEARCH_DEMAND_ALERT_ROWS,
  findComuneByName,
} from "@professionisti/shared";
import { publicVisibilityMissing } from "../professional-fiscal/public-visibility";
import { romeMonthKey, subscriptionState, tierOfPlan, type SubscriptionRow } from "../subscriptions/subscription-rules";

/** Quello che serve di un professionista per contarlo (docs/CHANGELOG.md §368). */
export type ProfessionalStatsRow = {
  id: string;
  city: string;
  imageUrl: string | null;
  bio: string | null;
  verified: boolean;
  /** Settimana tipo o almeno una fascia libera nell'agenda. */
  hasAgenda: boolean;
  servicesCount: number;
  quotesCount: number;
  bookingsCount: number;
  createdAt: Date;
  suspendedAt: Date | null;
  pausedAt: Date | null;
  invitePendingAt: Date | null;
  requestsBlockedUntil: Date | null;
  isDemo: boolean;
  categorySlugs: string[];
  user: { suspendedAt: Date | null };
  fiscalProfile: { entityType: string | null; fiscalDataCompleteAt: Date | null; taxIdChecks?: { status: string }[] } | null;
  subscription: SubscriptionRow | null;
};

const DAY_MS = 24 * 60 * 60 * 1000;

/** Un solo stato per professionista: prima quello che lo tiene fuori dalla ricerca per più tempo. */
export function professionalStatusOf(row: ProfessionalStatsRow, now: Date): ProfessionalStatusKey {
  if (row.suspendedAt || row.user.suspendedAt) return "SUSPENDED";
  if (row.requestsBlockedUntil && row.requestsBlockedUntil.getTime() > now.getTime()) return "BLOCKED";
  if (row.invitePendingAt) return "INVITE_PENDING";
  if (row.pausedAt) return "PAUSED";
  if (publicVisibilityMissing(row)) return "FISCAL_MISSING";
  return "VISIBLE";
}

export function professionalPlanOf(row: ProfessionalStatsRow, now: Date): ProfessionalPlanKey {
  const sub = row.subscription;
  const state = subscriptionState(sub, now);
  if (state === "TRIAL") return sub?.founderNumber ? "FOUNDER" : "TRIAL";
  if (state === "ACTIVE" || state === "PAST_DUE") return tierOfPlan(sub?.plan ?? "") ?? "NONE";
  return "NONE";
}

function entityOf(row: ProfessionalStatsRow): ProfessionalEntityKey {
  const type = row.fiscalProfile?.entityType;
  return type === "PRIVATE_INDIVIDUAL" || type === "SOLE_PROPRIETOR" || type === "BUSINESS" ? type : "UNKNOWN";
}

/**
 * Tutti i mesi dal gennaio dell'anno della prima iscrizione (almeno dagli
 * ultimi 12 mesi) a quello in corso, come chiavi "AAAA-MM" dell'ora di Roma:
 * la pagina sceglie gli ultimi 12 mesi o un anno intero.
 */
function monthKeysSince(firstKey: string | null, now: Date): string[] {
  const [year, month] = romeMonthKey(now).split("-").map(Number) as [number, number];
  const lastYear = new Date(Date.UTC(year, month - 12, 1));
  const firstYear = Math.min(lastYear.getUTCFullYear(), firstKey ? Number(firstKey.slice(0, 4)) : year);
  const keys: string[] = [];
  for (let d = new Date(Date.UTC(firstYear, 0, 1)); d.getUTCFullYear() < year || d.getUTCMonth() < month; d.setUTCMonth(d.getUTCMonth() + 1)) {
    keys.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  return keys;
}

/**
 * Conta i professionisti già filtrati (categoria, città; senza eliminati e
 * dimostrativi). `cityOptions` e `excluded` arrivano dal chiamante perché
 * non dipendono da queste righe.
 */
/** Passi dell'iscrizione già fatti da un professionista. */
function funnelStepsOf(row: ProfessionalStatsRow): ProfessionalFunnelKey[] {
  return [
    "REGISTERED",
    ...(row.fiscalProfile?.fiscalDataCompleteAt ? (["FISCAL"] as const) : []),
    ...(row.verified ? (["IDENTITY"] as const) : []),
    ...(row.quotesCount > 0 ? (["FIRST_QUOTE"] as const) : []),
    ...(row.bookingsCount > 0 ? (["FIRST_JOB"] as const) : []),
  ];
}

function completenessOf(row: ProfessionalStatsRow): ProfessionalCompletenessKey[] {
  const parts: ProfessionalCompletenessKey[] = [
    ...(row.imageUrl ? (["PHOTO"] as const) : []),
    ...(row.bio?.trim() ? (["BIO"] as const) : []),
    ...(row.servicesCount > 0 ? (["SERVICES"] as const) : []),
    ...(row.hasAgenda ? (["AGENDA"] as const) : []),
  ];
  return parts.length === 4 ? [...parts, "ALL"] : parts;
}

export type ProfessionalStatsExtra = {
  cityOptions: string[];
  excluded: AdminProfessionalStats["excluded"];
  countingFrom?: string | null;
  launchDate?: string | null;
  /** Professionisti con un preventivo o un messaggio negli ultimi 30 giorni. */
  activeIds?: ReadonlySet<string>;
  coverage?: AdminProfessionalStats["coverage"];
  byCategoryActivity?: AdminProfessionalStats["byCategoryActivity"];
  churnByMonth?: AdminProfessionalStats["churnByMonth"];
  searches?: AdminProfessionalStats["searches"];
};

export function buildProfessionalStats(rows: ProfessionalStatsRow[], now: Date, extra: ProfessionalStatsExtra): AdminProfessionalStats {
  const status = new Map<ProfessionalStatusKey, number>();
  const plan = new Map<ProfessionalPlanKey, number>();
  const entity = new Map<ProfessionalEntityKey, number>();
  const category = new Map<string, number>();
  const city = new Map<string, number>();
  const month = new Map<string, number>();
  const funnel = new Map<ProfessionalFunnelKey, number>();
  const completeness = new Map<ProfessionalCompletenessKey, number>();
  let new30d = 0;
  let active30d = 0;
  const add = <K>(map: Map<K, number>, key: K) => map.set(key, (map.get(key) ?? 0) + 1);

  for (const row of rows) {
    add(status, professionalStatusOf(row, now));
    add(plan, professionalPlanOf(row, now));
    add(entity, entityOf(row));
    for (const slug of new Set(row.categorySlugs)) add(category, slug);
    add(city, row.city.trim() || "Senza città");
    add(month, romeMonthKey(row.createdAt));
    if (now.getTime() - row.createdAt.getTime() <= 30 * DAY_MS) new30d += 1;
    if (extra.activeIds?.has(row.id)) active30d += 1;
    for (const step of funnelStepsOf(row)) add(funnel, step);
    for (const part of completenessOf(row)) add(completeness, part);
  }

  return {
    total: rows.length,
    new30d,
    excluded: extra.excluded,
    countingFrom: extra.countingFrom ?? null,
    launchDate: extra.launchDate ?? null,
    byStatus: PROFESSIONAL_STATUS_KEYS.map((key) => ({ key, count: status.get(key) ?? 0 })),
    byCategory: PROFESSIONAL_CATEGORIES.map((c) => ({ slug: c.slug, label: c.label, count: category.get(c.slug) ?? 0 })).sort(
      (a, b) => b.count - a.count || a.label.localeCompare(b.label, "it"),
    ),
    byCity: [...city.entries()].map(([name, count]) => ({ city: name, count })).sort((a, b) => b.count - a.count || a.city.localeCompare(b.city, "it")),
    byPlan: PROFESSIONAL_PLAN_KEYS.map((key) => ({ key, count: plan.get(key) ?? 0 })),
    byEntity: PROFESSIONAL_ENTITY_KEYS.map((key) => ({ key, count: entity.get(key) ?? 0 })),
    byMonth: monthKeysSince([...month.keys()].sort()[0] ?? null, now).map((key) => ({ key, count: month.get(key) ?? 0 })),
    cityOptions: extra.cityOptions,
    active30d,
    funnel: PROFESSIONAL_FUNNEL_KEYS.map((key) => ({ key, count: funnel.get(key) ?? 0 })),
    completeness: PROFESSIONAL_COMPLETENESS_KEYS.map((key) => ({ key, count: completeness.get(key) ?? 0 })),
    coverage: extra.coverage ?? [],
    byCategoryActivity: extra.byCategoryActivity ?? [],
    churnByMonth: extra.churnByMonth ?? [],
    searches: extra.searches ?? { total: 0, empty: 0, withText: 0, cityOnly: 0, byCity: [], byCategoryCity: [] },
  };
}

export const categoryLabel = (slug: string) => PROFESSIONAL_CATEGORIES.find((c) => c.slug === slug)?.label ?? slug;

/** Righe di copertura mostrate: le zone più scoperte prima. */
export const COVERAGE_ROWS = 20;

/**
 * Richieste per categoria e città contro i professionisti visibili con sede
 * in quella città (docs/CHANGELOG.md §369). La città si confronta senza
 * maiuscole; si mostra come scritta nella richiesta più recente.
 */
export function buildCoverage(
  requests: { categorySlug: string; city: string; quotes: number }[],
  visibleProfessionals: { city: string; categorySlugs: string[] }[],
): AdminProfessionalStats["coverage"] {
  const norm = (city: string) => city.trim().toLowerCase();
  const zones = new Map<string, { categorySlug: string; city: string; requests: number; unanswered: number }>();
  for (const r of requests) {
    if (!r.city.trim()) continue;
    const key = `${r.categorySlug}|${norm(r.city)}`;
    const zone = zones.get(key) ?? { categorySlug: r.categorySlug, city: r.city.trim(), requests: 0, unanswered: 0 };
    zone.requests += 1;
    if (r.quotes === 0) zone.unanswered += 1;
    zones.set(key, zone);
  }
  return [...zones.values()]
    .map((zone) => ({
      ...zone,
      categoryLabel: categoryLabel(zone.categorySlug),
      professionals: visibleProfessionals.filter((p) => norm(p.city) === norm(zone.city) && p.categorySlugs.includes(zone.categorySlug)).length,
    }))
    .sort((a, b) => b.unanswered - a.unanswered || b.requests - a.requests || a.professionals - b.professionals || a.city.localeCompare(b.city, "it"))
    .slice(0, COVERAGE_ROWS);
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : Math.round((sorted[mid - 1]! + sorted[mid]!) / 2);
}

/**
 * Risposte, preventivi e recensioni per categoria della richiesta (§369).
 * Risposta = preventivo, messaggio in chat o rifiuto; il tempo conta solo
 * preventivo e messaggio. Solo le categorie con almeno un numero.
 */
export function buildCategoryActivity(input: {
  leads: { categorySlug: string; createdAt: Date; answeredAt: Date | null; declined: boolean }[];
  quotes: { categorySlug: string; accepted: boolean }[];
  reviews: { categorySlug: string; rating: number }[];
}): AdminProfessionalStats["byCategoryActivity"] {
  return PROFESSIONAL_CATEGORIES.map((c) => {
    const leads = input.leads.filter((l) => l.categorySlug === c.slug);
    const quotes = input.quotes.filter((q) => q.categorySlug === c.slug);
    const reviews = input.reviews.filter((r) => r.categorySlug === c.slug);
    const minutes = leads.flatMap((l) => (l.answeredAt ? [Math.max(0, Math.round((l.answeredAt.getTime() - l.createdAt.getTime()) / 60_000))] : []));
    return {
      slug: c.slug,
      label: c.label,
      leads: leads.length,
      answered: leads.filter((l) => l.answeredAt || l.declined).length,
      medianMinutesToAnswer: median(minutes),
      quotes: quotes.length,
      accepted: quotes.filter((q) => q.accepted).length,
      reviews: reviews.length,
      avgRating: reviews.length ? Math.round((reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length) * 10) / 10 : null,
    };
  })
    .filter((row) => row.leads || row.quotes || row.reviews)
    .sort((a, b) => b.leads - a.leads || b.quotes - a.quotes || a.label.localeCompare(b.label, "it"));
}

/** Ultimi 12 mesi (ora di Roma), dal più vecchio: eliminati, messi in pausa, abbonamenti annullati. */
export function buildChurnByMonth(input: { deletedAt: Date[]; pausedAt: Date[]; canceledAt: Date[] }, now: Date): AdminProfessionalStats["churnByMonth"] {
  const keys = monthKeysSince(null, now).slice(-12);
  const count = (dates: Date[]) => {
    const map = new Map<string, number>();
    for (const d of dates) map.set(romeMonthKey(d), (map.get(romeMonthKey(d)) ?? 0) + 1);
    return map;
  };
  const deleted = count(input.deletedAt);
  const paused = count(input.pausedAt);
  const canceled = count(input.canceledAt);
  return keys.map((key) => ({ key, deleted: deleted.get(key) ?? 0, paused: paused.get(key) ?? 0, canceled: canceled.get(key) ?? 0 }));
}

/** Città mostrate nelle ricerche, e righe di lavoro + città (§370). */
export const SEARCH_CITY_ROWS = 15;
export const SEARCH_ZONE_ROWS = 20;

/** Città salvata in minuscolo: il nome del comune se lo è, altrimenti con le iniziali maiuscole. */
export function searchCityLabel(city: string): string {
  if (!city) return "";
  return findComuneByName(city)?.name ?? city.replace(/(^|[\s'-])(\p{L})/gu, (_, sep: string, ch: string) => sep + ch.toUpperCase());
}

/**
 * Cosa cercano sul sito (docs/CHANGELOG.md §370), dai contatori per giorno:
 * ricerche per lavoro e città e ricerche senza lavoro (solo città, o con una
 * parola scritta). Per ogni lavoro + città anche i professionisti visibili
 * con sede lì, come nella copertura.
 */
export function buildSearchStats(
  input: {
    categoryDays: { categorySlug: string; city: string; count: number; emptyCount: number }[];
    freeDays: { city: string; withText: boolean; count: number; emptyCount: number }[];
  },
  visibleProfessionals: { city: string; categorySlugs: string[] }[],
): AdminProfessionalStats["searches"] {
  const norm = (city: string) => city.trim().toLowerCase();
  const cities = new Map<string, { searches: number; empty: number }>();
  const zones = new Map<string, { categorySlug: string; city: string; searches: number; empty: number }>();
  const addCity = (city: string, count: number, empty: number) => {
    const entry = cities.get(norm(city)) ?? { searches: 0, empty: 0 };
    entry.searches += count;
    entry.empty += empty;
    cities.set(norm(city), entry);
  };
  let total = 0;
  let empty = 0;
  let withText = 0;
  let cityOnly = 0;
  for (const day of input.categoryDays) {
    total += day.count;
    empty += day.emptyCount;
    addCity(day.city, day.count, day.emptyCount);
    const key = `${day.categorySlug}|${norm(day.city)}`;
    const zone = zones.get(key) ?? { categorySlug: day.categorySlug, city: norm(day.city), searches: 0, empty: 0 };
    zone.searches += day.count;
    zone.empty += day.emptyCount;
    zones.set(key, zone);
  }
  for (const day of input.freeDays) {
    total += day.count;
    empty += day.emptyCount;
    if (day.withText) withText += day.count;
    else cityOnly += day.count;
    addCity(day.city, day.count, day.emptyCount);
  }
  return {
    total,
    empty,
    withText,
    cityOnly,
    byCity: [...cities.entries()]
      .map(([city, c]) => ({ city: searchCityLabel(city), ...c }))
      .sort((a, b) => b.searches - a.searches || a.city.localeCompare(b.city, "it"))
      .slice(0, SEARCH_CITY_ROWS),
    byCategoryCity: [...zones.values()]
      .map((zone) => ({
        categorySlug: zone.categorySlug,
        categoryLabel: categoryLabel(zone.categorySlug),
        city: searchCityLabel(zone.city),
        searches: zone.searches,
        empty: zone.empty,
        professionals: zone.city
          ? visibleProfessionals.filter((p) => norm(p.city) === zone.city && p.categorySlugs.includes(zone.categorySlug)).length
          : visibleProfessionals.filter((p) => p.categorySlugs.includes(zone.categorySlug)).length,
      }))
      .sort((a, b) => b.empty - a.empty || b.searches - a.searches || a.city.localeCompare(b.city, "it"))
      .slice(0, SEARCH_ZONE_ROWS),
  };
}

/** Una riga dell'avviso del lunedì: lavoro e città con ricerche senza nessuno vicino (§371). */
export type SearchDemandZone = { categoryLabel: string; city: string; searches: number; empty: number };

/**
 * Zone (lavoro + città) con almeno SEARCH_DEMAND_ALERT_MIN_EMPTY ricerche
 * senza nessun professionista vicino, dalla più scoperta (§371). Le ricerche
 * senza città non dicono dove reclutare: non contano.
 */
export function searchDemandZones(
  categoryDays: { categorySlug: string; city: string; count: number; emptyCount: number }[],
  minEmpty: number = SEARCH_DEMAND_ALERT_MIN_EMPTY,
): SearchDemandZone[] {
  const zones = new Map<string, { categorySlug: string; city: string; searches: number; empty: number }>();
  for (const day of categoryDays) {
    const city = day.city.trim().toLowerCase();
    if (!city) continue;
    const key = `${day.categorySlug}|${city}`;
    const zone = zones.get(key) ?? { categorySlug: day.categorySlug, city, searches: 0, empty: 0 };
    zone.searches += day.count;
    zone.empty += day.emptyCount;
    zones.set(key, zone);
  }
  return [...zones.values()]
    .filter((zone) => zone.empty >= minEmpty)
    .sort((a, b) => b.empty - a.empty || b.searches - a.searches || a.city.localeCompare(b.city, "it"))
    .slice(0, SEARCH_DEMAND_ALERT_ROWS)
    .map((zone) => ({ categoryLabel: categoryLabel(zone.categorySlug), city: searchCityLabel(zone.city), searches: zone.searches, empty: zone.empty }));
}
