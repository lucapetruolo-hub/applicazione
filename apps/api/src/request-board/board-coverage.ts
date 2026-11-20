import type { Prisma, PrismaClient } from "@professionisti/database";
import { PROVINCE_NAMES, findComuneByName, type BoardCard } from "@professionisti/shared";
import { calculateDistanceKm } from "../common/geo.util";
import { publicRealProfilesWhere } from "../professionals/searchable-profiles";
import { ACTIVE_QUOTE_STATUSES, boardCardOf, boardListedWhere, boardReplyProblem } from "./board-rules";

/**
 * Chi può rispondere a quali richieste di "Lavori cercati": stesse regole di
 * "Rispondi" per l'email del lunedì, il riquadro in Oggi, l'avviso sul sito e
 * le misure dell'Admin (docs/changelog/2026-11-20-misure-lavori-cercati.md).
 * Funzioni senza Nest, così le usano anche i servizi dell'Admin.
 */

const PAGE_SCAN_LIMIT = 300;

export const PROFILE_FACTS_SELECT = {
  id: true,
  category: { select: { slug: true } },
  extraCategories: { select: { slug: true } },
  services: { select: { name: true, categorySlug: true } },
  certifications: true,
  bio: true,
  latitude: true,
  longitude: true,
  remoteAvailable: true,
} as const;

export type ProfileFactsRow = {
  category: { slug: string };
  extraCategories: { slug: string }[];
  services: { name: string; categorySlug: string | null }[];
  certifications: string | null;
  bio: string | null;
  latitude: number;
  longitude: number;
  remoteAvailable: boolean;
};

export type ReplyableRequest = {
  row: Parameters<typeof boardReplyProblem>[0]["request"];
  card: BoardCard;
  comune: { lat: number; lon: number } | undefined;
  received: Set<string>;
};

export function profileFacts(profile: ProfileFactsRow): Parameters<typeof boardReplyProblem>[0]["profile"] {
  return {
    categorySlugs: [profile.category.slug, ...profile.extraCategories.map((category) => category.slug)],
    services: profile.services,
    certifications: profile.certifications,
    bio: profile.bio,
    latitude: profile.latitude,
    longitude: profile.longitude,
    remoteAvailable: profile.remoteAvailable,
  };
}

/** Le richieste a cui il profilo può rispondere e che non ha ricevuto, le più vicine prima. */
export function matchesFor(facts: Parameters<typeof boardReplyProblem>[0]["profile"], profileId: string, requests: ReplyableRequest[]): { card: BoardCard; km: number }[] {
  return requests
    .filter((request) => !request.received.has(profileId) && boardReplyProblem({ request: request.row, profile: facts }) === null)
    .map((request) => ({
      card: request.card,
      km: request.row.serviceMode === "ONLINE" || !request.comune ? 0 : calculateDistanceKm(request.comune.lat, request.comune.lon, facts.latitude, facts.longitude),
    }))
    .sort((a, b) => a.km - b.km);
}

export async function loadReplyableRequests(prisma: PrismaClient, extra: Prisma.GuidedRequestWhereInput, now: Date): Promise<ReplyableRequest[]> {
  const rows = await prisma.guidedRequest.findMany({
    where: { AND: [boardListedWhere(now), extra] },
    orderBy: { boardAt: "desc" },
    take: PAGE_SCAN_LIMIT,
    select: {
      id: true,
      city: true,
      boardTrade: true,
      boardTitle: true,
      boardSummary: true,
      boardPlace: true,
      boardProvince: true,
      boardAt: true,
      serviceMode: true,
      timing: true,
      photoUrls: true,
      waitingTrade: true,
      waitingTradeKey: true,
      leads: { select: { professionalProfileId: true } },
      _count: { select: { quotes: { where: { status: { in: [...ACTIVE_QUOTE_STATUSES] } } } } },
    },
  });
  return rows.flatMap((row) => {
    const card = boardCardOf({ ...row, photoCount: row.photoUrls.length, quoteCount: row._count.quotes });
    const comune = findComuneByName(row.city);
    return card && row.boardTrade ? [{ row: { ...row, boardTrade: row.boardTrade }, card, comune, received: new Set(row.leads.map((lead) => lead.professionalProfileId)) }] : [];
  });
}

/** Professionisti visibili nella ricerca, con quello che serve a "Rispondi". */
export function loadVisibleProfiles(prisma: PrismaClient, now: Date) {
  return prisma.professionalProfile.findMany({
    where: { AND: [publicRealProfilesWhere(now), { user: { deletedAt: null, suspendedAt: null } }] },
    take: 5000,
    select: { ...PROFILE_FACTS_SELECT, userId: true, user: { select: { name: true } } },
  });
}

/**
 * Dove mancano professionisti (proposta G, docs/changelog/2026-11-20-misure-lavori-cercati.md):
 * richieste in bacheca a cui nessun professionista visibile può rispondere
 * (stesse regole di "Rispondi", anche se l'ha già ricevuta), per provincia
 * e mestiere, prima quelle con più richieste. Solo per l'Admin.
 */
export async function uncoveredBoardRequests(prisma: PrismaClient, now: Date = new Date()): Promise<{ province: string; provinceName: string; trade: string; tradeLabel: string; count: number }[]> {
  let open = await loadReplyableRequests(prisma, {}, now);
  if (open.length === 0) return [];
  for (const profile of await loadVisibleProfiles(prisma, now)) {
    const facts = profileFacts(profile);
    open = open.filter((request) => boardReplyProblem({ request: request.row, profile: facts }) !== null);
    if (open.length === 0) return [];
  }
  const groups = new Map<string, { province: string; provinceName: string; trade: string; tradeLabel: string; count: number }>();
  for (const request of open) {
    const { province, trade, tradeLabel } = request.card;
    const key = `${province}|${trade}`;
    const group = groups.get(key) ?? { province, provinceName: PROVINCE_NAMES[province] ?? province, trade, tradeLabel, count: 0 };
    group.count += 1;
    groups.set(key, group);
  }
  return [...groups.values()].sort((a, b) => b.count - a.count || a.provinceName.localeCompare(b.provinceName, "it"));
}
