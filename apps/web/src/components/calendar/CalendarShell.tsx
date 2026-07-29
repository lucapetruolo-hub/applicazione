"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Icon, Text, XStack, YStack, brand, motionEasing, motionFast } from "@professionisti/ui";
import {
  addDaysUtc,
  addMonthsUtc,
  isSameDateUtc,
  monthGridDays,
  monthLabel,
  todayUtc,
  weekDays,
  weekdayShortLabel,
  formatDayRangeLabel,
} from "@/lib/calendarDates";

export type CalendarView = "day" | "week" | "month";

export type CalendarShellProps = {
  view: CalendarView;
  onViewChange: (view: CalendarView) => void;
  currentDate: Date;
  onNavigate: (date: Date) => void;
  onSelectDay?: (date: Date) => void;
  renderDayColumn: (date: Date) => ReactNode;
  renderMonthCell?: (date: Date) => ReactNode;
};

const VIEW_LABELS: { value: CalendarView; label: string }[] = [
  { value: "day", label: "Giorno" },
  { value: "week", label: "Settimana" },
  { value: "month", label: "Mese" },
];

/**
 * Shell di calendario condivisa (nessuna libreria: Tamagui + CSS grid via
 * styled-jsx, stesso pattern già in uso per ResultsListWithMap/MegaMenu —
 * componenti "difficili" che Tamagui da solo non rende bene). Usata sia dal
 * calendario "Disponibilità" (editor) che da "Prenotazioni" (eventi):
 * gestisce solo il guscio (toggle vista, navigazione, griglia), il
 * contenuto di ogni giorno è deciso dal chiamante via render prop —
 * evita di dover tenere sincronizzate due fonti di dati nella stessa
 * griglia, ognuno dei due calendari resta responsabile solo dei propri dati.
 */
