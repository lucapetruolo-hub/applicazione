"use client";

import type { GuidedRequestMyState } from "@professionisti/shared";
import { Icon, Text, XStack, brand } from "@professionisti/ui";
import { apiClient } from "@/lib/apiClient";
import type { CardAction } from "@/components/CardActionsMenu";

/**
 * Azioni "personali" del menu hamburger di una scheda richiesta, identiche
 * lato cliente (/le-mie-richieste) e professionista (/dashboard/richieste)
 * — docs/CHANGELOG.md §130: segna come letta/da leggere, silenzia
 * notifiche, promemoria, archivia. Ognuna agisce solo per chi la usa
 * (`PATCH /guided-requests/:id/my-state`), mai sull'altra parte.
 */

/** Domani alle 9:00 nell'ora locale del browser — "Ricordamelo domani". */
export function tomorrowAtNine(now: Date = new Date()): Date {
  const date = new Date(now);
  date.setDate(date.getDate() + 1);
  date.setHours(9, 0, 0, 0);
  return date;
}

export function formatReminder(iso: string): string {
  const date = new Date(iso);
  return `${date.toLocaleDateString("it-IT", { weekday: "short", day: "numeric", month: "short" })}, ${date.toLocaleTimeString("it-IT", {
    hour: "2-digit",
    minute: "2-digit",
  })}`;
}

export function buildPersonalStateActions({
  token,
  guidedRequestId,
  myState,
  isNew,
  onMarkedRead,
  onChanged,
  onError,
}: {
  token: string;
  guidedRequestId: string;
  myState: GuidedRequestMyState;
  /** La scheda mostra oggi il badge "Nuovo" (notifiche non lette o segnata a mano). */
  isNew: boolean;
  /** Toglie subito il "Nuovo" locale (le notifiche già viste in pagina vivono in uno stato del genitore). */
  onMarkedRead: () => void;
  onChanged: () => void;
  onError: (message: string) => void;
}): CardAction[] {
  async function update(input: Parameters<typeof apiClient.updateGuidedRequestMyState>[2]) {
    try {
      await apiClient.updateGuidedRequestMyState(token, guidedRequestId, input);
      onChanged();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Errore imprevisto, riprova.");
    }
  }

  return [
    isNew
      ? {
          icon: "eye",
          text: "Segna come letta",
          onPress: async () => {
            onMarkedRead();
            await update({ markedUnread: false });
          },
        }
      : { icon: "eye-off", text: "Segna come da leggere", onPress: () => update({ markedUnread: true }) },
    myState.mutedAt
      ? { icon: "bell-ring", text: "Riattiva notifiche", onPress: () => update({ muted: false }) }
      : { icon: "bell-ring", text: "Silenzia notifiche", onPress: () => update({ muted: true }) },
    myState.remindAt
      ? { icon: "clock", text: "Annulla promemoria", onPress: () => update({ remindAt: null }) }
      : { icon: "clock", text: "Ricordamelo domani alle 9", onPress: () => update({ remindAt: tomorrowAtNine().toISOString() }) },
    myState.archivedAt
      ? { icon: "rotate-ccw", text: "Ripristina dall'archivio", onPress: () => update({ archived: false }) }
      : { icon: "archive", text: "Archivia", onPress: () => update({ archived: true }) },
  ];
}

/** Riga di stato sotto il titolo della scheda: promemoria attivo, notifiche silenziate, archiviata. */
export function RequestStateIndicators({ myState }: { myState: GuidedRequestMyState }) {
  if (!myState.remindAt && !myState.mutedAt && !myState.archivedAt) return null;
  return (
    <XStack gap="$3" flexWrap="wrap" alignItems="center">
      {myState.remindAt ? (
        <XStack alignItems="center" gap={4}>
          <Icon name="clock" size={13} color={brand.cianografia} />
          <Text fontSize={13} fontWeight="600" color={brand.cianografia}>
            Promemoria {formatReminder(myState.remindAt)}
          </Text>
        </XStack>
      ) : null}
      {myState.mutedAt ? (
        <XStack alignItems="center" gap={4}>
          <Icon name="bell-ring" size={13} color={brand.grafite70} />
          <Text fontSize={13} color={brand.grafite70}>
            Notifiche silenziate
          </Text>
        </XStack>
      ) : null}
      {myState.archivedAt ? (
        <XStack alignItems="center" gap={4}>
          <Icon name="archive" size={13} color={brand.grafite70} />
          <Text fontSize={13} color={brand.grafite70}>
            Archiviata
          </Text>
        </XStack>
      ) : null}
    </XStack>
  );
}
