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
import { todayUtc, toIsoDate } from "@/lib/calendarDates";

type SlotDraft = { id?: string; dayOfWeek: number; start: string; end: string; maxBookings: number; hasUpcomingBooking?: boolean };
type AgendaTab = "disponibilita" | "prenotazioni";

const timeInputStyle = { padding: 7, borderRadius: 4, border: `1px solid ${brand.filetto}`, fontSize: 13, fontFamily: "inherit", color: brand.grafite, width: 88 };
const maxInputStyle = { ...timeInputStyle, width: 46, textAlign: "center" as const };

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
  // "new-<dayOfWeek>" mentre si aggiunge una fascia nuova, "edit-<index>"
  // mentre se ne modifica una esistente — un solo editor inline alla volta.
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [draftStart, setDraftStart] = useState("09:00");
  const [draftEnd, setDraftEnd] = useState("13:00");
  const [draftMax, setDraftMax] = useState("1");
  // Rimuovere una fascia con prenotazioni future richiede un secondo click
  // di conferma (stesso pattern a due passaggi già in uso in
  // /le-mie-richieste per l'eliminazione di una richiesta).
  const [pendingDeleteIndex, setPendingDeleteIndex] = useState<number | null>(null);
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

  function startAddSlot(dayOfWeek: number) {
    setError(null);
    setEditingKey(`new-${dayOfWeek}`);
    setDraftStart("09:00");
    setDraftEnd("13:00");
    setDraftMax("1");
  }

  function startEditSlot(index: number) {
    const slot = slots[index];
    if (!slot) return;
    setError(null);
    setEditingKey(`edit-${index}`);
    setDraftStart(slot.start);
    setDraftEnd(slot.end);
    setDraftMax(String(slot.maxBookings));
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
    const overlaps = slots.some(
      (s, i) => s.dayOfWeek === dayOfWeek && i !== excludeIndex && slotsOverlap(draftStart, draftEnd, s.start, s.end),
    );
    return overlaps ? "Questa fascia si sovrappone a un'altra già impostata per questo giorno." : null;
  }

  function commitSlotEdit(dayOfWeek: number) {
    const editIndex = editingKey?.startsWith("edit-") ? Number(editingKey.slice(5)) : null;
    const liveError = slotEditorLiveError(dayOfWeek, editIndex);
    if (liveError) {
      setError(liveError);
      return;
    }
    const maxBookings = Math.max(1, Math.min(20, Math.round(Number(draftMax)) || 1));

    if (editingKey?.startsWith("new-")) {
      setSlots((prev) => [...prev, { dayOfWeek, start: draftStart, end: draftEnd, maxBookings }]);
    } else if (editIndex !== null) {
      setSlots((prev) => prev.map((s, i) => (i === editIndex ? { ...s, start: draftStart, end: draftEnd, maxBookings } : s)));
    }
    setEditingKey(null);
    setError(null);
  }

  function requestRemoveSlot(index: number) {
    const slot = slots[index];
    if (slot?.hasUpcomingBooking && pendingDeleteIndex !== index) {
      setPendingDeleteIndex(index);
      return;
    }
    setSlots((prev) => prev.filter((_, i) => i !== index));
    setPendingDeleteIndex(null);
    if (editingKey === `edit-${index}`) setEditingKey(null);
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
        slots.map((slot) => ({ dayOfWeek: slot.dayOfWeek, startTime: slot.start, endTime: slot.end, maxBookings: slot.maxBookings })),
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
      .filter(({ slot }) => slot.dayOfWeek === dayOfWeek)
      .sort((a, b) => a.slot.start.localeCompare(b.slot.start));

    return (
      <YStack gap="$2">
        {!isPast ? (
          <XStack
            alignItems="center"
            gap="$1"
            cursor="pointer"
            opacity={exceptionBusyDate === dateStr ? 0.5 : 1}
            onPress={() => toggleException(dateStr)}
            accessibilityRole="button"
          >
            <Text fontFamily="$mono" fontSize={10} fontWeight="600" letterSpacing={0.3} color={isClosed ? brand.verificato : brand.urgenza}>
              {isClosed ? "↺ Riapri giorno" : "✕ Chiudi giorno"}
            </Text>
          </XStack>
        ) : null}

        {isClosed ? (
          <Text fontFamily="$mono" fontSize={11} fontWeight="700" letterSpacing={0.5} textTransform="uppercase" color={brand.urgenza}>
            Chiuso
          </Text>
        ) : (
          <>
            {daySlots.map(({ slot, index }) =>
              editingKey === `edit-${index}` ? (
                <SlotEditorInline
                  key={index}
                  start={draftStart}
                  end={draftEnd}
                  maxBookings={draftMax}
                  liveError={slotEditorLiveError(dayOfWeek, index)}
                  onStartChange={setDraftStart}
                  onEndChange={setDraftEnd}
                  onMaxChange={setDraftMax}
                  onSave={() => commitSlotEdit(dayOfWeek)}
                  onCancel={() => setEditingKey(null)}
                />
              ) : (
                <SlotChip
                  key={index}
                  slot={slot}
                  pendingDelete={pendingDeleteIndex === index}
                  onEdit={() => startEditSlot(index)}
                  onRemove={() => requestRemoveSlot(index)}
                />
              ),
            )}
            {editingKey === `new-${dayOfWeek}` ? (
              <SlotEditorInline
                start={draftStart}
                end={draftEnd}
                maxBookings={draftMax}
                liveError={slotEditorLiveError(dayOfWeek, null)}
                onStartChange={setDraftStart}
                onEndChange={setDraftEnd}
                onMaxChange={setDraftMax}
                onSave={() => commitSlotEdit(dayOfWeek)}
                onCancel={() => setEditingKey(null)}
              />
            ) : (
              <Button variant="ghost" size="$2" height={30} alignSelf="flex-start" onPress={() => startAddSlot(dayOfWeek)}>
                + Fascia
              </Button>
            )}
          </>
        )}
      </YStack>
    );
  }

  function renderMonthCell(date: Date) {
    const dayOfWeek = date.getUTCDay();
    const dateStr = toIsoDate(date);
    if (exceptionDates.includes(dateStr)) {
      return (
        <Text fontFamily="$mono" fontSize={9} fontWeight="700" letterSpacing={0.3} textTransform="uppercase" color={brand.urgenza}>
          Chiuso
        </Text>
      );
    }
    const daySlots = slots.filter((s) => s.dayOfWeek === dayOfWeek);
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
    return (
      <YStack gap="$2">
        {dayBookings.map((booking) => {
          const time = new Date(booking.scheduledAt).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
          const isCanceled = booking.status === "CANCELED" || booking.status === "NO_SHOW";
          return (
            <YStack
              key={booking.id}
              borderLeftWidth={3}
              borderLeftColor={BOOKING_STATUS_COLOR[booking.status]}
              backgroundColor={brand.gesso}
              borderRadius="$2"
              padding="$2"
              gap="$1"
              cursor="pointer"
              opacity={isCanceled ? 0.6 : 1}
              onPress={() => setSelectedBooking(booking)}
              accessibilityRole="button"
            >
              <Text fontFamily="$mono" fontSize={11} fontWeight="700" color={brand.grafite} textDecorationLine={isCanceled ? "line-through" : "none"}>
                {time}
              </Text>
              <Text fontSize={11} color={brand.grafite70}>
                {booking.clientName ?? "Cliente"}
              </Text>
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
              ? "Imposta i giorni e le fasce orarie in cui sei disponibile: i clienti la vedranno sul tuo profilo pubblico. Ogni fascia si applica a tutti i giorni della settimana corrispondenti (es. una fascia aggiunta di lunedì vale per ogni lunedì) — per chiudere una singola data usa “Chiudi giorno”."
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

            {error ? (
              <Text color={brand.urgenza} fontSize="$3">
                {error}
              </Text>
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
    </YStack>
  );
}

function SlotChip({
  slot,
  pendingDelete,
  onEdit,
  onRemove,
}: {
  slot: SlotDraft;
  pendingDelete: boolean;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const isGeneric = slot.maxBookings > 1;
  return (
    <YStack
      borderWidth={1}
      borderStyle={isGeneric ? "dashed" : "solid"}
      borderColor={isGeneric ? brand.ottone : brand.cianografia}
      borderRadius="$2"
      padding="$2"
      gap="$1"
      backgroundColor={brand.calce}
    >
      <XStack justifyContent="space-between" alignItems="center" gap="$2">
        <Text fontFamily="$mono" fontSize={12} fontWeight="700" color={isGeneric ? brand.ottone : brand.cianografia}>
          {slot.start}–{slot.end}
        </Text>
        {slot.hasUpcomingBooking ? <Icon name="bell-ring" size={12} color={brand.urgenza} /> : null}
      </XStack>
      {isGeneric ? (
        <Text fontFamily="$mono" fontSize={9.5} textTransform="uppercase" color={brand.grafite70}>
          Generica · max {slot.maxBookings}
        </Text>
      ) : null}
      <XStack gap="$2">
        <Text fontSize={11} color={brand.cianografia} fontWeight="600" cursor="pointer" onPress={onEdit}>
          Modifica
        </Text>
        <Text fontSize={11} color={brand.urgenza} fontWeight="600" cursor="pointer" onPress={onRemove}>
          {pendingDelete ? "Conferma rimozione?" : "Rimuovi"}
        </Text>
      </XStack>
    </YStack>
  );
}

function SlotEditorInline({
  start,
  end,
  maxBookings,
  liveError,
  onStartChange,
  onEndChange,
  onMaxChange,
  onSave,
  onCancel,
}: {
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
}) {
  return (
    <YStack
      borderWidth={1}
      borderColor={liveError ? brand.urgenza : brand.cianografia}
      borderRadius="$2"
      padding="$2"
      gap="$2"
      backgroundColor={liveError ? brand.gesso : brand.cianografiaVelo}
    >
      <XStack gap="$1" alignItems="center" flexWrap="wrap">
        <input type="time" value={start} onChange={(e) => onStartChange(e.target.value)} style={timeInputStyle} />
        <Text fontSize="$1" color={brand.grafite70}>
          –
        </Text>
        <input type="time" value={end} onChange={(e) => onEndChange(e.target.value)} style={timeInputStyle} />
      </XStack>
      <XStack gap="$1" alignItems="center">
        <Text fontFamily="$mono" fontSize={9.5} textTransform="uppercase" color={brand.grafite70}>
          Max prenotazioni
        </Text>
        <input type="number" min={1} max={20} value={maxBookings} onChange={(e) => onMaxChange(e.target.value)} style={maxInputStyle} />
      </XStack>
      {liveError ? (
        <Text fontSize={11} color={brand.urgenza} fontWeight="600">
          {liveError}
        </Text>
      ) : null}
      <XStack gap="$2">
        <Text
          fontSize={11}
          color={liveError ? brand.grafite70 : brand.verificato}
          fontWeight="700"
          cursor={liveError ? "default" : "pointer"}
          opacity={liveError ? 0.5 : 1}
          onPress={liveError ? undefined : onSave}
        >
          Salva
        </Text>
        <Text fontSize={11} color={brand.grafite70} fontWeight="600" cursor="pointer" onPress={onCancel}>
          Annulla
        </Text>
      </XStack>
    </YStack>
  );
}