export function CalendarShell({ view, onViewChange, currentDate, onNavigate, onSelectDay, renderDayColumn, renderMonthCell }: CalendarShellProps) {
  const today = todayUtc();
  // Vista a schermo intero (richiesta esplicita dell'utente per una
  // migliore visualizzazione): overlay fisso a tutto viewport, stesso
  // guscio (toggle vista + navigazione + griglia) mostrato più grande,
  // nessuna Fullscreen API del browser — stesso pattern DOM già in uso per
  // PhotoLightbox/BookingDetailPanel (più affidabile in contesti
  // sandboxed/iframe rispetto a requestFullscreen).
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    if (!isFullscreen) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setIsFullscreen(false);
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isFullscreen]);

  function handlePrev() {
    if (view === "day") onNavigate(addDaysUtc(currentDate, -1));
    else if (view === "week") onNavigate(addDaysUtc(currentDate, -7));
    else onNavigate(addMonthsUtc(currentDate, -1));
  }
  function handleNext() {
    if (view === "day") onNavigate(addDaysUtc(currentDate, 1));
    else if (view === "week") onNavigate(addDaysUtc(currentDate, 7));
    else onNavigate(addMonthsUtc(currentDate, 1));
  }

  let rangeLabel: string;
  if (view === "day") {
    rangeLabel = `${currentDate.getUTCDate()} ${monthLabel(currentDate)} ${currentDate.getUTCFullYear()}`;
  } else if (view === "week") {
    const days = weekDays(currentDate);
    rangeLabel = formatDayRangeLabel(days[0]!, days[6]!);
  } else {
    rangeLabel = `${monthLabel(currentDate)} ${currentDate.getUTCFullYear()}`;
  }

  const content = (
    <YStack gap="$3">
      <XStack justifyContent="space-between" alignItems="center" flexWrap="wrap" gap="$3">
        <XStack borderWidth={1} borderColor={brand.filetto} borderRadius="$2" overflow="hidden">
          {VIEW_LABELS.map((item, index) => {
            const active = item.value === view;
            return (
              <XStack
                key={item.value}
                paddingHorizontal="$3"
                paddingVertical="$2"
                backgroundColor={active ? brand.cianografia : brand.calce}
                borderLeftWidth={index === 0 ? 0 : 1}
                borderLeftColor={brand.filetto}
                cursor="pointer"
                onPress={() => onViewChange(item.value)}
                accessibilityRole="button"
                style={{ transition: `background-color ${motionFast} ${motionEasing}` }}
              >
                <Text
                  fontFamily="$mono"
                  fontSize={11}
                  fontWeight="700"
                  letterSpacing={0.5}
                  textTransform="uppercase"
                  color={active ? "white" : brand.grafite70}
                >
                  {item.label}
                </Text>
              </XStack>
            );
          })}
        </XStack>

        <XStack alignItems="center" gap="$3">
          <XStack
            paddingHorizontal="$2"
            height={30}
            borderRadius="$2"
            borderWidth={1}
            borderColor={brand.filetto}
            alignItems="center"
            justifyContent="center"
            cursor="pointer"
            onPress={() => onNavigate(today)}
            accessibilityRole="button"
          >
            <Text fontFamily="$mono" fontSize={11} fontWeight="600" textTransform="uppercase" color={brand.grafite}>
              Oggi
            </Text>
          </XStack>
          <XStack alignItems="center" gap="$2">
            <XStack
              width={30}
              height={30}
              borderRadius="$2"
              borderWidth={1}
              borderColor={brand.filetto}
              alignItems="center"
              justifyContent="center"
              cursor="pointer"
              onPress={handlePrev}
              accessibilityRole="button"
              accessibilityLabel="Periodo precedente"
            >
              <Icon name="chevron-left" size={15} color={brand.grafite} />
            </XStack>
            <Text fontFamily="$mono" fontSize={12.5} color={brand.grafite70} minWidth={140} textAlign="center">
              {rangeLabel}
            </Text>
            <XStack
              width={30}
              height={30}
              borderRadius="$2"
              borderWidth={1}
              borderColor={brand.filetto}
              alignItems="center"
              justifyContent="center"
              cursor="pointer"
              onPress={handleNext}
              accessibilityRole="button"
              accessibilityLabel="Periodo successivo"
            >
              <Icon name="chevron-right" size={15} color={brand.grafite} />
            </XStack>
          </XStack>
          <XStack
            width={30}
            height={30}
            borderRadius="$2"
            borderWidth={1}
            borderColor={brand.filetto}
            alignItems="center"
            justifyContent="center"
            cursor="pointer"
            onPress={() => setIsFullscreen((v) => !v)}
            accessibilityRole="button"
            accessibilityLabel={isFullscreen ? "Esci da schermo intero" : "Apri a schermo intero"}
          >
            <Icon name={isFullscreen ? "minimize-2" : "maximize-2"} size={14} color={brand.grafite} />
          </XStack>
        </XStack>
      </XStack>

      {view === "month" ? (
        <MonthGrid currentDate={currentDate} today={today} onSelectDay={onSelectDay} renderMonthCell={renderMonthCell} />
      ) : (
        <WeekOrDayGrid days={view === "day" ? [currentDate] : weekDays(currentDate)} today={today} renderDayColumn={renderDayColumn} />
      )}

      <style jsx>{`
        :global(.cal-month-grid) {
          display: grid;
          grid-template-columns: repeat(7, 1fr);
          border: 1px solid ${brand.filetto};
          border-radius: 6px;
          overflow: hidden;
          background: ${brand.calce};
        }
        :global(.cal-week-grid) {
          display: grid;
          border: 1px solid ${brand.filetto};
          border-radius: 6px;
          overflow: hidden;
          background: ${brand.calce};
        }
      `}</style>
    </YStack>
  );

  if (!isFullscreen) {
    return content;
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Calendario a schermo intero"
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 1000,
        backgroundColor: brand.gesso,
        overflow: "auto",
        padding: 24,
      }}
    >
      <div style={{ maxWidth: 1400, margin: "0 auto" }}>{content}</div>
    </div>
  );
}

