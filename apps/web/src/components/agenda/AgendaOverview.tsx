"use client";

import type { ExternalJob, ProfessionalBooking, ProfessionalLead } from "@professionisti/shared";
import { Icon, Surface, Text, XStack, YStack, brand } from "@professionisti/ui";
import { addDaysUtc, startOfWeekUtc, todayUtc, toIsoDate } from "@/lib/calendarDates";
import { REQUEST_STAGE_STYLE, bookingStageStyle } from "@/lib/requestStage";

/**
 * Vista "a colpo d'occhio" del calendario "Prenotazioni" (richiesta
 * esplicita dell'utente: "rendi la pagina agenda più innovativa") — tre
 * aggiunte puramente additive, montate sopra il calendario già esistente in
 * dashboard/agenda/page.tsx: nessuna modifica alla logica di disponibilità/
 * prenotazioni/ricerca/selezione multipla già verificata lì.
 *
 * 1. `NextAppointmentSpotlight` — il prossimo impegno REALE (una Booking
 *    confermata/in attesa di conferma, o un lavoro esterno programmato), non
 *    un preventivo ancora in attesa di risposta: quello non è ancora un
 *    impegno. Risponde alla stessa filosofia di prodotto già scritta in
 *    CLAUDE.md §8 ("le notifiche quasi istantanee sono una feature
 *    competitiva") applicata qui alla propria agenda: sapere subito cosa
 *    viene dopo, senza dover scorrere la griglia.
 * 2. `AgendaStatsStrip` — tre numeri reali (oggi/questa settimana/in attesa
 *    di risposta), mai un dato inventato: calcolati dagli stessi array già
 *    scaricati dalla pagina (bookings/externalJobs/leads), nessuna nuova
 *    chiamata di rete.
 * 3. `AgendaStatusLegend` — spiega i colori/bordi già in uso sulle caselle
 *    del calendario (CLAUDE.md §81: verde=confermata, turchese=completata,
 *    rosso=annullata, ottone tratteggiato=in attesa di risposta, grafite
 *    tratteggiato=lavoro esterno) — prima impliciti, mai spiegati da
 *    nessuna parte della pagina.
 */

function describeRelativeTime(target: Date, now: Date = new Date()): string {
  const diffMin = Math.round((target.getTime() - now.getTime()) / 60000);
  const time = target.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
  if (diffMin <= 1) return "tra pochi minuti";
  if (diffMin < 60) return `tra ${diffMin} minuti`;
  const sameDay = target.toDateString() === now.toDateString();
  if (sameDay) {
    const diffHours = Math.round(diffMin / 60);
    return `oggi alle ${time} (tra ${diffHours} ${diffHours === 1 ? "ora" : "ore"})`;
  }
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  if (target.toDateString() === tomorrow.toDateString()) return `domani alle ${time}`;
  const dateLabel = target.toLocaleDateString("it-IT", { day: "numeric", month: "short" });
  return `${dateLabel} alle ${time}`;
}

export type NextAgendaItem = {
  key: string;
  relativeLabel: string;
  title: string;
  subtitle: string;
  onPress: () => void;
};

/**
 * Il prossimo impegno reale in ordine cronologico — una Booking non
 * annullata/completata (CONFIRMED o PENDING, quest'ultima solo dal flusso di
 * prenotazione diretta dormiente, CLAUDE.md §20) o un lavoro esterno ancora
 * SCHEDULED. Mai un preventivo ancora "in attesa" (quello non è un impegno
 * confermato — resta comunque visibile nella griglia con l'etichetta "In
 * attesa", invariato).
 */
export function computeNextAgendaItem(
  bookings: ProfessionalBooking[] | null,
  externalJobs: ExternalJob[] | null,
  onOpenBooking: (booking: ProfessionalBooking) => void,
  onOpenExternal: (job: ExternalJob) => void,
): NextAgendaItem | null {
  const now = new Date();
  const candidates: { date: Date; item: NextAgendaItem }[] = [];

  for (const booking of bookings ?? []) {
    if (booking.status !== "CONFIRMED" && booking.status !== "PENDING") continue;
    const date = new Date(booking.scheduledAt);
    if (date < now) continue;
    const title = booking.clientAccountDeleted ? "Account eliminato" : (booking.clientName ?? "Cliente");
    candidates.push({
      date,
      item: {
        key: `booking-${booking.id}`,
        relativeLabel: describeRelativeTime(date, now),
        title,
        subtitle: booking.categoryLabel ?? "Prenotazione",
        onPress: () => onOpenBooking(booking),
      },
    });
  }

  for (const job of externalJobs ?? []) {
    if (job.status !== "SCHEDULED") continue;
    const date = new Date(job.scheduledAt);
    if (date < now) continue;
    candidates.push({
      date,
      item: {
        key: `external-${job.id}`,
        relativeLabel: describeRelativeTime(date, now),
        title: job.clientName,
        subtitle: "Lavoro esterno",
        onPress: () => onOpenExternal(job),
      },
    });
  }

  candidates.sort((a, b) => a.date.getTime() - b.date.getTime());
  return candidates[0]?.item ?? null;
}

