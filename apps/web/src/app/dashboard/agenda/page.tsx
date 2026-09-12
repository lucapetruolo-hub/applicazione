"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import type { ExternalJob, ProfessionalBooking, ProfessionalLead } from "@professionisti/shared";
import { Button, Icon, Text, XStack, YStack, brand } from "@professionisti/ui";
import { apiClient } from "@/lib/apiClient";
import { useAuth } from "@/lib/AuthContext";
import { CalendarShell, type CalendarView } from "@/components/calendar/CalendarShell";
import { BookingDetailPanel } from "@/components/calendar/BookingDetailPanel";
import { LoadingState } from "@/components/LoadingState";
import { TimelineModal } from "@/components/TimelineModal";
import { ExternalJobModal } from "@/components/ExternalJobModal";
import { REQUEST_STAGE_STYLE } from "@/lib/requestStage";
import {
  datesInMonth,
  datesInMonthForGivenWeekday,
  datesInMonthForWeekday,
  monthLabel,
  parseIsoDate,
  slotAppliesOnDateStr,
  startOfDayUtc,
  todayUtc,
  toIsoDate,
} from "@/lib/calendarDates";

// `date` (ISO, YYYY-MM-DD) è ora il comportamento di default per una nuova
// fascia (richiesta esplicita dell'utente: vale solo per quella data, non
// più per ogni <dayOfWeek> per sempre) — `null`/assente solo per le fasce
// ricorrenti create prima di questa funzionalità.
// Capienza indipendente per modalità (richiesta esplicita dell'utente: due
// caselle "A domicilio"/"Online", almeno una obbligatoria, con capienza
// separata) — homeMax/onlineMax valorizzati solo quando il rispettivo
// allows* è vero.
type SlotDraft = {
  id?: string;
  dayOfWeek: number;
  date: string | null;
  start: string;
  end: string;
  allowsHome: boolean;
  allowsOnline: boolean;
  homeMax: number | null;
  onlineMax: number | null;
  hasUpcomingBooking?: boolean;
};
type AgendaTab = "disponibilita" | "prenotazioni";

// dayOfWeek segue date.getUTCDay(): 0=domenica...6=sabato, stessa convenzione
// usata in tutto il modulo agenda.
const WEEKDAY_FULL_LABELS = ["Domenica", "Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato"];

function slotsOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return aStart < bEnd && bStart < aEnd;
}

/** Una fascia è "generica" (bordo tratteggiato ottone) se una delle due capienze indipendenti supera 1. */
function isSlotGeneric(slot: SlotDraft): boolean {
  return (slot.homeMax ?? 0) > 1 || (slot.onlineMax ?? 0) > 1;
}

// Richiesta esplicita dell'utente: "colora le caselle degli appuntamento in
// base ai colori che sono stati usati per le schede in richieste ricevute"
// — riusa `REQUEST_STAGE_STYLE` (packages/lib/requestStage.ts, unica fonte
// di verità, prima locale a `/dashboard/richieste`) invece dei token
// `brand.*` usati fin qui, mappando ogni `BookingStatus` sullo stadio con lo
// stesso significato pratico: CONFIRMED→accettata (verde), COMPLETED→
// completata (turchese), CANCELED→annullata (rosso firebrick). PENDING
// (prenotazione creata ma non ancora confermata dal professionista — solo
// dal flusso di prenotazione diretta, dormiente da CLAUDE.md §20) riusa lo
// stesso giallo "in attesa" — stessa semantica "in attesa di un'azione".
// NO_SHOW non ha uno stadio dedicato in "richieste ricevute": riusa lo
// stesso rosso di `annullata` (entrambi "il lavoro non si è svolto").
const BOOKING_STATUS_COLOR: Record<ProfessionalBooking["status"], string> = {
  PENDING: REQUEST_STAGE_STYLE.in_attesa.border,
  CONFIRMED: REQUEST_STAGE_STYLE.accettata.border,
  COMPLETED: REQUEST_STAGE_STYLE.completata.border,
  CANCELED: REQUEST_STAGE_STYLE.annullata.border,
  NO_SHOW: REQUEST_STAGE_STYLE.annullata.border,
};

// Lavori presi al di fuori della piattaforma (richiesta esplicita
// dell'utente), mostrati insieme alle Booking reali nello stesso
// calendario "Prenotazioni" — bordo tratteggiato (stesso principio già in
// uso per le fasce generiche dell'agenda) per restare visivamente distinti
// da un impegno nato da un preventivo accettato.
const EXTERNAL_JOB_STATUS_COLOR: Record<ExternalJob["status"], string> = {
  SCHEDULED: brand.grafite70,
  COMPLETED: brand.verificato,
  CANCELED: brand.urgenza,
};

// Data/orario di un preventivo inviato ma non ancora accettato dal cliente
// (richiesta esplicita dell'utente) — colore ottone, coerente con lo stesso
// significato "in attesa di una decisione" già usato altrove nel prodotto
// (es. Booking PENDING).
const PENDING_QUOTE_COLOR = brand.ottone;

// Etichette italiane per stato — usate sia in UI (lista annuale/risultati di
// ricerca) sia come testo indicizzato dalla ricerca full-text (così cercare
// "confermat" trova le prenotazioni confermate, non solo un nome cliente).
const AGENDA_BOOKING_STATUS_LABEL: Record<ProfessionalBooking["status"], string> = {
  PENDING: "In attesa di conferma",
  CONFIRMED: "Confermata",
  COMPLETED: "Completata",
  CANCELED: "Annullata",
  NO_SHOW: "Cliente non presentato",
};
const AGENDA_EXTERNAL_JOB_STATUS_LABEL: Record<ExternalJob["status"], string> = {
  SCHEDULED: "Programmato",
  COMPLETED: "Completato",
  CANCELED: "Annullato",
};

/**
 * Riga unificata per la lista annuale e per i risultati di ricerca
 * (richiesta esplicita dell'utente, entrambe): stessa forma per Booking,
 * ExternalJob e preventivo "in attesa", con `searchText` precalcolato —
 * concatenazione minuscola di ogni campo pertinente, così "qualsiasi
 * prenotazione dove in qualsiasi campo c'è la parola" (richiesta letterale
 * dell'utente) funziona con un solo `.includes()` invece di controllare
 * campo per campo ad ogni digitazione.
 */
type AgendaListItem = {
  key: string;
  date: Date;
  timeLabel: string;
  title: string;
  subtitle: string;
  statusLabel: string;
  statusColor: string;
  dashed: boolean;
  searchText: string;
  onPress: () => void;
};

function formatAgendaTimeRange(startIso: string, endIso: string | null): string {
  const start = new Date(startIso).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
  if (!endIso) return start;
  return `${start}–${new Date(endIso).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}`;
}

export default function DashboardAgendaPage() {
  return (
    <Suspense fallback={null}>
      <DashboardAgendaContent />
    </Suspense>
  );
}

