"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { X } from "lucide-react";
import {
  buildWhatsAppLink,
  formatBookingAddress,
  formatServicePriceRange,
  quotePriceTotals,
  type CompleteBookingInput,
  type ProfessionalBooking,
  type ProfessionalLead,
} from "@professionisti/shared";
import { Badge, Button, Icon, Surface, Text, XStack, YStack, brand, radiusDoc } from "@professionisti/ui";
import { apiClient } from "@/lib/apiClient";
import { useAuth } from "@/lib/AuthContext";
import { LoadingState } from "@/components/LoadingState";
import { TimelineModal } from "@/components/TimelineModal";
import { PhotoLightbox } from "@/components/PhotoLightbox";
import { MediaPreview } from "@/components/MediaPreview";
import { CompleteJobModal } from "@/components/CompleteJobModal";
import { CancelBookingModal } from "@/components/CancelBookingModal";
import { ReviewModal } from "@/components/ReviewModal";
import { RequestStepper, computeRequestStage } from "@/components/RequestStepper";
import {
  combineUnreadCounts,
  mergeCounts,
  mergeIds,
  professionalSectionCounts,
  unreadBookingCounts,
  unreadBookingIds,
  unreadGuidedRequestCounts,
  unreadGuidedRequestIds,
  unreadThreadCounts,
} from "@/lib/notificationSections";
import { UnreadDot } from "@/components/UnreadDot";
import { useDismissableUnreadCount } from "@/lib/useDismissableUnreadCount";

// Intervallo di poll per i pallini "Contatta/Cronologia" (richiesta
// esplicita dell'utente: "al professionista ancora non si capisce che è
// arrivato un nuovo messaggio da quella particolare richiesta") — più
// frequente del poll da 45s già in uso in AuthContext per il badge
// aggregato dell'header/i toast, perché qui l'obiettivo è far comparire il
// pallino sulla card giusta mentre si è già sulla pagina, non solo al
// prossimo login.
const UNREAD_BADGE_POLL_MS = 15000;
import { Pagination, sortListItems } from "@/components/ListControls";

// Massimo 10 righe per pagina nei riepiloghi compatti di "Richieste
// ricevute"/"Lavori accettati" (richiesta esplicita dell'utente): il resto
// resta raggiungibile con le pagine numerate di Pagination, invece di
// sparire semplicemente oltre la decima riga.
const DASHBOARD_LIST_PAGE_SIZE = 10;

const smallInputStyle = { padding: 10, borderRadius: 4, border: `1px solid ${brand.filetto}`, fontSize: 14, fontFamily: "inherit", color: brand.grafite };

function SectionTitle({ children }: { children: string }) {
  return (
    <Text fontFamily="$heading" fontWeight="700" fontSize="$7" color={brand.grafite}>
      {children}
    </Text>
  );
}

type DashboardTab = "richieste" | "lavori";

/**
 * Filtri per stato nelle due liste (richiesta esplicita dell'utente: "in
 * richieste ricevute e lavori accettati, crea una casella con filtri, dove
 * cliccando su possono inserire i filtri come ad esempio preventivo
 * inviato, preventivo accettato... e in lavori accettati filtri come:
 * completati, annullati, da effettuare").
 */
type LeadStatusFilter = "all" | "pending" | "quoteSent" | "quoteAccepted" | "declined" | "expired";
const LEAD_STATUS_OPTIONS: { value: LeadStatusFilter; label: string }[] = [
  { value: "all", label: "Tutte" },
  { value: "pending", label: "In attesa di preventivo" },
  { value: "quoteSent", label: "Preventivo inviato" },
  { value: "quoteAccepted", label: "Preventivo accettato" },
  { value: "declined", label: "Rifiutate" },
  // Lead non scaduto per rifiuto attivo ma per timeout (CLAUDE.md §14) —
  // filtro a parte: mescolarlo con "declined" mostrerebbe al
  // professionista una nota di rifiuto che non esiste per queste.
  { value: "expired", label: "Scadute" },
];
function leadMatchesStatus(lead: ProfessionalLead, filter: LeadStatusFilter): boolean {
  if (filter === "all") return true;
  if (filter === "declined") return lead.status === "DECLINED";
  if (filter === "expired") return lead.status === "EXPIRED";
  if (filter === "quoteAccepted") return lead.quote?.status === "ACCEPTED";
  if (filter === "quoteSent") return lead.quote !== null && lead.status !== "DECLINED" && lead.status !== "EXPIRED";
  // "In attesa di preventivo": bug reale corretto (CLAUDE.md §14) — un
  // Lead scaduto per timeout (nessuna risposta entro expiresAt) finiva qui
  // insieme a quelli davvero ancora aperti, perché il controllo escludeva
  // solo DECLINED. Un lead EXPIRED non è più azionabile, non deve
  // comparire come "in attesa".
  return lead.quote === null && lead.status !== "DECLINED" && lead.status !== "EXPIRED";
}