/** Assente del tutto (`null`) quando non c'è nulla in programma — mai un banner vuoto/finto, stesso principio già seguito ovunque in questo prodotto per gli stati "nessun dato reale". */
export function NextAppointmentSpotlight({ item }: { item: NextAgendaItem | null }) {
  if (!item) return null;
  return (
    <XStack
      alignItems="center"
      gap="$3"
      padding="$4"
      backgroundColor={brand.cianografiaVelo}
      borderWidth={1}
      borderColor={brand.cianografia}
      borderRadius="$4"
      cursor="pointer"
      onPress={item.onPress}
      accessibilityRole="button"
      accessibilityLabel={`Prossimo intervento: ${item.title}, ${item.relativeLabel}`}
    >
      <XStack width={44} height={44} borderRadius={22} backgroundColor={brand.cianografia} alignItems="center" justifyContent="center" flexShrink={0}>
        <Icon name="clock" size={20} color="white" strokeWidth={2} />
      </XStack>
      <YStack flex={1} minWidth={0} gap={2}>
        <Text fontSize={12} fontWeight="700" color={brand.cianografiaScuro} numberOfLines={1}>
          Prossimo intervento · {item.relativeLabel}
        </Text>
        <Text fontSize={16} fontWeight="800" color={brand.grafite} numberOfLines={1}>
          {item.title}
        </Text>
        <Text fontSize={12.5} color={brand.grafite70} numberOfLines={1}>
          {item.subtitle}
        </Text>
      </YStack>
      <Icon name="chevron-right" size={18} color={brand.cianografia} />
    </XStack>
  );
}

export type AgendaStats = {
  todayCount: number;
  todaySubtitle: string;
  weekCount: number;
  weekSubtitle: string;
  pendingCount: number;
};

/**
 * Stesso predicato già in uso due volte in dashboard/agenda/page.tsx
 * (pendingQuotesOnDate/buildAgendaListItems) — duplicato qui apposta invece
 * di refactorizzare quella logica già verificata: zero rischio di
 * regressione su codice esistente per tre righe di condizione.
 */
function isPendingQuoteLead(lead: ProfessionalLead): boolean {
  return !!lead.quote && lead.quote.bookingStatus === null && (lead.quote.status === "SENT" || lead.quote.status === "MODIFICATION_REQUESTED");
}

/** "Questa settimana" è sempre la settimana reale corrente (lunedì-domenica), indipendente da quale pagina del calendario si sta navigando — altrimenti il numero cambierebbe solo perché si sta sfogliando indietro/avanti, confondendo il significato di "questa". */
export function computeAgendaStats(
  bookings: ProfessionalBooking[] | null,
  externalJobs: ExternalJob[] | null,
  leads: ProfessionalLead[] | null,
): AgendaStats {
  const todayStr = toIsoDate(todayUtc());
  const weekStart = startOfWeekUtc(todayUtc());
  const weekDates = new Set(Array.from({ length: 7 }, (_, i) => toIsoDate(addDaysUtc(weekStart, i))));

  let todayCount = 0;
  let weekCount = 0;
  let weekMinutes = 0;

  function tally(dateStr: string, scheduledAt: string, scheduledEndAt: string | null) {
    if (dateStr === todayStr) todayCount++;
    if (weekDates.has(dateStr)) {
      weekCount++;
      if (scheduledEndAt) {
        weekMinutes += (new Date(scheduledEndAt).getTime() - new Date(scheduledAt).getTime()) / 60000;
      }
    }
  }

  for (const booking of bookings ?? []) {
    if (booking.status === "CANCELED" || booking.status === "NO_SHOW") continue;
    tally(booking.scheduledAt.slice(0, 10), booking.scheduledAt, booking.scheduledEndAt);
  }
  for (const job of externalJobs ?? []) {
    if (job.status === "CANCELED") continue;
    tally(job.scheduledAt.slice(0, 10), job.scheduledAt, job.scheduledEndAt);
  }

  const pendingCount = (leads ?? []).filter(isPendingQuoteLead).length;

  const todaySubtitle = todayCount === 0 ? "Nessun appuntamento" : `${todayCount} appuntament${todayCount === 1 ? "o" : "i"}`;
  const weekHours = Math.round(weekMinutes / 60);
  const weekSubtitle =
    weekCount === 0
      ? "Nessun appuntamento"
      : weekHours > 0
        ? `${weekHours} ${weekHours === 1 ? "ora" : "ore"} prenotate`
        : `${weekCount} appuntament${weekCount === 1 ? "o" : "i"}`;

  return { todayCount, todaySubtitle, weekCount, weekSubtitle, pendingCount };
}

