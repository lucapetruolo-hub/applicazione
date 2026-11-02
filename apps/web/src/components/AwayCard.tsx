"use client";

import { useState } from "react";
import { formatAppointmentDate, wallClockToday, MAX_AWAY_DAYS } from "@professionisti/shared";
import { Button, Surface, Text, XStack, YStack, brand, radiusDoc } from "@professionisti/ui";
import { apiClient } from "@/lib/apiClient";
import { ItalianDateInput } from "@/components/ItalianDateInput";

function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** "12 novembre": il giorno di ritorno, nella convenzione delle date dell'agenda. */
export function formatAwayDay(iso: string): string {
  return formatAppointmentDate(iso, { weekday: "long", day: "numeric", month: "long" });
}

/**
 * "Metti in pausa" (collaudo C-16): fino al giorno scelto niente nuove
 * richieste né prenotazioni e il profilo non compare nella ricerca; i lavori
 * già fissati restano. In Agenda la scheda c'è sempre, in Home solo durante
 * la pausa (`onlyWhenAway`), con "Riprendi ora".
 */
export function AwayCard({
  token,
  awayUntil,
  onChange,
  onlyWhenAway = false,
}: {
  token: string;
  awayUntil: string | null;
  onChange: (awayUntil: string | null) => void;
  onlyWhenAway?: boolean;
}) {
  const today = wallClockToday();
  const tomorrow = isoDay(new Date(today.getTime() + 86_400_000));
  const lastDay = isoDay(new Date(today.getTime() + MAX_AWAY_DAYS * 86_400_000));
  const [until, setUntil] = useState(awayUntil ? awayUntil.slice(0, 10) : "");
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const away = !!awayUntil;
  if (onlyWhenAway && !away) return null;

  async function save(next: string | null) {
    setBusy(true);
    setError(null);
    try {
      const result = await apiClient.setAway(token, next);
      onChange(result.awayUntil);
      setEditing(false);
      if (!result.awayUntil) setUntil("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Non siamo riusciti a salvare: riprova.");
    } finally {
      setBusy(false);
    }
  }

  const dateField = (
    <XStack gap="$2" alignItems="flex-end" flexWrap="wrap">
      <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13, fontWeight: 600, color: brand.grafite }}>
        Torno il
        <ItalianDateInput ariaLabel="Torno il" min={tomorrow} max={lastDay} value={until} onChange={setUntil} style={{ minWidth: 150 }} />
      </label>
      <Button variant="primary" size="$3" disabled={busy || !until || until < tomorrow || until > lastDay} onPress={() => void save(until)}>
        {busy ? "Salvo..." : away ? "Cambia data" : "Metti in pausa"}
      </Button>
      {away ? (
        <Button variant="secondary" size="$3" onPress={() => setEditing(false)}>
          Annulla
        </Button>
      ) : null}
    </XStack>
  );

  return (
    <Surface borderRadius={radiusDoc} padding="$4" gap="$3" borderLeftWidth={away ? 4 : 0} borderLeftColor={brand.ottone} role={away ? "status" : undefined}>
      <YStack gap="$1">
        <Text fontFamily="$heading" fontWeight="800" fontSize="$6" color={brand.grafite}>
          {awayUntil ? `Sei in pausa: torni ${formatAwayDay(awayUntil)}` : "Metti in pausa"}
        </Text>
        <Text color={brand.grafite70}>
          {away
            ? "Non ricevi nuove richieste né prenotazioni e non compari nella ricerca. I lavori già fissati restano."
            : "Non lavori per qualche giorno? Fino al giorno che scegli non ricevi nuove richieste e non compari nella ricerca. I lavori già fissati restano."}
        </Text>
      </YStack>
      {away && !editing ? (
        <XStack gap="$2" flexWrap="wrap">
          <Button variant="primary" size="$3" disabled={busy} onPress={() => void save(null)}>
            {busy ? "Salvo..." : "Riprendi ora"}
          </Button>
          <Button variant="secondary" size="$3" onPress={() => setEditing(true)}>
            Cambia data
          </Button>
        </XStack>
      ) : (
        dateField
      )}
      {error ? (
        <Text color={brand.urgenza} fontSize={14} role="alert">
          {error}
        </Text>
      ) : null}
    </Surface>
  );
}
