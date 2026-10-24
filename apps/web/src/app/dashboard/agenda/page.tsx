"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { CalendarDays, ChevronLeft, ChevronRight, Navigation, Phone, Plus, Search, Truck, X } from "lucide-react";
import {
  agendaAttention,
  formatAppointmentDate,
  formatAppointmentTimeRange,
  jobOccurrenceOn,
  jobOccurrences,
  navigateUrl,
  wallClockNow,
  type AgendaWeekTemplate,
  type DayPart,
  type ZoneDemand,
  DAY_PART_RANGE,
  type CompleteBookingInput,
  type ExternalJob,
  type ProfessionalBooking,
  type ProfessionalLead,
  type WeatherAlertKind,
} from "@professionisti/shared";
import { Button, Icon, Text, XStack, YStack, brand } from "@professionisti/ui";
import { apiClient } from "@/lib/apiClient";
import { useAuth } from "@/lib/AuthContext";
import { CalendarShell, MonthGrid, type CalendarView } from "@/components/calendar/CalendarShell";
import { SkeletonBlock } from "@/components/Skeleton";
import { TimelineModal } from "@/components/TimelineModal";
import { ExternalJobModal } from "@/components/ExternalJobModal";
import { CompleteJobModal } from "@/components/CompleteJobModal";
import { CancelBookingModal } from "@/components/CancelBookingModal";
import { AgendaStyles } from "@/components/agenda/AgendaStyles";
import { AgendaTimeGrid, WeatherIcon, type AgendaDayNote, type AgendaFreeBand, type AgendaGridEvent } from "@/components/agenda/AgendaTimeGrid";
import { AgendaMiniMonth } from "@/components/agenda/AgendaMiniMonth";
import { AppointmentPanel } from "@/components/agenda/AppointmentPanel";
import { CalendarLinkModal } from "@/components/agenda/CalendarLinkModal";
import { WeekTemplateEditor } from "@/components/agenda/WeekTemplateEditor";
import { ZoneDemandCard } from "@/components/agenda/ZoneDemandCard";
import { DayRouteSection } from "@/components/agenda/DayRouteSection";
import { readAgendaOffline, saveAgendaOffline } from "@/lib/agendaOffline";
import { subscribeRealtimeEvents } from "@/lib/realtimeBus";
import {
  addDaysUtc,
  addMonthsUtc,
  addYearsUtc,
  datesInMonth,
  datesInMonthForGivenWeekday,
  datesInMonthForWeekday,
  formatDayRangeLabel,
  isSameDateUtc,
  monthLabel,
  parseIsoDate,
  slotAppliesOnDateStr,
  startOfDayUtc,
  todayUtc,
  toIsoDate,
  weekDays,
  weekdayShortLabel,
} from "@/lib/calendarDates";
import { AgendaEventsList } from "./_components/AgendaEventsList";
import { SelectionCheckbox, SlotChip, SlotEditorModal } from "./_components/SlotEditorModal";
import { AGENDA_BOOKING_STATUS_LABEL, AGENDA_EXTERNAL_JOB_STATUS_LABEL, AgendaListItem, BOOKING_STATUS_COLOR, EXTERNAL_JOB_STATUS_COLOR, PENDING_QUOTE_COLOR, SlotDraft, WEEKDAY_FULL_LABELS, formatAgendaTimeRange, slotsOverlap } from "./_components/agendaHelpers";
import { ItalianDateInput } from "@/components/ItalianDateInput";

// Tre sezioni (docs/CHANGELOG.md §288): il calendario degli appuntamenti,
// gli orari di lavoro (settimana tipo + giorno per giorno) e il giro del giorno.
type AgendaTab = "calendario" | "orari" | "giro";
type AgendaFilter = "conf" | "done" | "wait" | "ext" | "free";
const ALL_FILTERS: AgendaFilter[] = ["conf", "done", "wait", "ext", "free"];
const DEFAULT_DURATION_MIN = 60;

/** Minuti dalla mezzanotte di un orario "di parete" salvato come UTC. */
function wallMinutes(iso: string): number {
  const date = new Date(iso);
  return date.getUTCHours() * 60 + date.getUTCMinutes();
}
function timeMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}
function hoursText(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  return m ? `${h} h ${m}` : `${h} h`;
}

export default function DashboardAgendaPage() {
  return (
    <Suspense fallback={null}>
      <DashboardAgendaContent />
    </Suspense>
  );
}

