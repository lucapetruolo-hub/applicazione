"use client";

import { useState } from "react";
import type { ClientBooking } from "@professionisti/api-client";
import type { BookingDateChange } from "@professionisti/shared";
import { Text, XStack, YStack, brand } from "@professionisti/ui";
import { apiClient } from "@/lib/apiClient";
import { CardButton } from "@/components/CardButton";
import { ScheduleChangeBox } from "@/components/ScheduleChangeBox";
import { formatQuoteDateRange } from "./QuoteCard";

/**
 * Il professionista, con "Modifica", propone un'altra data per
 * l'appuntamento già fissato: il cliente risponde come a ogni proposta di
 * data, "Accetta nuova data", "Proponi un'altra data" o "Rifiuta"
 * (docs/changelog/2026-10-28-promemoria-whatsapp.md).
 */
export function BookedDateChangeAnswer({
  token,
  quoteId,
  booking,
  dateChange,
  onPropose,
  onChanged,
}: {
  token: string;
  quoteId: string;
  booking: ClientBooking;
  dateChange: BookingDateChange;
  onPropose: () => void;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState<"accept" | "reject" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(kind: "accept" | "reject") {
    setBusy(kind);
    setError(null);
    try {
      if (kind === "accept") await apiClient.confirmProposedQuoteDate(token, quoteId);
      else await apiClient.rejectProposedQuoteDate(token, quoteId);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore imprevisto, riprova.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <YStack gap="$2">
      <ScheduleChangeBox
        title="Il professionista propone un'altra data"
        beforeLabel="Appuntamento di adesso"
        beforeText={formatQuoteDateRange(booking.scheduledAt, booking.scheduledEndAt)}
        afterLabel="Nuova data proposta"
        afterText={formatQuoteDateRange(dateChange.start, dateChange.end)}
        note={dateChange.note}
      />
      <XStack gap="$2" flexWrap="wrap" $xs={{ flexDirection: "column", alignItems: "stretch" }}>
        <CardButton tone="primary" $xs={{ height: 48 }} disabled={busy !== null} onPress={() => void run("accept")}>
          {busy === "accept" ? "Conferma..." : "Accetta nuova data"}
        </CardButton>
        <CardButton $xs={{ height: 48 }} disabled={busy !== null} onPress={onPropose}>
          Proponi un&apos;altra data
        </CardButton>
        <CardButton tone="danger" $xs={{ height: 48 }} disabled={busy !== null} onPress={() => void run("reject")}>
          {busy === "reject" ? "..." : "Rifiuta"}
        </CardButton>
      </XStack>
      {error ? (
        <Text fontSize={13} color={brand.urgenza} role="alert">
          {error}
        </Text>
      ) : null}
    </YStack>
  );
}
