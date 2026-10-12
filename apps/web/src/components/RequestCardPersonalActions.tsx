"use client";

import { useEffect, useState } from "react";
import type { GuidedRequestMyState } from "@professionisti/shared";
import { Icon, Text, XStack, YStack, brand } from "@professionisti/ui";
import { apiClient } from "@/lib/apiClient";
import type { CardAction } from "@/components/CardActionsMenu";
import { CardButton } from "@/components/CardButton";

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
      ? {
          icon: "rotate-ccw",
          text: "Ripristina dall'archivio",
          onPress: async () => {
            await update({ archived: false });
            announceRestored(1);
          },
        }
      : { icon: "archive", text: "Archivia", onPress: () => update({ archived: true }) },
  ];
}

/** Riga di stato sotto il titolo della scheda: promemoria attivo, notifiche silenziate (l'archiviazione ha la sua barra, `ArchivedRestoreBar`). */
export function RequestStateIndicators({ myState }: { myState: GuidedRequestMyState }) {
  if (!myState.remindAt && !myState.mutedAt) return null;
  return (
    <XStack gap="$3" flexWrap="wrap" alignItems="center">
      {myState.remindAt ? (
        <XStack alignItems="center" gap={4}>
          <Icon name="clock" size={13} color={brand.cianografiaScuro} />
          <Text fontSize={13} fontWeight="600" color={brand.cianografiaScuro}>
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
    </XStack>
  );
}

/**
 * Barra "Archiviata" con il pulsante "Ripristina" in vista, sotto
 * l'intestazione di una scheda archiviata (richiesta esplicita dell'utente:
 * annullare l'archiviazione senza cercare la voce nel menu). Toglie solo
 * l'archiviazione personale: la richiesta torna tra le altre nello stato in
 * cui era, senza effetti per l'altra parte. Fuori dall'intestazione
 * cliccabile, così il clic non apre/chiude la scheda.
 */
export function ArchivedRestoreBar({
  token,
  guidedRequestId,
  myState,
  onChanged,
}: {
  token: string;
  guidedRequestId: string;
  myState: GuidedRequestMyState;
  onChanged: () => void;
}) {
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!myState.archivedAt) return null;

  async function handleRestore() {
    setIsBusy(true);
    setError(null);
    try {
      await apiClient.updateGuidedRequestMyState(token, guidedRequestId, { archived: false });
      announceRestored(1);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore imprevisto, riprova.");
      setIsBusy(false);
    }
  }

  return (
    <YStack paddingHorizontal="$4" paddingBottom="$4" marginTop="$-2" gap="$2">
      <XStack alignItems="center" justifyContent="space-between" gap="$3" flexWrap="wrap" backgroundColor={brand.gesso} borderRadius="$3" padding="$3">
        <XStack alignItems="center" gap="$2" flexShrink={1} minWidth={0}>
          <Icon name="archive" size={16} color={brand.grafite70} />
          <Text fontSize="$3" color={brand.grafite70}>
            Archiviata il {new Date(myState.archivedAt).toLocaleDateString("it-IT", { day: "numeric", month: "long" })}
          </Text>
        </XStack>
        <CardButton onPress={handleRestore} disabled={isBusy}>
          {isBusy ? "Ripristino..." : "Ripristina"}
        </CardButton>
      </XStack>
      {error ? (
        <Text color={brand.urgenza} fontSize="$3">
          {error}
        </Text>
      ) : null}
    </YStack>
  );
}

/**
 * "Ripristina tutte" in cima al tab "Archiviate", con più di una scheda
 * archiviata (richiesta esplicita dell'utente, docs/CHANGELOG.md §222):
 * stesso effetto di "Ripristina" su ognuna, dopo una conferma.
 */
export function RestoreAllArchivedBar({
  token,
  guidedRequestIds,
  onChanged,
}: {
  token: string;
  guidedRequestIds: string[];
  onChanged: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (guidedRequestIds.length < 2) return null;

  async function handleRestoreAll() {
    setIsBusy(true);
    setError(null);
    const results = await Promise.allSettled(
      guidedRequestIds.map((id) => apiClient.updateGuidedRequestMyState(token, id, { archived: false })),
    );
    const failed = results.filter((r) => r.status === "rejected").length;
    setIsBusy(false);
    setConfirming(false);
    const restored = guidedRequestIds.length - failed;
    if (restored > 0) announceRestored(restored);
    if (failed > 0) setError(`${failed} richiest${failed === 1 ? "a non è stata ripristinata" : "e non sono state ripristinate"}, riprova.`);
    onChanged();
  }

  return (
    <YStack gap="$2">
      <XStack alignItems="center" justifyContent="flex-end" gap="$2" flexWrap="wrap">
        {confirming ? (
          <YStack alignItems="flex-end" gap="$2">
            <Text fontSize="$3" color={brand.grafite} textAlign="right">
              Ripristinare tutte le {guidedRequestIds.length} richieste archiviate?
            </Text>
            <XStack gap="$2">
              <CardButton tone="primary" onPress={handleRestoreAll} disabled={isBusy}>
                {isBusy ? "Ripristino..." : "Sì, ripristina"}
              </CardButton>
              <CardButton onPress={() => setConfirming(false)} disabled={isBusy}>
                Annulla
              </CardButton>
            </XStack>
          </YStack>
        ) : (
          <CardButton onPress={() => setConfirming(true)}>Ripristina tutte ({guidedRequestIds.length})</CardButton>
        )}
      </XStack>
      {error ? (
        <Text color={brand.urgenza} fontSize="$3" textAlign="right">
          {error}
        </Text>
      ) : null}
    </YStack>
  );
}

// "Richiesta ripristinata" (richiesta esplicita dell'utente, docs/CHANGELOG.md
// §224): la scheda sparisce dal tab "Archiviate", il messaggio dice dove è
// finita. Un evento sulla finestra invece di passare callback da ogni scheda.
const RESTORED_EVENT = "request-restored";

function announceRestored(count: number) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<number>(RESTORED_EVENT, { detail: count }));
}

/** Messaggio di conferma dopo un ripristino, per qualche secondo, in cima all'elenco. */
export function RestoredNotice() {
  const [count, setCount] = useState<number | null>(null);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    function handle(event: Event) {
      setCount((event as CustomEvent<number>).detail);
      clearTimeout(timer);
      timer = setTimeout(() => setCount(null), 5000);
    }
    window.addEventListener(RESTORED_EVENT, handle);
    return () => {
      window.removeEventListener(RESTORED_EVENT, handle);
      clearTimeout(timer);
    };
  }, []);
  if (count === null) return null;
  return (
    <XStack role="status" alignItems="center" gap="$2" backgroundColor={brand.cianografiaVelo} borderRadius="$3" padding="$3">
      <Icon name="check" size={16} color={brand.cianografiaScuro} strokeWidth={2.5} />
      <Text fontSize="$3" fontWeight="600" color={brand.cianografiaScuro}>
        {count === 1 ? `Richiesta ripristinata: la trovi di nuovo in "Tutte".` : `${count} richieste ripristinate: le trovi di nuovo in "Tutte".`}
      </Text>
    </XStack>
  );
}