function DashboardAgendaContent() {
  const { user, token, isLoading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  // "Prenotazioni" di default all'apertura (richiesta esplicita dell'utente):
  // è la vista con l'informazione più urgente al primo sguardo (gli
  // appuntamenti reali), "Disponibilità" è configurazione che si tocca meno
  // spesso una volta impostata.
  const [activeTab, setActiveTab] = useState<AgendaTab>("prenotazioni");

  const [slots, setSlots] = useState<SlotDraft[]>([]);
  const [exceptionDates, setExceptionDates] = useState<string[]>([]);
  const [isLoadingSlots, setIsLoadingSlots] = useState(true);
  const [profileMissing, setProfileMissing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [saved, setSaved] = useState(false);

  // Stesso criterio del calendario Prenotazioni sotto: su mobile il
  // default è "Giorno" perché la griglia settimanale non ci sta.
  const [view, setView] = useState<CalendarView>(() =>
    typeof window !== "undefined" && window.innerWidth < 640 ? "day" : "week",
  );
  const [currentDate, setCurrentDate] = useState(todayUtc());
  // "new-<dateStr>" (ISO) mentre si aggiunge una fascia nuova sulla colonna
  // di quella data esatta, "edit-<index>" mentre se ne modifica una
  // esistente — un solo editor inline alla volta.
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [draftStart, setDraftStart] = useState("09:00");
  const [draftEnd, setDraftEnd] = useState("13:00");
  // Due caselle indipendenti (richiesta esplicita dell'utente: "a
  // domicilio"/"online", almeno una obbligatoria per salvare), con la
  // propria capienza massima ciascuna.
  const [draftAllowsHome, setDraftAllowsHome] = useState(true);
  const [draftAllowsOnline, setDraftAllowsOnline] = useState(false);
  const [draftHomeMax, setDraftHomeMax] = useState("1");
  const [draftOnlineMax, setDraftOnlineMax] = useState("1");
  // Spunta "ripeti per tutti i <giorno> del mese" (richiesta esplicita
  // dell'utente): solo per una fascia nuova, mai per una già esistente in
  // modifica — resettata ad ogni apertura dell'editor.
  const [repeatForMonth, setRepeatForMonth] = useState(false);
  const [exceptionBusyDate, setExceptionBusyDate] = useState<string | null>(null);
  // Eliminazione massiva delle fasce (richiesta esplicita dell'utente): il
  // tasto "Modifica" NON apre una finestra separata — attiva invece una
  // modalità di selezione direttamente sul calendario "Disponibilità" già
  // esistente (funziona identica nelle viste Giorno/Settimana/Mese): un
  // click su una fascia la seleziona/deseleziona, più due scorciatoie per
  // selezionare in blocco un intero giorno o l'intero mese visualizzato.
  // "Elimina" rimuove le fasce selezionate dallo stato locale, persistito
  // solo al successivo "Salva agenda" — stesso principio già in uso per
  // l'eliminazione di una singola fascia.
  const [selectionMode, setSelectionMode] = useState(false);
  // Chiave composita `${index}:${dateStr}` (indice della fascia in `slots` +
  // data del calendario mostrata in quella cella), non il solo indice —
  // bug reale corretto: una fascia ricorrente storica (`date: null`) vale
  // per OGNI occorrenza futura del suo giorno della settimana
  // (slotAppliesOnDateStr), quindi lo stesso indice viene renderizzato in
  // celle diverse (settimane diverse, mesi diversi). Con la chiave sul solo
  // indice, selezionarla in una cella la faceva risultare "selezionata"
  // anche navigando altrove — mai toccata dall'utente. La data nella chiave
  // rende ogni occorrenza renderizzata indipendente dalle altre.
  const [selectedSlotKeys, setSelectedSlotKeys] = useState<Set<string>>(new Set());
  const [confirmingBulkDelete, setConfirmingBulkDelete] = useState(false);

  // Secondo calendario, indipendente dal primo (vista/data di navigazione
  // separate): mostra gli eventi reali invece delle regole di disponibilità
  // — richiesta esplicita dell'utente di avere entrambi i calendari, uno per
  // impostare gli orari e uno dove compaiono le prenotazioni.
  const [bookings, setBookings] = useState<ProfessionalBooking[] | null>(null);
  const [bookingsError, setBookingsError] = useState<string | null>(null);
  // Su schermi stretti la settimana a 7 colonne è illeggibile (testo
  // spezzato, chip invisibili): il default diventa "Giorno", da cui si
  // passa comunque a Settimana/Mese con i selettori. Rilevato una sola
  // volta all'avvio, senza listener: cambiare orientamento/larghezza dopo
  // non deve resettare la scelta fatta a mano dall'utente.
  const [bookingView, setBookingView] = useState<CalendarView>(() =>
    typeof window !== "undefined" && window.innerWidth < 640 ? "day" : "week",
  );
  const [bookingCurrentDate, setBookingCurrentDate] = useState(todayUtc());
  const [selectedBooking, setSelectedBooking] = useState<ProfessionalBooking | null>(null);
  const [isBookingActionPending, setIsBookingActionPending] = useState(false);
  const [isSavingBookingNote, setIsSavingBookingNote] = useState(false);
  const [isSavingMeetingLink, setIsSavingMeetingLink] = useState(false);
  // Cronologia completa della richiesta collegata, aperta dal pannello di
  // dettaglio (richiesta esplicita dell'utente: "cliccandoci sopra
  // inserisci un pulsante dove ti porta alla cronologia della richiesta
  // completa"). Serve il proprio profileId, non esposto altrove qui.
  const [myProfileId, setMyProfileId] = useState<string | null>(null);
  const [showBookingTimeline, setShowBookingTimeline] = useState(false);

  // Lavori presi al di fuori della piattaforma (richiesta esplicita
  // dell'utente: "dai la possibilità di inserire un lavoro preso al di
  // fuori della piattaforma, dove poter inserire tutti i dati utili per
  // effettuare l'intervento") — nessuna GuidedRequest/Quote dietro, gestiti
  // interamente dal professionista tramite ExternalJobModal, mostrati nello
  // stesso calendario "Prenotazioni" delle Booking reali.
  const [externalJobs, setExternalJobs] = useState<ExternalJob[] | null>(null);
  const [externalJobsError, setExternalJobsError] = useState<string | null>(null);
  const [selectedExternalJob, setSelectedExternalJob] = useState<ExternalJob | null>(null);
  const [creatingExternalJobFor, setCreatingExternalJobFor] = useState<Date | null>(null);

  // Preventivi inviati ma non ancora accettati (richiesta esplicita
  // dell'utente: una data/orario scelta per un preventivo — specialmente se
  // inserita a mano, non da una fascia dell'agenda — deve comunque comparire
  // da qualche parte sul calendario, così il professionista non se ne
  // dimentica né rischia di doppio-prenotarsi). Mostrati con l'etichetta
  // "In attesa" finché il cliente non accetta: nessun impatto su
  // AvailabilitySlot/capacità (una Quote non consuma mai capienza, solo una
  // Booking lo fa — invariato), puramente un promemoria visivo.
  const [leads, setLeads] = useState<ProfessionalLead[] | null>(null);

  // Ricerca full-text sul calendario "Prenotazioni" (richiesta esplicita
  // dell'utente): filtra Booking/ExternalJob/preventivi in attesa su
  // QUALSIASI campo, non solo nome/città/via — vedi AgendaListItem.searchText
  // e buildAgendaListItems più sotto. Quando valorizzata, sostituisce
  // l'intero CalendarShell (griglia Giorno/Settimana/Mese/Anno) con un
  // elenco piatto dei soli risultati: filtrare una griglia lasciando celle
  // vuote sparse in giro non avrebbe senso, un elenco sì.
  const [agendaSearchQuery, setAgendaSearchQuery] = useState("");

  useEffect(() => {
    if (!token) return;
    apiClient
      .getMyAvailability(token)
      .then((existing) => {
        // Stessa cautela della pagina profilo pubblico: non fidarsi
        // ciecamente della forma della risposta se l'API non è ancora
        // allineata all'ultimo deploy del frontend.
        if (!Array.isArray(existing?.slots)) return;
        setSlots(
          existing.slots.map((s) => ({
            id: s.id,
            dayOfWeek: s.dayOfWeek,
            date: s.date,
            start: s.startTime,
            end: s.endTime,
            allowsHome: s.allowsHome,
            allowsOnline: s.allowsOnline,
            homeMax: s.homeMaxBookings,
            onlineMax: s.onlineMaxBookings,
            hasUpcomingBooking: s.hasUpcomingBooking,
          })),
        );
        setExceptionDates(Array.isArray(existing.exceptionDates) ? existing.exceptionDates : []);
      })
      .catch((err) => {
        // Bug reale segnalato dall'utente: senza questo controllo, un
        // professionista che apre "Agenda" (nuova voce di menu) prima di
        // aver salvato il profilo base in /dashboard/profilo poteva
        // compilare e "salvare" l'agenda normalmente, ma il salvataggio
        // falliva silenziosamente con un piccolo testo d'errore facile da
        // non notare ("Completa prima il tuo profilo professionista") —
        // sembrava che l'agenda non si salvasse. Stesso pattern già usato
        // in /dashboard per lo stesso identico caso.
        if (err instanceof Error && err.message.includes("profilo")) {
          setProfileMissing(true);
        }
      })
      .finally(() => setIsLoadingSlots(false));
  }, [token]);

  useEffect(() => {
    if (!token) return;
    apiClient
      .myProfessionalBookings(token)
      .then(setBookings)
      .catch((err) => setBookingsError(err instanceof Error ? err.message : "Errore nel caricamento delle prenotazioni."));
  }, [token]);

  // Deep-link "Vedi in agenda" da /dashboard/richieste (?booking=<id>) —
  // bug reale segnalato dall'utente: il link portava sempre alla data
  // odierna del calendario "Prenotazioni", che il più delle volte non è
  // la data del preventivo appena accettato (spesso settimane avanti/
  // indietro) — la prenotazione esisteva ma non compariva da nessuna
  // parte nella vista mostrata, sembrando "mancante". Una volta che
  // `bookings` è caricato, se l'id in URL corrisponde a una prenotazione
  // reale: la vista "Prenotazioni" naviga alla sua data esatta (vista
  // "Giorno", sempre visibile a prescindere da settimana/mese) e apre
  // subito il pannello di dettaglio — non basta "essere sulla data
  // giusta", l'utente deve vedere concretamente la prenotazione aperta.
  // `consumedRef` evita di ripetere il salto se `bookings` si ricarica
  // (es. dopo un'azione sul pannello) mentre l'utente ha già navigato
  // altrove.
  const consumedBookingDeepLinkRef = useRef(false);
  useEffect(() => {
    if (consumedBookingDeepLinkRef.current) return;
    if (!bookings) return;
    const targetId = searchParams.get("booking");
    if (!targetId) {
      consumedBookingDeepLinkRef.current = true;
      return;
    }
    const match = bookings.find((b) => b.id === targetId);
    if (match) {
      setActiveTab("prenotazioni");
      setBookingView("day");
      setBookingCurrentDate(startOfDayUtc(new Date(match.scheduledAt)));
      setSelectedBooking(match);
    }
    consumedBookingDeepLinkRef.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookings]);

  useEffect(() => {
    if (!token) return;
    apiClient
      .myExternalJobs(token)
      .then(setExternalJobs)
      .catch((err) => setExternalJobsError(err instanceof Error ? err.message : "Errore nel caricamento dei lavori esterni."));
  }, [token]);

  useEffect(() => {
    if (!token) return;
    apiClient.myLeads(token).then(setLeads).catch(() => {});
  }, [token]);

  useEffect(() => {
    if (!token) return;
    apiClient
      .getMyProfessionalProfile(token)
      .then((profile) => setMyProfileId(profile?.id ?? null))
      .catch(() => {});
  }, [token]);

  // Riflette l'errore "dal vivo" dell'editor anche sotto lo schema del
  // calendario (richiesta esplicita dell'utente), non solo nel piccolo
  // riquadro di modifica: si aggiorna mentre si scelgono gli orari e si
  // pulisce da solo quando l'editor si chiude (Annulla/Salva/Rimuovi).
  // Deve stare prima dei return condizionali qui sotto (regola degli hook:
  // stesso numero/ordine di hook ad ogni render) — editingDayOfWeek/
  // slotEditorLiveError sono function declaration, quindi già disponibili
  // per hoisting anche se definite più in basso nel corpo del componente.
  useEffect(() => {
    const dayOfWeek = editingDayOfWeek();
    if (dayOfWeek === null) {
      setError(null);
      return;
    }
    const editIndex = editingKey?.startsWith("edit-") ? Number(editingKey.slice(5)) : null;
    setError(slotEditorLiveError(dayOfWeek, editIndex));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftStart, draftEnd, draftAllowsHome, draftAllowsOnline, editingKey, slots]);

  async function handleBookingAction(status: "CONFIRMED" | "COMPLETED" | "CANCELED") {
    if (!token || !selectedBooking) return;
    setIsBookingActionPending(true);
    try {
      if (status === "CANCELED") {
        // Riusa lo stesso endpoint di updateStatus (lato professionista è
        // sempre concesso annullare/completare/confermare una propria
        // prenotazione, a differenza del cliente che può solo annullare la
        // propria — vedi BookingsService.updateStatus vs cancelForClient).
        await apiClient.updateBookingStatus(token, selectedBooking.id, "CANCELED");
      } else {
        await apiClient.updateBookingStatus(token, selectedBooking.id, status);
      }
      setBookings((prev) => (prev ? prev.map((b) => (b.id === selectedBooking.id ? { ...b, status } : b)) : prev));
      setSelectedBooking(null);
    } catch (err) {
      setBookingsError(err instanceof Error ? err.message : "Errore imprevisto, riprova.");
    } finally {
      setIsBookingActionPending(false);
    }
  }

  // Nota privata del professionista (richiesta esplicita dell'utente:
  // "eventuali note da ricordare") — mai vista dal cliente, salvata
  // indipendentemente dallo stato della prenotazione.
  async function handleSaveBookingNote(note: string) {
    if (!token || !selectedBooking) return;
    setIsSavingBookingNote(true);
    try {
      const result = await apiClient.updateBookingNote(token, selectedBooking.id, { note });
      setBookings((prev) => (prev ? prev.map((b) => (b.id === selectedBooking.id ? { ...b, professionalNote: result.professionalNote } : b)) : prev));
      setSelectedBooking((prev) => (prev ? { ...prev, professionalNote: result.professionalNote } : prev));
    } catch (err) {
      setBookingsError(err instanceof Error ? err.message : "Errore imprevisto, riprova.");
    } finally {
      setIsSavingBookingNote(false);
    }
  }

  // Link consulenza video (Meet/Zoom/ecc., richiesta esplicita dell'utente)
  // — a differenza della nota sopra, questo è visibile al cliente.
  async function handleSaveMeetingLink(meetingLink: string) {
    if (!token || !selectedBooking) return;
    setIsSavingMeetingLink(true);
    try {
      const result = await apiClient.updateBookingMeetingLink(token, selectedBooking.id, { meetingLink });
      setBookings((prev) => (prev ? prev.map((b) => (b.id === selectedBooking.id ? { ...b, meetingLink: result.meetingLink } : b)) : prev));
      setSelectedBooking((prev) => (prev ? { ...prev, meetingLink: result.meetingLink } : prev));
    } catch (err) {
      setBookingsError(err instanceof Error ? err.message : "Errore imprevisto, riprova.");
    } finally {
      setIsSavingMeetingLink(false);
    }
  }

  if (isLoading || (token && isLoadingSlots)) return null;

  if (!user || !token) {
    return (
      <YStack width="100%" alignItems="center" backgroundColor={brand.gesso} paddingVertical="$9" paddingHorizontal="$4">
        <YStack width="100%" maxWidth={480} gap="$4" alignItems="center">
          <Text fontFamily="$heading" fontWeight="800" fontSize="$7" color={brand.grafite} textAlign="center">
            Accedi come professionista
          </Text>
          <Link href="/accedi?redirect=/dashboard/agenda" style={{ textDecoration: "none" }}>
            <Button variant="primary">Accedi</Button>
          </Link>
        </YStack>
      </YStack>
    );
  }

  if (!user.isProfessional) {
    return (
      <YStack width="100%" alignItems="center" backgroundColor={brand.gesso} paddingVertical="$9" paddingHorizontal="$4">
        <YStack width="100%" maxWidth={480} gap="$3" alignItems="center">
          <Text fontFamily="$heading" fontWeight="800" fontSize="$7" color={brand.grafite} textAlign="center">
            Questa sezione è per i professionisti
          </Text>
        </YStack>
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
            Serve un profilo completo (nome attività, categoria, città) prima di poter impostare l&apos;agenda.
          </Text>
          <Link href="/dashboard/profilo" style={{ textDecoration: "none" }}>
            <Button variant="primary">Completa profilo</Button>
          </Link>
        </YStack>
      </YStack>
    );
  }

  function startAddSlot(dayOfWeek: number, dateStr: string) {
    setError(null);
    setEditingKey(`new-${dateStr}`);
    setDraftStart("09:00");
    setDraftEnd("13:00");
    setDraftAllowsHome(true);
    setDraftAllowsOnline(false);
    setDraftHomeMax("1");
    setDraftOnlineMax("1");
    setRepeatForMonth(false);
  }

  function startEditSlot(index: number) {
    const slot = slots[index];
    if (!slot) return;
    setError(null);
    setEditingKey(`edit-${index}`);
    setDraftStart(slot.start);
    setDraftEnd(slot.end);
    setDraftAllowsHome(slot.allowsHome);
    setDraftAllowsOnline(slot.allowsOnline);
    setDraftHomeMax(String(slot.homeMax ?? 1));
    setDraftOnlineMax(String(slot.onlineMax ?? 1));
    setRepeatForMonth(false);
  }

  /** dayOfWeek della fascia attualmente in modifica (nuova o esistente), o null se nessun editor è aperto. */
  function editingDayOfWeek(): number | null {
    if (!editingKey) return null;
    if (editingKey.startsWith("new-")) return parseIsoDate(editingKey.slice(4)).getUTCDay();
    const index = Number(editingKey.slice(5));
    return slots[index]?.dayOfWeek ?? null;
  }

  /** Data ISO della fascia in modifica, se legata a una data esatta (null per una fascia ricorrente storica o nessun editor aperto). */
  function editingDateStr(): string | null {
    if (!editingKey) return null;
    if (editingKey.startsWith("new-")) return editingKey.slice(4);
    const index = Number(editingKey.slice(5));
    return slots[index]?.date ?? null;
  }

  /**
   * Fasce già salvate che potrebbero cadere nella stessa data di
   * `targetDateStr` (se nota) o nello stesso `targetDayOfWeek` per sempre
   * (fascia ricorrente storica, targetDateStr null) — stessa logica di
   * slotsShareAnOccurrence in professionalAvailabilitySchema
   * (packages/shared), calcolata qui lato client per il feedback "dal vivo".
   */
  function slotsSharingOccurrence(targetDateStr: string | null, targetDayOfWeek: number, excludeIndex: number | null): { slot: SlotDraft; index: number }[] {
    return slots
      .map((slot, index) => ({ slot, index }))
      .filter(({ slot, index }) => {
        if (index === excludeIndex) return false;
        if (targetDateStr) return slotAppliesOnDateStr(slot, targetDateStr);
        return slot.date ? parseIsoDate(slot.date).getUTCDay() === targetDayOfWeek : slot.dayOfWeek === targetDayOfWeek;
      });
  }

  // Sovrapposizione controllata "dal vivo" mentre si scelgono gli orari,
  // non solo al momento di cliccare "Salva agenda" (richiesta esplicita
  // dell'utente): stessa logica di professionalAvailabilitySchema
  // (packages/shared) ma calcolata subito lato client, senza aspettare il
  // round-trip col server.
  function slotEditorLiveError(dayOfWeek: number, excludeIndex: number | null): string | null {
    if (draftEnd <= draftStart) {
      return "L'orario di fine deve essere dopo l'orario di inizio.";
    }
    if (!draftAllowsHome && !draftAllowsOnline) {
      return "Seleziona almeno una modalità (a domicilio o online).";
    }
    const dateStr = editingDateStr();
    const overlaps = slotsSharingOccurrence(dateStr, dayOfWeek, excludeIndex).some(({ slot }) => slotsOverlap(draftStart, draftEnd, slot.start, slot.end));
    return overlaps ? "Questa fascia si sovrappone a un'altra già impostata per questo giorno." : null;
  }

  /** Indici delle fasce già salvate che la fascia in modifica sta sovrapponendo — per colorarle di rosso anche loro, non solo il riquadro in modifica. */
  function conflictingSlotIndexes(dayOfWeek: number, excludeIndex: number | null): Set<number> {
    const result = new Set<number>();
    if (draftEnd <= draftStart) return result;
    const dateStr = editingDateStr();
    for (const { slot, index } of slotsSharingOccurrence(dateStr, dayOfWeek, excludeIndex)) {
      if (slotsOverlap(draftStart, draftEnd, slot.start, slot.end)) result.add(index);
    }
    return result;
  }

  function commitSlotEdit(dayOfWeek: number) {
    const editIndex = editingKey?.startsWith("edit-") ? Number(editingKey.slice(5)) : null;
    if (!draftAllowsHome && !draftAllowsOnline) {
      setError("Seleziona almeno una modalità (a domicilio o online).");
      return;
    }
    const homeMax = draftAllowsHome ? Math.max(1, Math.min(20, Math.round(Number(draftHomeMax)) || 1)) : null;
    const onlineMax = draftAllowsOnline ? Math.max(1, Math.min(20, Math.round(Number(draftOnlineMax)) || 1)) : null;

    if (editingKey?.startsWith("new-")) {
      const anchorDateStr = editingKey.slice(4);
      // "Ripeti per tutti i <giorno> del mese" (richiesta esplicita
      // dell'utente): una fascia per ciascuna data del mese corrente con lo
      // stesso giorno della settimana, invece di una ricorrenza aperta.
      const targetDates = repeatForMonth ? datesInMonthForWeekday(anchorDateStr) : [anchorDateStr];
      for (const targetDateStr of targetDates) {
        const overlaps = slotsSharingOccurrence(targetDateStr, dayOfWeek, null).some(({ slot }) => slotsOverlap(draftStart, draftEnd, slot.start, slot.end));
        if (overlaps) {
          setError(
            targetDates.length > 1
              ? `Questa fascia si sovrapporrebbe a un'altra già impostata il ${targetDateStr}.`
              : "Questa fascia si sovrappone a un'altra già impostata per questo giorno.",
          );
          return;
        }
      }
      const next = [
        ...slots,
        ...targetDates.map((date) => ({
          dayOfWeek,
          date,
          start: draftStart,
          end: draftEnd,
          allowsHome: draftAllowsHome,
          allowsOnline: draftAllowsOnline,
          homeMax,
          onlineMax,
        })),
      ];
      setSlots(next);
      void persistSlots(next);
    } else if (editIndex !== null) {
      const original = slots[editIndex];
      if (!original) return;

      // Spunta "Applica anche a tutti i <giorno> del mese" mentre si
      // modifica una fascia già esistente (richiesta esplicita dell'utente:
      // cambiare la capienza — o l'orario — da un giorno e propagarla a
      // tutte le stesse occorrenze del mese, non solo a quel giorno). Solo
      // per fasce legate a una data esatta (original.date): una fascia
      // ricorrente storica non ha un mese su cui scoping ha senso, vale già
      // per ogni occorrenza. Le fasce "gemelle" sono quelle con lo stesso
      // giorno della settimana nel mese E lo stesso orario originale — cioè
      // la stessa fascia ripetuta su più giorni, non qualunque altra fascia
      // che capita di cadere lo stesso giorno.
      if (repeatForMonth && original.date) {
        const monthAnchor = parseIsoDate(original.date);
        const targetDates = datesInMonthForGivenWeekday(monthAnchor, dayOfWeek);
        const matchingIndexes = new Set(
          slots
            .map((s, i) => i)
            .filter((i) => i === editIndex || (slots[i]!.date !== null && targetDates.includes(slots[i]!.date!) && slots[i]!.start === original.start && slots[i]!.end === original.end)),
        );

        for (const targetDateStr of targetDates) {
          const overlaps = slotsSharingOccurrence(targetDateStr, dayOfWeek, null)
            .filter(({ index }) => !matchingIndexes.has(index))
            .some(({ slot }) => slotsOverlap(draftStart, draftEnd, slot.start, slot.end));
          if (overlaps) {
            setError(`Questa fascia si sovrapporrebbe a un'altra già impostata il ${targetDateStr}.`);
            return;
          }
        }

        const next = slots.map((s, i) =>
          matchingIndexes.has(i)
            ? { ...s, start: draftStart, end: draftEnd, allowsHome: draftAllowsHome, allowsOnline: draftAllowsOnline, homeMax, onlineMax }
            : s,
        );
        setSlots(next);
        void persistSlots(next);
      } else {
        const liveError = slotEditorLiveError(dayOfWeek, editIndex);
        if (liveError) {
          setError(liveError);
          return;
        }
        const next = slots.map((s, i) =>
          i === editIndex
            ? { ...s, start: draftStart, end: draftEnd, allowsHome: draftAllowsHome, allowsOnline: draftAllowsOnline, homeMax, onlineMax }
            : s,
        );
        setSlots(next);
        void persistSlots(next);
      }
    }
    setEditingKey(null);
    setError(null);
  }

  // La rimozione ora avviene solo dal pop-up di modifica (SlotEditorModal),
  // non più da un tasto "×" sulla fascia: su cellulare quella "×" si
  // sovrapponeva al riquadro della fascia, poco chiara — richiesta esplicita
  // dell'utente. La doppia conferma per le fasce con prenotazioni future
  // vive ora dentro il pop-up stesso (stato locale lì).
  function deleteSlot(index: number) {
    const next = slots.filter((_, i) => i !== index);
    setSlots(next);
    setEditingKey(null);
    setError(null);
    void persistSlots(next);
  }

  function toggleSelectionMode() {
    setSelectionMode((v) => !v);
    setSelectedSlotKeys(new Set());
    setConfirmingBulkDelete(false);
  }

  function slotKey(index: number, dateStr: string) {
    return `${index}:${dateStr}`;
  }

  /** Click diretto su una singola occorrenza (SlotChip) — sempre per quella sola data mostrata in quella colonna/cella, mai per l'intera fascia ricorrente. */
  function toggleSlotSelection(index: number, dateStr: string) {
    const key = slotKey(index, dateStr);
    setSelectedSlotKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  /**
   * Seleziona/deseleziona in blocco tutte le fasce che valgono per `date` —
   * scorciatoia "tutto il giorno" richiesta esplicitamente dall'utente.
   *
   * La chiave di selezione ora include sempre la data della cella
   * (`slotKey`), non il solo indice della fascia: una fascia ricorrente
   * storica (`date: null`) vale per ogni occorrenza futura del suo giorno
   * della settimana, ma selezionarla "per un giorno" genera una chiave
   * legata a QUELLA sola data — non risulta più selezionata navigando su
   * un'altra settimana/mese con lo stesso giorno della settimana (bug
   * reale corretto: prima la chiave era il solo indice, condiviso da ogni
   * occorrenza).
   */
  function toggleDaySelection(date: Date) {
    const dateStr = toIsoDate(date);
    const dayIndexes = slots.map((_, i) => i).filter((i) => slotAppliesOnDateStr(slots[i]!, dateStr));
    if (dayIndexes.length === 0) return;
    const keys = dayIndexes.map((i) => slotKey(i, dateStr));
    const allSelected = keys.every((k) => selectedSlotKeys.has(k));
    setSelectedSlotKeys((prev) => {
      const next = new Set(prev);
      keys.forEach((k) => (allSelected ? next.delete(k) : next.add(k)));
      return next;
    });
  }

  /**
   * Seleziona/deseleziona in blocco tutte le fasce del mese attualmente
   * visualizzato — scorciatoia "tutto il mese" richiesta esplicitamente
   * dall'utente. Una chiave per occorrenza-data (non per indice) tiene la
   * selezione scoped esattamente alle date del mese mostrato, anche per le
   * fasce ricorrenti storiche che ricorrono più volte nello stesso mese.
   */
  function toggleMonthSelection() {
    const monthDates = datesInMonth(currentDate);
    const keys: string[] = [];
    slots.forEach((slot, i) => {
      monthDates.forEach((d) => {
        if (slotAppliesOnDateStr(slot, d)) keys.push(slotKey(i, d));
      });
    });
    if (keys.length === 0) return;
    const allSelected = keys.every((k) => selectedSlotKeys.has(k));
    setSelectedSlotKeys((prev) => {
      const next = new Set(prev);
      keys.forEach((k) => (allSelected ? next.delete(k) : next.add(k)));
      return next;
    });
  }

  /**
   * Rimuove in blocco le fasce selezionate. Le chiavi selezionate sono per
   * occorrenza (indice+data), ma un indice va comunque tolto da `slots` una
   * sola volta: più occorrenze della stessa fascia ricorrente storica
   * selezionate insieme (es. "tutto il mese" su una fascia settimanale)
   * mappano allo stesso indice sottostante — eliminarlo rimuove l'intera
   * riga (ogni occorrenza futura), non solo quelle scelte: è un vincolo del
   * modello dati (nessun'eccezione per singola data su una fascia
   * ricorrente), non un effetto collaterale di questo cambio.
   */
  function deleteSelectedSlots() {
    const selectedIndexes = new Set(Array.from(selectedSlotKeys).map((k) => Number(k.slice(0, k.indexOf(":")))));
    const next = slots.filter((_, i) => !selectedIndexes.has(i));
    setSlots(next);
    setSelectionMode(false);
    setSelectedSlotKeys(new Set());
    setConfirmingBulkDelete(false);
    setError(null);
    void persistSlots(next);
  }

  async function toggleException(dateStr: string) {
    if (!token) return;
    setExceptionBusyDate(dateStr);
    setError(null);
    try {
      const res = exceptionDates.includes(dateStr)
        ? await apiClient.removeAvailabilityException(token, dateStr)
        : await apiClient.addAvailabilityException(token, dateStr);
      setExceptionDates(res.exceptionDates);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore imprevisto, riprova.");
    } finally {
      setExceptionBusyDate(null);
    }
  }

  // Salvataggio diretto ad ogni operazione (richiesta esplicita
  // dell'utente, "Verbale Cognitivo" F4.1: il bottone "Salva agenda" a sé
  // stante era ridondante — impostare un orario passa già dal proprio
  // "Salva" nel pop-up dedicato, eliminare una fascia ha già una conferma
  // dedicata) — nessun bottone di salvataggio generale della pagina: ogni
  // funzione che cambia `slots` calcola il nuovo array e lo passa qui
  // subito dopo `setSlots`, mai un salvataggio rimandato a un secondo
  // click. Riceve l'array esplicito (non legge `slots` dallo stato) per
  // evitare una closure stale nelle chiamate ravvicinate.
  async function persistSlots(nextSlots: SlotDraft[]) {
    setError(null);
    for (const slot of nextSlots) {
      if (slot.end <= slot.start) {
        setError("L'orario di fine deve essere dopo l'orario di inizio in ogni fascia.");
        return;
      }
    }

    setIsSubmitting(true);
    try {
      await apiClient.upsertMyAvailability(
        token as string,
        nextSlots.map((slot) => ({
          dayOfWeek: slot.dayOfWeek,
          startTime: slot.start,
          endTime: slot.end,
          allowsHome: slot.allowsHome,
          allowsOnline: slot.allowsOnline,
          homeMaxBookings: slot.allowsHome ? (slot.homeMax ?? 1) : undefined,
          onlineMaxBookings: slot.allowsOnline ? (slot.onlineMax ?? 1) : undefined,
          date: slot.date ?? undefined,
        })),
      );
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      if (err instanceof Error && err.message.includes("profilo")) {
        setProfileMissing(true);
        return;
      }
      setError(err instanceof Error ? err.message : "Errore imprevisto, riprova.");
    } finally {
      setIsSubmitting(false);
    }
  }

  function renderDayColumn(date: Date) {
    const dayOfWeek = date.getUTCDay();
    const dateStr = toIsoDate(date);
    const isPast = date < todayUtc();
    const isClosed = exceptionDates.includes(dateStr);
    const daySlots = slots
      .map((slot, index) => ({ slot, index }))
      .filter(({ slot }) => slotAppliesOnDateStr(slot, dateStr))
      .sort((a, b) => a.slot.start.localeCompare(b.slot.start));
    // Fasce già salvate colorate di rosso anche loro quando quella in
    // modifica ci si sovrappone (richiesta esplicita dell'utente), non
    // solo il riquadro dell'editor.
    const editIndexForThisDay = editingKey?.startsWith("edit-") ? Number(editingKey.slice(5)) : null;
    const editingSlot = editIndexForThisDay !== null ? slots[editIndexForThisDay] : undefined;
    const isEditingThisDay = editingKey === `new-${dateStr}` || (editingSlot !== undefined && slotAppliesOnDateStr(editingSlot, dateStr));
    const conflicts = isEditingThisDay ? conflictingSlotIndexes(dayOfWeek, editIndexForThisDay) : new Set<number>();

    // Modalità selezione (tasto "Modifica", richiesta esplicita
    // dell'utente): niente aggiunta/chiusura giorno, solo selezione delle
    // fasce già presenti + scorciatoia "tutto il giorno" per questa colonna.
    if (selectionMode) {
      // Chiave per occorrenza (indice+data di questa colonna): tutte le
      // fasce che compaiono in questa colonna partecipano ora allo
      // scorciatoia "tutto il giorno", incluse le fasce ricorrenti
      // storiche — la chiave le lega comunque solo a QUESTA data, non ad
      // ogni occorrenza futura (vedi toggleDaySelection sopra).
      const allDaySelected = daySlots.length > 0 && daySlots.every(({ index }) => selectedSlotKeys.has(slotKey(index, dateStr)));
      return (
        <YStack gap="$2" minWidth={0}>
          {daySlots.length > 0 ? (
            <XStack
              alignItems="center"
              gap={5}
              cursor="pointer"
              onPress={() => toggleDaySelection(date)}
              accessibilityRole="button"
              accessibilityLabel={allDaySelected ? "Deseleziona giorno" : "Seleziona giorno"}
            >
              <SelectionCheckbox checked={allDaySelected} />
              <Text
                fontFamily="$mono"
                fontSize={9}
                fontWeight="700"
                letterSpacing={0.2}
                color={allDaySelected ? brand.cianografia : brand.grafite70}
              >
                {allDaySelected ? "Giorno selezionato" : "Seleziona giorno"}
              </Text>
            </XStack>
          ) : null}
          {daySlots.map(({ slot, index }) => (
            <SlotChip
              key={index}
              slot={slot}
              isConflicting={false}
              isEditing={false}
              // Il click diretto seleziona sempre e solo l'occorrenza
              // mostrata in questa colonna (chiave indice+data): per una
              // fascia ricorrente storica, selezionarla qui non la fa
              // risultare selezionata navigando su un'altra
              // settimana/mese con lo stesso giorno della settimana — bug
              // reale corretto (prima la chiave era il solo indice,
              // condiviso da ogni occorrenza). Eliminarla rimuove comunque
              // l'intera riga/ogni occorrenza futura: vincolo del modello
              // dati (nessuna eccezione per singola data su una fascia
              // ricorrente), non di questa selezione.
              isSelected={selectedSlotKeys.has(slotKey(index, dateStr))}
              onEdit={() => toggleSlotSelection(index, dateStr)}
            />
          ))}
        </YStack>
      );
    }

    return (
      <YStack gap="$2" minWidth={0}>
        {!isPast ? (
          <XStack
            alignItems="center"
            gap="$1"
            minWidth={0}
            cursor="pointer"
            opacity={exceptionBusyDate === dateStr ? 0.5 : 1}
            onPress={() => toggleException(dateStr)}
            accessibilityRole="button"
          >
            <Text fontFamily="$mono" fontSize={9} fontWeight="600" letterSpacing={0.2} color={isClosed ? brand.verificato : brand.urgenza}>
              {isClosed ? "↺ Riapri" : "✕ Chiudi"}
            </Text>
          </XStack>
        ) : null}

        {isClosed ? (
          <Text fontFamily="$body" fontSize={11} fontWeight="700" color={brand.urgenza}>
            Chiuso
          </Text>
        ) : (
          <>
            {daySlots.map(({ slot, index }) => (
              <SlotChip
                key={index}
                slot={slot}
                isConflicting={conflicts.has(index)}
                isEditing={editingKey === `edit-${index}`}
                onEdit={() => startEditSlot(index)}
              />
            ))}
            {/*
              Un giorno già passato non può ricevere nuove fasce: una fascia
              con `date` nel passato non compare mai più da nessuna parte
              (getPublicAgenda/getMyAvailableSlots filtrano sempre da oggi in
              poi) — bug reale segnalato dall'utente ("clicco proponi altra
              data e non vedo le disponibilità"): la vista Settimana mostra
              di default l'intera settimana corrente, che può includere
              giorni già trascorsi se oggi non è lunedì, e il tasto "+" era
              comunque cliccabile lì, creando fasce orfane senza alcun avviso.
            */}
            {!isPast ? (
              <XStack
                height={34}
                borderWidth={1.5}
                borderStyle="dashed"
                borderColor={brand.cianografia}
                borderRadius="$2"
                alignItems="center"
                justifyContent="center"
                cursor="pointer"
                backgroundColor={editingKey === `new-${dateStr}` ? brand.cianografiaVelo : undefined}
                onPress={() => startAddSlot(dayOfWeek, dateStr)}
                accessibilityRole="button"
                accessibilityLabel="Aggiungi fascia oraria"
              >
                <Icon name="plus" size={16} strokeWidth={2.5} color={brand.cianografia} />
              </XStack>
            ) : daySlots.length === 0 ? (
              <Text fontFamily="$mono" fontSize={9} fontWeight="600" letterSpacing={0.2} color={brand.grafite70}>
                Giorno passato
              </Text>
            ) : null}
          </>
        )}
      </YStack>
    );
  }

  function renderMonthCell(date: Date) {
    const dateStr = toIsoDate(date);
    if (exceptionDates.includes(dateStr)) {
      return (
        <Text fontFamily="$body" fontSize={9} fontWeight="700" color={brand.urgenza}>
          Chiuso
        </Text>
      );
    }
    const daySlotsWithIndex = slots.map((s, i) => ({ s, i })).filter(({ s }) => slotAppliesOnDateStr(s, dateStr));
    if (daySlotsWithIndex.length === 0) return null;
    // In modalità selezione un click sulla cella seleziona/deseleziona
    // l'intero giorno (vedi onSelectDay più sotto): un segno di spunta
    // sostituisce i puntini quando tutte le fasce di quel giorno sono già
    // selezionate, per capire a colpo d'occhio quali giorni sono scelti
    // anche dalla vista Mese.
    if (selectionMode) {
      // Chiave per occorrenza (indice+data di questa cella): ogni fascia
      // che compare in questa cella, incluse le ricorrenti storiche, ora
      // partecipa alla selezione — la chiave la lega solo a QUESTA data,
      // non a ogni cella con lo stesso giorno della settimana in qualunque
      // mese (bug reale corretto, segnalato dall'utente come "clicco un
      // giorno e seleziona l'intera colonna" / "in mensile non si
      // seleziona" con una chiave sul solo indice).
      const allSelected = daySlotsWithIndex.length > 0 && daySlotsWithIndex.every(({ i }) => selectedSlotKeys.has(slotKey(i, dateStr)));
      return (
        <XStack alignItems="center" gap={4}>
          <SelectionCheckbox checked={allSelected} />
          <Text fontFamily="$mono" fontSize={9} fontWeight="700" color={allSelected ? brand.cianografia : brand.grafite70}>
            {daySlotsWithIndex.length}
          </Text>
        </XStack>
      );
    }
    const daySlots = daySlotsWithIndex.map(({ s }) => s);
    return (
      <XStack gap={3} flexWrap="wrap" alignItems="center">
        {daySlots.slice(0, 4).map((s, i) => (
          <YStack key={i} width={6} height={6} borderRadius={3} backgroundColor={isSlotGeneric(s) ? brand.ottone : brand.cianografia} />
        ))}
        {daySlots.length > 4 ? (
          <Text fontFamily="$mono" fontSize={9} color={brand.grafite70}>
            +{daySlots.length - 4}
          </Text>
        ) : null}
      </XStack>
    );
  }

  function bookingsOnDate(date: Date): ProfessionalBooking[] {
    const dateStr = toIsoDate(date);
    return (bookings ?? [])
      .filter((b) => b.scheduledAt.slice(0, 10) === dateStr)
      .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
  }

  function externalJobsOnDate(date: Date): ExternalJob[] {
    const dateStr = toIsoDate(date);
    return (externalJobs ?? [])
      .filter((j) => j.scheduledAt.slice(0, 10) === dateStr)
      .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
  }

  // Preventivi ancora in attesa di risposta del cliente (SENT o
  // MODIFICATION_REQUESTED — quest'ultimo mostra comunque la data
  // attualmente proposta dal professionista, non quella in trattativa) la
  // cui data proposta cade su questo giorno — richiesta esplicita
  // dell'utente. `bookingStatus === null` esclude i preventivi già accettati
  // (a quel punto esiste una Booking reale, già mostrata da
  // `bookingsOnDate` — evita di mostrare la stessa data due volte).
  function pendingQuotesOnDate(date: Date): ProfessionalLead[] {
    const dateStr = toIsoDate(date);
    return (leads ?? [])
      .filter(
        (lead) =>
          lead.quote &&
          lead.quote.bookingStatus === null &&
          (lead.quote.status === "SENT" || lead.quote.status === "MODIFICATION_REQUESTED") &&
          lead.quote.estimatedStartDate.slice(0, 10) === dateStr,
      )
      .sort((a, b) => a.quote!.estimatedStartDate.localeCompare(b.quote!.estimatedStartDate));
  }

  function renderBookingDayColumn(date: Date) {
    const dayBookings = bookingsOnDate(date);
    const dayExternalJobs = externalJobsOnDate(date);
    const dayPendingQuotes = pendingQuotesOnDate(date);
    if (dayBookings.length === 0 && dayExternalJobs.length === 0 && dayPendingQuotes.length === 0) {
      return (
        <Text fontSize={11} color={brand.grafite70}>
          Nessuna prenotazione.
        </Text>
      );
    }
    // Vista Settimana: colonna stretta, solo l'orario (niente nome cliente,
    // che essendo di lunghezza variabile è quello che non ci stava dentro) —
    // richiesta esplicita dell'utente, stesso principio già applicato a
    // SlotChip nel calendario "Disponibilità". Vista Giorno: molto più
    // spazio per colonna (una sola), il nome cliente resta.
    const compact = bookingView === "week";
    return (
      <YStack gap="$2" minWidth={0}>
        {dayBookings.map((booking) => {
          // Fascia completa (richiesta esplicita dell'utente: "fai
          // visualizzare la fascia oraria completa"), non solo l'inizio —
          // resta su una sola riga anche in vista Settimana (numberOfLines
          // già presente sotto), stesso principio già applicato altrove
          // nell'agenda (BookingDetailPanel, AcceptedJobCard).
          const startTime = new Date(booking.scheduledAt).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
          const time = booking.scheduledEndAt
            ? `${startTime}–${new Date(booking.scheduledEndAt).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}`
            : startTime;
          const isCanceled = booking.status === "CANCELED" || booking.status === "NO_SHOW";
          return (
            <YStack
              key={booking.id}
              minWidth={0}
              borderLeftWidth={3}
              borderLeftColor={BOOKING_STATUS_COLOR[booking.status]}
              backgroundColor={brand.gesso}
              borderRadius="$2"
              paddingHorizontal={compact ? "$1.5" : "$2"}
              paddingVertical={compact ? 5 : "$2"}
              gap={compact ? 0 : "$1"}
              cursor="pointer"
              opacity={isCanceled ? 0.6 : 1}
              onPress={() => setSelectedBooking(booking)}
              accessibilityRole="button"
            >
              <Text
                fontFamily="$mono"
                fontSize={compact ? 10 : 10.5}
                fontWeight="700"
                color={brand.grafite}
                textDecorationLine={isCanceled ? "line-through" : "none"}
                numberOfLines={1}
              >
                {time}
              </Text>
              {!compact ? (
                <Text fontSize={10.5} color={brand.grafite70}>
                  {booking.clientName ?? "Cliente"}
                </Text>
              ) : null}
            </YStack>
          );
        })}
        {dayExternalJobs.map((job) => {
          const startTime = new Date(job.scheduledAt).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
          const time = job.scheduledEndAt
            ? `${startTime}–${new Date(job.scheduledEndAt).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}`
            : startTime;
          const isCanceled = job.status === "CANCELED";
          return (
            <YStack
              key={job.id}
              minWidth={0}
              borderLeftWidth={3}
              borderStyle="dashed"
              borderLeftColor={EXTERNAL_JOB_STATUS_COLOR[job.status]}
              backgroundColor={brand.gesso}
              borderRadius="$2"
              paddingHorizontal={compact ? "$1.5" : "$2"}
              paddingVertical={compact ? 5 : "$2"}
              gap={compact ? 0 : "$1"}
              cursor="pointer"
              opacity={isCanceled ? 0.6 : 1}
              onPress={() => setSelectedExternalJob(job)}
              accessibilityRole="button"
            >
              <Text
                fontFamily="$mono"
                fontSize={compact ? 10 : 10.5}
                fontWeight="700"
                color={brand.grafite}
                textDecorationLine={isCanceled ? "line-through" : "none"}
                numberOfLines={1}
              >
                {time} · Esterno
              </Text>
              {!compact ? (
                <Text fontSize={10.5} color={brand.grafite70}>
                  {job.clientName}
                </Text>
              ) : null}
            </YStack>
          );
        })}
        {dayPendingQuotes.map((lead) => {
          const quote = lead.quote!;
          const startTime = new Date(quote.estimatedStartDate).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
          const time = quote.estimatedEndDate
            ? `${startTime}–${new Date(quote.estimatedEndDate).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}`
            : startTime;
          const clientName = lead.guidedRequest.clientAccountDeleted ? "Account eliminato" : (lead.guidedRequest.clientName ?? "Cliente");
          return (
            <YStack
              key={lead.id}
              minWidth={0}
              borderLeftWidth={3}
              borderStyle="dashed"
              borderLeftColor={PENDING_QUOTE_COLOR}
              backgroundColor={brand.gesso}
              borderRadius="$2"
              paddingHorizontal={compact ? "$1.5" : "$2"}
              paddingVertical={compact ? 5 : "$2"}
              gap={compact ? 0 : "$1"}
              cursor="pointer"
              onPress={() => router.push("/dashboard/richieste")}
              accessibilityRole="button"
              accessibilityLabel={`Preventivo in attesa per ${clientName}, vai a Richieste ricevute`}
            >
              <Text fontFamily="$mono" fontSize={compact ? 10 : 10.5} fontWeight="700" color={brand.grafite} numberOfLines={1}>
                {time} · In attesa
              </Text>
              {!compact ? (
                <Text fontSize={10.5} color={brand.grafite70}>
                  {clientName}
                </Text>
              ) : null}
            </YStack>
          );
        })}
      </YStack>
    );
  }

  function renderBookingMonthCell(date: Date) {
    const dayBookings = bookingsOnDate(date);
    const dayExternalJobs = externalJobsOnDate(date);
    const dayPendingQuotes = pendingQuotesOnDate(date);
    const totalCount = dayBookings.length + dayExternalJobs.length + dayPendingQuotes.length;
    if (totalCount === 0) return null;
    return (
      <XStack gap={3} flexWrap="wrap" alignItems="center">
        {dayBookings.slice(0, 4).map((b) => (
          <YStack key={b.id} width={6} height={6} borderRadius={3} backgroundColor={BOOKING_STATUS_COLOR[b.status]} />
        ))}
        {dayExternalJobs.slice(0, Math.max(0, 4 - dayBookings.length)).map((j) => (
          <YStack key={j.id} width={6} height={6} borderRadius={1} backgroundColor={EXTERNAL_JOB_STATUS_COLOR[j.status]} />
        ))}
        {dayPendingQuotes.slice(0, Math.max(0, 4 - dayBookings.length - dayExternalJobs.length)).map((lead) => (
          <YStack key={lead.id} width={6} height={6} borderRadius={3} borderWidth={1} borderColor={PENDING_QUOTE_COLOR} backgroundColor="transparent" />
        ))}
        {totalCount > 4 ? (
          <Text fontFamily="$mono" fontSize={9} color={brand.grafite70}>
            +{totalCount - 4}
          </Text>
        ) : null}
      </XStack>
    );
  }

  /**
   * Elenco unificato di TUTTI gli eventi del calendario "Prenotazioni"
   * (Booking reali, lavori esterni, preventivi in attesa) — a differenza di
   * `bookingsOnDate`/`externalJobsOnDate`/`pendingQuotesOnDate` sopra (che
   * filtrano per un singolo giorno, usati dalla griglia) qui non c'è alcun
   * filtro di data: serve sia alla lista annuale (poi filtrata per anno da
   * chi la chiama) sia alla ricerca full-text (che deve poter trovare un
   * risultato passato o futuro, non solo nell'anno corrente). Ogni campo
   * "utile a un umano che deve svolgere l'intervento" entra in `searchText`
   * — richiesta esplicita dell'utente: "qualsiasi campo".
   */
  function buildAgendaListItems(): AgendaListItem[] {
    const bookingItems: AgendaListItem[] = (bookings ?? []).map((b) => {
      const clientName = b.clientAccountDeleted ? "Account eliminato" : (b.clientName ?? "Cliente");
      const recipientName = [b.recipientName, b.recipientSurname].filter(Boolean).join(" ");
      const addressParts = [b.street, b.houseNumber, b.addressExtra, b.postalCode, b.city, b.province, b.address];
      return {
        key: `booking-${b.id}`,
        date: new Date(b.scheduledAt),
        timeLabel: formatAgendaTimeRange(b.scheduledAt, b.scheduledEndAt),
        title: clientName,
        subtitle: b.categoryLabel ?? "Prenotazione",
        statusLabel: AGENDA_BOOKING_STATUS_LABEL[b.status],
        statusColor: BOOKING_STATUS_COLOR[b.status],
        dashed: false,
        searchText: [
          clientName,
          recipientName,
          b.clientPhone,
          b.clientEmail,
          b.recipientPhone,
          ...addressParts,
          b.categoryLabel,
          b.description,
          b.professionalNote,
          b.cancellationNote,
          AGENDA_BOOKING_STATUS_LABEL[b.status],
          ...b.items.map((i) => i.name),
          ...b.finalItems.map((i) => i.name),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase(),
        onPress: () => setSelectedBooking(b),
      };
    });

    const externalItems: AgendaListItem[] = (externalJobs ?? []).map((j) => ({
      key: `external-${j.id}`,
      date: new Date(j.scheduledAt),
      timeLabel: formatAgendaTimeRange(j.scheduledAt, j.scheduledEndAt),
      title: j.clientName,
      subtitle: "Lavoro esterno",
      statusLabel: AGENDA_EXTERNAL_JOB_STATUS_LABEL[j.status],
      statusColor: EXTERNAL_JOB_STATUS_COLOR[j.status],
      dashed: true,
      searchText: [j.clientName, j.clientPhone, j.address, j.description, j.notes, AGENDA_EXTERNAL_JOB_STATUS_LABEL[j.status], "esterno"]
        .filter(Boolean)
        .join(" ")
        .toLowerCase(),
      onPress: () => setSelectedExternalJob(j),
    }));

    const pendingQuoteItems: AgendaListItem[] = (leads ?? [])
      .filter(
        (lead) =>
          lead.quote &&
          lead.quote.bookingStatus === null &&
          (lead.quote.status === "SENT" || lead.quote.status === "MODIFICATION_REQUESTED"),
      )
      .map((lead) => {
        const quote = lead.quote!;
        const clientName = lead.guidedRequest.clientAccountDeleted ? "Account eliminato" : (lead.guidedRequest.clientName ?? "Cliente");
        return {
          key: `pending-${lead.id}`,
          date: new Date(quote.estimatedStartDate),
          timeLabel: formatAgendaTimeRange(quote.estimatedStartDate, quote.estimatedEndDate),
          title: clientName,
          subtitle: lead.guidedRequest.categoryLabel,
          statusLabel: "In attesa del cliente",
          statusColor: PENDING_QUOTE_COLOR,
          dashed: true,
          searchText: [clientName, lead.guidedRequest.categoryLabel, lead.guidedRequest.description, lead.guidedRequest.city, "in attesa", "preventivo"]
            .filter(Boolean)
            .join(" ")
            .toLowerCase(),
          onPress: () => router.push("/dashboard/richieste"),
        };
      });

    return [...bookingItems, ...externalItems, ...pendingQuoteItems].sort((a, b) => a.date.getTime() - b.date.getTime());
  }

  const agendaSearchResults = agendaSearchQuery.trim()
    ? buildAgendaListItems().filter((item) => item.searchText.includes(agendaSearchQuery.trim().toLowerCase()))
    : [];

  function renderBookingYearList() {
    const year = bookingCurrentDate.getUTCFullYear();
    const items = buildAgendaListItems().filter((item) => item.date.getUTCFullYear() === year);
    return <AgendaEventsList items={items} groupByMonth emptyLabel={`Nessuna prenotazione nel ${year}.`} />;
  }

  return (
    <YStack width="100%" alignItems="center" backgroundColor={brand.gesso} paddingVertical="$8" paddingHorizontal="$4">
      <YStack width="100%" maxWidth={980} gap="$5">
        <YStack gap="$2">
          <Text fontFamily="$heading" fontWeight="800" fontSize="$8" color={brand.grafite}>
            Agenda
          </Text>
          <Text color={brand.grafite70}>
            {activeTab === "disponibilita"
              ? "Imposta i giorni e le fasce orarie in cui sei disponibile: i clienti la vedranno sul tuo profilo pubblico. Ogni fascia aggiunta vale solo per quella data — spunta “Ripeti” nel pop-up per applicarla a tutti gli stessi giorni della settimana nel mese corrente."
              : "Le tue prenotazioni reali: tocca un appuntamento per vederne i dettagli e confermarlo, completarlo o annullarlo."}
          </Text>
        </YStack>

        <XStack borderWidth={1} borderColor={brand.filetto} borderRadius="$2" overflow="hidden" alignSelf="flex-start">
          {(
            [
              { value: "prenotazioni" as const, label: "Prenotazioni" },
              { value: "disponibilita" as const, label: "Disponibilità" },
            ]
          ).map((tab, index) => {
            const active = tab.value === activeTab;
            return (
              <XStack
                key={tab.value}
                paddingHorizontal="$4"
                paddingVertical="$2"
                backgroundColor={active ? brand.grafite : brand.calce}
                borderLeftWidth={index === 0 ? 0 : 1}
                borderLeftColor={brand.filetto}
                cursor="pointer"
                onPress={() => setActiveTab(tab.value)}
                accessibilityRole="button"
              >
                <Text fontWeight="700" fontSize="$3" color={active ? "white" : brand.grafite}>
                  {tab.label}
                </Text>
              </XStack>
            );
          })}
        </XStack>

        {/* Avviso ben leggibile se non è ancora stata impostata nessuna
            disponibilità (richiesta esplicita dell'utente): visibile su
            entrambe le schede, non solo su "Disponibilità" — l'agenda apre
            ora di default su "Prenotazioni", dove altrimenti il
            professionista potrebbe non capire perché non riceve
            prenotazioni dirette. */}
        {slots.length === 0 ? (
          <XStack
            alignItems="flex-start"
            gap="$3"
            padding="$4"
            backgroundColor={brand.cianografiaVelo}
            borderWidth={1}
            borderColor={brand.cianografia}
            borderRadius="$4"
          >
            <Icon name="calendar" size={20} color={brand.cianografia} strokeWidth={1.5} />
            <YStack flex={1} gap="$2">
              <Text fontWeight="700" color={brand.grafite}>
                Non hai ancora impostato la tua disponibilità
              </Text>
              <Text fontSize="$3" color={brand.grafite70}>
                Aggiungi i giorni e gli orari in cui sei disponibile: comparirà sul tuo profilo pubblico e i clienti
                potranno prenotarti con molta più facilità.
              </Text>
              <Button variant="secondary" size="$3" height={40} alignSelf="flex-start" onPress={() => setActiveTab("disponibilita")}>
                Aggiungi disponibilità
              </Button>
            </YStack>
          </XStack>
        ) : null}

        {activeTab === "disponibilita" ? (
          <>
            {/* Eliminazione massiva delle fasce (richiesta esplicita
                dell'utente): "Modifica" non apre una finestra separata, attiva
                una modalità di selezione direttamente sul calendario qui sotto
                (funziona identica in Giorno/Settimana/Mese) — un click su una
                fascia la seleziona, più le scorciatoie "tutto il giorno"
                (nella colonna) e "tutto il mese" (qui). */}
            <XStack alignItems="center" gap="$3" flexWrap="wrap">
              <Button variant="secondary" size="$3" height={40} alignSelf="flex-start" onPress={toggleSelectionMode}>
                <XStack alignItems="center" gap="$2">
                  <Icon name={selectionMode ? "x" : "pencil"} size={15} color={brand.grafite} />
                  <Text color={brand.grafite} fontWeight="600">
                    {selectionMode ? "Annulla" : "Modifica"}
                  </Text>
                </XStack>
              </Button>
              {selectionMode ? (
                <>
                  <Text
                    fontFamily="$mono"
                    fontSize={12}
                    fontWeight="700"
                    color={brand.cianografia}
                    cursor="pointer"
                    onPress={toggleMonthSelection}
                    accessibilityRole="button"
                  >
                    Seleziona tutto il mese
                  </Text>
                  <Text fontSize="$3" color={brand.grafite70}>
                    {selectedSlotKeys.size} fasc{selectedSlotKeys.size === 1 ? "ia" : "e"} selezionat
                    {selectedSlotKeys.size === 1 ? "a" : "e"}
                  </Text>
                </>
              ) : null}
            </XStack>

            {selectionMode ? (
              confirmingBulkDelete ? (
                <XStack alignItems="center" gap="$3" flexWrap="wrap">
                  <Text color={brand.grafite70} fontSize="$3">
                    Eliminare {selectedSlotKeys.size} fasc{selectedSlotKeys.size === 1 ? "ia" : "e"}?
                  </Text>
                  <Button variant="urgent" size="$3" height={40} onPress={deleteSelectedSlots}>
                    Conferma eliminazione
                  </Button>
                  <Button variant="ghost" size="$3" height={40} onPress={() => setConfirmingBulkDelete(false)}>
                    Annulla
                  </Button>
                </XStack>
              ) : (
                <Button
                  variant="urgent"
                  size="$3"
                  height={40}
                  alignSelf="flex-start"
                  disabled={selectedSlotKeys.size === 0}
                  opacity={selectedSlotKeys.size === 0 ? 0.5 : 1}
                  onPress={selectedSlotKeys.size > 0 ? () => setConfirmingBulkDelete(true) : undefined}
                >
                  <XStack alignItems="center" gap="$2">
                    <Icon name="trash-2" size={15} color="white" />
                    <Text color="white" fontWeight="700">
                      Elimina
                    </Text>
                  </XStack>
                </Button>
              )
            ) : null}

            <CalendarShell
              view={view}
              onViewChange={setView}
              currentDate={currentDate}
              onNavigate={setCurrentDate}
              onSelectDay={(date) => {
                if (selectionMode) {
                  toggleDaySelection(date);
                  return;
                }
                setCurrentDate(date);
                setView("day");
              }}
              renderDayColumn={renderDayColumn}
              renderMonthCell={renderMonthCell}
            />

            {/* Mentre il pop-up è aperto l'errore è già mostrato lì (più leggibile):
                questo banner serve solo per gli errori del salvataggio finale,
                quando nessun editor è in corso. */}
            {error && !editingKey ? (
              <XStack
                borderWidth={1}
                borderColor={brand.urgenza}
                backgroundColor={brand.urgenzaVelo}
                borderRadius="$2"
                paddingHorizontal="$3"
                paddingVertical="$2"
                alignItems="center"
                gap="$2"
              >
                <Icon name="bell-ring" size={14} color={brand.urgenza} />
                <Text color={brand.urgenza} fontSize="$3" fontWeight="600" flex={1}>
                  {error}
                </Text>
              </XStack>
            ) : null}
            {/* Nessun bottone "Salva agenda" (richiesta esplicita
                dell'utente, F4.1): ogni operazione (impostare un orario,
                eliminare una fascia, propagare una modifica) salva già da
                sola — questo è solo un indicatore passivo dello stato del
                salvataggio in corso, non un'azione da compiere. */}
            {isSubmitting ? (
              <Text color={brand.grafite70} fontSize="$3">
                Salvataggio...
              </Text>
            ) : saved ? (
              <Text color={brand.verificato} fontSize="$3">
                Agenda salvata!
              </Text>
            ) : null}
          </>
        ) : (
          <>
            <XStack justifyContent="space-between" alignItems="center" gap="$3" flexWrap="wrap">
              {/* Ricerca full-text (richiesta esplicita dell'utente):
                  qualsiasi parola o parte di parola presente in QUALSIASI
                  campo di una prenotazione/lavoro esterno/preventivo in
                  attesa (nome cliente, telefono, indirizzo, descrizione,
                  note, stato, voci del preventivo...) — non solo
                  nome/città/via. Filtra dal vivo ad ogni digitazione,
                  nessuna chiamata di rete (stessi dati già scaricati). */}
              <XStack
                alignItems="center"
                gap="$2"
                flex={1}
                minWidth={220}
                maxWidth={360}
                height={40}
                paddingHorizontal="$3"
                borderRadius="$3"
                backgroundColor={brand.calce}
                borderWidth={1}
                borderColor={brand.filetto}
              >
                <Icon name="search" size={15} color={brand.grafite70} />
                <input
                  type="text"
                  value={agendaSearchQuery}
                  onChange={(e) => setAgendaSearchQuery(e.target.value)}
                  placeholder="Cerca in qualsiasi campo..."
                  style={{ flex: 1, minWidth: 0, border: "none", outline: "none", background: "transparent", fontSize: 14, color: brand.grafite }}
                />
                {agendaSearchQuery ? (
                  <XStack cursor="pointer" onPress={() => setAgendaSearchQuery("")} accessibilityRole="button" accessibilityLabel="Cancella ricerca">
                    <Icon name="x" size={15} color={brand.grafite70} />
                  </XStack>
                ) : null}
              </XStack>
              <Button
                variant="secondary"
                size="$3"
                height={40}
                alignSelf="flex-start"
                onPress={() => setCreatingExternalJobFor(bookingCurrentDate)}
              >
                <XStack alignItems="center" gap="$2">
                  <Icon name="plus" size={15} color={brand.grafite} />
                  <Text color={brand.grafite} fontWeight="600">
                    Lavoro esterno
                  </Text>
                </XStack>
              </Button>
            </XStack>
            {bookingsError ? (
              <Text color={brand.urgenza} fontSize="$3">
                {bookingsError}
              </Text>
            ) : null}
            {externalJobsError ? (
              <Text color={brand.urgenza} fontSize="$3">
                {externalJobsError}
              </Text>
            ) : null}
            {bookings === null ? (
              <LoadingState />
            ) : agendaSearchQuery.trim() ? (
              <AgendaEventsList
                items={agendaSearchResults}
                emptyLabel="Nessuna prenotazione corrisponde alla ricerca."
              />
            ) : (
              <CalendarShell
                view={bookingView}
                onViewChange={setBookingView}
                currentDate={bookingCurrentDate}
                onNavigate={setBookingCurrentDate}
                onSelectDay={(date) => {
                  setBookingCurrentDate(date);
                  setBookingView("day");
                }}
                renderDayColumn={renderBookingDayColumn}
                renderMonthCell={renderBookingMonthCell}
                renderYearList={renderBookingYearList}
              />
            )}
          </>
        )}
      </YStack>

      {selectedBooking ? (
        <BookingDetailPanel
          key={selectedBooking.id}
          booking={selectedBooking}
          onClose={() => setSelectedBooking(null)}
          onAction={handleBookingAction}
          isActionPending={isBookingActionPending}
          onSaveNote={handleSaveBookingNote}
          isSavingNote={isSavingBookingNote}
          onSaveMeetingLink={handleSaveMeetingLink}
          isSavingMeetingLink={isSavingMeetingLink}
          onOpenTimeline={selectedBooking.guidedRequestId ? () => setShowBookingTimeline(true) : undefined}
          onOpenFullRequest={
            selectedBooking.guidedRequestId ? () => router.push(`/dashboard/richieste?open=${selectedBooking.guidedRequestId}`) : undefined
          }
          token={token}
        />
      ) : null}

      {showBookingTimeline && selectedBooking?.guidedRequestId && myProfileId ? (
        <TimelineModal
          token={token}
          guidedRequestId={selectedBooking.guidedRequestId}
          professionalProfileId={myProfileId}
          viewerRole="PROFESSIONAL"
          otherPartyName={selectedBooking.clientName}
          onClose={() => setShowBookingTimeline(false)}
        />
      ) : null}

      {selectedExternalJob ? (
        <ExternalJobModal
          key={selectedExternalJob.id}
          token={token}
          job={selectedExternalJob}
          onClose={() => setSelectedExternalJob(null)}
          onSaved={(job) => setExternalJobs((prev) => (prev ? prev.map((j) => (j.id === job.id ? job : j)) : [job]))}
          onDeleted={(id) => setExternalJobs((prev) => (prev ? prev.filter((j) => j.id !== id) : prev))}
        />
      ) : null}

      {creatingExternalJobFor ? (
        <ExternalJobModal
          token={token}
          defaultDate={creatingExternalJobFor}
          onClose={() => setCreatingExternalJobFor(null)}
          onSaved={(job) => setExternalJobs((prev) => (prev ? [...prev, job] : [job]))}
        />
      ) : null}

      {editingKey && editingDayOfWeek() !== null ? (
        <SlotEditorModal
          // key forza un nuovo componente (quindi uno stato di conferma
          // eliminazione azzerato) ad ogni fascia diversa aperta — non può
          // succedere che il pop-up resti aperto passando da una fascia
          // all'altra (l'overlay blocca il resto della pagina), ma è una
          // garanzia a costo zero.
          key={editingKey}
          dayLabel={
            editingDateStr()
              ? `${WEEKDAY_FULL_LABELS[editingDayOfWeek()!]} ${parseIsoDate(editingDateStr()!).getUTCDate()} ${monthLabel(parseIsoDate(editingDateStr()!))}`
              : WEEKDAY_FULL_LABELS[editingDayOfWeek()!]!
          }
          start={draftStart}
          end={draftEnd}
          allowsHome={draftAllowsHome}
          allowsOnline={draftAllowsOnline}
          homeMax={draftHomeMax}
          onlineMax={draftOnlineMax}
          liveError={error}
          onStartChange={setDraftStart}
          onEndChange={setDraftEnd}
          onAllowsHomeChange={setDraftAllowsHome}
          onAllowsOnlineChange={setDraftAllowsOnline}
          onHomeMaxChange={setDraftHomeMax}
          onOnlineMaxChange={setDraftOnlineMax}
          onSave={() => commitSlotEdit(editingDayOfWeek()!)}
          onCancel={() => setEditingKey(null)}
          isNew={editingKey.startsWith("new-")}
          // Spunta "ripeti"/"applica anche" per tutti i <giorno> del mese:
          // creando una fascia nuova aggiunge una fascia per occorrenza,
          // modificandone una esistente propaga invece lo stesso
          // cambiamento (orario/capienza) alle fasce gemelle del mese —
          // richiesta esplicita dell'utente. Mostrata solo quando la fascia
          // è legata a una data esatta: una fascia ricorrente storica
          // (editingDateStr() null) non ha un mese su cui scoping ha senso.
          canRepeatForMonth={editingDateStr() !== null}
          repeatForMonth={repeatForMonth}
          onRepeatForMonthChange={setRepeatForMonth}
          repeatWeekdayLabel={WEEKDAY_FULL_LABELS[editingDayOfWeek()!]!}
          repeatMonthLabel={editingDateStr() ? monthLabel(parseIsoDate(editingDateStr()!)) : ""}
          // La fascia si può eliminare solo modificando una già esistente,
          // non mentre se ne sta creando una nuova.
          onDelete={
            editingKey.startsWith("edit-") ? () => deleteSlot(Number(editingKey.slice(5))) : undefined
          }
          hasUpcomingBooking={
            editingKey.startsWith("edit-") ? (slots[Number(editingKey.slice(5))]?.hasUpcomingBooking ?? false) : false
          }
        />
      ) : null}
    </YStack>
  );
}

/**
 * Casellina di spunta (richiesta esplicita dell'utente): in modalità
 * selezione, ogni fascia oraria e ogni "Seleziona giorno" mostrano ora un
 * riquadro cliccabile riconoscibile invece del solo cambio di colore del
 * testo/icona — segnale visivo più immediato che quell'elemento è
 * selezionabile.
 */
function SelectionCheckbox({ checked }: { checked: boolean }) {
  return (
    <XStack
      width={14}
      height={14}
      flexShrink={0}
      borderRadius={3}
      borderWidth={1.5}
      borderColor={brand.cianografia}
      backgroundColor={checked ? brand.cianografia : brand.calce}
      alignItems="center"
      justifyContent="center"
    >
      {checked ? <Icon name="check" size={9} color="white" strokeWidth={3} /> : null}
    </XStack>
  );
}

function SlotChip({
  slot,
  isConflicting,
  isEditing,
  isSelected,
  onEdit,
}: {
  slot: SlotDraft;
  /** True se la fascia in modifica altrove nello stesso giorno si sovrappone a questa — colorata di rosso anche lei, non solo il riquadro in modifica (richiesta esplicita dell'utente). */
  isConflicting: boolean;
  /** True mentre questa fascia è aperta nel pop-up di modifica: evidenziata per farla ritrovare facilmente quando si chiude. */
  isEditing: boolean;
  /** True in modalità selezione (tasto "Modifica") quando questa fascia è tra quelle scelte per l'eliminazione in blocco. */
  isSelected?: boolean;
  onEdit: () => void;
}) {
  const isGeneric = isSlotGeneric(slot);
  // Solo l'orario, in piccolo, per restare dentro la colonna anche nella
  // vista Settimana (richiesta esplicita dell'utente): tutto il resto
  // (modifica, capienza, eliminazione) si apre nel pop-up di modifica
  // (SlotEditorModal) toccando l'intera fascia — niente più tasto "×" a
  // parte: su cellulare si sovrapponeva al riquadro della fascia, poco
  // chiaro, richiesta esplicita dell'utente.
  return (
    <XStack
      borderWidth={isConflicting || isEditing || isSelected ? 1.5 : 1}
      borderStyle={isGeneric && !isConflicting && !isSelected ? "dashed" : "solid"}
      borderColor={isConflicting ? brand.urgenza : isEditing || isSelected ? brand.cianografia : isGeneric ? brand.ottone : brand.cianografia}
      borderRadius="$2"
      paddingHorizontal="$1.5"
      paddingVertical={5}
      alignItems="center"
      gap={3}
      minWidth={0}
      cursor="pointer"
      backgroundColor={isConflicting ? brand.urgenzaVelo : isEditing || isSelected ? brand.cianografiaVelo : brand.calce}
      onPress={onEdit}
      accessibilityRole="button"
      accessibilityLabel={isSelected !== undefined ? `${isSelected ? "Deseleziona" : "Seleziona"} fascia ${slot.start}–${slot.end}` : `Modifica fascia ${slot.start}–${slot.end}`}
    >
      {isSelected !== undefined ? (
        <SelectionCheckbox checked={isSelected} />
      ) : slot.hasUpcomingBooking ? (
        <Icon name="bell-ring" size={9} color={brand.urgenza} />
      ) : null}
      <Text fontFamily="$mono" fontSize={10} fontWeight="700" color={isGeneric && !isSelected ? brand.ottone : brand.cianografia}>
        {slot.start}–{slot.end}
      </Text>
      {/* Simbolo "online" in piccolo sulla fascia (richiesta esplicita
          dell'utente) quando è stata spuntata la modalità online. */}
      {slot.allowsOnline ? <Icon name="video" size={9} color={brand.verificato} /> : null}
    </XStack>
  );
}

const modalTimeInputStyle = {
  padding: 12,
  borderRadius: 4,
  border: `1px solid ${brand.filetto}`,
  fontSize: 17,
  fontFamily: "inherit",
  color: brand.grafite,
  width: 130,
  minWidth: 0,
};
const modalMaxInputStyle = { ...modalTimeInputStyle, width: 80, textAlign: "center" as const };

/**
 * Pop-up per impostare/modificare una fascia oraria, aperto sia dal tasto
 * "+" (nuova fascia) sia cliccando una fascia già impostata: prima gli
 * stessi campi stavano incastrati in un riquadro minuscolo dentro la
 * colonna del calendario, illeggibile — richiesta esplicita dell'utente di
 * aprirli invece in un overlay grande, stesso pattern DOM di
 * BookingDetailPanel/PhotoLightbox (role="dialog", chiusura con Escape o
 * click sul backdrop, nessuna libreria aggiunta).
 */
function SlotEditorModal({
  dayLabel,
  start,
  end,
  allowsHome,
  allowsOnline,
  homeMax,
  onlineMax,
  liveError,
  onStartChange,
  onEndChange,
  onAllowsHomeChange,
  onAllowsOnlineChange,
  onHomeMaxChange,
  onOnlineMaxChange,
  onSave,
  onCancel,
  onDelete,
  hasUpcomingBooking,
  isNew,
  canRepeatForMonth,
  repeatForMonth,
  onRepeatForMonthChange,
  repeatWeekdayLabel,
  repeatMonthLabel,
}: {
  dayLabel: string;
  start: string;
  end: string;
  /** Due caselle indipendenti (richiesta esplicita dell'utente), almeno una obbligatoria per salvare. */
  allowsHome: boolean;
  allowsOnline: boolean;
  homeMax: string;
  onlineMax: string;
  /** Calcolato ad ogni render da slotEditorLiveError: mostrato subito, senza aspettare "Salva agenda". */
  liveError: string | null;
  onStartChange: (v: string) => void;
  onEndChange: (v: string) => void;
  onAllowsHomeChange: (v: boolean) => void;
  onAllowsOnlineChange: (v: boolean) => void;
  onHomeMaxChange: (v: string) => void;
  onOnlineMaxChange: (v: string) => void;
  onSave: () => void;
  onCancel: () => void;
  /** Assente quando si sta creando una fascia nuova: solo una fascia già esistente si può eliminare. */
  onDelete?: () => void;
  /** Richiede una seconda conferma prima di eliminare, stesso pattern a due passaggi già in uso altrove nel progetto. */
  hasUpcomingBooking: boolean;
  /** True mentre si crea una fascia nuova: cambia solo l'etichetta della spunta ("Ripeti" vs "Applica anche"). */
  isNew: boolean;
  /** False per una fascia ricorrente storica (nessuna data esatta, niente mese su cui scoping ha senso). */
  canRepeatForMonth: boolean;
  repeatForMonth: boolean;
  onRepeatForMonthChange: (v: boolean) => void;
  repeatWeekdayLabel: string;
  repeatMonthLabel: string;
}) {
  // Eliminazione dal pop-up invece che da un tasto "×" sulla fascia: su
  // cellulare quella "×" si sovrapponeva al riquadro della fascia, poco
  // chiara — richiesta esplicita dell'utente.
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onCancel]);

  return (
    <div
      onClick={onCancel}
      role="dialog"
      aria-modal="true"
      aria-label="Imposta fascia oraria"
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(20,24,30,0.55)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
        padding: 16,
      }}
    >
      <YStack
        onPress={(e: { stopPropagation: () => void }) => e.stopPropagation()}
        width="100%"
        maxWidth={400}
        backgroundColor={brand.calce}
        borderRadius="$3"
        borderWidth={1}
        borderColor={brand.filetto}
        padding="$5"
        gap="$4"
      >
        <XStack justifyContent="space-between" alignItems="center">
          <Text fontFamily="$heading" fontWeight="800" fontSize="$6" color={brand.grafite}>
            {dayLabel}
          </Text>
          <Text fontSize="$5" color={brand.grafite70} cursor="pointer" onPress={onCancel} accessibilityRole="button" accessibilityLabel="Chiudi">
            ✕
          </Text>
        </XStack>

        <YStack gap="$2">
          <Text fontFamily="$body" fontWeight="700" fontSize={11} color={brand.grafite70}>
            Orario
          </Text>
          <XStack gap="$2" alignItems="center" flexWrap="wrap">
            <input type="time" value={start} onChange={(e) => onStartChange(e.target.value)} style={modalTimeInputStyle} />
            <Text fontSize="$3" color={brand.grafite70}>
              –
            </Text>
            <input type="time" value={end} onChange={(e) => onEndChange(e.target.value)} style={modalTimeInputStyle} />
          </XStack>
        </YStack>

        <YStack gap="$3">
          <Text fontFamily="$body" fontWeight="700" fontSize={11} color={brand.grafite70}>
            Modalità (almeno una obbligatoria)
          </Text>
          {/* Due caselle indipendenti, richiesta esplicita dell'utente: "a
              domicilio"/"online", ognuna con la propria capienza massima —
              un professionista può offrire, ad esempio, 2 interventi a
              domicilio E 5 consulenze online sulla stessa fascia oraria. */}
          <YStack gap="$2">
            <XStack
              alignItems="center"
              gap="$3"
              padding="$3"
              backgroundColor={brand.gesso}
              borderWidth={1}
              borderColor={brand.filetto}
              borderRadius="$3"
              cursor="pointer"
              onPress={() => onAllowsHomeChange(!allowsHome)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: allowsHome }}
            >
              <YStack
                width={22}
                height={22}
                borderRadius="$2"
                borderWidth={2}
                borderColor={allowsHome ? brand.cianografia : brand.filetto}
                backgroundColor={allowsHome ? brand.cianografia : brand.calce}
                alignItems="center"
                justifyContent="center"
              >
                {allowsHome ? <Icon name="check" size={14} strokeWidth={2} color="white" /> : null}
              </YStack>
              <Text flex={1} fontSize="$3" color={brand.grafite}>
                A domicilio
              </Text>
              {allowsHome ? (
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={homeMax}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => onHomeMaxChange(e.target.value)}
                  style={modalMaxInputStyle}
                />
              ) : null}
            </XStack>
            <XStack
              alignItems="center"
              gap="$3"
              padding="$3"
              backgroundColor={brand.gesso}
              borderWidth={1}
              borderColor={brand.filetto}
              borderRadius="$3"
              cursor="pointer"
              onPress={() => onAllowsOnlineChange(!allowsOnline)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: allowsOnline }}
            >
              <YStack
                width={22}
                height={22}
                borderRadius="$2"
                borderWidth={2}
                borderColor={allowsOnline ? brand.cianografia : brand.filetto}
                backgroundColor={allowsOnline ? brand.cianografia : brand.calce}
                alignItems="center"
                justifyContent="center"
              >
                {allowsOnline ? <Icon name="check" size={14} strokeWidth={2} color="white" /> : null}
              </YStack>
              <Text flex={1} fontSize="$3" color={brand.grafite}>
                Online
              </Text>
              {allowsOnline ? (
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={onlineMax}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => onOnlineMaxChange(e.target.value)}
                  style={modalMaxInputStyle}
                />
              ) : null}
            </XStack>
          </YStack>
        </YStack>

        {canRepeatForMonth ? (
          <XStack
            alignItems="center"
            gap="$3"
            padding="$3"
            backgroundColor={brand.gesso}
            borderWidth={1}
            borderColor={brand.filetto}
            borderRadius="$3"
            cursor="pointer"
            onPress={() => onRepeatForMonthChange(!repeatForMonth)}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: repeatForMonth }}
          >
            <YStack
              width={22}
              height={22}
              borderRadius="$2"
              borderWidth={2}
              borderColor={repeatForMonth ? brand.cianografia : brand.filetto}
              backgroundColor={repeatForMonth ? brand.cianografia : brand.calce}
              alignItems="center"
              justifyContent="center"
            >
              {repeatForMonth ? <Icon name="check" size={14} strokeWidth={2} color="white" /> : null}
            </YStack>
            {/* Creando una fascia nuova, la spunta ne aggiunge una per ogni
                occorrenza del mese; modificandone una esistente (es. cambiando
                la capienza), propaga invece lo stesso orario/capienza alle
                fasce gemelle del mese — senza spunta, la modifica resta
                sempre limitata a questo solo giorno (richiesta esplicita
                dell'utente). */}
            <Text flex={1} fontSize="$3" color={brand.grafite}>
              {isNew
                ? `Ripeti per tutti i ${repeatWeekdayLabel.toLowerCase()} di ${repeatMonthLabel.toLowerCase()}`
                : `Applica anche a tutti i ${repeatWeekdayLabel.toLowerCase()} di ${repeatMonthLabel.toLowerCase()}`}
            </Text>
          </XStack>
        ) : null}
        {!isNew ? (
          <Text fontSize="$2" color={brand.grafite70}>
            {canRepeatForMonth
              ? "Senza spunta, la modifica riguarda solo questo giorno."
              : "Questa fascia è ricorrente: la modifica si applica a ogni occorrenza futura."}
          </Text>
        ) : null}

        {liveError ? (
          <XStack borderWidth={1} borderColor={brand.urgenza} backgroundColor={brand.urgenzaVelo} borderRadius="$2" paddingHorizontal="$3" paddingVertical="$2" gap="$2" alignItems="center">
            <Icon name="bell-ring" size={14} color={brand.urgenza} />
            <Text color={brand.urgenza} fontSize="$3" fontWeight="600" flex={1}>
              {liveError}
            </Text>
          </XStack>
        ) : null}

        <XStack gap="$3">
          <Button variant="primary" disabled={!!liveError} opacity={liveError ? 0.5 : 1} onPress={liveError ? undefined : onSave}>
            Salva
          </Button>
          <Button variant="ghost" onPress={onCancel}>
            Annulla
          </Button>
        </XStack>

        {onDelete ? (
          <YStack gap="$2" borderTopWidth={1} borderTopColor={brand.filetto} paddingTop="$3">
            {confirmingDelete ? (
              <YStack gap="$2">
                {hasUpcomingBooking ? (
                  <XStack
                    borderWidth={1}
                    borderColor={brand.urgenza}
                    backgroundColor={brand.urgenzaVelo}
                    borderRadius="$2"
                    paddingHorizontal="$3"
                    paddingVertical="$2"
                    gap="$2"
                    alignItems="center"
                  >
                    <Icon name="bell-ring" size={14} color={brand.urgenza} />
                    <Text color={brand.urgenza} fontSize="$3" fontWeight="600" flex={1}>
                      Questa fascia ha una prenotazione futura. Eliminarla comunque?
                    </Text>
                  </XStack>
                ) : (
                  <Text color={brand.grafite70} fontSize="$3">
                    Eliminare questa fascia?
                  </Text>
                )}
                <XStack gap="$3">
                  <Button variant="urgent" onPress={onDelete}>
                    Conferma eliminazione
                  </Button>
                  <Button variant="ghost" onPress={() => setConfirmingDelete(false)}>
                    Annulla
                  </Button>
                </XStack>
              </YStack>
            ) : (
              <Text
                fontSize="$3"
                fontWeight="700"
                color={brand.urgenza}
                cursor="pointer"
                onPress={() => setConfirmingDelete(true)}
                accessibilityRole="button"
                accessibilityLabel="Elimina fascia"
              >
                Elimina fascia
              </Text>
            )}
          </YStack>
        ) : null}
      </YStack>
    </div>
  );
}

