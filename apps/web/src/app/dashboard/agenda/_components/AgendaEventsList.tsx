"use client";

import { Text, XStack, YStack, brand } from "@professionisti/ui";
import { monthLabel } from "@/lib/calendarDates";
import { AgendaListItem, WEEKDAY_FULL_LABELS } from "./agendaHelpers";

/**
 * Lista di eventi condivisa (richiesta esplicita dell'utente, entrambe): sia
 * per la vista "Anno" (raggruppata per mese) sia per i risultati della
 * ricerca full-text (elenco piatto, un filtro non ha una struttura mensile
 * naturale). Click su una riga apre lo stesso pannello/pop-up di dettaglio
 * già usato dalla griglia (`item.onPress`, già collegato a
 * `setSelectedBooking`/`setSelectedExternalJob`/navigazione a
 * "/dashboard/richieste" da `buildAgendaListItems`).
 */
export function AgendaEventsList({ items, groupByMonth = false, emptyLabel }: { items: AgendaListItem[]; groupByMonth?: boolean; emptyLabel: string }) {
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

export function AgendaEventRow({ item }: { item: AgendaListItem }) {
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