/**
 * Etichetta di stato breve per il riepilogo compatto (richiesta esplicita
 * dell'utente, revisione UX: "la dashboard dovrebbe essere un riepilogo...
 * e rimandare all'inbox per il dettaglio") — riusa le stesse categorie già
 * definite per il filtro completo di /dashboard/richieste, senza duplicare
 * la logica.
 */
function leadSummaryLabel(lead: ProfessionalLead): string {
  const match = LEAD_STATUS_OPTIONS.find((option) => option.value !== "all" && leadMatchesStatus(lead, option.value));
  return match?.label ?? "";
}

/**
 * Etichetta di stato breve per il riepilogo compatto di "Lavori accettati"
 * (richiesta esplicita dell'utente, revisione UX — stesso principio già
 * seguito per `leadSummaryLabel` sopra: la dashboard mostra solo il
 * riepilogo, il dettaglio/le azioni restano su /dashboard/richieste).
 */
function bookingSummaryLabel(booking: ProfessionalBooking): string {
  if (booking.status === "CANCELED") {
    return `Annullata${booking.canceledBy === "CLIENT" ? " dal cliente" : booking.canceledBy === "PROFESSIONAL" ? " da te" : ""}`;
  }
  if (booking.status === "COMPLETED") return "Completato";
  return "Confermato";
}

/**
 * Caselle "Richieste ricevute"/"Lavori accettati" (richiesta esplicita
 * dell'utente, "il piu facile e ordinata la visualizzazione"): stesso
 * pattern a pillola attiva/inattiva già in uso altrove nel sito (es. tab
 * "A domicilio"/"Online" di SearchBar) invece di introdurre un nuovo
 * componente Tab condiviso solo per questa pagina.
 */
function DashboardTabButton({
  active,
  onPress,
  badgeCount,
  children,
}: {
  active: boolean;
  onPress: () => void;
  /** Numeretto degli aggiornamenti non letti di questa sezione (richiesta esplicita dell'utente). */
  badgeCount?: number;
  children: React.ReactNode;
}) {
  return (
    <XStack
      alignItems="center"
      gap="$2"
      paddingHorizontal="$4"
      paddingVertical="$3"
      borderRadius="$3"
      backgroundColor={active ? brand.cianografiaVelo : "transparent"}
      cursor="pointer"
      onPress={onPress}
      accessibilityRole="button"
    >
      <Text fontWeight="700" color={active ? brand.cianografia : brand.grafite70}>
        {children}
      </Text>
      {badgeCount ? (
        <YStack backgroundColor={brand.urgenza} borderRadius={999} minWidth={18} height={18} paddingHorizontal={4} alignItems="center" justifyContent="center">
          <Text fontSize={11} fontWeight="700" color="white" lineHeight={14}>
            {badgeCount > 9 ? "9+" : badgeCount}
          </Text>
        </YStack>
      ) : null}
    </XStack>
  );
}

export default function DashboardPage() {
  return (
    <Suspense fallback={null}>
      <DashboardContent />
    </Suspense>
  );
}