function WeekOrDayGrid({ days, today, renderDayColumn }: { days: Date[]; today: Date; renderDayColumn: (date: Date) => ReactNode }) {
  return (
    <div className="cal-week-grid" style={{ gridTemplateColumns: `repeat(${days.length}, 1fr)` }}>
      {days.map((date) => {
        const isToday = isSameDateUtc(date, today);
        return (
          <YStack key={date.toISOString()} borderRightWidth={1} borderRightColor={brand.filetto} minWidth={0} overflow="hidden">
            <YStack
              paddingVertical="$2"
              paddingHorizontal="$2"
              borderBottomWidth={1}
              borderBottomColor={brand.filetto}
              backgroundColor={brand.gesso}
              alignItems="center"
              gap="$1"
            >
              <Text fontFamily="$mono" fontSize={10.5} fontWeight="700" letterSpacing={0.6} textTransform="uppercase" color={brand.grafite70}>
                {weekdayShortLabel(date)}
              </Text>
              <XStack
                width={26}
                height={26}
                borderRadius={13}
                alignItems="center"
                justifyContent="center"
                backgroundColor={isToday ? brand.cianografia : "transparent"}
              >
                <Text fontFamily="$heading" fontWeight="800" fontSize={14} color={isToday ? "white" : brand.grafite}>
                  {date.getUTCDate()}
                </Text>
              </XStack>
            </YStack>
            <YStack padding="$2" gap="$2" minHeight={220} minWidth={0} overflow="hidden">
              {renderDayColumn(date)}
            </YStack>
          </YStack>
        );
      })}
    </div>
  );
}

function MonthGrid({
  currentDate,
  today,
  onSelectDay,
  renderMonthCell,
}: {
  currentDate: Date;
  today: Date;
  onSelectDay?: (date: Date) => void;
  renderMonthCell?: (date: Date) => ReactNode;
}) {
  const days = monthGridDays(currentDate);
  const currentMonth = currentDate.getUTCMonth();

  return (
    <YStack>
      <XStack borderWidth={1} borderColor={brand.filetto} borderBottomWidth={0} borderTopLeftRadius="$2" borderTopRightRadius="$2" overflow="hidden">
        {["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"].map((label) => (
          <YStack key={label} flex={1} paddingVertical="$2" alignItems="center" backgroundColor={brand.gesso}>
            <Text fontFamily="$mono" fontSize={10.5} fontWeight="700" letterSpacing={0.6} textTransform="uppercase" color={brand.grafite70}>
              {label}
            </Text>
          </YStack>
        ))}
      </XStack>
      <div className="cal-month-grid">
        {days.map((date) => {
          const isToday = isSameDateUtc(date, today);
          const inMonth = date.getUTCMonth() === currentMonth;
          return (
            <YStack
              key={date.toISOString()}
              minHeight={84}
              minWidth={0}
              overflow="hidden"
              padding="$2"
              gap="$1"
              borderRightWidth={1}
              borderBottomWidth={1}
              borderColor={brand.filetto}
              backgroundColor={inMonth ? brand.calce : brand.gesso}
              opacity={inMonth ? 1 : 0.55}
              cursor={onSelectDay ? "pointer" : undefined}
              onPress={onSelectDay ? () => onSelectDay(date) : undefined}
              accessibilityRole={onSelectDay ? "button" : undefined}
            >
              <XStack
                width={22}
                height={22}
                borderRadius={11}
                alignItems="center"
                justifyContent="center"
                backgroundColor={isToday ? brand.cianografia : "transparent"}
              >
                <Text fontFamily="$heading" fontWeight="800" fontSize={12} color={isToday ? "white" : brand.grafite}>
                  {date.getUTCDate()}
                </Text>
              </XStack>
              {renderMonthCell ? renderMonthCell(date) : null}
            </YStack>
          );
        })}
      </div>
    </YStack>
  );
}
