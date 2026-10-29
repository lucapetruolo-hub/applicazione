import { SubscriptionsService } from "../subscriptions/subscriptions.service";
import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { Prisma, type PrismaClient } from "@professionisti/database";
import {
  quotePaymentOffer,
  professionalKindOf,
  traderStatusOf,
  findComuneByName,
  italianComuni,
  PROFILE_DECLARATION_VERSION,
  PUBLIC_AGENDA_DAYS,
  SEARCH_FALLBACK_MAX_KM,
  SEARCH_RADIUS_KM,
  type AvailabilitySlotInput,
  weekTemplateDatesKept,
  type BookAgendaSlotInput,
  type DeclineLeadInput,
  type ServicePriceIndexEntry,
  type MyAvailability,
  type MyProfessionalProfile,
  type MyProfilePreview,
  type ProfessionalAgenda,
  type ProfessionalAgendaDay,
  type ProfessionalAvailabilityPreviewDay,
  type ProfessionalAvailableSlot,
  type ProfessionalBooking,
  type ProfessionalDetail,
  type ProfessionalInsights,
  type ProfessionalLead,
  type ProfessionalSearchResult,
  type ProfessionalServiceItem,
  type ServicePriceUnit,
  type ProfessionalCategorySlug,
  type ProfessionalProfileSelfInput,
  type UpdateEngagementRadiusInput,
  toJobIssueSummary,
  toJobPaymentSummary,
  professionalRestrictions,
  jobPaidOnline,
  PROFESSIONAL_JOB_PROBLEM_REPORT_PREFIX,
  wallClockToday,
  isProfessionalCategorySlug,
  validSubTags,
  type CategoryPriceStats,
  DEFAULT_CANCELLATION_NOTICE_HOURS,
  OUT_OF_SERVICE_KEYWORDS,
  type ProblemOutOfService,
} from "@professionisti/shared";
import { COUNTED_USER, countingFrom, daySinceLaunch } from "../site-counts/counted";
import { PRISMA } from "../prisma/prisma.module";
import { invoiceRequestView } from "../client-invoice-requests/client-invoice-requests.service";
import { COURTESY_DOCUMENT_FIELDS, courtesyDocumentSummary } from "../accounting/courtesy-documents";
import { identityVerificationNeeded } from "../identity-verification/identity-provider-env";
import { PUBLIC_VISIBILITY_SELECT, publicVisibilityMissing, publicVisibilityWhere, publicVerified, stripeVerified } from "../professional-fiscal/public-visibility";
import { quoteResendWindow } from "../quotes/quote-resend";
import { onlineLimitFields, professionalOnlineLimit } from "../job-payments/online-limit";
import { NOT_ACCEPTING_REQUESTS, NOT_BOOKABLE_ONLINE } from "../subscriptions/subscription-rules";
import { GeocodingService } from "../geocoding/geocoding.service";
import { coveredComuni, selectSearchArea } from "./search-area";
import { acceptedQuoteStats, declaredServiceStats, quoteMidpointEurCents } from "./category-prices";
import { buildServicePriceIndex } from "./service-price-index";
import { type ServiceCanonicalizer, serviceGroupKey } from "./service-group-key";
import { ServiceNamesService } from "../problem-match/service-names.service";
import { slotAppliesOnDate } from "../common/availability.util";
import { AgendaService } from "../agenda/agenda.service";
import { countBookingsInSlot, loadCommitments, lockProfessionalAgenda, type Commitment } from "../agenda/commitments";
import { countCompletedThisMonth } from "../common/completed-jobs.util";
import { profileCategories } from "../common/profile-categories.util";
import { computeIsNewProfile } from "../common/new-profile.util";
import { NotificationsService } from "../notifications/notifications.service";
import { GuidedRequestsService } from "../guided-requests/guided-requests.service";
import { toMyState } from "../guided-requests/guided-request-user-state.service";
import { ProfessionalMetricsService } from "../professional-metrics/professional-metrics.service";
import { TimelineService } from "../timeline/timeline.service";
import { ProfessionalVerificationService } from "../professional-verification/professional-verification.service";
import { clientNameForProfessional, publicClientName } from "../common/client-name.util";
import { cancellationNoticeFor } from "../bookings/one-job-per-request";

export type ProfessionalSearchParams = {
  category?: string;
  city?: string;
  q?: string;
  remote?: boolean;
  /**
   * Nome di una prestazione (voce di "Quanto costa in media", docs/CHANGELOG.md
   * §398): solo i professionisti che l'hanno inserita, stesso raggruppamento
   * del price-index (maiuscole e spazi ai lati non contano).
   */
  service?: string;
  /** Esclude i profili demo del seed (isDemo) — usato dalla homepage per non mostrare vetrine finte come reali. */
  excludeDemo?: boolean;
  /**
   * Dalla descrizione del problema (docs/CHANGELOG.md §392): ordine per voto,
   * recensioni e distanza, senza il boost a pagamento (decisione di Luca).
   */
  merit?: boolean;
  /** Lavoro fuori dalle categorie: chi lo dichiara nelle prestazioni, nei patentini o nella descrizione. */
  offers?: ProblemOutOfService;
};

// Giorni della griglia mostrata in card: colonne giorno consecutive (un
// giorno vuoto resta in griglia con "-", riferimento miodottore.it), tutti
// i PUBLIC_AGENDA_DAYS giorni restituiti in un colpo solo: la UI pagina in
// finestre da 4 colonne con le frecce sui dati già scaricati, e cerca lì
// stessa il primo orario libero per "Mostra orari disponibili" (richiesta
// esplicita dell'utente: frecce per almeno due mesi, docs/CHANGELOG.md §206).

function mapServices(
  services: { id: string; name: string; priceMinEurCents: number | null; priceMaxEurCents: number | null; priceUnit: ServicePriceUnit }[],
): ProfessionalServiceItem[] {
  return services.map((service) => ({
    id: service.id,
    name: service.name,
    priceMinEurCents: service.priceMinEurCents,
    priceMaxEurCents: service.priceMaxEurCents,
    priceUnit: service.priceUnit,
  }));
}

/**
 * Professionisti che possono comparire nella ricerca. Un professionista che
 * ha eliminato l'account non deve mai ricomparire (soft-delete, vedi
 * AuthService.deleteAccount), né uno sospeso da un admin (docs/CHANGELOG.md
 * §144), né uno in pausa per l'abbonamento (§162), né uno creato da un
 * operatore e non ancora confermato (§170), né uno bloccato per la 3ª
 * segnalazione accolta in 30 giorni (§167). Va insieme a
 * `publicVisibilityWhere()` (dati fiscali, §241).
 */
function searchableProfileWhere(): Prisma.ProfessionalProfileWhereInput {
  return {
    deletedAt: null,
    suspendedAt: null,
    pausedAt: null,
    invitePendingAt: null,
    OR: [{ requestsBlockedUntil: null }, { requestsBlockedUntil: { lte: new Date() } }],
  };
}

/** La prestazione che corrisponde alla voce cercata, da evidenziare nella scheda (§398). */
function matchedServiceField(
  services: { id: string; name: string }[],
  serviceKey: string,
  canonicalize: ServiceCanonicalizer,
): { matchedServiceId?: string } {
  const match = services.find((item) => serviceGroupKey(item.name, canonicalize) === serviceKey);
  return match ? { matchedServiceId: match.id } : {};
}

/** Dati letti per la pagina pubblica del professionista e per la sua anteprima in dashboard. */
/** Campo "Città" (§383): periodo delle più cercate, quante, quanto si tengono in memoria. */
const CITY_HINTS_WINDOW_DAYS = 90;
const CITY_HINTS_POPULAR = 6;
const CITY_HINTS_CACHE_MS = 5 * 60 * 1000;

const PROFESSIONAL_DETAIL_INCLUDE = {
  category: true,
  fiscalProfile: { select: { stripePayoutsEnabled: true, fiscalDataCompleteAt: true, entityType: true } },
  extraCategories: true,
  // Nome di chi recensisce e servizio del lavoro, per l'intestazione delle
  // recensioni sul profilo (docs/CHANGELOG.md §349).
  bookings: {
    include: {
      review: true,
      client: { select: { name: true, surname: true } },
      quote: { select: { guidedRequest: { select: { category: { select: { label: true } } } } } },
    },
  },
  visibilityBoosts: { where: { status: "ACTIVE" } },
  services: true,
  metrics: true,
} satisfies Prisma.ProfessionalProfileInclude;