function DashboardContent() {
  const { user, token, isLoading, markNotificationsRead } = useAuth();
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<DashboardTab>("richieste");
  // Un toast cliccato (ToastStack, richiesta esplicita dell'utente: "fagli
  // aprire l'aggiornamento relativo a quel banner") naviga qui con
  // `?tab=richieste|lavori` — reattivo a `searchParams` (non solo al primo
  // mount) perché un click sul toast mentre si è già su questa pagina è una
  // navigazione superficiale (stessa route, solo la query cambia), che non
  // rimonta il componente.
  useEffect(() => {
    const tab = searchParams.get("tab");
    if (tab === "richieste" || tab === "lavori") setActiveTab(tab);
  }, [searchParams]);
  // Fotografia delle notifiche non lette al momento dell'arrivo sulla
  // pagina, presa PRIMA di segnarle come lette — evita una race condition
  // reale: se si usasse invece il conteggio "live" di AuthContext
  // (aggiornato dallo stesso poll usato per il badge/toast), la richiesta
  // GET qui e la PATCH di markNotificationsRead partono nello stesso
  // istante e l'ordine di arrivo delle risposte non è garantito — se la
  // PATCH vince, la GET successiva del poll trova già tutto letto e il
  // numeretto per sezione non compare mai, anche se un attimo prima
  // c'era davvero un aggiornamento. Recuperata qui esplicitamente PRIMA
  // di segnare come letto, la sequenza è sempre corretta.
  const [sectionSnapshot, setSectionSnapshot] = useState<{ richieste: number; lavori: number }>({ richieste: 0, lavori: 0 });
  // ID delle richieste/prenotazioni con un aggiornamento non letto (stesso
  // snapshot di sectionSnapshot, recuperato una sola volta) — richiesta
  // esplicita dell'utente: "rendilo evidente anche nella lista", non solo
  // il numeretto sul tab. LeadCard/AcceptedJobCard mostrano un badge
  // "Nuovo" quando il proprio id è tra questi.
  const [newLeadRequestIds, setNewLeadRequestIds] = useState<Set<string>>(new Set());
  const [newBookingIds, setNewBookingIds] = useState<Set<string>>(new Set());
  // Conteggio (non solo presenza) degli aggiornamenti non letti per
  // richiesta/prenotazione — richiesta esplicita dell'utente: un pallino
  // rosso con un numero accanto a "Contatta/Cronologia", non solo il badge
  // "Nuovo" già esistente.
  const [leadUnreadCounts, setLeadUnreadCounts] = useState<Map<string, number>>(new Map());
  const [bookingUnreadCounts, setBookingUnreadCounts] = useState<Map<string, number>>(new Map());
  // Bug reale trovato da un agente di verifica: un messaggio di chat su un
  // lavoro già accettato non accendeva mai il pallino di AcceptedJobCard,
  // perché quel pallino leggeva solo `bookingUnreadCounts` (chiave
  // `bookingId`) mentre un messaggio di chat porta solo
  // `guidedRequestId`+`professionalProfileId` nel payload — mai `bookingId`.
  // Chiave composita `guidedRequestId:professionalProfileId` (stessa già in
  // uso in /le-mie-richieste per "Inviata a"), sommata a bookingUnreadCounts
  // via combineUnreadCounts (mai lo stesso evento contato due volte, vedi
  // il commento su combineUnreadCounts).
  const [threadUnreadCounts, setThreadUnreadCounts] = useState<Map<string, number>>(new Map());
  const [profileMissing, setProfileMissing] = useState(false);
  const [leads, setLeads] = useState<ProfessionalLead[] | null>(null);
  const [bookings, setBookings] = useState<ProfessionalBooking[] | null>(null);
  // Id del proprio profilo professionista — serve per aprire la cronologia
  // della richiesta (TimelineModal, richiesta esplicita dell'utente),
  // nessun altro endpoint qui lo espone già essendo sempre "il proprio".
  const [myProfileId, setMyProfileId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Pagina corrente dei due riepiloghi compatti (richiesta esplicita
  // dell'utente: "mostra un massimo di 10, il resto in altre pagine
  // cliccabili") — indipendente per tab, non si azzera cambiando scheda.
  const [leadsPage, setLeadsPage] = useState(1);
  const [bookingsPage, setBookingsPage] = useState(1);

  // Un solo ref condiviso dalle due tab (solo una è montata alla volta) —
  // resta per lo scroll-to-top del toast/deep-link, invariato dal redesign
  // precedente. Riusato anche per il cambio pagina (stesso principio già
  // in uso in /le-mie-richieste: senza, si resta scrollati sul controllo
  // appena cliccato mentre la nuova pagina parte fuori dallo schermo).
  const listTopRef = useRef<HTMLDivElement>(null);
  function scrollToListTop() {
    listTopRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  function goToLeadsPage(page: number) {
    setLeadsPage(page);
    scrollToListTop();
  }
  function goToBookingsPage(page: number) {
    setBookingsPage(page);
    scrollToListTop();
  }

  function reloadBookings() {
    if (!token) return;
    apiClient.myProfessionalBookings(token).then(setBookings);
  }

  function reloadLeads() {
    if (!token) return;
    apiClient.myLeads(token).then(setLeads);
  }

  // Aprire la dashboard segna come lette le notifiche in attesa (nuovo lead,
  // risposta del cliente su una data proposta): il badge nell'header si
  // azzera qui, non con un click separato — coerente con la richiesta
  // dell'utente di vedere "un numeretto con le novità da visualizzare".
  // L'elenco va recuperato ESPLICITAMENTE prima di segnarle come lette
  // (vedi commento su sectionSnapshot) — mai affidarsi al conteggio "live"
  // già in corso di poll altrove per questo calcolo one-shot. Ripetuto ogni
  // UNREAD_BADGE_POLL_MS finché la pagina resta aperta (richiesta esplicita
  // dell'utente: un nuovo messaggio in chat mentre si è già sulla dashboard
  // deve comparire da solo, non solo al prossimo caricamento) — ogni tick
  // trova solo le notifiche arrivate DOPO il markNotificationsRead del tick
  // precedente (mai le stesse due volte), quindi i conteggi si sommano
  // (mergeCounts/mergeIds) invece di sostituire lo stato.
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    function poll() {
      apiClient
        .unreadNotifications(token!)
        .then((notifications) => {
          if (cancelled || notifications.length === 0) return;
          const delta = professionalSectionCounts(notifications);
          setSectionSnapshot((prev) => ({ richieste: prev.richieste + delta.richieste, lavori: prev.lavori + delta.lavori }));
          setNewLeadRequestIds((prev) => mergeIds(prev, unreadGuidedRequestIds(notifications)));
          setNewBookingIds((prev) => mergeIds(prev, unreadBookingIds(notifications)));
          setLeadUnreadCounts((prev) => mergeCounts(prev, unreadGuidedRequestCounts(notifications)));
          setBookingUnreadCounts((prev) => mergeCounts(prev, unreadBookingCounts(notifications)));
          setThreadUnreadCounts((prev) => mergeCounts(prev, unreadThreadCounts(notifications)));
          // Stesso bug/fix già applicato in /dashboard/richieste e
          // /le-mie-richieste: un evento generato dall'altra parte mentre
          // questa pagina resta aperta lasciava leads/bookings non
          // aggiornati fino a un ricaricamento manuale.
          reloadLeads();
          reloadBookings();
        })
        .catch(() => {})
        .finally(() => markNotificationsRead());
    }
    poll();
    const interval = setInterval(poll, UNREAD_BADGE_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [token, markNotificationsRead]);

  useEffect(() => {
    if (!token) return;
    Promise.all([
      apiClient.myLeads(token),
      apiClient.myProfessionalBookings(token),
      apiClient.getMyProfessionalProfile(token),
    ])
      .then(([leadsResult, bookingsResult, profile]) => {
        setLeads(leadsResult);
        setBookings(bookingsResult);
        setMyProfileId(profile?.id ?? null);
      })
      .catch((err) => {
        if (err instanceof Error && err.message.includes("profilo")) {
          setProfileMissing(true);
        } else {
          setError(err instanceof Error ? err.message : "Errore nel caricamento della dashboard.");
        }
      });
  }, [token]);

  if (isLoading) return null;

  if (!user || !token) {
    return (
      <YStack width="100%" alignItems="center" backgroundColor={brand.gesso} paddingVertical="$9" paddingHorizontal="$4">
        <YStack width="100%" maxWidth={480} gap="$4" alignItems="center">
          <Text fontFamily="$heading" fontWeight="800" fontSize="$7" color={brand.grafite} textAlign="center">
            Accedi come professionista
          </Text>
          <Link href="/accedi?redirect=/dashboard" style={{ textDecoration: "none" }}>
            <Button variant="primary">Accedi</Button>
          </Link>
        </YStack>
      </YStack>
    );
  }

  if (!user.isProfessional) {
    return (
      <YStack width="100%" alignItems="center" backgroundColor={brand.gesso} paddingVertical="$9" paddingHorizontal="$4">
        <Text color={brand.grafite70}>Questa sezione è riservata ai professionisti.</Text>
      </YStack>
    );
  }

  if (profileMissing) {
    return (
      <YStack width="100%" alignItems="center" backgroundColor={brand.gesso} paddingVertical="$9" paddingHorizontal="$4">
        <YStack width="100%" maxWidth={480} gap="$4" alignItems="center">
          <Text fontFamily="$heading" fontWeight="800" fontSize="$7" color={brand.grafite} textAlign="center">
            Completa il tuo profilo per iniziare
          </Text>
          <Text color={brand.grafite70} textAlign="center">
            Serve un profilo completo (nome attività, categoria, città) per comparire in ricerca e ricevere
            richieste.
          </Text>
          <Link href="/dashboard/profilo" style={{ textDecoration: "none" }}>
            <Button variant="primary">Completa profilo</Button>
          </Link>
        </YStack>
      </YStack>
    );
  }

  // Riepilogo compatto invece dell'elenco completo (richiesta esplicita
  // dell'utente, revisione UX: la stessa card appariva due volte tra
  // /dashboard e /dashboard/richieste) — ordinate per ultimo aggiornamento,
  // con un link all'inbox completa per il dettaglio/le azioni. Filtri/
  // ordinamento restano solo su /dashboard/richieste, unica fonte di verità
  // per quelli; la paginazione (max 10 per pagina, richiesta esplicita
  // dell'utente) resta invece anche qui, sullo stesso riepilogo.
  const sortedLeads = leads ? sortListItems(leads, "updatedAt", { createdAt: (l) => l.createdAt, updatedAt: (l) => l.updatedAt }) : null;
  const leadsTotalPages = sortedLeads ? Math.max(1, Math.ceil(sortedLeads.length / DASHBOARD_LIST_PAGE_SIZE)) : 1;
  const leadsEffectivePage = Math.min(leadsPage, leadsTotalPages);
  const recentLeads = sortedLeads?.slice((leadsEffectivePage - 1) * DASHBOARD_LIST_PAGE_SIZE, leadsEffectivePage * DASHBOARD_LIST_PAGE_SIZE) ?? null;
  const pendingLeadsCount = leads ? leads.filter((lead) => leadMatchesStatus(lead, "pending")).length : 0;

  // Stesso riepilogo compatto, applicato ora anche a "Lavori accettati"
  // (richiesta esplicita dell'utente: "il contesto duplicato è un errore da
  // risolvere" — la stessa card completa (ex `AcceptedJobCard`, con
  // Contatta/Cronologia, Lavoro terminato, Annulla intervento, Recensisci il
  // cliente) appariva identica qui e su /dashboard/richieste sotto gli
  // stadi "Accettate"/"Completate"/"Annullate". Filtri/ricerca rimossi:
  // restano solo su /dashboard/richieste, unica fonte di verità per il
  // dettaglio/le azioni — la paginazione resta invece anche qui.
  const acceptedJobsList = bookings ? acceptedJobs(bookings) : null;
  const sortedBookings = acceptedJobsList
    ? sortListItems(acceptedJobsList, "updatedAt", { createdAt: (b) => b.createdAt, updatedAt: (b) => b.updatedAt })
    : null;
  const bookingsTotalPages = sortedBookings ? Math.max(1, Math.ceil(sortedBookings.length / DASHBOARD_LIST_PAGE_SIZE)) : 1;
  const bookingsEffectivePage = Math.min(bookingsPage, bookingsTotalPages);
  const recentBookings = sortedBookings?.slice((bookingsEffectivePage - 1) * DASHBOARD_LIST_PAGE_SIZE, bookingsEffectivePage * DASHBOARD_LIST_PAGE_SIZE) ?? null;
  const toDoBookingsCount = acceptedJobsList ? acceptedJobsList.filter((b) => b.status === "CONFIRMED").length : 0;

  return (
    <YStack width="100%" alignItems="center" backgroundColor={brand.gesso} paddingVertical="$8" paddingHorizontal="$4">
      <YStack width="100%" maxWidth={780} gap="$6">
        <YStack flexDirection="row" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap="$2">
          <Text fontFamily="$heading" fontWeight="800" fontSize="$8" color={brand.grafite}>
            Dashboard
          </Text>
          <Link href="/dashboard/profilo" style={{ textDecoration: "none" }}>
            <Text color={brand.cianografia} fontWeight="600">
              Modifica profilo
            </Text>
          </Link>
        </YStack>

        {error ? <Text color={brand.urgenza}>{error}</Text> : null}

        <XStack gap="$2" flexWrap="wrap" borderBottomWidth={1} borderBottomColor={brand.filetto}>
          <DashboardTabButton active={activeTab === "richieste"} onPress={() => setActiveTab("richieste")} badgeCount={sectionSnapshot.richieste}>
            Richieste ricevute{leads ? ` (${leads.length})` : ""}
          </DashboardTabButton>
          <DashboardTabButton active={activeTab === "lavori"} onPress={() => setActiveTab("lavori")} badgeCount={sectionSnapshot.lavori}>
            Lavori accettati{bookings ? ` (${acceptedJobs(bookings).length})` : ""}
          </DashboardTabButton>
        </XStack>

        {activeTab === "richieste" ? (
          <YStack ref={listTopRef} gap="$3">
            {leads === null ? (
              <LoadingState />
            ) : leads.length === 0 ? (
              <Text color={brand.grafite70}>Non hai ancora ricevuto richieste. Torna a trovarci a breve!</Text>
            ) : (
              <>
                {/* Riepilogo, non l'elenco completo (segnalato in revisione
                    UX: la stessa card ripetuta identica su questa pagina e
                    su /dashboard/richieste) — i numeri e le ultime novità
                    qui, dettaglio/azioni sempre nell'inbox dedicata. */}
                <Text color={brand.grafite70} fontSize="$3">
                  {pendingLeadsCount === 0
                    ? "Nessuna richiesta in attesa di risposta al momento."
                    : `${pendingLeadsCount} richiest${pendingLeadsCount === 1 ? "a" : "e"} in attesa della tua risposta, su ${leads.length} ricevut${leads.length === 1 ? "a" : "e"} in totale.`}
                </Text>
                <Pagination page={leadsEffectivePage} totalPages={leadsTotalPages} onPageChange={goToLeadsPage} />
                <YStack gap="$2">
                  {recentLeads?.map((lead) => (
                    <LeadSummaryRow
                      key={lead.id}
                      lead={lead}
                      isNew={newLeadRequestIds.has(lead.guidedRequest.id)}
                      unreadCount={leadUnreadCounts.get(lead.guidedRequest.id)}
                    />
                  ))}
                </YStack>
                <Pagination page={leadsEffectivePage} totalPages={leadsTotalPages} onPageChange={goToLeadsPage} />
                <Link href="/dashboard/richieste" style={{ textDecoration: "none", alignSelf: "flex-start" }}>
                  <Button variant="secondary" size="$3" height={40}>
                    Apri tutte le richieste ricevute
                  </Button>
                </Link>
              </>
            )}
          </YStack>
        ) : (
          <YStack ref={listTopRef} gap="$3">
            {bookings === null ? (
              <LoadingState />
            ) : acceptedJobsList!.length === 0 ? (
              <Text color={brand.grafite70}>Nessun lavoro accettato per ora.</Text>
            ) : (
              <>
                {/* Stesso riepilogo compatto di "Richieste ricevute" sopra
                    (revisione UX: la card completa appariva identica qui e
                    su /dashboard/richieste) — i numeri e le ultime novità
                    qui, dettaglio/azioni sempre nella pipeline dedicata. */}
                <Text color={brand.grafite70} fontSize="$3">
                  {toDoBookingsCount === 0
                    ? "Nessun lavoro in agenda al momento."
                    : `${toDoBookingsCount} lavor${toDoBookingsCount === 1 ? "o" : "i"} in agenda, su ${acceptedJobsList!.length} accettat${acceptedJobsList!.length === 1 ? "o" : "i"} in totale.`}
                </Text>
                <Pagination page={bookingsEffectivePage} totalPages={bookingsTotalPages} onPageChange={goToBookingsPage} />
                <YStack gap="$2">
                  {recentBookings?.map((booking) => (
                    <BookingSummaryRow
                      key={booking.id}
                      booking={booking}
                      isNew={newBookingIds.has(booking.id)}
                      unreadCount={combineUnreadCounts(
                        bookingUnreadCounts.get(booking.id),
                        booking.guidedRequestId && myProfileId ? threadUnreadCounts.get(`${booking.guidedRequestId}:${myProfileId}`) : undefined,
                      )}
                    />
                  ))}
                </YStack>
                <Pagination page={bookingsEffectivePage} totalPages={bookingsTotalPages} onPageChange={goToBookingsPage} />
                <XStack gap="$3" flexWrap="wrap" alignItems="center">
                  <Link href="/dashboard/richieste?stage=accettata" style={{ textDecoration: "none" }}>
                    <Button variant="secondary" size="$3" height={40}>
                      Apri tutti i lavori accettati
                    </Button>
                  </Link>
                  <Link href="/dashboard/agenda" style={{ textDecoration: "none" }}>
                    <Text color={brand.cianografia} fontWeight="600" fontSize="$3">
                      Apri il calendario completo
                    </Text>
                  </Link>
                </XStack>
              </>
            )}
          </YStack>
        )}

        <BoostSection />
      </YStack>
    </YStack>
  );
}

/**
 * "Lavori accettati" (richiesta esplicita dell'utente): prenotazioni
 * CONFIRMED (preventivo accettato dal cliente, o fascia diretta già
 * confermata dal professionista), COMPLETED (lavori passati) o CANCELED —
 * quest'ultima inclusa apposta (a differenza di PENDING/NO_SHOW, ancora
 * escluse) per richiesta esplicita dell'utente: se un cliente annulla una
 * prenotazione già confermata, il professionista deve accorgersene invece
 * di vederla sparire silenziosamente dall'elenco.
 */
function acceptedJobs(bookings: ProfessionalBooking[]): ProfessionalBooking[] {
  return bookings.filter((b) => b.status === "CONFIRMED" || b.status === "COMPLETED" || b.status === "CANCELED");
}

const BOOST_OPTIONS: { type: "BOOST_LOCALE" | "BADGE_REPUTAZIONE" | "STORIA_SUCCESSO"; label: string; description: string; priceEur: number }[] = [
  { type: "BOOST_LOCALE", label: "Boost locale", description: "Prime posizioni nei risultati per 30 giorni.", priceEur: 19.9 },
  { type: "BADGE_REPUTAZIONE", label: "Badge reputazione", description: "Evidenza per rating alto e risposta rapida.", priceEur: 9.9 },
  { type: "STORIA_SUCCESSO", label: "Storia di successo", description: "Contenuto editoriale in evidenza sulla piattaforma.", priceEur: 49.9 },
];

function BoostSection() {
  return (
    <YStack gap="$3">
      <SectionTitle>Aumenta la tua visibilità</SectionTitle>
      <YStack gap="$3" $gtSm={{ flexDirection: "row" }}>
        {BOOST_OPTIONS.map((option) => (
          <Surface key={option.type} flex={1} gap="$2">
            <XStack alignItems="center" gap="$2" flexWrap="wrap">
              <Badge variant="pro">{option.label}</Badge>
              {/* Pagamenti non ancora attivi (Stripe escluso dal lancio):
                  il bottone "Acquista" fallirebbe sempre, quindi mostriamo
                  uno stato "In arrivo" onesto invece di un errore. */}
              <YStack backgroundColor={brand.cianografiaVelo} borderRadius="$10" paddingHorizontal="$2" paddingVertical={2}>
                <Text fontSize={11} fontWeight="700" color={brand.cianografia}>
                  In arrivo
                </Text>
              </YStack>
            </XStack>
            <Text color={brand.grafite70} fontSize="$3">
              {option.description}
            </Text>
            <Text fontWeight="700" color={brand.grafite}>
              €{option.priceEur.toFixed(2)}
            </Text>
            <Text fontSize="$2" color={brand.grafite70}>
              Ti avviseremo appena gli acquisti in piattaforma saranno attivi.
            </Text>
          </Surface>
        ))}
      </YStack>
    </YStack>
  );
}


/**
 * Riga compatta per il riepilogo "Richieste ricevute" in dashboard —
 * richiesta esplicita dell'utente, revisione UX: la card completa
 * (voci del preventivo, form di invio, cronologia inline, ecc.) appariva
 * identica sia qui sia in /dashboard/richieste, ora unica fonte di verità
 * per il dettaglio e le azioni. Qui resta solo identità + stato +
 * eventuale pallino non letto: click apre l'inbox completa.
 */
function LeadSummaryRow({
  lead,
  isNew,
  unreadCount,
}: {
  lead: ProfessionalLead;
  /** True se questa richiesta ha un aggiornamento non letto — richiesta esplicita dell'utente ("rendilo evidente anche nella lista"). */
  isNew?: boolean;
  /** Numero di aggiornamenti non letti per questa richiesta — pallino rosso, stesso significato già in uso su "Contatta/Cronologia". */
  unreadCount?: number;
}) {
  const clientName = lead.guidedRequest.clientAccountDeleted ? "Account eliminato" : lead.guidedRequest.clientName ?? "Cliente";
  // Data/ora di ricezione (richiesta esplicita dell'utente: "inserisci
  // anche la data e l'orario nelle richieste ricevute") — stesso campo e
  // stesso formato già usati per la data/ora di ricezione su
  // /dashboard/richieste (CLAUDE.md §62) e per la data della prenotazione
  // in BookingSummaryRow qui sotto.
  const receivedDate = new Date(lead.createdAt);
  // Deep link diretto alla card specifica (richiesta esplicita dell'utente:
  // "cliccando su uno specifico richiesta/lavoro si dovrà aprire quella
  // determinata richiesta/lavoro") — stesso `?open=` già in uso da
  // BookingSummaryRow qui sotto, letto da /dashboard/richieste per
  // espandere/scrollare alla card giusta invece di aprire solo l'inbox.
  return (
    <Link href={`/dashboard/richieste?open=${lead.guidedRequest.id}`} style={{ textDecoration: "none" }}>
      <XStack alignItems="center" gap="$2" backgroundColor={brand.gesso} borderRadius="$3" padding="$3" flexWrap="wrap">
        <YStack flex={1} minWidth={200} gap="$1">
          <XStack alignItems="center" gap="$2" flexWrap="wrap">
            <Text fontWeight="700" color={brand.grafite}>
              {clientName}
            </Text>
            <Text color={brand.grafite70} fontSize="$3">
              · {lead.guidedRequest.categoryLabel}
              {lead.guidedRequest.city ? ` · ${lead.guidedRequest.city}` : ""}
            </Text>
            {lead.guidedRequest.isUrgent ? <Badge variant="urgente">Urgente</Badge> : null}
            {isNew ? <Badge variant="nuovo">Nuovo</Badge> : null}
          </XStack>
          <Text fontSize="$2" color={brand.grafite70}>
            {receivedDate.toLocaleDateString("it-IT", { weekday: "short", day: "numeric", month: "short" })} ·{" "}
            {receivedDate.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })} · {leadSummaryLabel(lead)}
          </Text>
        </YStack>
        <XStack alignItems="center" gap="$2" flexShrink={0}>
          <UnreadDot count={unreadCount} />
          <Icon name="chevron-right" size={16} color={brand.grafite70} />
        </XStack>
      </XStack>
    </Link>
  );
}

/**
 * Riepilogo compatto di un lavoro accettato — stesso principio di
 * `LeadSummaryRow` sopra, applicato a "Lavori accettati" (richiesta
 * esplicita dell'utente: "il contesto duplicato è un errore da risolvere").
 * Il deep-link (`?open=`, già introdotto per /chat — CLAUDE.md §47) apre
 * direttamente la card giusta nella pipeline quando la prenotazione ha una
 * richiesta guidata di origine; le prenotazioni dirette da agenda pubblica
 * (`guidedRequestId` assente, dormiente da CLAUDE.md §20) ricadono
 * sull'inbox generica.
 */
function BookingSummaryRow({
  booking,
  isNew,
  unreadCount,
}: {
  booking: ProfessionalBooking;
  /** True se questo lavoro ha un aggiornamento non letto. */
  isNew?: boolean;
  /** Numero di aggiornamenti non letti — pallino rosso, stesso significato di LeadSummaryRow. */
  unreadCount?: number;
}) {
  const date = new Date(booking.scheduledAt);
  const recipientFullName = [booking.recipientName, booking.recipientSurname].filter(Boolean).join(" ") || null;
  const clientName = booking.clientAccountDeleted ? "Account eliminato" : (recipientFullName ?? booking.clientName ?? "Cliente");
  const href = booking.guidedRequestId ? `/dashboard/richieste?open=${booking.guidedRequestId}` : "/dashboard/richieste";
  // Indirizzo/telefono restano sempre visibili una volta confermato il
  // lavoro — richiesta esplicita dell'utente, "ad esempio anche nelle
  // richieste completate" — non solo un click di distanza in "Richieste
  // ricevute" (dove restano comunque disponibili con WhatsApp/Chiama/
  // mailto): qui una riga in sola lettura, coerente col resto del
  // riepilogo compatto (CLAUDE.md §56), senza reintrodurre l'intera
  // sezione "Dettagli cliente" già presente altrove.
  const revealedPhone = booking.recipientPhone ?? booking.clientPhone;
  const revealedAddress = formatBookingAddress(booking) ?? (booking.address ? `${booking.address}, ${booking.city ?? ""}` : null);
  return (
    <Link href={href} style={{ textDecoration: "none" }}>
      <XStack alignItems="center" gap="$2" backgroundColor={brand.gesso} borderRadius="$3" padding="$3" flexWrap="wrap">
        <YStack flex={1} minWidth={200} gap="$1">
          <XStack alignItems="center" gap="$2" flexWrap="wrap">
            <Text fontWeight="700" color={brand.grafite}>
              {clientName}
            </Text>
            <Text color={brand.grafite70} fontSize="$3">
              · {booking.categoryLabel ?? "Lavoro"}
              {booking.city ? ` · ${booking.city}` : ""}
            </Text>
            {isNew ? <Badge variant="nuovo">Nuovo</Badge> : null}
          </XStack>
          <Text fontSize="$2" color={brand.grafite70}>
            {date.toLocaleDateString("it-IT", { weekday: "short", day: "numeric", month: "short" })} ·{" "}
            {date.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })} · {bookingSummaryLabel(booking)}
          </Text>
          {revealedAddress || revealedPhone ? (
            <XStack alignItems="center" gap="$3" flexWrap="wrap">
              {revealedAddress ? (
                <XStack alignItems="center" gap={4}>
                  <Icon name="map-pin" size={12} color={brand.grafite70} />
                  <Text fontSize="$1" color={brand.grafite70}>
                    {revealedAddress}
                  </Text>
                </XStack>
              ) : null}
              {revealedPhone ? (
                <XStack alignItems="center" gap={4}>
                  <Icon name="phone" size={12} color={brand.grafite70} />
                  <Text fontSize="$1" color={brand.grafite70}>
                    {revealedPhone}
                  </Text>
                </XStack>
              ) : null}
            </XStack>
          ) : null}
        </YStack>
        <XStack alignItems="center" gap="$2" flexShrink={0}>
          <UnreadDot count={unreadCount} />
          <Icon name="chevron-right" size={16} color={brand.grafite70} />
        </XStack>
      </XStack>
    </Link>
  );
}
