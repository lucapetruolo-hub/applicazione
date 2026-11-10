"use client";

import { useState } from "react";
import {
  RECURRING_FREQUENCY_LABELS,
  formatAppointmentDate,
  formatAppointmentTimeRange,
  wallClockNow,
  type RecurringVisitInfo,
} from "@professionisti/shared";
import { Text, XStack, YStack, brand } from "@professionisti/ui";
import { CardButton } from "@/components/CardButton";
import { apiClient } from "@/lib/apiClient";

type Visit = { id: string; status: string; scheduledAt: string; scheduledEndAt: string | null; recurring: RecurringVisitInfo | null };

/** Visite future mostrate per prime: le altre restano dietro "Mostra tutte". */
const UPCOMING_SHOWN = 4;

/**
 * Lavoro ricorrente nella scheda della richiesta, per cliente e
 * professionista (funzione nuova 3 del controllo pre-lancio dell'08/11,
 * docs/changelog/2026-11-09-lavori-ricorrenti.md): ogni quanto, le prossime
 * visite con "Salta questa volta" (il normale annullamento di quella visita)
 * e "Interrompi", che toglie tutte le visite future.
 */
export function RecurringVisitsBox({
  side,
  visits,
  token,
  onChanged,
}: {
  side: "CLIENT" | "PROFESSIONAL";
  visits: readonly Visit[];
  token: string;
  onChanged: () => void;
}) {
  const [skippingId, setSkippingId] = useState<string | null>(null);
  const [confirmSkipId, setConfirmSkipId] = useState<string | null>(null);
  const [confirmStop, setConfirmStop] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  const info = visits.find((visit) => visit.recurring)?.recurring ?? null;
  if (!info) return null;
  const now = wallClockNow().getTime();
  const sorted = [...visits].sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
  const upcoming = sorted.filter((visit) => new Date(visit.scheduledAt).getTime() > now && visit.status !== "COMPLETED");
  const done = sorted.filter((visit) => visit.status === "COMPLETED").length;
  const shown = showAll ? upcoming : upcoming.slice(0, UPCOMING_SHOWN);
  const stopped = info.stoppedAt !== null;

  async function skip(visitId: string) {
    setError(null);
    setSkippingId(visitId);
    try {
      if (side === "CLIENT") await apiClient.cancelMyBooking(token, visitId);
      else await apiClient.cancelBookingByProfessional(token, visitId, {});
      setConfirmSkipId(null);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore imprevisto, riprova.");
    } finally {
      setSkippingId(null);
    }
  }

  async function stop() {
    if (!info) return;
    setError(null);
    setBusy(true);
    try {
      await apiClient.stopRecurringJob(token, info.seriesId);
      setConfirmStop(false);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore imprevisto, riprova.");
    } finally {
      setBusy(false);
    }
  }

  const stoppedBy = info.stoppedBy === "CLIENT" ? (side === "CLIENT" ? "da te" : "dal cliente") : info.stoppedBy === "PROFESSIONAL" ? (side === "PROFESSIONAL" ? "da te" : "dal professionista") : "";

  return (
    <YStack
      gap="2"
      padding="3"
      borderRadius="3"
      borderWidth={1}
      borderColor={brand.filetto}
      backgroundColor={brand.calce}
      role="region"
      aria-label="Lavoro ricorrente"
      data-testid="recurring-visits"
    >
      <XStack justifyContent="space-between" alignItems="baseline" gap="2" flexWrap="wrap">
        <Text fontSize={16} fontWeight="800" color={brand.grafite}>
          Lavoro ricorrente · {RECURRING_FREQUENCY_LABELS[info.frequency]}
        </Text>
        {done > 0 ? (
          <Text fontSize={13} color={brand.grafite70}>
            {done === 1 ? "1 visita fatta" : `${done} visite fatte`}
          </Text>
        ) : null}
      </XStack>

      {stopped ? (
        <Text fontSize={16} color={brand.grafite}>
          Interrotto {stoppedBy}: niente più visite.
        </Text>
      ) : (
        <>
          {info.paysOnline ? (
            <Text fontSize={13} color={brand.grafite70}>
              {side === "CLIENT"
                ? "Ogni visita si paga quando è terminata, con la carta della prima, in automatico."
                : "Ogni visita la paga il cliente quando la segni terminata, con la carta della prima."}
            </Text>
          ) : null}
          {shown.length === 0 ? (
            <Text fontSize={16} color={brand.grafite70}>
              Le prossime visite entrano in agenda da sole, quattro settimane prima.
            </Text>
          ) : (
            <YStack gap="1" role="list" aria-label="Prossime visite">
              {shown.map((visit) => {
                const skipped = visit.status === "CANCELED";
                const when = `${formatAppointmentDate(visit.scheduledAt, { weekday: "short", day: "numeric", month: "short" })}, ${formatAppointmentTimeRange(visit.scheduledAt, visit.scheduledEndAt)}`;
                return (
                  <YStack key={visit.id} role="listitem" gap="1" paddingVertical="1" borderTopWidth={1} borderTopColor={brand.filetto}>
                    <XStack justifyContent="space-between" alignItems="center" gap="2" flexWrap="wrap">
                      <Text fontSize={16} color={skipped ? brand.grafite70 : brand.grafite} textDecorationLine={skipped ? "line-through" : "none"}>
                        {when}
                      </Text>
                      {skipped ? (
                        <Text fontSize={13} fontWeight="700" color={brand.grafite70}>
                          Saltata
                        </Text>
                      ) : confirmSkipId === visit.id ? (
                        <XStack gap="2" alignItems="center" flexWrap="wrap">
                          <CardButton tone="dangerSolid" compact disabled={skippingId === visit.id} onPress={() => skip(visit.id)}>
                            {skippingId === visit.id ? "Un attimo…" : "Sì, salta"}
                          </CardButton>
                          <CardButton compact onPress={() => setConfirmSkipId(null)}>
                            No
                          </CardButton>
                        </XStack>
                      ) : (
                        <CardButton compact onPress={() => setConfirmSkipId(visit.id)} aria-label={`Salta questa volta: ${when}`}>
                          Salta questa volta
                        </CardButton>
                      )}
                    </XStack>
                  </YStack>
                );
              })}
              {upcoming.length > UPCOMING_SHOWN && !showAll ? (
                <CardButton compact onPress={() => setShowAll(true)}>
                  Mostra tutte ({upcoming.length})
                </CardButton>
              ) : null}
            </YStack>
          )}

          {confirmStop ? (
            <YStack gap="2">
              <Text fontSize={16} color={brand.grafite}>
                Interrompere? Le visite future si tolgono dall&apos;agenda e {side === "CLIENT" ? "il professionista" : "il cliente"} lo sa subito. Quelle fatte restano.
              </Text>
              <XStack gap="2" flexWrap="wrap">
                <CardButton tone="dangerSolid" compact disabled={busy} onPress={stop}>
                  {busy ? "Un attimo…" : "Sì, interrompi"}
                </CardButton>
                <CardButton compact onPress={() => setConfirmStop(false)}>
                  No
                </CardButton>
              </XStack>
            </YStack>
          ) : (
            <XStack>
              <CardButton tone="danger" compact onPress={() => setConfirmStop(true)}>
                Interrompi il lavoro ricorrente
              </CardButton>
            </XStack>
          )}
        </>
      )}
      {error ? (
        <Text fontSize={16} color={brand.urgenza} role="alert">
          {error}
        </Text>
      ) : null}
    </YStack>
  );
}