@Injectable()
export class ProfessionalsService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly geocodingService: GeocodingService,
    private readonly notificationsService: NotificationsService,
    private readonly guidedRequestsService: GuidedRequestsService,
    private readonly professionalMetricsService: ProfessionalMetricsService,
    private readonly timelineService: TimelineService,
    private readonly subscriptionsService: SubscriptionsService,
    private readonly professionalVerificationService: ProfessionalVerificationService,
    private readonly agendaService: AgendaService,
    private readonly serviceNamesService: ServiceNamesService,
  ) {}

  private readonly logger = new Logger(ProfessionalsService.name);

  /**
   * Suggerimenti del campo "Città" (docs/CHANGELOG.md §383): `covered` sono
   * i comuni con almeno un professionista visibile del lavoro scelto entro
   * il raggio della ricerca (prima quelli con più professionisti vicini,
   * senza mai dire quanti), `popular` le città più cercate per quel lavoro
   * negli ultimi 90 giorni, completate con le prime di `covered`. Solo nomi
   * di comuni: nessuna posizione dei professionisti esce dal server.
   */
  async getCityHints(category?: string): Promise<{ popular: string[]; covered: string[] }> {
    const key = category ?? "";
    const cached = this.cityHintsCache.get(key);
    if (cached && cached.expiresAt > Date.now()) return cached.value;

    const candidates = await this.prisma.professionalProfile.findMany({
      where: this.publicSearchWhere(category, true),
      select: { latitude: true, longitude: true },
    });
    const covered = coveredComuni(italianComuni(), candidates, SEARCH_RADIUS_KM).map((comune) => comune.name);

    const since = new Date(Date.now() - CITY_HINTS_WINDOW_DAYS * 24 * 60 * 60 * 1000);
    const categoryRow = category ? await this.prisma.category.findUnique({ where: { slug: category }, select: { id: true } }) : null;
    const [searches, freeSearches, requests] = await Promise.all([
      this.prisma.categorySearchDay.groupBy({
        by: ["city"],
        where: { day: { gte: since }, ...(categoryRow ? { categoryId: categoryRow.id } : {}) },
        _sum: { count: true },
      }),
      category
        ? Promise.resolve([])
        : this.prisma.freeSearchDay.groupBy({ by: ["city"], where: { day: { gte: since } }, _sum: { count: true } }),
      this.prisma.guidedRequest.groupBy({
        by: ["city"],
        where: { createdAt: { gte: since }, ...(categoryRow ? { categoryId: categoryRow.id } : {}) },
        _count: { _all: true },
      }),
    ]);
    const scoreByCity = new Map<string, number>();
    const add = (city: string, score: number) => {
      const comune = findComuneByName(city);
      if (comune && score > 0) scoreByCity.set(comune.name, (scoreByCity.get(comune.name) ?? 0) + score);
    };
    for (const row of searches) add(row.city, row._sum.count ?? 0);
    for (const row of freeSearches) add(row.city, row._sum.count ?? 0);
    // Una richiesta pesa come tre ricerche, come per i lavori più cercati (§280).
    for (const row of requests) add(row.city, row._count._all * 3);
    const popular = [...scoreByCity.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "it")).map(([city]) => city);
    for (const city of covered) {
      if (popular.length >= CITY_HINTS_POPULAR) break;
      if (!popular.includes(city)) popular.push(city);
    }

    const value = { popular: popular.slice(0, CITY_HINTS_POPULAR), covered };
    this.cityHintsCache.set(key, { value, expiresAt: Date.now() + CITY_HINTS_CACHE_MS });
    return value;
  }

  private readonly cityHintsCache = new Map<string, { value: { popular: string[]; covered: string[] }; expiresAt: number }>();

  /** Chi compare nella ricerca pubblica (filtri di CLAUDE.md §5.11), per lavoro e voce di "Quanto costa". */
  private publicSearchWhere(
    category: string | undefined,
    excludeDemo: boolean | undefined,
    serviceProfileIds: string[] | null = null,
  ): Prisma.ProfessionalProfileWhereInput {
    return {
      ...searchableProfileWhere(),
      // Categoria principale o una delle aggiuntive (docs/CHANGELOG.md §217).
      AND: [
        ...(category ? [{ OR: [{ category: { slug: category } }, { extraCategories: { some: { slug: category } } }] }] : []),
        // Visibile solo con i dati fiscali compilati (docs/CHANGELOG.md §241).
        publicVisibilityWhere(),
        ...(serviceProfileIds ? [{ id: { in: serviceProfileIds } }] : []),
      ],
      ...(excludeDemo ? { isDemo: false } : {}),
    };
  }

  async search({ category, city, q, remote, service, excludeDemo, merit, offers }: ProfessionalSearchParams): Promise<ProfessionalSearchResult[]> {
    // Sinonimi compresi (docs/changelog/2026-10-28-quanto-costa-sinonimi.md): "perdite" trova chi ha scritto "Riparazione perdita d'acqua".
    const canonicalize = service ? await this.serviceNamesService.canonicalizer() : null;
    const serviceKey = service && canonicalize ? serviceGroupKey(service, canonicalize) : "";
    const serviceProfileIds = serviceKey && canonicalize ? await this.profileIdsWithService(serviceKey, canonicalize) : null;
    const publicWhere = this.publicSearchWhere(category, excludeDemo, serviceProfileIds);
    const offerKeywords = offers ? OUT_OF_SERVICE_KEYWORDS[offers] : [];
    const baseWhere: Prisma.ProfessionalProfileWhereInput = {
      ...publicWhere,
      // Nell'AND: l'OR in cima è già usato da publicSearchWhere.
      ...(offerKeywords.length > 0
        ? {
            AND: [
              ...(Array.isArray(publicWhere.AND) ? publicWhere.AND : []),
              {
                OR: offerKeywords.flatMap((word) => [
                  { services: { some: { name: { contains: word, mode: "insensitive" as const } } } },
                  { certifications: { contains: word, mode: "insensitive" as const } },
                  { bio: { contains: word, mode: "insensitive" as const } },
                ]),
              },
            ],
          }
        : {}),
      ...(q ? { businessName: { contains: q, mode: "insensitive" } } : {}),
      ...(remote ? { remoteAvailable: true } : {}),
    };

    // Ricerca per luogo (richiesta esplicita dell'utente): con un comune
    // riconosciuto si cercano i professionisti entro SEARCH_RADIUS_KM dal suo
    // centro e, se non ce n'è nessuno, il più vicino (selectSearchArea). Una
    // prima query leggera solo sulle coordinate, poi il dettaglio completo
    // solo per i profili scelti. Un nome che non è un comune ISTAT resta un
    // confronto esatto sulla città, come prima.
    const comune = city ? findComuneByName(city) : undefined;
    let distanceById: Map<string, number> | null = null;
    let where: Prisma.ProfessionalProfileWhereInput = baseWhere;
    if (comune) {
      const candidates = await this.prisma.professionalProfile.findMany({
        where: baseWhere,
        select: { id: true, latitude: true, longitude: true },
      });
      distanceById = selectSearchArea(comune, candidates, SEARCH_RADIUS_KM, SEARCH_FALLBACK_MAX_KM);
      where = { ...baseWhere, id: { in: [...distanceById.keys()] } };
    } else if (city) {
      where = { ...baseWhere, city: { equals: city, mode: "insensitive" } };
    }

    const profiles = await this.prisma.professionalProfile.findMany({
      where,
      include: {
        category: true,
        extraCategories: true,
        bookings: { include: { review: true } },
        visibilityBoosts: { where: { status: "ACTIVE" } },
        services: true,
        fiscalProfile: { select: { stripePayoutsEnabled: true, entityType: true } },
      },
    });

    const previewsByProfileId = await this.buildAvailabilityPreviews(profiles.map((profile) => profile.id));

    const results = profiles.map((profile) => {
      // Recensioni dei clienti pubbliche subito (docs/CHANGELOG.md §215: il
      // professionista non recensisce più il cliente, niente "doppio cieco").
      const reviews = profile.bookings
        .filter((booking) => booking.review !== null && booking.review.hiddenAt === null)
        .map((booking) => booking.review)
        .filter((review): review is NonNullable<typeof review> => review !== null);
      const reviewCount = reviews.length;
      const rating =
        reviewCount > 0 ? Math.round((reviews.reduce((sum, review) => sum + review.rating, 0) / reviewCount) * 10) / 10 : null;
      const preview = previewsByProfileId.get(profile.id);
      const categories = profileCategories(profile);
      // Cercando "idraulico" la card mostra Idraulico anche se è una
      // categoria aggiuntiva del professionista.
      const shownCategory = categories.find((item) => item.slug === category) ?? categories[0]!;

      return {
        id: profile.id,
        businessName: profile.businessName,
        categorySlug: shownCategory.slug,
        categoryLabel: shownCategory.label,
        categories,
        city: profile.city,
        address: profile.address,
        verified: publicVerified(profile),
        stripeVerified: stripeVerified(profile.fiscalProfile),
        professionalKind: professionalKindOf(profile.fiscalProfile?.entityType),
        rating,
        reviewCount,
        boosted: profile.visibilityBoosts.length > 0,
        remoteAvailable: profile.remoteAvailable,
        latitude: profile.latitude,
        longitude: profile.longitude,
        imageUrl: profile.imageUrl,
        services: mapServices(profile.services),
        subTags: profile.subTags,
        spokenLanguages: profile.spokenLanguages,
        hasLiabilityInsurance: profile.hasLiabilityInsurance,
        availabilityPreview: preview?.days ?? [],
        availabilityFrom: new Date().toISOString().slice(0, 10),
        createdAt: profile.createdAt.toISOString(),
        completedThisMonth: countCompletedThisMonth(profile.bookings),
        isNewProfile: computeIsNewProfile(profile.createdAt),
        ...(serviceKey && canonicalize ? matchedServiceField(profile.services, serviceKey, canonicalize) : {}),
        ...(distanceById?.has(profile.id) ? { distanceKm: Math.round(distanceById.get(profile.id)! * 10) / 10 } : {}),
      } satisfies ProfessionalSearchResult;
    });

    // Ranking sponsorizzabile: boost attivo prima, poi rating, poi numero
    // recensioni (CLAUDE.md §1 — il ranking è la leva di monetizzazione).
    // Un profilo abbassato per segnalazioni accolte (§167) va in fondo per
    // 14 giorni, anche se ha un boost.
    const now = new Date();
    const demotedIds = new Set(profiles.filter((p) => professionalRestrictions(p, now).demoted).map((p) => p.id));
    results.sort((a, b) => {
      const demotedDiff = Number(demotedIds.has(a.id)) - Number(demotedIds.has(b.id));
      if (demotedDiff !== 0) return demotedDiff;
      if (!merit && a.boosted !== b.boosted) return a.boosted ? -1 : 1;
      const ratingDiff = (b.rating ?? 0) - (a.rating ?? 0);
      if (ratingDiff !== 0) return ratingDiff;
      const reviewDiff = b.reviewCount - a.reviewCount;
      if (reviewDiff !== 0) return reviewDiff;
      // A parità di tutto, nella ricerca per luogo prima il più vicino.
      return (a.distanceKm ?? 0) - (b.distanceKm ?? 0);
    });

    return results;
  }

  /**
   * Profili con una prestazione della voce data (`serviceGroupKey`). Il
   * confronto si fa qui e non nel database perché la chiave può unire nomi
   * scritti in modo diverso; le prestazioni sono poche (al massimo 30 a
   * professionista).
   */
  private async profileIdsWithService(serviceKey: string, canonicalize: ServiceCanonicalizer): Promise<string[]> {
    const services = await this.prisma.professionalService.findMany({ select: { professionalProfileId: true, name: true } });
    return [...new Set(services.filter((item) => serviceGroupKey(item.name, canonicalize) === serviceKey).map((item) => item.professionalProfileId))];
  }

  /**
   * "Quanto costa in media" della home: ogni prestazione inserita dai
   * professionisti visibili in ricerca, mai un dato inventato. Raggruppamento,
   * mediana e soglie in `buildServicePriceIndex` (docs/CHANGELOG.md §398);
   * prima erano minimo e massimo delle sole voci con un prezzo.
   */
  async getServicePriceIndex(): Promise<ServicePriceIndexEntry[]> {
    const services = await this.prisma.professionalService.findMany({
      where: {
        // Solo chi compare nella ricerca: ogni voce porta all'elenco di chi la
        // offre, e il numero mostrato deve coincidere (docs/CHANGELOG.md §398).
        // Gli account di prova restano nella ricerca ma non nei prezzi (docs/changelog/2026-10-28-quanto-costa-sinonimi.md, decisione di Luca).
        professionalProfile: { isDemo: false, user: COUNTED_USER, ...searchableProfileWhere(), AND: [publicVisibilityWhere()] },
      },
      select: { name: true, professionalProfileId: true, priceMinEurCents: true, priceMaxEurCents: true, priceUnit: true },
    });
    return buildServicePriceIndex(services, await this.serviceNamesService.canonicalizer());
  }

  /**
   * Prezzi veri per la pagina "Quanto costa" di una categoria
   * (docs/CHANGELOG.md §296): preventivi accettati dai clienti (status
   * ACCEPTED, cioè con la prenotazione creata) e prestazioni dichiarate dai
   * professionisti che fanno solo quel lavoro (le prestazioni non dicono a
   * quale categoria appartengono). Professionisti demo esclusi; sotto le
   * soglie nessun numero.
   */
  async getCategoryPriceStats(categorySlug: string, city?: string): Promise<CategoryPriceStats> {
    if (!isProfessionalCategorySlug(categorySlug)) throw new NotFoundException("Categoria non trovata");
    // Con una città: solo la sua provincia (richiesta di Luca, §296), sia per
    // i preventivi (comune della richiesta) sia per i prezzi dichiarati
    // (comune del professionista). Il comune si risolve in memoria perché le
    // città sono testo libero.
    const comune = city ? findComuneByName(city) : undefined;
    if (city && !comune) throw new NotFoundException("Comune non trovato");
    const inProvince = (name: string | null | undefined) => !comune || findComuneByName(name ?? "")?.province === comune.province;
    const [allQuotes, allServices] = await Promise.all([
      this.prisma.quote.findMany({
        where: {
          status: "ACCEPTED",
          // Né preventivi di un account di prova, da una parte o dall'altra (docs/changelog/2026-10-28-quanto-costa-sinonimi.md).
          guidedRequest: { category: { slug: categorySlug }, client: COUNTED_USER },
          professionalProfile: { isDemo: false, user: COUNTED_USER },
        },
        select: {
          updatedAt: true,
          guidedRequest: { select: { city: true } },
          items: { select: { priceMinEurCents: true, priceMaxEurCents: true } },
        },
      }),
      this.prisma.professionalService.findMany({
        where: {
          OR: [{ priceMinEurCents: { not: null } }, { priceMaxEurCents: { not: null } }],
          professionalProfile: {
            isDemo: false,
            user: COUNTED_USER,
            deletedAt: null,
            suspendedAt: null,
            invitePendingAt: null,
            category: { slug: categorySlug },
            extraCategories: { none: {} },
            AND: [publicVisibilityWhere()],
          },
        },
        select: {
          name: true,
          priceMinEurCents: true,
          priceMaxEurCents: true,
          priceUnit: true,
          professionalProfileId: true,
          professionalProfile: { select: { city: true } },
        },
      }),
    ]);
    const canonicalize = await this.serviceNamesService.canonicalizer();
    const quotes = allQuotes.filter((quote) => inProvince(quote.guidedRequest.city));
    const services = allServices.filter((service) => inProvince(service.professionalProfile.city));
    const totals = quotes.flatMap((quote) => {
      const totalEurCents = quoteMidpointEurCents(quote.items);
      return totalEurCents === null ? [] : [{ totalEurCents, updatedAt: quote.updatedAt }];
    });
    return {
      categorySlug,
      province: comune ? comune.province : null,
      quotes: acceptedQuoteStats(totals),
      declared: declaredServiceStats(services, canonicalize),
    };
  }

  /**
   * Conteggio reale di quante volte ogni lingua compare già in
   * `ProfessionalProfile.spokenLanguages` su tutta la piattaforma — richiesta
   * esplicita dell'utente: quando si aggiunge una lingua parlata in
   * `/dashboard/profilo`, i primi risultati mostrati non devono essere in
   * ordine alfabetico ma "in ordine delle più inserite già". Stesso principio
   * di `getServicePriceIndex` sopra (dato reale, mai un ordine inventato),
   * stessa esclusione demo/eliminati. Prisma non aggrega elementi di un array
   * lato query: si scaricano i soli array (mai l'intero profilo) e si conta
   * in memoria — scala già accettata altrove nel progetto per lo stesso
   * motivo (CLAUDE.md §7, singola città/poche categorie).
   */
  async getLanguagePopularity(): Promise<{ name: string; count: number }[]> {
    const profiles = await this.prisma.professionalProfile.findMany({
      where: { isDemo: false, deletedAt: null, suspendedAt: null },
      select: { spokenLanguages: true },
    });

    const counts = new Map<string, { label: string; count: number }>();
    for (const profile of profiles) {
      for (const lang of profile.spokenLanguages) {
        const trimmed = lang.trim();
        if (!trimmed) continue;
        const key = trimmed.toLowerCase();
        const existing = counts.get(key);
        if (existing) existing.count += 1;
        else counts.set(key, { label: trimmed, count: 1 });
      }
    }

    return Array.from(counts.values())
      .map((c) => ({ name: c.label, count: c.count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "it"));
  }

  /**
   * Anteprima "prossimi orari liberi" per la mini-agenda della card di
   * ricerca (richiesta esplicita dell'utente, riferimento miodottore.it).
   * Un'unica query batch per l'intera pagina di risultati invece di una per
   * professionista: a differenza di getPublicAgenda (stessi giorni, un solo
   * profilo, chiamata dalla pagina profilo) qui il numero di profili può
   * essere alto e questa funzione gira dentro l'endpoint di ricerca, dove un
   * N+1 sarebbe un problema di scala reale, non solo teorico.
   */
  private async buildAvailabilityPreviews(profileIds: string[]): Promise<Map<string, { days: ProfessionalAvailabilityPreviewDay[] }>> {
    const result = new Map<string, { days: ProfessionalAvailabilityPreviewDay[] }>();
    if (profileIds.length === 0) return result;

    const startOfToday = wallClockToday();
    const searchEnd = new Date(startOfToday);
    searchEnd.setUTCDate(searchEnd.getUTCDate() + PUBLIC_AGENDA_DAYS);

    const [slots, bookingsByProfile, exceptions] = await Promise.all([
      // Ogni fascia, a prescindere dalla capienza (richiesta esplicita
      // dell'utente: "devono comparire da subito gli orari disponibili a
      // prescindere se il professionista ha impostato la capienza per
      // quella fascia 1 o più di 1") — non più filtrate a maxBookings: 1
      // né gated dietro un opt-in del professionista.
      this.prisma.availabilitySlot.findMany({
        where: { professionalProfileId: { in: profileIds } },
      }),
      loadCommitments(this.prisma, profileIds, startOfToday, searchEnd),
      this.prisma.availabilityException.findMany({
        where: { professionalProfileId: { in: profileIds }, date: { gte: startOfToday, lt: searchEnd } },
        select: { professionalProfileId: true, date: true },
      }),
    ]);

    const slotsByProfile = new Map<string, typeof slots>();
    for (const slot of slots) {
      const list = slotsByProfile.get(slot.professionalProfileId) ?? [];
      list.push(slot);
      slotsByProfile.set(slot.professionalProfileId, list);
    }
    const exceptionDatesByProfile = new Map<string, Set<string>>();
    for (const exception of exceptions) {
      const set = exceptionDatesByProfile.get(exception.professionalProfileId) ?? new Set<string>();
      set.add(exception.date.toISOString().slice(0, 10));
      exceptionDatesByProfile.set(exception.professionalProfileId, set);
    }

    for (const profileId of profileIds) {
      const profileSlots = slotsByProfile.get(profileId);
      if (!profileSlots || profileSlots.length === 0) continue;
      const profileBookings = bookingsByProfile.get(profileId) ?? [];
      const exceptionDates = exceptionDatesByProfile.get(profileId);

      // Solo i giorni con almeno una fascia: la card ricostruisce da sola le
      // colonne vuote a partire da `availabilityFrom` (risposta più leggera).
      const days: ProfessionalAvailabilityPreviewDay[] = [];
      for (let offset = 0; offset < PUBLIC_AGENDA_DAYS; offset++) {
        const date = new Date(startOfToday);
        date.setUTCDate(date.getUTCDate() + offset);
        const dateStr = date.toISOString().slice(0, 10);
        if (exceptionDates?.has(dateStr)) continue;

        const times = profileSlots
          .filter((slot) => slotAppliesOnDate(slot, date))
          .sort((a, b) => a.startTime.localeCompare(b.startTime))
          .map((slot) => {
            // Una fascia resta prenotabile finché ha capienza residua per
            // quel tipo, non solo finché è del tutto libera — coerente con
            // "una volta che quella fascia consuma la capienza non deve
            // essere più prenotabile" (richiesta esplicita dell'utente),
            // ora indipendente per home/online (CLAUDE.md §22).
            const homeAvailable =
              slot.allowsHome && countBookingsInSlot(profileBookings, dateStr, slot.startTime, slot.endTime, "HOME") < (slot.homeMaxBookings ?? 1);
            const onlineAvailable =
              slot.allowsOnline &&
              countBookingsInSlot(profileBookings, dateStr, slot.startTime, slot.endTime, "ONLINE") < (slot.onlineMaxBookings ?? 1);
            return { time: slot.startTime, endTime: slot.endTime, allowsHome: slot.allowsHome, allowsOnline: slot.allowsOnline, homeAvailable, onlineAvailable };
          });
        if (times.length > 0) days.push({ date: dateStr, times });
      }

      // Restituita sempre quando il professionista ha almeno una fascia nei
      // prossimi due mesi, anche se oggi è tutto al completo (bug reale
      // segnalato dall'utente, docs/CHANGELOG.md §206): prima la griglia
      // spariva del tutto se nei primi 30 giorni non c'era nulla di libero,
      // e il cliente non vedeva più nessuna data.
      if (days.length > 0) result.set(profileId, { days });
    }

    return result;
  }

  async getById(id: string): Promise<ProfessionalDetail> {
    const profile = await this.prisma.professionalProfile.findUnique({ where: { id }, include: PROFESSIONAL_DETAIL_INCLUDE });

    // Senza dati fiscali la pagina non è ancora pubblica (docs/CHANGELOG.md §241).
    if (!profile || profile.deletedAt || profile.suspendedAt || profile.invitePendingAt || publicVisibilityMissing(profile)) {
      throw new NotFoundException("Professionista non trovato.");
    }
    return this.toProfessionalDetail(profile);
  }

  /**
   * Anteprima del proprio profilo pubblico in "Profilo pubblico"
   * (docs/CHANGELOG.md §252): gli stessi dati della pagina pubblica, anche
   * quando il profilo non è ancora visibile ai clienti, con il motivo.
   */
  async getMyPreview(userId: string): Promise<MyProfilePreview | null> {
    const profile = await this.prisma.professionalProfile.findUnique({ where: { userId }, include: PROFESSIONAL_DETAIL_INCLUDE });
    if (!profile || profile.deletedAt) return null;
    const visibility: MyProfilePreview["visibility"] = profile.suspendedAt
      ? "SUSPENDED"
      : profile.invitePendingAt || profile.profileDeclarationVersion !== PROFILE_DECLARATION_VERSION
        ? "NOT_CONFIRMED"
        : publicVisibilityMissing(profile)
          ? "FISCAL_DATA_MISSING"
          : "PUBLIC";
    return { profile: this.toProfessionalDetail(profile), visibility };
  }

  private toProfessionalDetail(profile: Prisma.ProfessionalProfileGetPayload<{ include: typeof PROFESSIONAL_DETAIL_INCLUDE }>): ProfessionalDetail {
    // Recensioni dei clienti pubbliche subito (docs/CHANGELOG.md §215).
    const reviewed = profile.bookings
      .flatMap((booking) => (booking.review !== null && booking.review.hiddenAt === null ? [{ review: booking.review, booking }] : []))
      .sort((a, b) => b.review.createdAt.getTime() - a.review.createdAt.getTime());
    const reviews = reviewed.map(({ review }) => review);
    const reviewCount = reviews.length;
    const rating =
      reviewCount > 0 ? Math.round((reviews.reduce((sum, review) => sum + review.rating, 0) / reviewCount) * 10) / 10 : null;

    return {
      id: profile.id,
      businessName: profile.businessName,
      categorySlug: profile.category.slug as ProfessionalCategorySlug,
      categoryLabel: profile.category.label,
      categories: profileCategories(profile),
      city: profile.city,
      address: profile.address,
      verified: publicVerified(profile),
      stripeVerified: stripeVerified(profile.fiscalProfile),
      // Privato o professionista, per il cliente (Codice del consumo art. 49-bis, §241).
      traderStatus: traderStatusOf(profile.fiscalProfile?.entityType),
      professionalKind: professionalKindOf(profile.fiscalProfile?.entityType),
      rating,
      reviewCount,
      boosted: profile.visibilityBoosts.length > 0,
      remoteAvailable: profile.remoteAvailable,
      latitude: profile.latitude,
      longitude: profile.longitude,
      imageUrl: profile.imageUrl,
      services: mapServices(profile.services),
      subTags: profile.subTags,
      spokenLanguages: profile.spokenLanguages,
      // La pagina profilo mostra già l'agenda completa (getPublicAgenda):
      // l'anteprima compatta esiste solo per la card nei risultati di ricerca.
      availabilityPreview: [],
      availabilityFrom: new Date().toISOString().slice(0, 10),
      createdAt: profile.createdAt.toISOString(),
      completedThisMonth: countCompletedThisMonth(profile.bookings),
      isNewProfile: computeIsNewProfile(profile.createdAt),
      bio: profile.bio,
      portfolioUrls: profile.portfolioUrls,
      completedJobsTotal: profile.metrics?.completedJobs ?? 0,
      avgResponseTimeMinutes: profile.metrics?.avgResponseTimeMinutes ?? null,
      yearsOfExperience: profile.yearsOfExperience,
      certifications: profile.certifications,
      hasLiabilityInsurance: profile.hasLiabilityInsurance,
      acceptingRequests: !profile.pausedAt && !professionalRestrictions(profile, new Date()).blocked,
      reviews: reviewed.map(({ review, booking }) => ({
        id: review.id,
        rating: review.rating,
        comment: review.comment,
        photoUrls: review.photoUrls,
        createdAt: review.createdAt.toISOString(),
        // Pagina pubblica: solo nome e iniziale del cognome (§216).
        clientName: publicClientName(booking.client),
        jobLabel: booking.quote?.guidedRequest.category.label ?? null,
      })),
    };
  }

  async getMyProfile(userId: string): Promise<MyProfessionalProfile | null> {
    const profile = await this.prisma.professionalProfile.findUnique({
      where: { userId },
      include: { category: true, extraCategories: true, services: true, fiscalProfile: { select: { stripePayoutsEnabled: true } } },
    });
    if (!profile) return null;

    return {
      id: profile.id,
      businessName: profile.businessName,
      categorySlug: profile.category.slug,
      categoryLabel: profile.category.label,
      categorySlugs: profileCategories(profile).map((category) => category.slug),
      city: profile.city,
      address: profile.address,
      latitude: profile.latitude,
      longitude: profile.longitude,
      bio: profile.bio,
      subTags: profile.subTags,
      verified: profile.verified,
      verificationRequestedAt: profile.verificationRequestedAt?.toISOString() ?? null,
      remoteAvailable: profile.remoteAvailable,
      cancellationNoticeHours: profile.cancellationNoticeHours,
      imageUrl: profile.imageUrl,
      portfolioUrls: profile.portfolioUrls,
      services: mapServices(profile.services),
      engagementRadiusKm: profile.engagementRadiusKm,
      urgentEngagementRadiusKm: profile.urgentEngagementRadiusKm,
      spokenLanguages: profile.spokenLanguages,
      yearsOfExperience: profile.yearsOfExperience,
      certifications: profile.certifications,
      hasLiabilityInsurance: profile.hasLiabilityInsurance,
      profileDeclarationAccepted: profile.profileDeclarationVersion === PROFILE_DECLARATION_VERSION,
      demotedUntil: profile.demotedUntil && profile.demotedUntil > new Date() ? profile.demotedUntil.toISOString() : null,
      requestsBlockedUntil: profile.requestsBlockedUntil && profile.requestsBlockedUntil > new Date() ? profile.requestsBlockedUntil.toISOString() : null,
      // Modi di pagamento di serie nei nuovi preventivi (docs/CHANGELOG.md §239).
      defaultPaymentOffer: quotePaymentOffer({ paymentOptions: profile.defaultPaymentOptions, depositPercent: profile.defaultDepositPercent }),
      stripeVerified: stripeVerified(profile.fiscalProfile),
      ...onlineLimitFields(await professionalOnlineLimit(this.prisma, profile.id)),
      identityVerificationNeeded: identityVerificationNeeded(profile),
    };
  }

  /**
   * `byOperator`: profilo creato da un operatore al telefono
   * (docs/CHANGELOG.md §170). Niente dichiarazione (la accetta il
   * professionista al primo salvataggio), profilo fuori dalla ricerca e
   * dallo smistamento finché non lo fa.
   */
  async upsertMyProfile(userId: string, input: ProfessionalProfileSelfInput, options: { byOperator?: boolean } = {}): Promise<MyProfessionalProfile> {
    // Da 1 a 3 categorie (limite già nello schema Zod), la prima è la
    // principale (docs/CHANGELOG.md §217).
    const categorySlugs = [...new Set(input.categorySlugs)];
    const categories = await this.prisma.category.findMany({ where: { slug: { in: categorySlugs } }, select: { id: true, slug: true } });
    if (categories.length !== categorySlugs.length) {
      throw new NotFoundException("Categoria non valida.");
    }
    const categoryIdBySlug = new Map(categories.map((category) => [category.slug, category.id]));
    const primaryCategoryId = categoryIdBySlug.get(categorySlugs[0]!)!;
    // Solo le specializzazioni delle categorie scelte (docs/CHANGELOG.md §296):
    // togliendo una categoria spariscono anche le sue.
    const subTags = validSubTags(input.subTags, categorySlugs as ProfessionalCategorySlug[]);
    const extraCategoryIds = categorySlugs.slice(1).map((slug) => ({ id: categoryIdBySlug.get(slug)! }));

    // Posizione sulla mappa: se il professionista indica un indirizzo
    // preciso, prova a geocodificarlo (Google Geocoding) per posizionarlo esatto
    // invece che al centro del comune — richiesta esplicita dell'utente
    // ("scegliere sia la città generica, che un indirizzo preciso che andrà
    // a posizionarsi precisamente sulla mappa"). Se la geocodifica non trova
    // nulla (indirizzo incompleto, servizio non raggiungibile) si ricade sul
    // centro del comune scelto (dataset ISTAT, sempre disponibile), mai su
    // un blocco del salvataggio del profilo.
    const comune = findComuneByName(input.city);
    let latitude = input.latitude ?? comune?.lat ?? 0;
    let longitude = input.longitude ?? comune?.lon ?? 0;
    if (input.latitude === undefined && input.longitude === undefined && input.address?.trim()) {
      const geocoded = await this.geocodingService.geocodeAddress(`${input.address.trim()}, ${input.city}, Italia`);
      if (geocoded) {
        latitude = geocoded.latitude;
        longitude = geocoded.longitude;
      }
    }

    // Serve saperlo PRIMA dell'upsert (che non lo dice da sé): solo alla
    // primissima creazione del profilo va coinvolto nelle richieste guidate
    // già aperte in zona (vedi matchNewProfileToOpenRequests più sotto) —
    // un professionista che modifica il profilo esistente non deve
    // riceverne di nuove ogni volta che salva.
    const existingProfile = await this.prisma.professionalProfile.findUnique({
      where: { userId },
      select: {
        id: true,
        businessName: true,
        profileDeclarationVersion: true,
        invitePendingAt: true,
        categoryId: true,
        extraCategories: { select: { id: true } },
      },
    });
    const isFirstTimeCreation = existingProfile === null;
    // Alla creazione senza un'immagine scelta, il profilo pubblico parte
    // dalla foto dell'account (quella di Google, se registrato con Google).
    const accountImageUrl =
      isFirstTimeCreation && !input.imageUrl
        ? ((await this.prisma.user.findUnique({ where: { id: userId }, select: { imageUrl: true } }))?.imageUrl ?? undefined)
        : undefined;

    // Dichiarazione di responsabilità (docs/CHANGELOG.md §158): senza la
    // versione attuale già accettata, il salvataggio richiede la casella.
    const declarationAlreadyAccepted = existingProfile?.profileDeclarationVersion === PROFILE_DECLARATION_VERSION;
    if (!options.byOperator && !declarationAlreadyAccepted && !input.profileDeclarationAccepted) {
      throw new BadRequestException("Per salvare il profilo conferma la dichiarazione sui dati inseriti.");
    }
    const declarationData =
      input.profileDeclarationAccepted && !options.byOperator
        ? { profileDeclarationAcceptedAt: new Date(), profileDeclarationVersion: PROFILE_DECLARATION_VERSION }
        : {};
    // Il professionista invitato salva per la prima volta il profilo creato
    // dall'operatore: entra in ricerca e riceve le richieste aperte in zona.
    const activatesInvite = !options.byOperator && !!existingProfile?.invitePendingAt;
    const inviteData = activatesInvite ? { invitePendingAt: null } : {};

    const profile = await this.prisma.professionalProfile.upsert({
      where: { userId },
      update: {
        categoryId: primaryCategoryId,
        extraCategories: { set: extraCategoryIds },
        subTags,
        businessName: input.businessName,
        city: input.city,
        address: input.address,
        latitude,
        longitude,
        bio: input.bio,
        remoteAvailable: input.remoteAvailable,
        // undefined = non inviata in questo salvataggio: Prisma la ignora e
        // lascia il valore esistente invariato, non la azzera.
        imageUrl: input.imageUrl,
        portfolioUrls: input.portfolioUrls,
        spokenLanguages: input.spokenLanguages,
        yearsOfExperience: input.yearsOfExperience ?? null,
        certifications: input.certifications,
        hasLiabilityInsurance: input.hasLiabilityInsurance,
        cancellationNoticeHours: input.cancellationNoticeHours,
        ...declarationData,
        ...inviteData,
      },
      create: {
        userId,
        categoryId: primaryCategoryId,
        extraCategories: { connect: extraCategoryIds },
        subTags,
        businessName: input.businessName,
        city: input.city,
        address: input.address,
        latitude,
        longitude,
        bio: input.bio,
        remoteAvailable: input.remoteAvailable,
        imageUrl: input.imageUrl || accountImageUrl,
        portfolioUrls: input.portfolioUrls,
        spokenLanguages: input.spokenLanguages,
        yearsOfExperience: input.yearsOfExperience ?? null,
        certifications: input.certifications,
        hasLiabilityInsurance: input.hasLiabilityInsurance,
        cancellationNoticeHours: input.cancellationNoticeHours,
        ...declarationData,
        ...(options.byOperator ? { invitePendingAt: new Date() } : {}),
      },
      include: { category: true, extraCategories: true },
    });

    // Lista prestazioni sostituita per intero ad ogni salvataggio (nessun
    // editing granulare per singola voce): coerente con la scala attesa
    // (poche voci a professionista), molto più semplice che diffare la
    // lista esistente contro quella inviata.
    // In un'unica transazione (docs/CHANGELOG.md §287): un errore a metà non lascia il profilo senza prestazioni.
    await this.prisma.$transaction([
      this.prisma.professionalService.deleteMany({ where: { professionalProfileId: profile.id } }),
      this.prisma.professionalService.createMany({
        data: input.services.map((service) => ({
          professionalProfileId: profile.id,
          name: service.name.trim(),
          priceMinEurCents: service.priceMinEurCents ?? null,
          priceMaxEurCents: service.priceMaxEurCents ?? null,
          priceUnit: service.priceUnit ?? "JOB",
        })),
      }),
    ]);
    const savedServices = await this.prisma.professionalService.findMany({ where: { professionalProfileId: profile.id } });

    // Badge "Verificato" (docs/CHANGELOG.md §200): il controllo valeva per il
    // nome dell'attività di prima, quindi si toglie se il nome cambia.
    if (existingProfile && existingProfile.businessName.trim() !== profile.businessName.trim()) {
      await this.professionalVerificationService.revokeAfterOwnChange(
        profile.id,
        userId,
        "Hai cambiato il nome dell'attività: dobbiamo ricontrollare i tuoi dati.",
      );
    }

    // Coinvolgimento nei confronti delle richieste guidate già aperte in
    // zona (CLAUDE.md §14, STEP 4) — solo alla primissima creazione del
    // profilo: non esiste in questo progetto un vero flusso di verifica
    // admin da usare come innesco (ProfessionalProfile.verified non è mai
    // impostato da nessuna parte), quindi il momento reale in cui un
    // professionista diventa eleggibile per ricerca/fan-out è proprio la
    // creazione del profilo, coerente con come funziona già oggi il resto
    // del sistema.
    if (isFirstTimeCreation) {
      // Primo mese gratis per tutti (docs/CHANGELOG.md §161).
      await this.subscriptionsService.ensureTrial(profile.id);
      // Orari di partenza nell'agenda (docs/CHANGELOG.md §364): non devono
      // mai bloccare il salvataggio del profilo.
      try {
        await this.agendaService.applyStarterHours(profile.id, profile.remoteAvailable);
      } catch (err) {
        this.logger.error(`Orari di partenza non messi per ${profile.id}`, err instanceof Error ? err.stack : String(err));
      }
    }
    // Offerta di lancio (§363): uno dei primi 100 posti a chi completa il
    // profilo da sé; un profilo creato da un operatore lo prende alla conferma.
    if ((isFirstTimeCreation && !options.byOperator) || activatesInvite) {
      await this.subscriptionsService.claimFounderSpot(profile.id);
    }
    // Categorie aggiunte a un profilo già attivo (docs/CHANGELOG.md §217):
    // riceve anche le richieste aperte di quelle categorie, solo quelle.
    const profileCategoryIds = [profile.categoryId, ...profile.extraCategories.map((category) => category.id)];
    const previousCategoryIds = existingProfile ? [existingProfile.categoryId, ...existingProfile.extraCategories.map((category) => category.id)] : [];
    const addedCategoryIds = profileCategoryIds.filter((id) => !previousCategoryIds.includes(id));
    const isActiveProfile = !!existingProfile && !existingProfile.invitePendingAt && !options.byOperator;
    const matchCategoryIds =
      (isFirstTimeCreation && !options.byOperator) || activatesInvite ? profileCategoryIds : isActiveProfile ? addedCategoryIds : [];
    if (matchCategoryIds.length > 0) {
      await this.guidedRequestsService.matchNewProfileToOpenRequests({
        id: profile.id,
        userId,
        categoryIds: matchCategoryIds,
        latitude: profile.latitude,
        longitude: profile.longitude,
        engagementRadiusKm: profile.engagementRadiusKm,
        urgentEngagementRadiusKm: profile.urgentEngagementRadiusKm,
        remoteAvailable: profile.remoteAvailable,
      });
    }

    return {
      id: profile.id,
      businessName: profile.businessName,
      categorySlug: profile.category.slug,
      categoryLabel: profile.category.label,
      categorySlugs: profileCategories(profile).map((category) => category.slug),
      city: profile.city,
      address: profile.address,
      latitude: profile.latitude,
      longitude: profile.longitude,
      bio: profile.bio,
      subTags: profile.subTags,
      verified: profile.verified,
      verificationRequestedAt: profile.verificationRequestedAt?.toISOString() ?? null,
      remoteAvailable: profile.remoteAvailable,
      cancellationNoticeHours: profile.cancellationNoticeHours,
      imageUrl: profile.imageUrl,
      portfolioUrls: profile.portfolioUrls,
      services: mapServices(savedServices),
      engagementRadiusKm: profile.engagementRadiusKm,
      urgentEngagementRadiusKm: profile.urgentEngagementRadiusKm,
      spokenLanguages: profile.spokenLanguages,
      yearsOfExperience: profile.yearsOfExperience,
      certifications: profile.certifications,
      hasLiabilityInsurance: profile.hasLiabilityInsurance,
      profileDeclarationAccepted: profile.profileDeclarationVersion === PROFILE_DECLARATION_VERSION,
      defaultPaymentOffer: quotePaymentOffer({ paymentOptions: profile.defaultPaymentOptions, depositPercent: profile.defaultDepositPercent }),
      stripeVerified: stripeVerified(await this.prisma.professionalFiscalProfile.findUnique({ where: { professionalProfileId: profile.id }, select: { stripePayoutsEnabled: true } })),
      ...onlineLimitFields(await professionalOnlineLimit(this.prisma, profile.id)),
      identityVerificationNeeded: identityVerificationNeeded(profile),
    };
  }

  async updateMyImage(userId: string, imageUrl: string): Promise<void> {
    // "Immagine profilo" è la prima sezione del form in /dashboard/profilo:
    // un professionista alla primissima configurazione può naturalmente
    // provare a caricare la foto prima ancora di aver compilato e salvato il
    // resto (nessuna riga ProfessionalProfile ancora). In quel caso non c'è
    // nulla su cui persistere subito l'URL — non è un errore da bloccare con
    // "Completa prima il tuo profilo professionista" (bug reale segnalato
    // dall'utente: appariva anche se stava letteralmente completando il
    // profilo in quel momento), semplicemente non c'è ancora un profilo:
    // l'URL resta nello stato del form e viene incluso nel primo salvataggio
    // vero e proprio (vedi `imageUrl` in professionalProfileSchema).
    const profile = await this.prisma.professionalProfile.findUnique({ where: { userId }, select: { id: true } });
    if (!profile) return;
    await this.prisma.professionalProfile.update({ where: { userId }, data: { imageUrl } });
  }

  /**
   * Aggiorna i due raggi di ingaggio (standard/urgente) del professionista
   * autenticato — editabili separatamente dal resto del profilo
   * (EngagementRadiusMap in /dashboard/profilo ha un proprio bottone
   * "Salva"). Il range (1-35 km standard, 1-25 urgente) è già validato da updateEngagementRadiusSchema
   * (ZodValidationPipe, stessa fonte di verità usata da ogni altro endpoint
   * di questo modulo) prima che l'input arrivi qui — nessuna doppia
   * validazione nel service.
   */
  async updateEngagementRadius(userId: string, input: UpdateEngagementRadiusInput): Promise<{ engagementRadiusKm: number; urgentEngagementRadiusKm: number }> {
    await this.requireMyProfileId(userId);
    const updated = await this.prisma.professionalProfile.update({
      where: { userId },
      data: {
        engagementRadiusKm: input.engagementRadiusKm,
        urgentEngagementRadiusKm: input.urgentEngagementRadiusKm,
      },
      select: { engagementRadiusKm: true, urgentEngagementRadiusKm: true },
    });
    return updated;
  }

  private async requireMyProfileId(userId: string): Promise<string> {
    const profile = await this.prisma.professionalProfile.findUnique({ where: { userId }, select: { id: true } });
    if (!profile) {
      throw new NotFoundException("Completa prima il tuo profilo professionista.");
    }
    return profile.id;
  }

  /**
   * Una visita al profilo pubblico (docs/CHANGELOG.md §147): contatore per
   * giorno, mai la singola visita né chi guarda. Non conta il proprietario
   * che guarda il proprio profilo né un profilo non visibile. Né un admin o
   * un account di prova che guarda, né il profilo di un account di prova
   * (docs/CHANGELOG.md §395).
   */
  async recordProfileView(professionalProfileId: string, viewerUserId: string | null): Promise<void> {
    const profile = await this.prisma.professionalProfile.findUnique({
      where: { id: professionalProfileId },
      select: { userId: true, deletedAt: true, suspendedAt: true, isDemo: true, user: { select: { testAccountAt: true } } },
    });
    if (!profile || profile.deletedAt || profile.suspendedAt || profile.isDemo || profile.user.testAccountAt) return;
    if (viewerUserId && viewerUserId === profile.userId) return;
    if (viewerUserId) {
      const viewer = await this.prisma.user.findUnique({ where: { id: viewerUserId }, select: { role: true, testAccountAt: true } });
      if (viewer && (viewer.role === "ADMIN" || viewer.testAccountAt)) return;
    }
    const day = new Date();
    day.setUTCHours(0, 0, 0, 0);
    await this.prisma.profileViewDay.upsert({
      where: { professionalProfileId_day: { professionalProfileId, day } },
      create: { professionalProfileId, day, count: 1 },
      update: { count: { increment: 1 } },
    });
  }

  /**
   * Numeri per la Home "Oggi" (docs/CHANGELOG.md §147, CLAUDE.md §8: "il
   * tuo profilo ha ricevuto 12 visite, la media di categoria+zona è 28"):
   * tempo medio di risposta, recensioni e visite degli ultimi 30 giorni,
   * confrontati con la media dei professionisti della stessa categoria e
   * città. Medie `null` se in zona non c'è nessun altro con cui confrontarsi.
   */
  async getMyInsights(userId: string): Promise<ProfessionalInsights> {
    const professionalProfileId = await this.requireMyProfileId(userId);
    const me = await this.prisma.professionalProfile.findUniqueOrThrow({
      where: { id: professionalProfileId },
      select: {
        categoryId: true,
        city: true,
        category: { select: { id: true, slug: true, label: true } },
        extraCategories: { select: { id: true, slug: true, label: true } },
        metrics: { select: { avgResponseTimeMinutes: true } },
      },
    });
    // Confronto con chi in città condivide almeno una delle sue categorie
    // (principale o aggiuntiva, docs/CHANGELOG.md §217).
    const myCategoryIds = [me.categoryId, ...me.extraCategories.map((category) => category.id)];
    // Visite contate dal lancio (docs/CHANGELOG.md §395): le prove di prima non si mescolano.
    const since30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    since30.setUTCHours(0, 0, 0, 0);
    const since = daySinceLaunch(since30, countingFrom());
    const peers = await this.prisma.professionalProfile.findMany({
      where: {
        id: { not: professionalProfileId },
        OR: [{ categoryId: { in: myCategoryIds } }, { extraCategories: { some: { id: { in: myCategoryIds } } } }],
        city: { equals: me.city, mode: "insensitive" },
        deletedAt: null,
        suspendedAt: null,
        isDemo: false,
        user: COUNTED_USER,
      },
      select: { id: true, metrics: { select: { avgResponseTimeMinutes: true } } },
    });
    const [myViews, peerViews, reviews] = await Promise.all([
      this.prisma.profileViewDay.aggregate({ where: { professionalProfileId, day: { gte: since } }, _sum: { count: true } }),
      peers.length > 0
        ? this.prisma.profileViewDay.aggregate({ where: { professionalProfileId: { in: peers.map((p) => p.id) }, day: { gte: since } }, _sum: { count: true } })
        : Promise.resolve({ _sum: { count: 0 } }),
      this.prisma.review.aggregate({
        where: { hiddenAt: null, booking: { professionalProfileId } },
        _avg: { rating: true },
        _count: { _all: true },
      }),
    ]);
    const peerResponseTimes = peers.map((p) => p.metrics?.avgResponseTimeMinutes).filter((v): v is number => typeof v === "number");
    const round = (value: number) => Math.round(value);
    return {
      areaLabel: `${profileCategories(me)
        .map((category) => category.label)
        .join(", ")} a ${me.city}`,
      areaProfessionals: peers.length,
      avgResponseTimeMinutes: me.metrics?.avgResponseTimeMinutes != null ? round(me.metrics.avgResponseTimeMinutes) : null,
      areaAvgResponseTimeMinutes:
        peerResponseTimes.length > 0 ? round(peerResponseTimes.reduce((sum, v) => sum + v, 0) / peerResponseTimes.length) : null,
      rating: reviews._count._all > 0 && reviews._avg.rating != null ? Math.round(reviews._avg.rating * 10) / 10 : null,
      reviewCount: reviews._count._all,
      profileViews30d: myViews._sum.count ?? 0,
      areaAvgProfileViews30d: peers.length > 0 ? round((peerViews._sum.count ?? 0) / peers.length) : null,
    };
  }

  async getMyLeads(userId: string): Promise<ProfessionalLead[]> {
    const professionalProfileId = await this.requireMyProfileId(userId);

    const leads = await this.prisma.lead.findMany({
      // Le richieste "eliminate" dal professionista restano nel database,
      // solo nascoste a lui (deleteLead, docs/CHANGELOG.md §143).
      where: {
        professionalProfileId,
        hiddenByProfessionalAt: null,
        // Richiesta rimossa da un admin su segnalazione (docs/CHANGELOG.md §144).
        guidedRequest: { hiddenAt: null },
      },
      include: {
        guidedRequest: {
          include: {
            category: true,
            client: true,
            quotes: { where: { professionalProfileId }, include: { items: true, booking: true } },
            // Stato personale del professionista sulla scheda (docs/CHANGELOG.md §130).
            userStates: { where: { userId } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    // Quanti professionisti hanno già risposto alla stessa richiesta, su
    // quanti l'hanno ricevuta (docs/CHANGELOG.md §147, decisione esplicita
    // dell'utente): solo i numeri, mai chi sono né cosa hanno offerto. Due
    // query raggruppate per l'intera pagina, mai una per richiesta.
    const requestIds = [...new Set(leads.map((lead) => lead.guidedRequest.id))];
    const [leadCounts, quoteCounts] =
      requestIds.length > 0
        ? await Promise.all([
            this.prisma.lead.groupBy({ by: ["guidedRequestId"], where: { guidedRequestId: { in: requestIds } }, _count: { _all: true } }),
            this.prisma.quote.groupBy({
              by: ["guidedRequestId"],
              where: { guidedRequestId: { in: requestIds }, professionalProfileId: { not: professionalProfileId }, status: { not: "WITHDRAWN" } },
              _count: { _all: true },
            }),
          ])
        : [[], []];
    const leadsPerRequest = new Map(leadCounts.map((row) => [row.guidedRequestId, row._count._all]));
    // Richieste dirette a cui ha già scritto in chat: l'inoltro non partirà (§209).
    const chattedRequestIds = new Set(
      requestIds.length > 0
        ? (
            await this.prisma.conversationEvent.findMany({
              where: { guidedRequestId: { in: requestIds }, professionalProfileId, actor: "PROFESSIONAL", automatic: false },
              select: { guidedRequestId: true },
              distinct: ["guidedRequestId"],
            })
          ).map((row) => row.guidedRequestId)
        : [],
    );
    const otherQuotesPerRequest = new Map(quoteCounts.map((row) => [row.guidedRequestId, row._count._all]));
    // Richieste in cui il cliente ha accettato il preventivo di un altro
    // professionista (docs/CHANGELOG.md §346): il preventivo di chi non è
    // stato scelto non resta "in attesa del cliente" per sempre.
    const takenByOthers = new Set(
      requestIds.length > 0
        ? (
            await this.prisma.booking.findMany({
              where: { guidedRequestId: { in: requestIds }, status: { not: "CANCELED" }, professionalProfileId: { not: professionalProfileId } },
              select: { guidedRequestId: true },
            })
          ).map((row) => row.guidedRequestId)
        : [],
    );
    return leads.map((lead) => {
      // quotes è filtrato per professionalProfileId nella query: al più una
      // voce (un professionista invia un solo preventivo per richiesta,
      // QuotesService.createOrUpdate aggiorna quello esistente invece di
      // crearne un secondo).
      const quote = lead.guidedRequest.quotes[0] ?? null;
      // Il più recente tra l'aggiornamento del lead stesso (es. rifiuto) e
      // quello del preventivo (invio/modifica) — "ultimo aggiornamento" per
      // l'ordinamento richiesto dall'utente deve riflettere qualunque delle
      // due cose sia successa più di recente.
      const updatedAt = quote && quote.updatedAt > lead.updatedAt ? quote.updatedAt : lead.updatedAt;
      return {
        id: lead.id,
        status: lead.status,
        declineNote: lead.declineNote,
        professionalNote: lead.professionalNote,
        priceEurCents: lead.priceEurCents,
        createdAt: lead.createdAt.toISOString(),
        updatedAt: updatedAt.toISOString(),
        // Scadenza del Lead (CLAUDE.md §14) — mai esposta all'UI prima
        // d'ora: richiesta esplicita dell'utente ("evidenziare quanto manca
        // alla scadenza della richiesta spinge a quotare in fretta").
        // `null` per un Lead senza scadenza (righe create prima di questa
        // funzionalità) o già scaduto/con preventivo (non più pertinente).
        expiresAt: lead.expiresAt ? lead.expiresAt.toISOString() : null,
        forwardAt:
          lead.guidedRequest.professionalProfileId === professionalProfileId &&
          lead.guidedRequest.forwardAt &&
          !lead.guidedRequest.forwardedAt &&
          !quote &&
          !chattedRequestIds.has(lead.guidedRequest.id)
            ? lead.guidedRequest.forwardAt.toISOString()
            : null,
        // Fino a quando si può rispondere (richiesta esplicita dell'utente,
        // docs/CHANGELOG.md §221): la scadenza della richiesta, finché non
        // hai ancora inviato un preventivo e la richiesta è aperta. Non per
        // le urgenti: lì resta la dicitura di prima (decisione dell'utente).
        respondUntil:
          lead.status === "PENDING" &&
          !lead.guidedRequest.isUrgent &&
          !quote &&
          lead.guidedRequest.status !== "CLOSED" &&
          lead.guidedRequest.expiresAt &&
          lead.guidedRequest.expiresAt.getTime() > Date.now()
            ? lead.guidedRequest.expiresAt.toISOString()
            : null,
        competitors: {
          responded: otherQuotesPerRequest.get(lead.guidedRequest.id) ?? 0,
          total: Math.max(0, (leadsPerRequest.get(lead.guidedRequest.id) ?? 1) - 1),
        },
        quote: quote
          ? {
              id: quote.id,
              status: quote.status,
              // Data+ora di invio (richiesta esplicita dell'utente,
              // visibile sia al cliente che al professionista): già
              // esistente sullo schema (Quote.createdAt), qui solo esposta.
              sentAt: quote.createdAt.toISOString(),
              estimatedStartDate: quote.estimatedStartDate.toISOString(),
              // Fine della fascia (richiesta esplicita dell'utente: mostrare
              // tutta la fascia oraria, non solo l'inizio) — null se non nota.
              estimatedEndDate: quote.estimatedEndDate?.toISOString() ?? null,
              clientProposedDate: quote.clientProposedDate?.toISOString() ?? null,
              clientProposedEndDate: quote.clientProposedEndDate?.toISOString() ?? null,
              clientProposedNote: quote.clientProposedNote,
              // Nota del cliente senza cambio di data (docs/CHANGELOG.md §196).
              clientNote: quote.clientNote,
              rejectionNote: quote.status === "REJECTED" ? quote.rejectionNote : null,
              // Modi di pagamento offerti (docs/CHANGELOG.md §237), coi valori di serie per i preventivi vecchi.
              ...quotePaymentOffer(quote),
              // Preavviso e acconto trattenuto scelti nel preventivo (docs/CHANGELOG.md §348).
              cancellationNoticeHours: quote.cancellationNoticeHours ?? DEFAULT_CANCELLATION_NOTICE_HOURS,
              lateCancelKeepsDeposit: quote.lateCancelKeepsDeposit,
              resentAt: quote.resentAt?.toISOString() ?? null,
              // Nuovo preventivo dopo il rifiuto del cliente, fino alla
              // scadenza della richiesta contata dal suo invio
              // (docs/CHANGELOG.md §188).
              ...(() => {
                const { canResend, resendUntil } = quoteResendWindow({
                  quoteStatus: quote.status,
                  hasBooking: quote.booking !== null,
                  request: lead.guidedRequest,
                  clientDeleted: lead.guidedRequest.client.deletedAt !== null,
                });
                return { canResend, resendUntil: resendUntil?.toISOString() ?? null };
              })(),
              // Il preventivo già inviato, per mostrarlo al professionista
              // sulla propria dashboard invece del solo stato — richiesta
              // esplicita dell'utente ("dai la possibilità di vedere il
              // preventivo inviato... allo stesso professionista").
              items: quote.items.map((item) => ({
                id: item.id,
                name: item.name,
                priceMinEurCents: item.priceMinEurCents,
                priceMaxEurCents: item.priceMaxEurCents,
              })),
              notes: quote.notes,
              // Stato della prenotazione nata da questo preventivo (solo se
              // accettato), per lo stepper di stato anche lato professionista
              // (richiesta esplicita dell'utente: "stepper stile deliveroo
              // visualizzabile anche dall'account professionista, non solo
              // cliente") — stesso campo già esposto lato cliente
              // (GuidedRequestsService.listForClient).
              bookingStatus: quote.booking?.status ?? null,
              otherProfessionalChosen: quote.booking === null && takenByOthers.has(lead.guidedRequest.id),
            }
          : null,
        guidedRequest: {
          id: lead.guidedRequest.id,
          categoryLabel: lead.guidedRequest.category.label,
          description: lead.guidedRequest.description,
          city: lead.guidedRequest.city,
          // Solo il nome finché il preventivo non è accettato, il cognome
          // si sblocca con la Booking come telefono e indirizzo
          // (docs/CHANGELOG.md §216).
          clientName: clientNameForProfessional(lead.guidedRequest.client, quote?.booking != null),
          // Data di nascita ed età non esposte al professionista, né prima
          // né dopo l'accettazione (decisione dell'utente, §216).
          clientDetailsUnlocked: quote?.booking != null,
          // Telefono/email/indirizzo NON esposti finché il preventivo non è
          // accettato — decisione di privacy ribaltata di nuovo su richiesta
          // esplicita dell'utente rispetto alla correzione precedente (che
          // li mostrava già dalla prima richiesta): "tutte le info relative
          // al cliente gli verranno visualizzate solo ad accettazione del
          // lavoro". Una volta creata la Booking, restano disponibili come
          // sempre su ProfessionalBooking/getMyBookings (recipientPhone,
          // street, ecc. — dati raccolti alla richiesta ma girati al
          // professionista solo con l'accettazione).
          // Foto profilo del cliente solo a preventivo accettato, come il
          // cognome (decisione dell'utente, docs/CHANGELOG.md §216).
          clientImageUrl: quote?.booking != null ? lead.guidedRequest.client.imageUrl : null,
          clientEmailVerified: lead.guidedRequest.client.emailVerifiedAt !== null,
          clientAccountDeleted: lead.guidedRequest.client.deletedAt !== null,
          photoUrls: lead.guidedRequest.photoUrls,
          serviceMode: lead.guidedRequest.serviceMode,
          isUrgent: lead.guidedRequest.isUrgent,
          timing: lead.guidedRequest.timing,
          // Valorizzati solo se la richiesta è nata da una fascia generica
          // dell'agenda (AvailabilitySlot.maxBookings > 1): il professionista
          // deve vedere subito per quale orario è stata richiesta.
          preferredDate: lead.guidedRequest.preferredDate?.toISOString().slice(0, 10) ?? null,
          preferredTimeSlot: lead.guidedRequest.preferredTimeSlot,
          // Eliminata (o annullata prima del §343) dal cliente: "Ritirata dal cliente", non "Scaduta".
          withdrawnByClient:
            lead.guidedRequest.closedReason === "CANCELED_BY_CLIENT"
              ? { at: (lead.guidedRequest.deletedByClientAt ?? lead.guidedRequest.updatedAt).toISOString(), reason: lead.guidedRequest.withdrawReason }
              : null,
        },
        myState: toMyState(lead.guidedRequest.userStates?.[0]),
      };
    });
  }

  /**
   * Il professionista rifiuta una richiesta ricevuta prima di inviare un
   * preventivo (richiesta esplicita dell'utente: un pop-up con nota
   * facoltativa per il cliente) — consentito solo se non ha già inviato un
   * preventivo per questa richiesta (a quel punto si ritira il preventivo,
   * non si rifiuta più il lead — vedi QuotesService.withdraw).
   */
  async declineLead(userId: string, leadId: string, input: DeclineLeadInput): Promise<void> {
    const professionalProfileId = await this.requireMyProfileId(userId);

    const lead = await this.prisma.lead.findUnique({
      where: { id: leadId },
      include: { guidedRequest: true },
    });
    if (!lead || lead.professionalProfileId !== professionalProfileId) {
      throw new ForbiddenException("Questa richiesta non è tua.");
    }
    if (lead.status === "DECLINED") {
      throw new ForbiddenException("Hai già rifiutato questa richiesta.");
    }
    const existingQuote = await this.prisma.quote.findFirst({
      where: { guidedRequestId: lead.guidedRequestId, professionalProfileId },
    });
    if (existingQuote) {
      throw new ForbiddenException("Hai già inviato un preventivo per questa richiesta: ritiralo invece di rifiutare il lead.");
    }

    await this.prisma.lead.update({
      where: { id: leadId },
      data: { status: "DECLINED", declineNote: input.note?.trim() || null },
    });

    await this.notificationsService.notify(lead.guidedRequest.clientId, "LEAD_DECLINED", {
      guidedRequestId: lead.guidedRequestId,
      professionalProfileId,
    });

    const declineNote = input.note?.trim() || null;
    await this.timelineService.log(
      lead.guidedRequestId,
      professionalProfileId,
      "PROFESSIONAL",
      `Il professionista ha rifiutato la richiesta.${declineNote ? ` Nota: "${declineNote}"` : ""}`,
    );

    // Espande subito verso il prossimo candidato in coda di riserva
    // (CLAUDE.md §14) — non serve aspettare il prossimo giro del job
    // schedulato quando si sa già ora che questo professionista non
    // risponderà: no-op se la coda è vuota.
    await this.guidedRequestsService.expandLeadQueue(lead.guidedRequestId);

    // Metriche di affidabilità (CLAUDE.md §15, evento 7): un rifiuto
    // esplicito è comunque un'azione del professionista, anche se non è la
    // "prima risposta" misurata dall'evento 2 (quella è solo l'invio di un
    // preventivo).
    await this.professionalMetricsService.touchActivity(professionalProfileId);
  }

  /**
   * "Elimina" dal menu della scheda in "Richieste ricevute" (docs/CHANGELOG.md
   * §143): consentito solo su una richiesta non più azionabile — scaduta,
   * rifiutata dal professionista, preventivo ritirato o rifiutato dal
   * cliente — oppure con l'account cliente eliminato. Stessa classificazione
   * di `classifyLeadStage` (apps/web) per gli stadi "scaduta"/"chiusa".
   *
   * Non cancella nulla (richiesta esplicita dell'utente: "nascondile, in modo
   * che un admin possa vederle"): valorizza `Lead.hiddenByProfessionalAt`,
   * la scheda sparisce da `getMyLeads` e resta visibile in /admin. Il Lead
   * conserva prezzo e metriche; la Quote e la GuidedRequest restano intatte
   * per il cliente. Silenzia anche le notifiche di quella richiesta per il
   * professionista: una notifica porterebbe a una scheda che non vede più.
   */
  async deleteLead(userId: string, leadId: string): Promise<void> {
    const professionalProfileId = await this.requireMyProfileId(userId);

    const lead = await this.prisma.lead.findUnique({
      where: { id: leadId },
      include: { guidedRequest: { include: { client: true } } },
    });
    if (!lead || lead.professionalProfileId !== professionalProfileId) {
      throw new ForbiddenException("Questa richiesta non è tua.");
    }
    const clientAccountDeleted = lead.guidedRequest.client.deletedAt !== null;
    const leadClosed = lead.status === "EXPIRED" || lead.status === "DECLINED";
    if (!clientAccountDeleted && !leadClosed) {
      const closedQuote = await this.prisma.quote.findFirst({
        where: { guidedRequestId: lead.guidedRequestId, professionalProfileId, status: { in: ["WITHDRAWN", "REJECTED"] } },
        select: { id: true },
      });
      if (!closedQuote) {
        throw new ForbiddenException("Puoi eliminare solo una richiesta scaduta o chiusa.");
      }
    }

    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.lead.update({ where: { id: leadId }, data: { hiddenByProfessionalAt: now } }),
      this.prisma.guidedRequestUserState.upsert({
        where: { userId_guidedRequestId: { userId, guidedRequestId: lead.guidedRequestId } },
        create: { userId, guidedRequestId: lead.guidedRequestId, mutedAt: now },
        update: { mutedAt: now },
      }),
    ]);
  }

  /**
   * Nota privata del professionista su una richiesta ricevuta, mai vista dal
   * cliente (`/dashboard/richieste`) — a differenza di
   * `BookingsService.updateProfessionalNote`, valorizzabile fin dalla
   * ricezione del lead, prima ancora che esista un preventivo/prenotazione.
   */
  async updateLeadNote(userId: string, leadId: string, note: string): Promise<{ leadId: string; professionalNote: string | null }> {
    const professionalProfileId = await this.requireMyProfileId(userId);

    const lead = await this.prisma.lead.findUnique({ where: { id: leadId } });
    if (!lead || lead.professionalProfileId !== professionalProfileId) {
      throw new ForbiddenException("Questa richiesta non è tua.");
    }

    const trimmed = note.trim();
    const updated = await this.prisma.lead.update({
      where: { id: leadId },
      data: { professionalNote: trimmed || null },
    });
    return { leadId, professionalNote: updated.professionalNote };
  }

  async getMyBookings(userId: string): Promise<ProfessionalBooking[]> {
    const professionalProfileId = await this.requireMyProfileId(userId);

    // Ascendente (prossima prima): un'agenda operativa deve mostrare
    // l'appuntamento più vicino in cima, non il più lontano — bug reale,
    // l'ordinamento discendente precedente mostrava per primo l'impegno più
    // lontano nel futuro. La UI (/dashboard) raggruppa poi per giorno e
    // separa prossime/storico, questo endpoint resta la lista grezza.
    const bookings = await this.prisma.booking.findMany({
      where: { professionalProfileId },
      include: {
        client: true,
        // guidedRequest solo se la prenotazione viene da un preventivo
        // accettato (Booking.quoteId): porta l'indirizzo preciso indicato
        // dal cliente nella richiesta, più descrizione e foto del lavoro
        // (richiesta esplicita dell'utente, visibili al click su una
        // prenotazione in agenda). Le prenotazioni dirette da agenda
        // (bookAgendaSlot) non hanno una Quote/GuidedRequest collegata,
        // tutti questi campi restano null/[] in quel caso.
        quote: {
          include: {
            items: true,
            guidedRequest: { select: { address: true, description: true, photoUrls: true, serviceMode: true, category: { select: { slug: true, label: true } } } },
            invoiceRequest: true,
          },
        },
        finalItems: true,
        issue: true,
        jobPayment: true,
        courtesyDocument: { select: COURTESY_DOCUMENT_FIELDS },
      },
      orderBy: { scheduledAt: "asc" },
    });

    // Nota privata del professionista unificata con quella di
    // `/dashboard/richieste` (richiesta esplicita dell'utente, vedi
    // `BookingsService.updateProfessionalNote`): `Lead.professionalNote` è
    // la fonte di verità per ogni prenotazione nata da una GuidedRequest,
    // recuperata qui in un'unica query batch (mai una per prenotazione,
    // stesso principio anti-N+1 già seguito altrove in questo file) invece
    // della colonna `Booking.professionalNote`, ormai di sola lettura per
    // quel caso (resta scritta solo per le prenotazioni dirette da agenda
    // pubblica, senza GuidedRequest).
    const guidedRequestIds = bookings.map((b) => b.quote?.guidedRequestId).filter((id): id is string => Boolean(id));
    const leadNoteByGuidedRequestId = new Map<string, string | null>();
    if (guidedRequestIds.length > 0) {
      const leads = await this.prisma.lead.findMany({
        where: { professionalProfileId, guidedRequestId: { in: guidedRequestIds } },
        select: { guidedRequestId: true, professionalNote: true },
      });
      for (const lead of leads) leadNoteByGuidedRequestId.set(lead.guidedRequestId, lead.professionalNote);
    }
    // Ultima segnalazione "Qualcosa è andato male" per lavoro (§197), una
    // sola query per tutte le prenotazioni.
    const problemReportByGuidedRequestId = new Map<string, { reason: string; status: "OPEN" | "RESOLVED" | "DISMISSED"; createdAt: string }>();
    if (guidedRequestIds.length > 0) {
      const reports = await this.prisma.contentReport.findMany({
        where: {
          reporterId: userId,
          targetType: "GUIDED_REQUEST",
          targetId: { in: guidedRequestIds },
          reason: { startsWith: PROFESSIONAL_JOB_PROBLEM_REPORT_PREFIX },
        },
        orderBy: { createdAt: "desc" },
        select: { targetId: true, reason: true, status: true, createdAt: true },
      });
      for (const report of reports) {
        if (problemReportByGuidedRequestId.has(report.targetId)) continue;
        problemReportByGuidedRequestId.set(report.targetId, {
          reason: report.reason.slice(PROFESSIONAL_JOB_PROBLEM_REPORT_PREFIX.length),
          status: report.status,
          createdAt: report.createdAt.toISOString(),
        });
      }
    }

    return bookings.map((booking) => ({
      id: booking.id,
      // Richiesta guidata di origine, per il bottone "Vai alla cronologia
      // della richiesta" (richiesta esplicita dell'utente) — null per le
      // prenotazioni dirette da agenda pubblica (bookAgendaSlot), che non
      // hanno una Quote/GuidedRequest collegata.
      guidedRequestId: booking.quote?.guidedRequestId ?? null,
      scheduledAt: booking.scheduledAt.toISOString(),
      // Fine della fascia (richiesta esplicita dell'utente: mostrare tutta
      // la fascia oraria, non solo l'inizio) — null se non nota.
      scheduledEndAt: booking.scheduledEndAt?.toISOString() ?? null,
      createdAt: booking.createdAt.toISOString(),
      updatedAt: booking.updatedAt.toISOString(),
      status: booking.status,
      // Nome e cognome: prima esponeva solo booking.client.name (nome di
      // battesimo), non sufficiente per un professionista che deve
      // presentarsi al lavoro sapendo con chi ha a che fare — richiesta
      // esplicita dell'utente ("nome e cognome").
      clientName: [booking.client.name, booking.client.surname].filter(Boolean).join(" ") || null,
      clientImageUrl: booking.client.deletedAt ? null : booking.client.imageUrl,
      clientPhone: booking.client.phone,
      // Mai l'email anonimizzata sintetica — stesso motivo di getMyLeads sopra.
      clientEmail: booking.client.deletedAt ? null : booking.client.email,
      clientAccountDeleted: booking.client.deletedAt !== null,
      address: booking.quote?.guidedRequest?.address ?? null,
      // Indirizzo di lavoro strutturato, raccolto nella schermata di
      // accettazione preventivo (richiesta esplicita dell'utente) — null
      // per le prenotazioni dirette da agenda pubblica (bookAgendaSlot,
      // che non passano da quella schermata) o per prenotazioni create
      // prima di questa funzionalità. Quando presente sostituisce, in UI,
      // il campo `address` libero sopra.
      recipientName: booking.recipientName,
      recipientSurname: booking.recipientSurname,
      recipientPhone: booking.recipientPhone,
      street: booking.street,
      houseNumber: booking.houseNumber,
      addressExtra: booking.addressExtra,
      postalCode: booking.postalCode,
      city: booking.city,
      province: booking.province,
      items: (booking.quote?.items ?? []).map((item) => ({
        id: item.id,
        name: item.name,
        priceMinEurCents: item.priceMinEurCents,
        priceMaxEurCents: item.priceMaxEurCents,
      })),
      finalAmountEurCents: booking.finalAmountEurCents,
      finalItems: booking.finalItems.map((item) => ({ id: item.id, name: item.name, priceEurCents: item.priceEurCents })),
      cancellationNote: booking.cancellationNote,
      // Chi ha annullato — richiesta esplicita dell'utente, mostrato accanto
      // all'etichetta "Annullata".
      canceledBy: booking.canceledBy,
      // Il cliente ha annullato dentro il preavviso scelto (docs/CHANGELOG.md §347).
      canceledLate: booking.canceledLate,
      // Pulsanti del promemoria WhatsApp (docs/changelog/2026-10-28-promemoria-whatsapp.md).
      clientConfirmedAt: booking.clientConfirmedAt?.toISOString() ?? null,
      clientCantComeAt: booking.clientCantComeAt?.toISOString() ?? null,
      professionalProblemReport: booking.quote?.guidedRequestId ? (problemReportByGuidedRequestId.get(booking.quote.guidedRequestId) ?? null) : null,
      description: booking.quote?.guidedRequest?.description ?? null,
      photoUrls: booking.quote?.guidedRequest?.photoUrls ?? [],
      // Categoria e modalità (a domicilio/online) del lavoro — richiesta
      // esplicita dell'utente per il redesign "Lavori accettati" (titolo
      // card + badge). Copiati dalla GuidedRequest originale, `null` per le
      // prenotazioni dirette da agenda pubblica (bookAgendaSlot, dormiente
      // da CLAUDE.md §20) che non hanno una GuidedRequest collegata —
      // `Booking.serviceMode` esiste già come copia denormalizzata
      // (CLAUDE.md §23) ma non era ancora esposto qui.
      categorySlug: booking.quote?.guidedRequest?.category?.slug ?? null,
      categoryLabel: booking.quote?.guidedRequest?.category?.label ?? null,
      serviceMode: booking.serviceMode,
      professionalNote: booking.quote?.guidedRequestId
        ? (leadNoteByGuidedRequestId.get(booking.quote.guidedRequestId) ?? booking.professionalNote)
        : booking.professionalNote,
      // Il cliente ha segnalato che non ti sei presentato e ha chiesto un
      // rimborso — richiesta esplicita dell'utente, mai un cambio di
      // `status` automatico (il professionista può ancora contestarlo).
      refundRequested: booking.refundRequested,
      // Link della consulenza video (Meet/Zoom/ecc.), impostato dal
      // professionista stesso — richiesta esplicita dell'utente.
      meetingLink: booking.meetingLink,
      onTheWayAt: booking.onTheWayAt?.toISOString() ?? null,
      clientConfirmedCompletedAt: booking.clientConfirmedCompletedAt?.toISOString() ?? null,
      professionalCompletionPhotoUrls: booking.professionalCompletionPhotoUrls,
      clientCompletionPhotoUrls: booking.clientCompletionPhotoUrls,
      // Segnalazione del cliente sul lavoro, con la risposta del professionista (docs/CHANGELOG.md §164).
      issue: toJobIssueSummary(booking.issue, { paidOnline: jobPaidOnline(booking.jobPayment), assisted: booking.jobPayment?.paymentMethod !== "DIRECT" }),
      // Pagamento del lavoro (§168), con commissione, costo Stripe e quanto riceve.
      payment: toJobPaymentSummary(booking.jobPayment, booking.finalAmountEurCents, true),
      // Fattura chiesta dal cliente (docs/CHANGELOG.md §378): c'è la Booking, quindi il preventivo è accettato.
      invoiceRequest: booking.quote?.invoiceRequest ? invoiceRequestView(booking.quote.invoiceRequest) : null,
      // Ricevuta o copia di cortesia già preparata: se l'importo cambia dopo il PDF va rifatta (§381).
      courtesyDocument: booking.courtesyDocument ? courtesyDocumentSummary(booking.courtesyDocument, booking) : null,
    }));
  }

  /**
   * Fasce libere del professionista autenticato nei prossimi 14 giorni,
   * usate per far scegliere la data di un preventivo dentro l'agenda reale
   * invece di una data libera scollegata. Include sia le fasce esatte
   * (maxBookings=1) sia quelle a capienza (maxBookings>1) — bug reale
   * segnalato dall'utente ("negli invii dei preventivi non escono gli
   * orari disponibili già impostati nell'agenda personale"): il filtro
   * `maxBookings: 1` escludeva del tutto un professionista che avesse
   * impostato solo fasce a capienza (fasce che rappresentano comunque un
   * orario di lavoro reale, solo pensate per il fan-out di richieste
   * guidate — qui il professionista sta scegliendo quando iniziare un
   * lavoro già concordato, non sta consumando quella capienza). Ignora
   * bookableAgenda apposta (quel flag governa solo la prenotazione diretta
   * pubblica, qui il professionista guarda la propria agenda per
   * pianificare, non per farsi prenotare da un cliente).
   */
  async getMyAvailableSlots(userId: string): Promise<ProfessionalAvailableSlot[]> {
    const professionalProfileId = await this.requireMyProfileId(userId);
    const startOfToday = wallClockToday();
    const endWindow = new Date(startOfToday);
    endWindow.setUTCDate(endWindow.getUTCDate() + PUBLIC_AGENDA_DAYS);

    const [slots, bookings, exceptions] = await Promise.all([
      this.prisma.availabilitySlot.findMany({ where: { professionalProfileId } }),
      loadCommitments(this.prisma, [professionalProfileId], startOfToday, endWindow).then((byProfile) => byProfile.get(professionalProfileId) ?? []),
      this.prisma.availabilityException.findMany({
        where: { professionalProfileId, date: { gte: startOfToday, lt: endWindow } },
        select: { date: true },
      }),
    ]);
    const exceptionDates = new Set(exceptions.map((exception) => exception.date.toISOString().slice(0, 10)));

    const result: ProfessionalAvailableSlot[] = [];
    for (let i = 0; i < PUBLIC_AGENDA_DAYS; i++) {
      const date = new Date(startOfToday);
      date.setUTCDate(date.getUTCDate() + i);
      const dateStr = date.toISOString().slice(0, 10);
      if (exceptionDates.has(dateStr)) continue;

      const candidateSlots = slots.filter((slot) => slotAppliesOnDate(slot, date)).sort((a, b) => a.startTime.localeCompare(b.startTime));
      for (const slot of candidateSlots) {
        const homeAvailable = slot.allowsHome && countBookingsInSlot(bookings, dateStr, slot.startTime, slot.endTime, "HOME") < (slot.homeMaxBookings ?? 1);
        const onlineAvailable =
          slot.allowsOnline && countBookingsInSlot(bookings, dateStr, slot.startTime, slot.endTime, "ONLINE") < (slot.onlineMaxBookings ?? 1);
        if (!homeAvailable && !onlineAvailable) continue;
        result.push({ date: dateStr, startTime: slot.startTime, endTime: slot.endTime, homeAvailable, onlineAvailable });
      }
    }
    return result;
  }

  async getMyAvailability(userId: string): Promise<MyAvailability> {
    const professionalProfileId = await this.requireMyProfileId(userId);
    const startOfToday = wallClockToday();
    const endWindow = new Date(startOfToday);
    endWindow.setUTCDate(endWindow.getUTCDate() + PUBLIC_AGENDA_DAYS);

    const [slots, upcomingBookings, exceptions] = await Promise.all([
      this.prisma.availabilitySlot.findMany({
        where: { professionalProfileId },
        orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
      }),
      // Finestra di 14 giorni: serve solo a segnalare
      // in UI "questa fascia ha già una prenotazione futura", non a bloccare
      // nulla lato server — un professionista resta libero di modificare la
      // propria agenda, viene solo avvisato prima di farlo.
      this.prisma.booking.findMany({
        where: {
          professionalProfileId,
          status: { in: ["PENDING", "CONFIRMED", "COMPLETED"] },
          scheduledAt: { gte: startOfToday, lt: endWindow },
        },
        select: { scheduledAt: true },
      }),
      this.prisma.availabilityException.findMany({
        where: { professionalProfileId, date: { gte: startOfToday } },
        orderBy: { date: "asc" },
        select: { date: true },
      }),
    ]);

    return {
      slots: slots.map((slot) => {
        const slotDateStr = slot.date ? slot.date.toISOString().slice(0, 10) : null;
        // Per una fascia legata a una data esatta, l'avviso "hai già un
        // impegno futuro" ha senso solo per QUELLA data — a differenza delle
        // fasce ricorrenti (date=null, comportamento storico), dove qualunque
        // occorrenza del giorno della settimana nella finestra conta.
        //
        // Stesso criterio per fasce esatte e generiche (richiesta esplicita
        // dell'utente): conta solo una trattativa conclusa (Booking reale),
        // non una richiesta di preventivo ancora senza risposta — altrimenti
        // il professionista vedrebbe l'avviso "hai già un impegno" anche per
        // richieste che potrebbe rifiutare o lasciare cadere.
        const hasUpcomingBooking = upcomingBookings.some((booking) => {
          const bookingDateStr = booking.scheduledAt.toISOString().slice(0, 10);
          const dayMatches = slotDateStr ? bookingDateStr === slotDateStr : booking.scheduledAt.getUTCDay() === slot.dayOfWeek;
          if (!dayMatches) return false;
          const bookingTime = booking.scheduledAt.toISOString().slice(11, 16);
          return bookingTime >= slot.startTime && bookingTime < slot.endTime;
        });
        return {
          id: slot.id,
          dayOfWeek: slot.dayOfWeek,
          startTime: slot.startTime,
          endTime: slot.endTime,
          allowsHome: slot.allowsHome,
          allowsOnline: slot.allowsOnline,
          homeMaxBookings: slot.homeMaxBookings,
          onlineMaxBookings: slot.onlineMaxBookings,
          date: slotDateStr,
          hasUpcomingBooking,
          fromWeekTemplate: slot.fromWeekTemplate,
        };
      }),
      exceptionDates: exceptions.map((exception) => exception.date.toISOString().slice(0, 10)),
    };
  }

  async upsertMyAvailability(userId: string, slots: AvailabilitySlotInput[]): Promise<MyAvailability> {
    const professionalProfileId = await this.requireMyProfileId(userId);

    // Lista sostituita per intero ad ogni salvataggio, stesso pattern già
    // usato per le prestazioni (ProfessionalService): coerente con la scala
    // attesa (poche decine di fasce a professionista), molto più semplice
    // che diffare la lista esistente contro quella inviata. La validazione
    // di non-sovrapposizione tra fasce dello stesso giorno vive a monte, nello
    // zod schema condiviso (professionalAvailabilitySchema in packages/shared,
    // applicato da ZodValidationPipe) — stessa regola usata anche lato client.
    // Tutto o niente (docs/CHANGELOG.md §287): se la creazione fallisce le
    // fasce di prima restano, invece di sparire con il solo deleteMany.
    await this.prisma.$transaction(async (tx) => {
      // Un giorno resta "della settimana tipo" solo se le sue fasce non sono
      // cambiate: cambiarle a mano ne fa un giorno a sé (docs/CHANGELOG.md §323).
      const previous = await tx.availabilitySlot.findMany({ where: { professionalProfileId } });
      const toTemplateSlot = (s: { startTime: string; endTime: string; allowsHome: boolean; allowsOnline: boolean; homeMaxBookings?: number | null; onlineMaxBookings?: number | null }) => ({
        start: s.startTime,
        end: s.endTime,
        allowsHome: s.allowsHome,
        allowsOnline: s.allowsOnline,
        homeMax: s.allowsHome ? (s.homeMaxBookings ?? 1) : null,
        onlineMax: s.allowsOnline ? (s.onlineMaxBookings ?? 1) : null,
      });
      const templateDates = weekTemplateDatesKept(
        previous.map((s) => ({ date: s.date ? s.date.toISOString().slice(0, 10) : null, fromWeekTemplate: s.fromWeekTemplate, slot: toTemplateSlot(s) })),
        slots.map((s) => ({ date: s.date ?? null, slot: toTemplateSlot(s) })),
      );
      await tx.availabilitySlot.deleteMany({ where: { professionalProfileId } });
      if (!slots.length) return;
      await tx.availabilitySlot.createMany({
        data: slots.map((slot) => ({
          fromWeekTemplate: slot.date ? templateDates.has(slot.date) : false,
          professionalProfileId,
          dayOfWeek: slot.dayOfWeek,
          startTime: slot.startTime,
          endTime: slot.endTime,
          allowsHome: slot.allowsHome,
          allowsOnline: slot.allowsOnline,
          homeMaxBookings: slot.allowsHome ? (slot.homeMaxBookings ?? 1) : null,
          onlineMaxBookings: slot.allowsOnline ? (slot.onlineMaxBookings ?? 1) : null,
          date: slot.date ? new Date(`${slot.date}T00:00:00.000Z`) : null,
        })),
      });
    });
    // Metriche di affidabilità (CLAUDE.md §15, evento 7): aggiornamento
    // disponibilità è un'azione esplicita del professionista.
    await this.professionalMetricsService.touchActivity(professionalProfileId);
    return this.getMyAvailability(userId);
  }

  /**
   * Giorno di chiusura straordinaria (ferie, festività, imprevisto): blocca
   * una data specifica senza toccare la ricorrenza settimanale. `upsert`
   * invece di `create` per restare idempotente (aggiungere due volte la
   * stessa data non deve fallire con un errore di vincolo unico visibile
   * all'utente).
   */
  async addAvailabilityException(userId: string, dateStr: string): Promise<{ exceptionDates: string[] }> {
    const professionalProfileId = await this.requireMyProfileId(userId);
    const date = parseIsoDateUtc(dateStr);
    await this.prisma.availabilityException.upsert({
      where: { professionalProfileId_date: { professionalProfileId, date } },
      create: { professionalProfileId, date },
      update: {},
    });
    return this.listMyExceptionDates(professionalProfileId);
  }

  async removeAvailabilityException(userId: string, dateStr: string): Promise<{ exceptionDates: string[] }> {
    const professionalProfileId = await this.requireMyProfileId(userId);
    const date = parseIsoDateUtc(dateStr);
    await this.prisma.availabilityException.deleteMany({ where: { professionalProfileId, date } });
    return this.listMyExceptionDates(professionalProfileId);
  }

  private async listMyExceptionDates(professionalProfileId: string): Promise<{ exceptionDates: string[] }> {
    const startOfToday = wallClockToday();
    const exceptions = await this.prisma.availabilityException.findMany({
      where: { professionalProfileId, date: { gte: startOfToday } },
      orderBy: { date: "asc" },
      select: { date: true },
    });
    return { exceptionDates: exceptions.map((exception) => exception.date.toISOString().slice(0, 10)) };
  }

  /**
   * Agenda pubblica: proietta la disponibilità settimanale ricorrente sui
   * prossimi 14 giorni di calendario, barrando le fasce che coincidono con
   * una prenotazione reale già presa. Confronto su data/ora UTC (nessuna
   * libreria di timezone nello stack): coerente con come `scheduledAt` viene
   * già scritto/letto altrove nel progetto, senza introdurre una nuova
   * dipendenza per un confronto di sola data.
   */
  async getPublicAgenda(professionalProfileId: string): Promise<ProfessionalAgenda> {
    // Stessi filtri della pagina pubblica; in pausa o bloccato per le
    // richieste non si prenota, quindi nessuna fascia (CLAUDE.md §5.11,
    // §293). Con i lavori esauriti l'agenda resta (§363): serve al cliente
    // per scegliere quando nella richiesta, e il professionista deve poter
    // ricevere richieste (decisione dell'utente).
    const profile = await this.prisma.professionalProfile.findUnique({
      where: { id: professionalProfileId },
      select: { deletedAt: true, suspendedAt: true, invitePendingAt: true, pausedAt: true, requestsBlockedUntil: true, ...PUBLIC_VISIBILITY_SELECT },
    });
    if (!profile || profile.deletedAt || profile.suspendedAt || profile.invitePendingAt || publicVisibilityMissing(profile)) {
      throw new NotFoundException("Professionista non trovato.");
    }
    if (profile.pausedAt || (profile.requestsBlockedUntil && profile.requestsBlockedUntil > new Date())) return { days: [] };

    const startOfToday = wallClockToday();
    const endWindow = new Date(startOfToday);
    endWindow.setUTCDate(endWindow.getUTCDate() + PUBLIC_AGENDA_DAYS);

    const [slots, bookings, exceptions] = await Promise.all([
      this.prisma.availabilitySlot.findMany({ where: { professionalProfileId } }),
      loadCommitments(this.prisma, [professionalProfileId], startOfToday, endWindow).then((byProfile) => byProfile.get(professionalProfileId) ?? []),
      this.prisma.availabilityException.findMany({
        where: { professionalProfileId, date: { gte: startOfToday, lt: endWindow } },
        select: { date: true },
      }),
    ]);
    const exceptionDates = new Set(exceptions.map((exception) => exception.date.toISOString().slice(0, 10)));

    const days: ProfessionalAgendaDay[] = [];
    for (let i = 0; i < PUBLIC_AGENDA_DAYS; i++) {
      const date = new Date(startOfToday);
      date.setUTCDate(date.getUTCDate() + i);
      const dayOfWeek = date.getUTCDay();
      const dateStr = date.toISOString().slice(0, 10);

      // Giorno di chiusura straordinaria: nessuna fascia, indipendentemente
      // dalla ricorrenza settimanale — stesso effetto visivo di un giorno
      // senza orari impostati (il frontend nasconde già i giorni senza slot).
      const daySlots = exceptionDates.has(dateStr)
        ? []
        : slots
            .filter((slot) => slotAppliesOnDate(slot, date))
            .sort((a, b) => a.startTime.localeCompare(b.startTime))
            .map((slot) => {
              // Sia per le fasce esatte che per quelle generiche, "prenotato"
              // conta solo una trattativa conclusa (Booking reale, creato
              // all'accettazione del preventivo) — non il semplice arrivo di
              // una richiesta di preventivo (richiesta esplicita dell'utente:
              // cliccare per richiedere non deve già "sbarrare" l'orario o
              // consumare la capienza mostrata al cliente). Una prenotazione
              // annullata non è nel set `bookings` (filtrato a monte su
              // PENDING/CONFIRMED/COMPLETED), quindi libera la fascia da sola.
              // Capienza indipendente per tipo (CLAUDE.md §22): `home`/`online`
              // null quando quel tipo non è offerto su questa fascia.
              const home = slot.allowsHome
                ? { maxBookings: slot.homeMaxBookings ?? 1, bookedCount: countBookingsInSlot(bookings, dateStr, slot.startTime, slot.endTime, "HOME") }
                : null;
              const online = slot.allowsOnline
                ? {
                    maxBookings: slot.onlineMaxBookings ?? 1,
                    bookedCount: countBookingsInSlot(bookings, dateStr, slot.startTime, slot.endTime, "ONLINE"),
                  }
                : null;
              return { startTime: slot.startTime, endTime: slot.endTime, home, online };
            });

      days.push({ date: dateStr, dayOfWeek, slots: daySlots });
    }
    return { days };
  }

  /**
   * Prenotazione diretta di una fascia esatta (maxBookings=1) dell'agenda
   * pubblica — richiesta esplicita dell'utente: rimosso il precedente
   * opt-in `bookableAgenda` ("permetti ai clienti di prenotare
   * direttamente"), la prenotazione diretta è ora sempre disponibile per
   * ogni fascia esatta, senza bisogno che il professionista lo attivi.
   * Le fasce a capienza (maxBookings>1) restano sul percorso "richiesta di
   * preventivo" (`GuidedRequestsService.resolveGenericSlot`), invariato.
   * Rivalida server-side che la fascia esista davvero nella disponibilità
   * ricorrente, non sia già occupata e non cada in un giorno di chiusura,
   * invece di fidarsi ciecamente di quanto inviato dal client.
   *
   * Il controllo "libera?" e la creazione della prenotazione avvengono dentro
   * un'unica transazione Serializable: senza, due clienti che toccano la
   * stessa fascia nello stesso istante possono entrambi superare il
   * controllo prima che l'altro scriva (race condition reale, non teorica,
   * in un marketplace dove "il primo che risponde si aggiudica il lavoro" -
   * CLAUDE.md §8). Postgres rifiuta una delle due transazioni con un errore
   * di serializzazione (P2034), che qui diventa un 409 pulito invece di
   * propagarsi come 500. Nessuna modifica allo schema per questo fix (niente
   * vincolo unique su Booking.scheduledAt): quel campo ha già un secondo
   * significato per le prenotazioni da preventivo (data stimata di inizio,
   * non uno slot esatto — due preventivi diversi possono legittimamente
   * condividere la stessa data), un vincolo globale li avrebbe rotti.
   */
  async bookAgendaSlot(clientId: string, professionalProfileId: string, input: BookAgendaSlotInput): Promise<{ bookingId: string }> {
    const profile = await this.prisma.professionalProfile.findUnique({
      where: { id: professionalProfileId },
      select: { id: true, deletedAt: true, suspendedAt: true, invitePendingAt: true, pausedAt: true, jobLimitReachedAt: true, demotedUntil: true, requestsBlockedUntil: true, ...PUBLIC_VISIBILITY_SELECT },
    });
    if (!profile || profile.deletedAt || profile.suspendedAt || profile.invitePendingAt || publicVisibilityMissing(profile)) {
      throw new NotFoundException("Professionista non trovato.");
    }
    if (profile.pausedAt || professionalRestrictions(profile, new Date()).blocked) {
      throw new ConflictException(NOT_ACCEPTING_REQUESTS);
    }
    // Lavori esauriti (§362): niente prenotazione diretta, solo richieste (§363).
    if (profile.jobLimitReachedAt) {
      throw new ConflictException(NOT_BOOKABLE_ONLINE);
    }

    const date = parseIsoDateUtc(input.date);
    const dayOfWeek = date.getUTCDay();

    const [matchingSlot, exception] = await Promise.all([
      // Corrisponde sia a una fascia legata a questa data esatta sia a una
      // fascia ricorrente (date=null, comportamento storico) per lo stesso
      // giorno della settimana — vedi slotAppliesOnDate.
      this.prisma.availabilitySlot.findFirst({
        where: {
          professionalProfileId,
          startTime: input.startTime,
          endTime: input.endTime,
          OR: [{ date }, { date: null, dayOfWeek }],
        },
      }),
      this.prisma.availabilityException.findUnique({
        where: { professionalProfileId_date: { professionalProfileId, date } },
      }),
    ]);
    if (!matchingSlot) {
      throw new NotFoundException("Questa fascia oraria non fa parte dell'agenda del professionista.");
    }
    // Metodo dormiente (nessun chiamante frontend, CLAUDE.md §20): capienza
    // > 1 su uno qualunque dei due tipi resta comunque "fascia generica",
    // riservata al percorso richiesta di preventivo.
    if ((matchingSlot.homeMaxBookings ?? 1) > 1 || (matchingSlot.onlineMaxBookings ?? 1) > 1) {
      throw new ForbiddenException("Questa fascia richiede l'invio di una richiesta di preventivo, non una prenotazione diretta.");
    }
    if (exception) {
      throw new ConflictException("Il professionista non è disponibile in questa data.");
    }

    const [hoursStr, minutesStr] = input.startTime.split(":");
    const scheduledAt = new Date(date);
    scheduledAt.setUTCHours(Number(hoursStr), Number(minutesStr), 0, 0);

    const dayStart = new Date(date);
    const dayEnd = new Date(date);
    dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);

    try {
      const booking = await this.prisma.$transaction(
        async (tx) => {
          await lockProfessionalAgenda(tx, professionalProfileId);
          const commitments = (await loadCommitments(tx, [professionalProfileId], dayStart, dayEnd)).get(professionalProfileId) ?? [];
          if (isSlotBooked(commitments, input.date, input.startTime, input.endTime)) {
            throw new ConflictException("Questa fascia è già stata prenotata.");
          }
          return tx.booking.create({
            data: {
              clientId,
              professionalProfileId,
              scheduledAt,
              scheduledEndAt: new Date(`${input.date}T${input.endTime}:00.000Z`),
              status: "PENDING",
              cancellationNoticeHours: await cancellationNoticeFor(tx, professionalProfileId),
            },
          });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
      await this.subscriptionsService.afterJobAccepted(professionalProfileId);
      return { bookingId: booking.id };
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2034") {
        throw new ConflictException("Questa fascia è già stata prenotata.");
      }
      throw err;
    }
  }
}

function parseIsoDateUtc(dateStr: string): Date {
  const date = new Date(`${dateStr}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) {
    throw new BadRequestException("Data non valida.");
  }
  return date;
}

/** Fascia già occupata da almeno un impegno (prenotazione o lavoro esterno, docs/CHANGELOG.md §310). */
function isSlotBooked(bookings: Commitment[], dateStr: string, startTime: string, endTime: string): boolean {
  return countBookingsInSlot(bookings, dateStr, startTime, endTime) > 0;
}