/**
 * Lista di eventi condivisa (richiesta esplicita dell'utente, entrambe): sia
 * per la vista "Anno" (raggruppata per mese) sia per i risultati della
 * ricerca full-text (elenco piatto, un filtro non ha una struttura mensile
 * naturale). Click su una riga apre lo stesso pannello/pop-up di dettaglio
 * già usato dalla griglia (`item.onPress`, già collegato a
 * `setSelectedBooking`/`setSelectedExternalJob`/navigazione a
 * "/dashboard/richieste" da `buildAgendaListItems`).
 */
function AgendaEventsList({ items, groupByMonth = false, emptyLabel }: { items: AgendaListItem[]; groupByMonth?: boolean; emptyLabel: string }) {
  if (items.length === 0) {
    return (
      <YStack padding="$5" alignItems="center" backgroundColor={brand.calce} borderRadius="$3">
        <Text color={brand.grafite70} fontSize="$3">
          {emptyLabel}
        </Text>
      </YStack>
    );
  }

  if (!groupByMonth) {
    return (
      <YStack gap="$2">
        {items.map((item) => (
          <AgendaEventRow key={item.key} item={item} />
        ))}
      </YStack>
    );
  }

  // Raggruppamento per mese (vista Anno): un'intestazione per ogni mese che
  // contiene almeno un evento — i mesi senza nulla non occupano spazio,
  // stesso principio "niente sezioni vuote" già seguito altrove nel sito.
  const groups: { monthKey: string; label: string; items: AgendaListItem[] }[] = [];
  for (const item of items) {
    const monthKey = `${item.date.getUTCFullYear()}-${item.date.getUTCMonth()}`;
    const lastGroup = groups[groups.length - 1];
    if (lastGroup && lastGroup.monthKey === monthKey) {
      lastGroup.items.push(item);
    } else {
      groups.push({ monthKey, label: monthLabel(item.date), items: [item] });
    }
  }

  return (
    <YStack gap="$5">
      {groups.map((group) => (
        <YStack key={group.monthKey} gap="$2">
          <Text fontFamily="$body" fontSize={13} fontWeight="700" color={brand.grafite70} textTransform="capitalize">
            {group.label}
          </Text>
          <YStack gap="$2">
            {group.items.map((item) => (
              <AgendaEventRow key={item.key} item={item} />
            ))}
          </YStack>
        </YStack>
      ))}
    </YStack>
  );
}

