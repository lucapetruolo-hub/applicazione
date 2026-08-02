"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { ProfessionalBooking } from "@professionisti/shared";
import { Button, Icon, Text, XStack, YStack, brand } from "@professionisti/ui";
import { apiClient } from "@/lib/apiClient";
import { useAuth } from "@/lib/AuthContext";
import { CalendarShell, type CalendarView } from "@/components/calendar/CalendarShell";
import { BookingDetailPanel } from "@/components/calendar/BookingDetailPanel";
import { LoadingState } from "@/components/LoadingState";
import { datesInMonthForWeekday, monthLabel, parseIsoDate, slotAppliesOnDateStr, todayUtc, toIsoDate } from "@/lib/calendarDates";

// `date` (ISO, YYYY-MM-DD) è ora il comportamento di default per una nuova
// fascia (richiesta esplicita dell'utente: vale solo per quella data, non
// più per ogni <dayOfWeek> per sempre) — `null`/assente solo per le fasce
// ricorrenti create prima di questa funzionalità.
type SlotDraft = { id?: string; dayOfWeek: number; date: string | null; start: string; end: string; maxBookings: number; hasUpcomingBooking?: boolean };
type AgendaTab = "disponibilita" | "prenotazioni";

// dayOfWeek segue date.getUTCDay(): 0=domenica...6=sabato, stessa convenzione
// usata in tutto il modulo agenda.
const WEEKDAY_FULL_LABELS = ["Domenica", "Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato"];

function slotsOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return aStart < bEnd && bStart < aEnd;
}

const BOOKING_STATUS_COLOR: Record<ProfessionalBooking["status"], string> = {
  PENDING: brand.ottone,
  CONFIRMED: brand.verificato,
  COMPLETED: brand.grafite70,
  CANCELED: brand.urgenza,
  NO_SHOW: brand.urgenza,
};

