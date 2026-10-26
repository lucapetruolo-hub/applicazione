import {
  PROFESSIONAL_CATEGORIES,
  PROFESSIONAL_ENTITY_KEYS,
  PROFESSIONAL_PLAN_KEYS,
  PROFESSIONAL_STATUS_KEYS,
  type AdminProfessionalStats,
  type ProfessionalEntityKey,
  type ProfessionalPlanKey,
  type ProfessionalStatusKey,
} from "@professionisti/shared";
import { publicVisibilityMissing } from "../professional-fiscal/public-visibility";
import { romeMonthKey, subscriptionState, tierOfPlan, type SubscriptionRow } from "../subscriptions/subscription-rules";

/** Quello che serve di un professionista per contarlo (docs/CHANGELOG.md §368). */
export type ProfessionalStatsRow = {
  city: string;
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
export function buildProfessionalStats(
  rows: ProfessionalStatsRow[],
  now: Date,
  extra: { cityOptions: string[]; excluded: AdminProfessionalStats["excluded"] },
): AdminProfessionalStats {
  const status = new Map<ProfessionalStatusKey, number>();
  const plan = new Map<ProfessionalPlanKey, number>();
  const entity = new Map<ProfessionalEntityKey, number>();
  const category = new Map<string, number>();
  const city = new Map<string, number>();
  const month = new Map<string, number>();
  let new30d = 0;
  const add = <K>(map: Map<K, number>, key: K) => map.set(key, (map.get(key) ?? 0) + 1);

  for (const row of rows) {
    add(status, professionalStatusOf(row, now));
    add(plan, professionalPlanOf(row, now));
    add(entity, entityOf(row));
    for (const slug of new Set(row.categorySlugs)) add(category, slug);
    add(city, row.city.trim() || "Senza città");
    add(month, romeMonthKey(row.createdAt));
    if (now.getTime() - row.createdAt.getTime() <= 30 * DAY_MS) new30d += 1;
  }

  return {
    total: rows.length,
    new30d,
    excluded: extra.excluded,
    byStatus: PROFESSIONAL_STATUS_KEYS.map((key) => ({ key, count: status.get(key) ?? 0 })),
    byCategory: PROFESSIONAL_CATEGORIES.map((c) => ({ slug: c.slug, label: c.label, count: category.get(c.slug) ?? 0 })).sort(
      (a, b) => b.count - a.count || a.label.localeCompare(b.label, "it"),
    ),
    byCity: [...city.entries()].map(([name, count]) => ({ city: name, count })).sort((a, b) => b.count - a.count || a.city.localeCompare(b.city, "it")),
    byPlan: PROFESSIONAL_PLAN_KEYS.map((key) => ({ key, count: plan.get(key) ?? 0 })),
    byEntity: PROFESSIONAL_ENTITY_KEYS.map((key) => ({ key, count: entity.get(key) ?? 0 })),
    byMonth: monthKeysSince([...month.keys()].sort()[0] ?? null, now).map((key) => ({ key, count: month.get(key) ?? 0 })),
    cityOptions: extra.cityOptions,
  };
}