function AgendaEventRow({ item }: { item: AgendaListItem }) {
  const dateLabel = `${WEEKDAY_FULL_LABELS[item.date.getUTCDay()]!.slice(0, 3)} ${item.date.getUTCDate()} ${monthLabel(item.date)}`;
  return (
    <XStack
      minWidth={0}
      alignItems="center"
      gap="$3"
      padding="$3"
      backgroundColor={brand.calce}
      borderRadius="$3"
      borderLeftWidth={3}
      borderStyle={item.dashed ? "dashed" : "solid"}
      borderLeftColor={item.statusColor}
      cursor="pointer"
      onPress={item.onPress}
      accessibilityRole="button"
    >
      <YStack minWidth={92}>
        <Text fontFamily="$mono" fontSize={12} fontWeight="700" color={brand.grafite} numberOfLines={1}>
          {dateLabel}
        </Text>
        <Text fontFamily="$mono" fontSize={11} color={brand.grafite70} numberOfLines={1}>
          {item.timeLabel}
        </Text>
      </YStack>
      <YStack flex={1} minWidth={0} gap={2}>
        <Text fontWeight="700" fontSize={14} color={brand.grafite} numberOfLines={1}>
          {item.title}
        </Text>
        <Text fontSize={12} color={brand.grafite70} numberOfLines={1}>
          {item.subtitle}
        </Text>
      </YStack>
      <Text fontSize={11} fontWeight="700" color={item.statusColor} numberOfLines={1}>
        {item.statusLabel}
      </Text>
    </XStack>
  );
}