function DashboardAgendaContent() {
  const { user, token, isLoading, refreshUser } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  // "Prenotazioni" di default all'apertura (richiesta esplicita dell'utente):
  // è la vista con l'informazione più urgente al primo sguardo (gli
  // appuntamenti reali), "Disponibilità" è configurazione che si tocca meno
  // spesso una volta impostata.
  // `?tab=disponibilita` (avviso "agenda vuota" in Oggi) apre subito le disponibilità.
  const [activeTab, setActiveTab] = useState<AgendaTab>(() => {
    const tab = searchParams.get("tab");
    if (tab === "disponibilita" || tab === "orari") return "orari";
    return tab === "giro" ? "giro" : "calendario";
  });

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

  // Nuova agenda (docs/CHANGELOG.md §288).
  const [filters, setFilters] = useState<Set<AgendaFilter>>(() => new Set(ALL_FILTERS));
  const [weather, setWeather] = useState<Map<string, WeatherAlertKind>>(new Map());
  const [offlineSavedAt, setOfflineSavedAt] = useState<string | null>(null);
  const [showCalendarLink, setShowCalendarLink] = useState(false);
  const [completingBooking, setCompletingBooking] = useState<ProfessionalBooking | null>(null);
  const [cancelingBooking, setCancelingBooking] = useState<ProfessionalBooking | null>(null);
  const [weekTemplate, setWeekTemplate] = useState<AgendaWeekTemplate | null>(null);
  const [weekTemplateActive, setWeekTemplateActive] = useState(false);
  // Dopo "Salva la settimana" il server cambia le fasce dei prossimi giorni: si rileggono.
  const [slotsReload, setSlotsReload] = useState(0);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [templateNotice, setTemplateNotice] = useState<string | null>(null);
  const [zoneDemand, setZoneDemand] = useState<ZoneDemand | null>(null);
  const [nowTick, setNowTick] = useState(() => Date.now());
  const [vacationFrom, setVacationFrom] = useState("");
  const [vacationTo, setVacationTo] = useState("");
  const [vacationBusy, setVacationBusy] = useState(false);

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
  // Ultime fasce confermate dal server, per tornarci se un salvataggio fallisce.
  const savedSlotsRef = useRef<SlotDraft[]>([]);
  const persistSeqRef = useRef(0);
  function setSavedSlots(next: SlotDraft[]) {
    savedSlotsRef.current = next;
    setSlots(next);
  }
  function openDeepLinkedBooking(list: ProfessionalBooking[]) {
    if (consumedBookingDeepLinkRef.current) return;
    consumedBookingDeepLinkRef.current = true;
    const targetId = searchParams.get("booking");
    const match = targetId ? list.find((b) => b.id === targetId) : undefined;
    if (match) {
      setActiveTab("calendario");
      setBookingView("day");
      setBookingCurrentDate(startOfDayUtc(new Date(match.scheduledAt)));
      setSelectedBooking(match);
    }
  }

  useEffect(() => {
    if (!token) return;
    apiClient
      .getMyAvailability(token)
      .then((existing) => {
        // Stessa cautela della pagina profilo pubblico: non fidarsi
        // ciecamente della forma della risposta se l'API non è ancora
        // allineata all'ultimo deploy del frontend.
        if (!Array.isArray(existing?.slots)) return;
        setSavedSlots(
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
  }, [token, slotsReload]);

  // Appuntamenti e lavori esterni insieme: se la rete non c'è si mostra
  // l'ultima copia salvata sul telefono (docs/CHANGELOG.md §288).
  // Si ricarica da sola quando un cliente accetta, sposta o annulla, e
  // quando si torna sull'app o torna la rete (R2 della verifica,
  // docs/CHANGELOG.md §310): prima restava ferma all'apertura.
  const [agendaReload, setAgendaReload] = useState(0);
  useEffect(() => {
    let last = Date.now();
    const reload = () => {
      // Mai più di una volta ogni 5 secondi: tornare sull'app più volte di fila non serve.
      if (Date.now() - last < 5_000) return;
      last = Date.now();
      setAgendaReload((n) => n + 1);
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") reload();
    };
    const unsubscribe = subscribeRealtimeEvents((event) => {
      if (event.kind === "notification" && /^(QUOTE_|BOOKING_|JOB_)/.test(event.notification.type)) {
        last = 0;
        reload();
      }
    });
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", reload);
    return () => {
      unsubscribe();
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", reload);
    };
  }, []);

  useEffect(() => {
    if (!token || !user) return;
    let cancelled = false;
    Promise.all([apiClient.myProfessionalBookings(token), apiClient.myExternalJobs(token)])
      .then(([loadedBookings, loadedJobs]) => {
        if (cancelled) return;
        setBookings(loadedBookings);
        openDeepLinkedBooking(loadedBookings);
        setExternalJobs(loadedJobs);
        // Il riquadro aperto mostra subito lo stato nuovo (es. annullato dal cliente).
        setSelectedBooking((current) => (current ? (loadedBookings.find((b) => b.id === current.id) ?? current) : current));
        setOfflineSavedAt(null);
        saveAgendaOffline(user.id, loadedBookings, loadedJobs);
      })
      .catch((err) => {
        if (cancelled) return;
        const copy = readAgendaOffline(user.id);
        if (copy) {
          setBookings(copy.bookings);
          openDeepLinkedBooking(copy.bookings);
          setExternalJobs(copy.externalJobs);
          setOfflineSavedAt(copy.savedAt);
          return;
        }
        const message = err instanceof Error ? err.message : "Errore nel caricamento delle prenotazioni.";
        setBookingsError(message);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, user?.id, agendaReload]);

  useEffect(() => {
    if (!token) return;
    apiClient
      .agendaWeather(token)
      .then((alerts) => setWeather(new Map(alerts.map((a) => [a.date, a.kind]))))
      .catch(() => {});
    apiClient
      .agendaWeekTemplate(token)
      .then((state) => {
        setWeekTemplate(state.template);
        setWeekTemplateActive(state.active);
      })
      .catch(() => {});
    apiClient
      .agendaZoneDemand(token)
      .then(setZoneDemand)
      .catch(() => {});
  }, [token]);

  // La linea dell'ora attuale si sposta da sola.
  useEffect(() => {
    const timer = setInterval(() => setNowTick(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);


  useEffect(() => {
    if (!token) return;
    apiClient.myLeads(token).then(setLeads).catch(() => {});
  }, [token, agendaReload]);

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
  // Ricalcolato durante il render quando cambia uno dei valori dell'editor,
  // invece che in un effetto dopo.
  const liveErrorInputs = [draftStart, draftEnd, draftAllowsHome, draftAllowsOnline, editingKey, slots] as const;
  const [checkedLiveErrorInputs, setCheckedLiveErrorInputs] = useState<readonly unknown[] | null>(null);
  if (!checkedLiveErrorInputs || liveErrorInputs.some((value, i) => value !== checkedLiveErrorInputs[i])) {
    setCheckedLiveErrorInputs(liveErrorInputs);
    const dayOfWeek = editingDayOfWeek();
    const editIndex = editingKey?.startsWith("edit-") ? Number(editingKey.slice(5)) : null;
    setError(dayOfWeek === null ? null : slotEditorLiveError(dayOfWeek, editIndex));
  }

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

  function patchBooking(id: string, patch: Partial<ProfessionalBooking>) {
    setBookings((prev) => (prev ? prev.map((b) => (b.id === id ? { ...b, ...patch } : b)) : prev));
    setSelectedBooking((prev) => (prev && prev.id === id ? { ...prev, ...patch } : prev));
  }

  // Nota privata del professionista (mai vista dal cliente) e link della
  // videochiamata (visibile al cliente): gli errori li mostra il riquadro.
  async function handleSaveBookingNote(note: string) {
    if (!token || !selectedBooking) return;
    const result = await apiClient.updateBookingNote(token, selectedBooking.id, { note });
    patchBooking(selectedBooking.id, { professionalNote: result.professionalNote });
  }

  async function handleSaveMeetingLink(meetingLink: string) {
    if (!token || !selectedBooking) return;
    const result = await apiClient.updateBookingMeetingLink(token, selectedBooking.id, { meetingLink });
    patchBooking(selectedBooking.id, { meetingLink: result.meetingLink });
  }

  /** "Sto arrivando" (docs/CHANGELOG.md §288): avvisa il cliente una volta sola. */
  async function handleOnTheWay(booking: ProfessionalBooking) {
    if (!token) return;
    const result = await apiClient.notifyOnTheWay(token, booking.id);
    patchBooking(booking.id, { onTheWayAt: result.onTheWayAt });
  }

  /**
   * "Lavoro completato" dall'agenda con la stessa finestra di "Richieste e
   * lavori" (importo finale, foto, dichiarazione): prima l'agenda segnava
   * solo lo stato, senza importo né pagamento del lavoro (docs/CHANGELOG.md §288).
   */
  async function handleComplete(input: CompleteBookingInput) {
    if (!token || !completingBooking) return;
    const result = await apiClient.completeBooking(token, completingBooking.id, input);
    patchBooking(completingBooking.id, { status: "COMPLETED", finalAmountEurCents: result.finalAmountEurCents });
    setCompletingBooking(null);
    setSelectedBooking(null);
  }

  /** Annulla con una nota per il cliente, come da "Richieste e lavori". */
  async function handleCancelWithNote(note: string | undefined) {
    if (!token || !cancelingBooking) return;
    await apiClient.cancelBookingByProfessional(token, cancelingBooking.id, { note });
    patchBooking(cancelingBooking.id, { status: "CANCELED", canceledBy: "PROFESSIONAL", cancellationNote: note ?? null });
    setCancelingBooking(null);
    setSelectedBooking(null);
  }

  // Mentre carica si tiene il posto della pagina: prima non c'era nulla e il
  // piè di pagina saltava giù all'arrivo dell'agenda (A1 della verifica,
  // CLS 0,22, docs/CHANGELOG.md §310).
  if (isLoading || (token && isLoadingSlots)) {
    return (
      <div aria-busy="true" style={{ minHeight: "100vh", padding: 16, display: "flex", flexDirection: "column", gap: 16 }}>
        <SkeletonBlock height={44} radius={12} />
        <SkeletonBlock height={420} radius={20} />
      </div>
    );
  }

  if (!user || !token) {
    return (
      <YStack width="100%" alignItems="center" backgroundColor="transparent" paddingVertical="$9" paddingHorizontal="$4">
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
      <YStack width="100%" alignItems="center" backgroundColor="transparent" paddingVertical="$9" paddingHorizontal="$4">
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
      <YStack width="100%" alignItems="center" backgroundColor="transparent" paddingVertical="$9" paddingHorizontal="$4">
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
  //
  // Se il salvataggio non riesce la pagina torna alle fasce salvate davvero
  // (docs/CHANGELOG.md §287), invece di mostrare fasce che il server non ha.
  // `persistSeqRef` evita che un errore vecchio annulli un salvataggio più
  // recente fatto nel frattempo.
  async function persistSlots(nextSlots: SlotDraft[]) {
    setError(null);
    const seq = ++persistSeqRef.current;
    const rollback = () => {
      if (seq === persistSeqRef.current) setSlots(savedSlotsRef.current);
    };
    for (const slot of nextSlots) {
      if (slot.end <= slot.start) {
        setError("L'orario di fine deve essere dopo l'orario di inizio in ogni fascia.");
        rollback();
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
      savedSlotsRef.current = nextSlots;
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      // Aggiorna il pallino su "Agenda" nel menu e l'avviso in Oggi.
      // Stesso criterio dell'API (`agendaAttention` di packages/shared).
      if ((user?.agendaAttention ?? null) !== agendaAttention(nextSlots)) void refreshUser();
    } catch (err) {
      rollback();
      if (err instanceof Error && err.message.includes("profilo")) {
        setProfileMissing(true);
        return;
      }
      setError(err instanceof Error ? `${err.message} Le modifiche non sono state salvate.` : "Modifiche non salvate, riprova.");
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
                fontFamily="$body"
                fontSize={9}
                fontWeight="700"
                letterSpacing={0.2}
                color={allDaySelected ? brand.cianografiaScuro : brand.grafite70}
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
      <YStack gap="$2" minWidth={0} opacity={isPast ? 0.55 : 1}>
        {!isPast ? (
          <XStack
            alignItems="center"
            gap="$1"
            minWidth={0}
            cursor="pointer"
            opacity={exceptionBusyDate === dateStr ? 0.5 : 1}
            onPress={() => toggleException(dateStr)}
            accessibilityRole="button"
            // "Chiudi venerdì 30" invece di sei "Chiudi" uguali per il lettore di schermo (A3, §310).
            accessibilityLabel={`${isClosed ? "Riapri" : "Chiudi"} ${formatAppointmentDate(date, { weekday: "long", day: "numeric" })}`}
          >
            <Text fontFamily="$body" fontSize={12} fontWeight="600" color={brand.grafite70} textDecorationLine="underline">
              {isClosed ? "Riapri" : "Chiudi"}
            </Text>
          </XStack>
        ) : null}

        {isClosed ? (
          <XStack alignSelf="flex-start" borderRadius={999} paddingHorizontal={10} paddingVertical={4} backgroundColor="#ECECE8">
            <Text fontFamily="$body" fontSize={12} fontWeight="600" color={brand.grafite70}>
              Chiuso
            </Text>
          </XStack>
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
                height={32}
                borderWidth={1}
                borderStyle="dashed"
                borderColor={brand.grafite70}
                borderRadius={999}
                alignItems="center"
                justifyContent="center"
                cursor="pointer"
                backgroundColor={editingKey === `new-${dateStr}` ? brand.cianografiaVelo : undefined}
                onPress={() => startAddSlot(dayOfWeek, dateStr)}
                accessibilityRole="button"
                accessibilityLabel="Aggiungi fascia oraria"
              >
                <Icon name="plus" size={16} strokeWidth={2} color={brand.grafite} />
              </XStack>
            ) : daySlots.length === 0 ? (
              <Text fontFamily="$body" fontSize={11} fontWeight="600" color={brand.grafite70}>
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
        <Text fontFamily="$body" fontSize={11} fontWeight="600" color={brand.urgenza}>
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
          <Text fontFamily="$body" fontSize={11} fontWeight="600" color={allSelected ? brand.cianografiaScuro : brand.grafite70}>
            {daySlotsWithIndex.length}
          </Text>
        </XStack>
      );
    }
    const daySlots = daySlotsWithIndex.map(({ s }) => s);
    return (
      <XStack gap={3} flexWrap="wrap" alignItems="center">
        {daySlots.slice(0, 4).map((s, i) => (
          <YStack key={i} width={6} height={6} borderRadius={3} backgroundColor={brand.cianografia} />
        ))}
        {daySlots.length > 4 ? (
          <Text fontFamily="$body" fontSize={11} color={brand.grafite70}>
            +{daySlots.length - 4}
          </Text>
        ) : null}
      </XStack>
    );
  }

  function bookingsOnDate(date: Date): ProfessionalBooking[] {
    const dateStr = toIsoDate(date);
    return (bookings ?? [])
      .filter((b) => jobOccurrenceOn(b.scheduledAt, b.scheduledEndAt, dateStr) !== null)
      .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
  }

  function externalJobsOnDate(date: Date): ExternalJob[] {
    const dateStr = toIsoDate(date);
    return (externalJobs ?? [])
      .filter((j) => jobOccurrenceOn(j.scheduledAt, j.scheduledEndAt, dateStr) !== null)
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
          jobOccurrenceOn(lead.quote.estimatedStartDate, lead.quote.estimatedEndDate, dateStr) !== null,
      )
      .sort((a, b) => a.quote!.estimatedStartDate.localeCompare(b.quote!.estimatedStartDate));
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
          <Text fontFamily="$body" fontSize={11} color={brand.grafite70}>
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

  // ——— Nuova agenda (docs/CHANGELOG.md §288) ———
  const now = wallClockNow(new Date(nowTick));
  const today = todayUtc();
  const todayStr = toIsoDate(today);
  // Striscia dei giorni: sette giorni a partire da oggi, così la domenica
  // sera "domani" è a un tocco (T4 del test dei compiti, docs/CHANGELOG.md
  // §311); le frecce ai lati portano al giorno prima e dopo e la striscia
  // scorre di sette giorni alla volta, sempre contando da oggi (§320).
  function stripDays(current: Date): Date[] {
    const offset = Math.round((startOfDayUtc(current).getTime() - startOfDayUtc(today).getTime()) / 86_400_000);
    const start = addDaysUtc(today, Math.floor(offset / 7) * 7);
    return Array.from({ length: 7 }, (_, i) => addDaysUtc(start, i));
  }
  function dayStrip(current: Date, onChange: (date: Date) => void, withWeather: boolean) {
    return (
      <div className="ag-strip-row">
        <button type="button" className="ag-strip-arrow" aria-label="Giorno precedente" onClick={() => onChange(addDaysUtc(current, -1))}>
          <ChevronLeft size={20} aria-hidden />
        </button>
        <div className="ag-strip" role="group" aria-label="Giorni della settimana">
          {stripDays(current).map((date) => {
            const dateStr = toIsoDate(date);
            return (
              <button
                key={dateStr}
                type="button"
                className={`${isSameDateUtc(date, current) ? "on" : ""} ${dateStr === todayStr ? "today" : ""}`}
                onClick={() => onChange(date)}
                aria-pressed={isSameDateUtc(date, current)}
              >
                {weekdayShortLabel(date)} <b>{date.getUTCDate()}</b>
                {withWeather && weather.get(dateStr) ? (
                  <WeatherIcon kind={weather.get(dateStr)!} size={12} />
                ) : withWeather && busyDates.has(dateStr) ? (
                  <u aria-hidden />
                ) : null}
              </button>
            );
          })}
        </div>
        <button type="button" className="ag-strip-arrow" aria-label="Giorno successivo" onClick={() => onChange(addDaysUtc(current, 1))}>
          <ChevronRight size={20} aria-hidden />
        </button>
      </div>
    );
  }
  const nowMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();
  const closedSet = new Set(exceptionDates);

  function bookingKind(b: ProfessionalBooking): AgendaGridEvent["kind"] {
    if (b.status === "CANCELED" || b.status === "NO_SHOW") return "canceled";
    if (b.status === "COMPLETED") return "done";
    return b.status === "PENDING" ? "pending" : "conf";
  }

  /**
   * Posizione nella griglia di un appuntamento, una per giorno: un lavoro su
   * più giorni compare ogni giorno con lo stesso orario (docs/CHANGELOG.md
   * §310), con "Giorno 2 di 3".
   */
  function onEachDay(startIso: string, endIso: string | null, key: string) {
    const days = jobOccurrences(startIso, endIso);
    return days.map((occurrence, i) => {
      const start = wallMinutes(occurrence.start.toISOString());
      const end = occurrence.end ? wallMinutes(occurrence.end.toISOString()) || 24 * 60 : null;
      return {
        key: days.length > 1 ? `${key}-${occurrence.date}` : key,
        date: occurrence.date,
        start,
        end: end !== null ? Math.max(start + 15, end) : start + DEFAULT_DURATION_MIN,
        dayOf: days.length > 1 ? `Giorno ${i + 1} di ${days.length}` : null,
      };
    });
  }

  const gridEvents: AgendaGridEvent[] = [
    ...(filters.has("conf") || filters.has("done")
      ? (bookings ?? [])
          .filter((b) => (b.status === "COMPLETED" ? filters.has("done") : filters.has("conf")))
          .flatMap((b) =>
            onEachDay(b.scheduledAt, b.scheduledEndAt, `booking-${b.id}`).map((day) => ({
              ...day,
              title: b.clientAccountDeleted ? "Account eliminato" : ([b.recipientName, b.recipientSurname].filter(Boolean).join(" ") || b.clientName || "Cliente"),
              detail: [day.dayOf, b.categoryLabel, b.serviceMode === "ONLINE" ? "online" : b.city].filter(Boolean).join(" · "),
              kind: bookingKind(b),
              label: AGENDA_BOOKING_STATUS_LABEL[b.status],
              onPress: () => setSelectedBooking(b),
            })),
          )
      : []),
    ...(filters.has("ext")
      ? (externalJobs ?? []).flatMap((j) =>
          onEachDay(j.scheduledAt, j.scheduledEndAt, `external-${j.id}`).map((day) => ({
            ...day,
            title: j.clientName,
            detail: [day.dayOf, "Lavoro esterno"].filter(Boolean).join(" · "),
            kind: j.status === "CANCELED" ? ("canceled" as const) : ("ext" as const),
            label: "Lavoro esterno",
            onPress: () => setSelectedExternalJob(j),
          })),
        )
      : []),
    ...(filters.has("wait")
      ? (leads ?? [])
          .filter((lead) => lead.quote && lead.quote.bookingStatus === null && (lead.quote.status === "SENT" || lead.quote.status === "MODIFICATION_REQUESTED"))
          .flatMap((lead) => {
            const quote = lead.quote!;
            return onEachDay(quote.estimatedStartDate, quote.estimatedEndDate, `pending-${lead.id}`).map((day) => ({
              ...day,
              title: lead.guidedRequest.clientAccountDeleted ? "Account eliminato" : (lead.guidedRequest.clientName ?? "Cliente"),
              detail: [day.dayOf, "In attesa del cliente"].filter(Boolean).join(" · "),
              kind: "wait" as const,
              label: "Preventivo in attesa",
              onPress: () => router.push(`/dashboard/richieste?open=${lead.guidedRequest.id}`),
            }));
          })
      : []),
  ];

  /** Orari liberi di un giorno: le fasce dell'agenda, da oggi in poi, nei giorni aperti. */
  function freeBandsOn(dateStr: string): AgendaFreeBand[] {
    if (closedSet.has(dateStr) || dateStr < todayStr) return [];
    return slots
      .filter((slot) => slotAppliesOnDateStr(slot, dateStr))
      .map((slot) => ({ date: dateStr, start: timeMinutes(slot.start), end: timeMinutes(slot.end) }));
  }

  /** Minuti liberi di un giorno: fasce meno gli appuntamenti che ci cadono dentro (`null` senza fasce). */
  function freeMinutesOn(dateStr: string): number | null {
    const bands = freeBandsOn(dateStr);
    if (bands.length === 0) return null;
    const busy = gridEvents.filter((e) => e.date === dateStr && e.kind !== "canceled" && e.kind !== "wait");
    let total = 0;
    for (const band of bands) {
      let free = band.end - band.start;
      for (const e of busy) free -= Math.max(0, Math.min(band.end, e.end) - Math.max(band.start, e.start));
      total += Math.max(0, free);
    }
    return total;
  }

  function dayNote(dateStr: string): AgendaDayNote | null {
    const free = freeMinutesOn(dateStr);
    if (free === null) return null;
    return free === 0 ? { text: "Pieno", tone: "full" } : { text: `${hoursText(free)} libere`, tone: "free" };
  }

  const visibleDays = bookingView === "day" ? [bookingCurrentDate] : weekDays(bookingCurrentDate);
  const visibleDayStrs = visibleDays.map(toIsoDate);
  const freeBands = filters.has("free") ? visibleDayStrs.flatMap(freeBandsOn) : [];
  const busyDates = new Set(gridEvents.filter((e) => e.kind !== "canceled").map((e) => e.date));
  const rangeEvents = gridEvents.filter((e) => visibleDayStrs.includes(e.date) && e.kind !== "canceled" && e.kind !== "wait");
  const rangeFree = visibleDayStrs.reduce((sum, d) => sum + (freeMinutesOn(d) ?? 0), 0);
  const rangeWaiting = gridEvents.filter((e) => visibleDayStrs.includes(e.date) && e.kind === "wait").length;
  const rangeSummary = [
    `${rangeEvents.length} ${rangeEvents.length === 1 ? "lavoro" : "lavori"}`,
    rangeWaiting > 0 ? `${rangeWaiting} in attesa` : null,
    rangeFree > 0 ? `${hoursText(rangeFree)} libere` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const filterCount = (filter: AgendaFilter): string => {
    if (filter === "free") return hoursText(visibleDayStrs.reduce((sum, d) => sum + (freeMinutesOn(d) ?? 0), 0));
    const inRange = (date: string) => visibleDayStrs.includes(date);
    if (filter === "conf") return String((bookings ?? []).filter((b) => inRange(b.scheduledAt.slice(0, 10)) && (b.status === "CONFIRMED" || b.status === "PENDING")).length);
    if (filter === "done") return String((bookings ?? []).filter((b) => inRange(b.scheduledAt.slice(0, 10)) && b.status === "COMPLETED").length);
    if (filter === "ext") return String((externalJobs ?? []).filter((j) => inRange(j.scheduledAt.slice(0, 10)) && j.status !== "CANCELED").length);
    return String(rangeWaiting);
  };

  // Prossimo appuntamento di oggi, con le azioni a portata di pollice.
  const nextBooking =
    (bookings ?? [])
      .filter((b) => b.status === "CONFIRMED")
      .flatMap((b) => {
        // Di un lavoro su più giorni conta l'orario di oggi (§310).
        const occurrence = jobOccurrenceOn(b.scheduledAt, b.scheduledEndAt, todayStr);
        if (!occurrence) return [];
        const start = occurrence.start.toISOString();
        const endMinutes = occurrence.end ? wallMinutes(occurrence.end.toISOString()) || 24 * 60 : wallMinutes(start) + DEFAULT_DURATION_MIN;
        return endMinutes > nowMinutes ? [{ booking: b, start }] : [];
      })
      .sort((a, b) => a.start.localeCompare(b.start))[0]?.booking ?? null;

  function navigateCalendar(direction: -1 | 1) {
    if (bookingView === "day") setBookingCurrentDate(addDaysUtc(bookingCurrentDate, direction));
    else if (bookingView === "week") setBookingCurrentDate(addDaysUtc(bookingCurrentDate, 7 * direction));
    else if (bookingView === "year") setBookingCurrentDate(addYearsUtc(bookingCurrentDate, direction));
    else setBookingCurrentDate(addMonthsUtc(bookingCurrentDate, direction));
  }

  const rangeLabel =
    bookingView === "day"
      ? `${weekdayShortLabel(bookingCurrentDate)} ${bookingCurrentDate.getUTCDate()} ${monthLabel(bookingCurrentDate)}`
      : bookingView === "week"
        ? formatDayRangeLabel(visibleDays[0]!, visibleDays[6]!)
        : bookingView === "year"
          ? String(bookingCurrentDate.getUTCFullYear())
          : `${monthLabel(bookingCurrentDate)} ${bookingCurrentDate.getUTCFullYear()}`;

  // Settimana tipo (docs/CHANGELOG.md §323): "Salva la settimana" la porta
  // subito nei prossimi giorni e da lì vale per tutte le settimane.
  async function changeWeekTemplate(next: AgendaWeekTemplate) {
    if (!token) return;
    setTemplateNotice(null);
    setSavingTemplate(true);
    try {
      const state = await apiClient.saveAgendaWeekTemplate(token, next);
      setWeekTemplate(state.template);
      setWeekTemplateActive(state.active);
      setSlotsReload((n) => n + 1);
      setTemplateNotice(
        state.changedDays > 0
          ? `Settimana salvata: orari aggiornati in ${state.changedDays} ${state.changedDays === 1 ? "giorno" : "giorni"}. I giorni cambiati a mano, quelli chiusi e quelli con lavori già fissati restano com'erano.`
          : "Settimana salvata.",
      );
    } catch (err) {
      setTemplateNotice(err instanceof Error ? `${err.message} La settimana non è stata salvata.` : "Settimana non salvata, riprova.");
    } finally {
      setSavingTemplate(false);
    }
  }

  // "Aggiungi alla settimana tipo" da Richieste in zona.
  function addDemandSlot(weekday: number, part: DayPart) {
    if (!weekTemplate) return;
    const range = DAY_PART_RANGE[part];
    const slot = { start: range.start, end: range.end, allowsHome: true, allowsOnline: false, homeMax: 1, onlineMax: null };
    void changeWeekTemplate({
      days: weekTemplate.days.map((daySlots, day) => (day === weekday ? [...daySlots, slot].sort((a, b) => a.start.localeCompare(b.start)) : daySlots)),
    });
  }

  /** Ferie: chiude in un colpo tutti i giorni tra due date. */
  async function addVacation() {
    // "Al" vuoto = un giorno solo (T1 del test dei compiti, docs/CHANGELOG.md §311).
    const until = vacationTo || vacationFrom;
    if (!token || !vacationFrom || until < vacationFrom) return;
    setVacationBusy(true);
    setError(null);
    try {
      let latest = exceptionDates;
      for (let d = parseIsoDate(vacationFrom); toIsoDate(d) <= until; d = addDaysUtc(d, 1)) {
        const dateStr = toIsoDate(d);
        if (latest.includes(dateStr) || dateStr < todayStr) continue;
        latest = (await apiClient.addAvailabilityException(token, dateStr)).exceptionDates;
      }
      setExceptionDates(latest);
      setVacationFrom("");
      setVacationTo("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ferie non salvate, riprova.");
    } finally {
      setVacationBusy(false);
    }
  }

  const upcomingClosed = exceptionDates.filter((d) => d >= todayStr).sort();

  function openStop(key: string) {
    if (key.startsWith("booking-")) {
      const match = (bookings ?? []).find((b) => `booking-${b.id}` === key);
      if (match) setSelectedBooking(match);
    } else {
      const match = (externalJobs ?? []).find((j) => `external-${j.id}` === key);
      if (match) setSelectedExternalJob(match);
    }
  }

  const tabs: { value: AgendaTab; label: string }[] = [
    { value: "calendario", label: "Calendario" },
    { value: "orari", label: "Orari di lavoro" },
    { value: "giro", label: "Giro intelligente" },
  ];

  const nextCard = nextBooking ? (
    <div className="ag-card ag-next">
      <b>
        Prossimo · {formatAppointmentTimeRange(nextBooking.scheduledAt, nextBooking.scheduledEndAt)}{" "}
        {[nextBooking.recipientName, nextBooking.recipientSurname].filter(Boolean).join(" ") || nextBooking.clientName || "Cliente"}
      </b>
      <span className="ag-muted" style={{ fontSize: 13 }}>
        {nextBooking.serviceMode === "ONLINE" ? "Online" : [nextBooking.street, nextBooking.houseNumber].filter(Boolean).join(" ") || nextBooking.city || nextBooking.categoryLabel}
      </span>
      <div className="ag-actions">
        {nextBooking.serviceMode !== "ONLINE" && nextBooking.street && nextBooking.houseNumber ? (
          <a
            className="ag-btn sm primary"
            href={navigateUrl(`${nextBooking.street} ${nextBooking.houseNumber}, ${[nextBooking.postalCode, nextBooking.city].filter(Boolean).join(" ")}`)}
            target="_blank"
            rel="noreferrer"
          >
            <Navigation size={15} aria-hidden /> Naviga
          </a>
        ) : null}
        {nextBooking.serviceMode !== "ONLINE" && !nextBooking.onTheWayAt ? (
          <button type="button" className="ag-btn sm" onClick={() => void handleOnTheWay(nextBooking).catch((err) => setBookingsError(err instanceof Error ? err.message : "Avviso non inviato, riprova."))}>
            <Truck size={15} aria-hidden /> Sto arrivando
          </button>
        ) : null}
        {nextBooking.recipientPhone ?? nextBooking.clientPhone ? (
          <a className="ag-btn sm" href={`tel:${(nextBooking.recipientPhone ?? nextBooking.clientPhone)!.replace(/\s+/g, "")}`}>
            <Phone size={15} aria-hidden /> Chiama
          </a>
        ) : null}
      </div>
      <button type="button" className="ag-link" style={{ marginTop: 12, fontSize: 13.5 }} onClick={() => setSelectedBooking(nextBooking)}>
        Apri l&apos;appuntamento ›
      </button>
    </div>
  ) : null;

  return (
    <div className="ag" style={{ padding: "32px 16px 96px", boxSizing: "border-box" }}>
      <AgendaStyles />
      <div style={{ maxWidth: 1180, margin: "0 auto" }}>
        <div className="ag-head">
          <h1>Agenda</h1>
          <div className="ag-head-right">
            <button type="button" className="ag-btn" onClick={() => setShowCalendarLink(true)} aria-label="Collega al tuo calendario">
              <CalendarDays size={16} aria-hidden /> <span className="ag-hide-phone">Collega al tuo calendario</span>
            </button>
            <button type="button" className="ag-btn primary ag-hide-phone" onClick={() => setCreatingExternalJobFor(bookingCurrentDate)}>
              <Plus size={16} aria-hidden /> Lavoro esterno
            </button>
          </div>
        </div>

        <div className="ag-seg ag-tabs" role="group" aria-label="Sezioni dell'agenda">
          {tabs.map((tab) => (
            <button key={tab.value} type="button" aria-pressed={activeTab === tab.value} onClick={() => setActiveTab(tab.value)}>
              {tab.label}
            </button>
          ))}
        </div>

        {offlineSavedAt ? (
          <div className="ag-banner warn" role="status">
            Senza connessione: agenda aggiornata alle {new Date(offlineSavedAt).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}.
          </div>
        ) : null}

        {slots.length === 0 && activeTab !== "orari" ? (
          <div className="ag-banner info">
            <span>Non hai ancora orari di lavoro: aggiungili e i clienti potranno prenotarti più facilmente.</span>
            <button type="button" className="ag-btn sm" onClick={() => setActiveTab("orari")}>
              Imposta gli orari
            </button>
          </div>
        ) : null}

        {activeTab === "calendario" ? (
          <div className="ag-layout">
            <aside className="ag-aside" aria-label="Riepilogo">
              {nextCard}
              <AgendaMiniMonth
                selected={bookingCurrentDate}
                rangeDates={new Set(bookingView === "day" || bookingView === "week" ? visibleDayStrs : [])}
                busyDates={busyDates}
                today={today}
                onPick={(date) => {
                  setBookingCurrentDate(date);
                  if (bookingView === "month" || bookingView === "year") setBookingView("day");
                }}
              />
              <div className="ag-card">
                <h3 style={{ marginBottom: 6 }}>Mostra</h3>
                {(
                  [
                    { value: "conf", label: "Appuntamenti", swatch: "ag-swatch-conf" },
                    { value: "done", label: "Completati", swatch: "ag-swatch-done" },
                    { value: "wait", label: "Preventivi in attesa", swatch: "ag-swatch-wait" },
                    { value: "ext", label: "Lavori esterni", swatch: "ag-swatch-ext" },
                    { value: "free", label: "Orari liberi", swatch: "ag-swatch-free" },
                  ] as const
                ).map((item) => (
                  <button
                    key={item.value}
                    type="button"
                    className="ag-filter"
                    aria-pressed={filters.has(item.value)}
                    onClick={() =>
                      setFilters((prev) => {
                        const next = new Set(prev);
                        if (next.has(item.value)) next.delete(item.value);
                        else next.add(item.value);
                        return next;
                      })
                    }
                  >
                    <i className={item.swatch} aria-hidden />
                    {item.label}
                    {bookingView === "day" || bookingView === "week" ? <em>{filterCount(item.value)}</em> : null}
                  </button>
                ))}
              </div>
              <div className="ag-card">
                <h3>Orari di lavoro</h3>
                <p className="ag-muted" style={{ fontSize: 13, marginTop: 4 }}>
                  {upcomingClosed.length > 0 ? `Prossima chiusura: ${parseIsoDate(upcomingClosed[0]!).getUTCDate()} ${monthLabel(parseIsoDate(upcomingClosed[0]!))}` : "Settimana tipo, giorni diversi e ferie."}
                </p>
                <button type="button" className="ag-link" style={{ marginTop: 10, fontSize: 13.5 }} onClick={() => setActiveTab("orari")}>
                  Modifica gli orari ›
                </button>
              </div>
            </aside>

            <div style={{ minWidth: 0 }}>
              <div className="ag-toolbar">
                <button type="button" className="ag-btn sm" onClick={() => setBookingCurrentDate(today)}>
                  Oggi
                </button>
                <button type="button" className="ag-icon-btn" onClick={() => navigateCalendar(-1)} aria-label="Periodo precedente">
                  <ChevronLeft size={18} aria-hidden />
                </button>
                <button type="button" className="ag-icon-btn" onClick={() => navigateCalendar(1)} aria-label="Periodo successivo">
                  <ChevronRight size={18} aria-hidden />
                </button>
                <span className="ag-range" style={{ textTransform: "capitalize" }}>
                  {rangeLabel}
                </span>
                <div className="ag-seg" role="group" aria-label="Vista" style={{ marginLeft: "auto" }}>
                  {(
                    [
                      { value: "day", label: "Giorno" },
                      { value: "week", label: "Settimana" },
                      { value: "month", label: "Mese" },
                      { value: "year", label: "Anno" },
                    ] as const
                  ).map((item) => (
                    <button key={item.value} type="button" aria-pressed={bookingView === item.value} onClick={() => setBookingView(item.value)}>
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
                <label className="ag-input" style={{ display: "flex", alignItems: "center", gap: 8, flex: "1 1 220px", maxWidth: 380 }}>
                  <Search size={16} aria-hidden style={{ color: "var(--ag-muted)", flex: "none" }} />
                  <input
                    aria-label="Cerca nell'agenda"
                    type="text"
                    value={agendaSearchQuery}
                    onChange={(e) => setAgendaSearchQuery(e.target.value)}
                    placeholder="Cerca cliente, via, lavoro..."
                    style={{ flex: 1, minWidth: 0, border: "none", outline: "none", background: "transparent", fontSize: 14, color: brand.grafite, font: "inherit" }}
                  />
                  {agendaSearchQuery ? (
                    <button type="button" onClick={() => setAgendaSearchQuery("")} aria-label="Cancella ricerca" style={{ border: 0, background: "none", cursor: "pointer", padding: 4, display: "grid" }}>
                      <X size={15} aria-hidden />
                    </button>
                  ) : null}
                </label>
                {bookingView === "day" || bookingView === "week" ? <span className="ag-summary">{rangeSummary}</span> : null}
              </div>

              {bookingView === "day" ? (
                <>
                  {dayStrip(bookingCurrentDate, setBookingCurrentDate, true)}
                  {isSameDateUtc(bookingCurrentDate, today) ? <div className="ag-day-only-phone">{nextCard}</div> : null}
                </>
              ) : null}

              {bookingsError && !bookings ? (
                <div className="ag-banner error" role="alert">
                  {bookingsError}
                </div>
              ) : null}

              {bookings === null && !bookingsError ? (
                <SkeletonBlock height={420} radius={20} />
              ) : agendaSearchQuery.trim() ? (
                <AgendaEventsList items={agendaSearchResults} emptyLabel="Nessun appuntamento corrisponde alla ricerca." />
              ) : bookingView === "day" || bookingView === "week" ? (
                <AgendaTimeGrid
                  days={visibleDays}
                  events={gridEvents}
                  free={freeBands}
                  closedDates={closedSet}
                  weather={weather}
                  today={today}
                  nowMinutes={nowMinutes}
                  selectedKey={selectedBooking ? `booking-${selectedBooking.id}` : null}
                  dayNote={dayNote}
                  onDayPress={(date) => {
                    setBookingCurrentDate(date);
                    setBookingView("day");
                  }}
                />
              ) : bookingView === "month" ? (
                <div className="ag-card" style={{ padding: 12 }}>
                  <MonthGrid
                    currentDate={bookingCurrentDate}
                    today={today}
                    onSelectDay={(date) => {
                      setBookingCurrentDate(date);
                      setBookingView("day");
                    }}
                    renderMonthCell={renderBookingMonthCell}
                  />
                </div>
              ) : (
                renderBookingYearList()
              )}
              {bookingsError && bookings ? (
                <div className="ag-banner error" role="alert" style={{ marginTop: 12 }}>
                  {bookingsError}
                </div>
              ) : null}
            </div>
          </div>
        ) : activeTab === "orari" ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            {/* Chiudere un giorno è il compito più frequente della scheda: prima di tutto (T1, §311). */}
            <div className="ag-card" style={{ padding: 20 }}>
              <h2 style={{ fontSize: 19 }}>Chiudi un giorno o le ferie</h2>
              <p className="ag-muted" style={{ fontSize: 13.5, marginTop: 4 }}>
                Per un giorno solo basta &quot;Dal&quot;. I giorni chiusi non si possono prenotare.
              </p>
              <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap", marginTop: 12 }}>
                <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13, fontWeight: 600 }}>
                  Dal
                  <ItalianDateInput className="ag-input" min={todayStr} value={vacationFrom} onChange={setVacationFrom} />
                </label>
                <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13, fontWeight: 600 }}>
                  Al (facoltativo)
                  <ItalianDateInput className="ag-input" min={vacationFrom || todayStr} value={vacationTo} onChange={setVacationTo} />
                </label>
                <button type="button" className="ag-btn" disabled={vacationBusy || !vacationFrom || (vacationTo !== "" && vacationTo < vacationFrom)} onClick={() => void addVacation()}>
                  {vacationBusy ? "Salvo..." : !vacationTo || vacationTo === vacationFrom ? "Chiudi questo giorno" : "Chiudi questi giorni"}
                </button>
              </div>
              {upcomingClosed.length > 0 ? (
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 14 }}>
                  {upcomingClosed.slice(0, 30).map((dateStr) => (
                    <button
                      key={dateStr}
                      type="button"
                      className="ag-pill"
                      style={{ border: 0, cursor: "pointer", height: 32 }}
                      disabled={exceptionBusyDate === dateStr}
                      onClick={() => void toggleException(dateStr)}
                    >
                      {weekdayShortLabel(parseIsoDate(dateStr))} {parseIsoDate(dateStr).getUTCDate()} {monthLabel(parseIsoDate(dateStr))}
                      <span className="sr-only">, riapri</span>
                      <X size={13} aria-hidden />
                    </button>
                  ))}
                </div>
              ) : null}
            </div>

            {weekTemplate ? (
              <WeekTemplateEditor key={JSON.stringify(weekTemplate)} template={weekTemplate} active={weekTemplateActive} onSave={(next) => void changeWeekTemplate(next)} saving={savingTemplate} />
            ) : (
              <SkeletonBlock height={360} radius={20} />
            )}
            {templateNotice ? (
              <div className="ag-banner info" role="status" style={{ marginBottom: 0 }}>
                {templateNotice}
              </div>
            ) : null}

            <ZoneDemandCard demand={zoneDemand} template={weekTemplate} onAdd={addDemandSlot} />

            <div className="ag-card" style={{ padding: 20 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 6 }}>
                <h2 style={{ fontSize: 19 }}>Giorno per giorno</h2>
                <span className="ag-muted" style={{ fontSize: 13 }} aria-live="polite">
                  {isSubmitting ? "Salvo..." : saved ? "Salvato" : ""}
                </span>
                <button type="button" className="ag-btn sm" style={{ marginLeft: "auto" }} onClick={toggleSelectionMode}>
                  {selectionMode ? "Annulla" : "Elimina più fasce"}
                </button>
              </div>
              <p className="ag-muted" style={{ fontSize: 13.5, marginBottom: 14 }}>
                Tocca un giorno per aggiungere o cambiare le sue fasce, con il limite di prenotazioni a domicilio e online.
              </p>
              {selectionMode ? (
                <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
                  <button type="button" className="ag-link" onClick={toggleMonthSelection}>
                    Seleziona tutto il mese
                  </button>
                  <span className="ag-muted" style={{ fontSize: 13 }}>
                    {selectedSlotKeys.size} {selectedSlotKeys.size === 1 ? "fascia selezionata" : "fasce selezionate"}
                  </span>
                  {confirmingBulkDelete ? (
                    <>
                      <button type="button" className="ag-btn sm danger" onClick={deleteSelectedSlots}>
                        Conferma eliminazione
                      </button>
                      <button type="button" className="ag-btn sm" onClick={() => setConfirmingBulkDelete(false)}>
                        Annulla
                      </button>
                    </>
                  ) : (
                    <button type="button" className="ag-btn sm danger" disabled={selectedSlotKeys.size === 0} onClick={() => setConfirmingBulkDelete(true)}>
                      Elimina
                    </button>
                  )}
                </div>
              ) : null}
              {view === "day" ? (
                // Striscia della settimana come nel Calendario: venerdì è a un tocco, non a quattro frecce (U1, §310).
                dayStrip(currentDate, setCurrentDate, false)
              ) : null}
              <CalendarShell
                dayStripAbove
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
              {error && !editingKey ? (
                <div className="ag-banner error" role="alert" style={{ marginTop: 12, marginBottom: 0 }}>
                  {error}
                </div>
              ) : null}
            </div>
          </div>
        ) : (
          <DayRouteSection token={token} today={today} onOpenStop={openStop} />
        )}
      </div>

      {activeTab === "calendario" ? (
        // Con la scritta: il solo "+" non diceva cosa aggiunge (T9, docs/CHANGELOG.md §311).
        <button type="button" className="ag-fab" onClick={() => setCreatingExternalJobFor(bookingCurrentDate)}>
          <Plus size={22} aria-hidden /> Aggiungi lavoro
        </button>
      ) : null}

      {selectedBooking && !completingBooking && !cancelingBooking && !showBookingTimeline ? (
        <AppointmentPanel
          key={selectedBooking.id}
          booking={selectedBooking}
          onClose={() => setSelectedBooking(null)}
          onConfirm={() => void handleBookingAction("CONFIRMED")}
          onComplete={() => setCompletingBooking(selectedBooking)}
          onCancel={() => setCancelingBooking(selectedBooking)}
          onOnTheWay={() => handleOnTheWay(selectedBooking)}
          onSaveNote={handleSaveBookingNote}
          onSaveMeetingLink={handleSaveMeetingLink}
          onOpenMessages={selectedBooking.guidedRequestId && myProfileId ? () => setShowBookingTimeline(true) : undefined}
          isBusy={isBookingActionPending}
        />
      ) : null}

      {completingBooking ? (
        <CompleteJobModal
          quotedItems={completingBooking.items}
          jobName={completingBooking.categoryLabel}
          onClose={() => setCompletingBooking(null)}
          onComplete={handleComplete}
          uploadPhoto={(file) => apiClient.uploadBookingCompletionPhoto(token, file).then((r) => r.imageUrl)}
        />
      ) : null}
      {cancelingBooking ? <CancelBookingModal onClose={() => setCancelingBooking(null)} onCancel={handleCancelWithNote} /> : null}

      {showCalendarLink ? <CalendarLinkModal token={token} onClose={() => setShowCalendarLink(false)} /> : null}

      {showBookingTimeline && selectedBooking?.guidedRequestId && myProfileId ? (
        <TimelineModal
          token={token}
          guidedRequestId={selectedBooking.guidedRequestId}
          professionalProfileId={myProfileId}
          viewerRole="PROFESSIONAL"
          otherPartyName={selectedBooking.clientName}
          otherPartyImageUrl={selectedBooking.clientImageUrl}
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
    </div>
  );
}