export function AgendaStatsStrip({ stats, onPendingPress }: { stats: AgendaStats; onPendingPress: () => void }) {
  const pendingColor = stats.pendingCount > 0 ? REQUEST_STAGE_STYLE.in_attesa.fg : brand.grafite;
  return (
    <div className="stats-kpi-grid">
      <Surface gap="$1">
        <Text fontSize={12} fontWeight="700" color={brand.grafite70}>
          Oggi
        </Text>
        <Text fontSize={26} fontWeight="800" color={brand.grafite}>
          {stats.todayCount}
        </Text>
        <Text fontSize={12} color={brand.grafite70}>
          {stats.todaySubtitle}
        </Text>
      </Surface>
      <Surface gap="$1">
        <Text fontSize={12} fontWeight="700" color={brand.grafite70}>
          Questa settimana
        </Text>
        <Text fontSize={26} fontWeight="800" color={brand.grafite}>
          {stats.weekCount}
        </Text>
        <Text fontSize={12} color={brand.grafite70}>
          {stats.weekSubtitle}
        </Text>
      </Surface>
      <Surface
        gap="$1"
        cursor={stats.pendingCount > 0 ? "pointer" : undefined}
        onPress={stats.pendingCount > 0 ? onPendingPress : undefined}
        accessibilityRole={stats.pendingCount > 0 ? "button" : undefined}
        accessibilityLabel={stats.pendingCount > 0 ? "Vai a richieste ricevute" : undefined}
      >
        <Text fontSize={12} fontWeight="700" color={brand.grafite70}>
          In attesa di risposta
        </Text>
        <Text fontSize={26} fontWeight="800" color={pendingColor}>
          {stats.pendingCount}
        </Text>
        <Text fontSize={12} color={brand.grafite70}>
          {stats.pendingCount === 0 ? "Nessun preventivo in attesa" : "Preventivi inviati, in attesa del cliente"}
        </Text>
      </Surface>
    </div>
  );
}

// Stessa palette già in uso sulle caselle del calendario (CLAUDE.md §81,
// `bookingStageStyle`/`REQUEST_STAGE_STYLE`), unica fonte di verità — mai
// un hex duplicato qui.
const LEGEND_ITEMS: { label: string; color: string; dashed?: boolean }[] = [
  { label: "Confermata", color: bookingStageStyle("CONFIRMED").border },
  { label: "Completata", color: bookingStageStyle("COMPLETED").border },
  { label: "Annullata", color: bookingStageStyle("CANCELED").border },
  { label: "In attesa di risposta", color: brand.ottone, dashed: true },
  { label: "Lavoro esterno", color: brand.grafite70, dashed: true },
];

export function AgendaStatusLegend() {
  return (
    <XStack gap="$4" flexWrap="wrap" alignItems="center">
      {LEGEND_ITEMS.map((item) => (
        <XStack key={item.label} alignItems="center" gap={6}>
          <YStack
            width={12}
            height={12}
            borderRadius={2}
            borderWidth={item.dashed ? 1.5 : 0}
            borderStyle={item.dashed ? "dashed" : "solid"}
            borderColor={item.color}
            backgroundColor={item.dashed ? "transparent" : item.color}
          />
          <Text fontSize={11.5} color={brand.grafite70}>
            {item.label}
          </Text>
        </XStack>
      ))}
    </XStack>
  );
}
