"use client";

import { useState } from "react";
import { Icon, Text, XStack, YStack, brand } from "@professionisti/ui";
import { apiClient } from "@/lib/apiClient";
import { CardButton } from "@/components/CardButton";

/**
 * "Aggiungi al calendario" del cliente (docs/CHANGELOG.md §346): stesso
 * evento delle email (stesso UID, niente doppioni), con Google Calendar o
 * con il file .ics che iPhone e Outlook aprono da soli.
 */
export function AddToCalendar({ token, bookingId }: { token: string; bookingId: string }) {
  const [calendar, setCalendar] = useState<{ googleUrl: string | null; ics: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setError(null);
    setLoading(true);
    try {
      setCalendar(await apiClient.bookingCalendar(token, bookingId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Calendario non disponibile, riprova.");
    } finally {
      setLoading(false);
    }
  }

  const icon = <Icon name="calendar" size={18} color={brand.grafite} />;
  return (
    <YStack gap="$2" alignItems="flex-start">
      {calendar ? (
        <XStack gap="$2" flexWrap="wrap">
          {calendar.googleUrl ? (
            <a href={calendar.googleUrl} target="_blank" rel="noreferrer" style={{ textDecoration: "none" }}>
              <CardButton>
                <XStack alignItems="center" gap="$2">
                  {icon}
                  <Text fontFamily="$body" fontWeight="600" fontSize="$3" color={brand.grafite}>
                    Google Calendar
                  </Text>
                </XStack>
              </CardButton>
            </a>
          ) : null}
          <a href={`data:text/calendar;charset=utf-8,${encodeURIComponent(calendar.ics)}`} download="appuntamento.ics" style={{ textDecoration: "none" }}>
            <CardButton>
              <XStack alignItems="center" gap="$2">
                {icon}
                <Text fontFamily="$body" fontWeight="600" fontSize="$3" color={brand.grafite}>
                  iPhone e altri
                </Text>
              </XStack>
            </CardButton>
          </a>
        </XStack>
      ) : (
        <CardButton onPress={load} disabled={loading}>
          <XStack alignItems="center" gap="$2">
            {icon}
            <Text fontFamily="$body" fontWeight="600" fontSize="$3" color={brand.grafite}>
              {loading ? "Un momento..." : "Aggiungi al calendario"}
            </Text>
          </XStack>
        </CardButton>
      )}
      {error ? (
        <Text fontSize={13} color={brand.urgenza}>
          {error}
        </Text>
      ) : null}
    </YStack>
  );
}