export default function DashboardAgendaPage() {
  const { user, token, isLoading } = useAuth();

  const [activeTab, setActiveTab] = useState<AgendaTab>("disponibilita");

  const [slots, setSlots] = useState<SlotDraft[]>([]);
  const [bookableAgenda, setBookableAgenda] = useState(false);
  const [exceptionDates, setExceptionDates] = useState<string[]>([]);
  const [isLoadingSlots, setIsLoadingSlots] = useState(true);
  const [profileMissing, setProfileMissing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [saved, setSaved] = useState(false);

  const [view, setView] = useState<CalendarView>("week");
  const [currentDate, setCurrentDate] = useState(todayUtc());
  // "new-<dateStr>" (ISO) mentre si aggiunge una fascia nuova sulla colonna
  // di quella data esatta, "edit-<index>" mentre se ne modifica una
  // esistente — un solo editor inline alla volta.
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [draftStart, setDraftStart] = useState("09:00");
  const [draftEnd, setDraftEnd] = useState("13:00");
  const [draftMax, setDraftMax] = useState("1");
  // Spunta "ripeti per tutti i <giorno> del mese" (richiesta esplicita
  // dell'utente): solo per una fascia nuova, mai per una già esistente in
  // modifica — resettata ad ogni apertura dell'editor.
  const [repeatForMonth, setRepeatForMonth] = useState(false);
  const [exceptionBusyDate, setExceptionBusyDate] = useState<string | null>(null);

  // Secondo calendario, indipendente dal primo (vista/data di navigazione
  // separate): mostra gli eventi reali invece delle regole di disponibilità
  // — richiesta esplicita dell'utente di avere entrambi i calendari, uno per
  // impostare gli orari e uno dove compaiono le prenotazioni.
  const [bookings, setBookings] = useState<ProfessionalBooking[] | null>(null);
  const [bookingsError, setBookingsError] = useState<string | null>(null);
  const [bookingView, setBookingView] = useState<CalendarView>("week");
  const [bookingCurrentDate, setBookingCurrentDate] = useState(todayUtc());
  const [selectedBooking, setSelectedBooking] = useState<ProfessionalBooking | null>(null);
  const [isBookingActionPending, setIsBookingActionPending] = useState(false);

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
            maxBookings: s.maxBookings,
            hasUpcomingBooking: s.hasUpcomingBooking,
          })),
        );
        setBookableAgenda(Boolean(existing.bookableAgenda));
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
  }, [draftStart, draftEnd, editingKey, slots]);

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

  if (user.role !== "PROFESSIONAL") {
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
    setDraftMax("1");
    setRepeatForMonth(false);
  }

  function startEditSlot(index: number) {
    const slot = slots[index];
    if (!slot) return;
    setError(null);
    setEditingKey(`edit-${index}`);
    setDraftStart(slot.start);
    setDraftEnd(slot.end);
    setDraftMax(String(slot.maxBookings));
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
    const maxBookings = Math.max(1, Math.min(20, Math.round(Number(draftMax)) || 1));

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
      setSlots((prev) => [...prev, ...targetDates.map((date) => ({ dayOfWeek, date, start: draftStart, end: draftEnd, maxBookings }))]);
    } else if (editIndex !== null) {
      const liveError = slotEditorLiveError(dayOfWeek, editIndex);
      if (liveError) {
        setError(liveError);
        return;
      }
      setSlots((prev) => prev.map((s, i) => (i === editIndex ? { ...s, start: draftStart, end: draftEnd, maxBookings } : s)));
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
    setSlots((prev) => prev.filter((_, i) => i !== index));
    setEditingKey(null);
    setError(null);
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

  async function handleSubmit() {
    setError(null);
    for (const slot of slots) {
      if (slot.end <= slot.start) {
        setError("L'orario di fine deve essere dopo l'orario di inizio in ogni fascia.");
        return;
      }
    }

    setIsSubmitting(true);
    try {
      await apiClient.upsertMyAvailability(
        token as string,
        slots.map((slot) => ({
          dayOfWeek: slot.dayOfWeek,
          startTime: slot.start,
          endTime: slot.end,
          maxBookings: slot.maxBookings,
          date: slot.date ?? undefined,
        })),
        bookableAgenda,
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
          <Text fontFamily="$mono" fontSize={11} fontWeight="700" letterSpacing={0.5} textTransform="uppercase" color={brand.urgenza}>
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
          </>
        )}
      </YStack>
    );
  }

  function renderMonthCell(date: Date) {
    const dateStr = toIsoDate(date);
    if (exceptionDates.includes(dateStr)) {
      return (
        <Text fontFamily="$mono" fontSize={9} fontWeight="700" letterSpacing={0.3} textTransform="uppercase" color={brand.urgenza}>
          Chiuso
        </Text>
      );
    }
    const daySlots = slots.filter((s) => slotAppliesOnDateStr(s, dateStr));
    if (daySlots.length === 0) return null;
    return (
      <XStack gap={3} flexWrap="wrap" alignItems="center">
        {daySlots.slice(0, 4).map((s, i) => (
          <YStack key={i} width={6} height={6} borderRadius={3} backgroundColor={s.maxBookings > 1 ? brand.ottone : brand.cianografia} />
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

  function renderBookingDayColumn(date: Date) {
    const dayBookings = bookingsOnDate(date);
    if (dayBookings.length === 0) {
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
          const time = new Date(booking.scheduledAt).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
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
      </YStack>
    );
  }

  function renderBookingMonthCell(date: Date) {
    const dayBookings = bookingsOnDate(date);
    if (dayBookings.length === 0) return null;
    return (
      <XStack gap={3} flexWrap="wrap" alignItems="center">
        {dayBookings.slice(0, 4).map((b) => (
          <YStack key={b.id} width={6} height={6} borderRadius={3} backgroundColor={BOOKING_STATUS_COLOR[b.status]} />
        ))}
        {dayBookings.length > 4 ? (
          <Text fontFamily="$mono" fontSize={9} color={brand.grafite70}>
            +{dayBookings.length - 4}
          </Text>
        ) : null}
      </XStack>
    );
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
              { value: "disponibilita" as const, label: "Disponibilità" },
              { value: "prenotazioni" as const, label: "Prenotazioni" },
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

        {activeTab === "disponibilita" ? (
          <>
            <YStack
              flexDirection="row"
              alignItems="center"
              gap="$3"
              padding="$3"
              backgroundColor={brand.calce}
              borderWidth={1}
              borderColor={brand.filetto}
              borderRadius="$4"
              cursor="pointer"
              onPress={() => setBookableAgenda((v) => !v)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: bookableAgenda }}
            >
              <YStack
                width={22}
                height={22}
                borderRadius="$2"
                borderWidth={2}
                borderColor={bookableAgenda ? brand.cianografia : brand.filetto}
                backgroundColor={bookableAgenda ? brand.cianografia : brand.calce}
                alignItems="center"
                justifyContent="center"
              >
                {bookableAgenda ? <Icon name="check" size={14} strokeWidth={2} color="white" /> : null}
              </YStack>
              <YStack flex={1} gap="$1">
                <YStack flexDirection="row" gap="$2" alignItems="center">
                  <Icon name="receipt-text" size={16} strokeWidth={1.5} color={brand.grafite} />
                  <Text fontWeight="600" color={brand.grafite}>
                    Permetti ai clienti di prenotare direttamente le fasce esatte
                  </Text>
                </YStack>
                <Text fontSize="$2" color={brand.grafite70}>
                  Vale solo per le fasce con capienza 1 (esatte). Le fasce generiche (capienza &gt; 1) portano sempre a
                  una richiesta di preventivo, indipendentemente da questa opzione.
                </Text>
              </YStack>
            </YStack>

            <CalendarShell
              view={view}
              onViewChange={setView}
              currentDate={currentDate}
              onNavigate={setCurrentDate}
              onSelectDay={(date) => {
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
            {saved ? (
              <Text color={brand.verificato} fontSize="$3">
                Agenda salvata!
              </Text>
            ) : null}

            <Button variant="primary" onPress={handleSubmit} disabled={isSubmitting} opacity={isSubmitting ? 0.6 : 1} alignSelf="flex-start">
              {isSubmitting ? "Salvataggio..." : "Salva agenda"}
            </Button>
          </>
        ) : (
          <>
            {bookingsError ? (
              <Text color={brand.urgenza} fontSize="$3">
                {bookingsError}
              </Text>
            ) : null}
            {bookings === null ? (
              <LoadingState />
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
              />
            )}
          </>
        )}
      </YStack>

      {selectedBooking ? (
        <BookingDetailPanel
          booking={selectedBooking}
          onClose={() => setSelectedBooking(null)}
          onAction={handleBookingAction}
          isActionPending={isBookingActionPending}
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
          maxBookings={draftMax}
          liveError={error}
          onStartChange={setDraftStart}
          onEndChange={setDraftEnd}
          onMaxChange={setDraftMax}
          onSave={() => commitSlotEdit(editingDayOfWeek()!)}
          onCancel={() => setEditingKey(null)}
          // Spunta "ripeti per tutti i <giorno> del mese" (richiesta esplicita
          // dell'utente): solo mentre si crea una fascia nuova, mai in
          // modifica di una già esistente.
          isNew={editingKey.startsWith("new-")}
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

function SlotChip({
  slot,
  isConflicting,
  isEditing,
  onEdit,
}: {
  slot: SlotDraft;
  /** True se la fascia in modifica altrove nello stesso giorno si sovrappone a questa — colorata di rosso anche lei, non solo il riquadro in modifica (richiesta esplicita dell'utente). */
  isConflicting: boolean;
  /** True mentre questa fascia è aperta nel pop-up di modifica: evidenziata per farla ritrovare facilmente quando si chiude. */
  isEditing: boolean;
  onEdit: () => void;
}) {
  const isGeneric = slot.maxBookings > 1;
  // Solo l'orario, in piccolo, per restare dentro la colonna anche nella
  // vista Settimana (richiesta esplicita dell'utente): tutto il resto
  // (modifica, capienza, eliminazione) si apre nel pop-up di modifica
  // (SlotEditorModal) toccando l'intera fascia — niente più tasto "×" a
  // parte: su cellulare si sovrapponeva al riquadro della fascia, poco
  // chiaro, richiesta esplicita dell'utente.
  return (
    <XStack
      borderWidth={isConflicting || isEditing ? 1.5 : 1}
      borderStyle={isGeneric && !isConflicting ? "dashed" : "solid"}
      borderColor={isConflicting ? brand.urgenza : isEditing ? brand.cianografia : isGeneric ? brand.ottone : brand.cianografia}
      borderRadius="$2"
      paddingHorizontal="$1.5"
      paddingVertical={5}
      alignItems="center"
      gap={3}
      minWidth={0}
      cursor="pointer"
      backgroundColor={isConflicting ? brand.urgenzaVelo : isEditing ? brand.cianografiaVelo : brand.calce}
      onPress={onEdit}
      accessibilityRole="button"
      accessibilityLabel={`Modifica fascia ${slot.start}–${slot.end}`}
    >
      {slot.hasUpcomingBooking ? <Icon name="bell-ring" size={9} color={brand.urgenza} /> : null}
      <Text fontFamily="$mono" fontSize={10} fontWeight="700" color={isGeneric ? brand.ottone : brand.cianografia}>
        {slot.start}–{slot.end}
      </Text>
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
  maxBookings,
  liveError,
  onStartChange,
  onEndChange,
  onMaxChange,
  onSave,
  onCancel,
  onDelete,
  hasUpcomingBooking,
  isNew,
  repeatForMonth,
  onRepeatForMonthChange,
  repeatWeekdayLabel,
  repeatMonthLabel,
}: {
  dayLabel: string;
  start: string;
  end: string;
  maxBookings: string;
  /** Calcolato ad ogni render da slotEditorLiveError: mostrato subito, senza aspettare "Salva agenda". */
  liveError: string | null;
  onStartChange: (v: string) => void;
  onEndChange: (v: string) => void;
  onMaxChange: (v: string) => void;
  onSave: () => void;
  onCancel: () => void;
  /** Assente quando si sta creando una fascia nuova: solo una fascia già esistente si può eliminare. */
  onDelete?: () => void;
  /** Richiede una seconda conferma prima di eliminare, stesso pattern a due passaggi già in uso altrove nel progetto. */
  hasUpcomingBooking: boolean;
  /** True mentre si crea una fascia nuova: solo in questo caso ha senso la spunta "ripeti". */
  isNew: boolean;
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
          <Text fontFamily="$mono" fontSize={11} textTransform="uppercase" letterSpacing={0.5} color={brand.grafite70}>
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

        <YStack gap="$2">
          <Text fontFamily="$mono" fontSize={11} textTransform="uppercase" letterSpacing={0.5} color={brand.grafite70}>
            Numero massimo di prenotazioni
          </Text>
          <input type="number" min={1} max={20} value={maxBookings} onChange={(e) => onMaxChange(e.target.value)} style={modalMaxInputStyle} />
          <Text fontSize="$2" color={brand.grafite70}>
            1 = fascia esatta (prenotazione diretta se attiva). Più di 1 = fascia generica, sempre a richiesta di preventivo.
          </Text>
        </YStack>

        {isNew ? (
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
            <Text flex={1} fontSize="$3" color={brand.grafite}>
              Ripeti per tutti i {repeatWeekdayLabel.toLowerCase()} di {repeatMonthLabel.toLowerCase()}
            </Text>
          </XStack>
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
