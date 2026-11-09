"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { REBOOK_REMINDER_OPTIONS, suggestedRebookReminder, type RebookReminderKey } from "@professionisti/shared";
import { Icon, Text, XStack, YStack, brand } from "@professionisti/ui";
import { apiClient } from "@/lib/apiClient";
import { CardButton } from "@/components/CardButton";

/**
 * "Ti servirà di nuovo?" a lavoro terminato (docs/changelog/2026-11-08-promemoria-manutenzione.md):
 * il cliente sceglie quando ricordarglielo, con la scelta tipica del mestiere
 * già in evidenza; alla data arrivano un avviso sul sito e un'email con
 * "Prenota di nuovo" dallo stesso professionista. Un tocco imposta, "Togli"
 * lo cancella.
 */
export function RebookReminderBox({
  token,
  guidedRequestId,
  remindAt,
  categorySlug,
  businessName,
  rebookHref,
  onChanged,
}: {
  token: string;
  guidedRequestId: string;
  remindAt: string | null;
  categorySlug: string;
  businessName: string;
  /** "Prenota di nuovo" qui solo se non c'è già sopra (senza recensione). */
  rebookHref: string | null;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState<RebookReminderKey | "remove" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [changing, setChanging] = useState(false);
  const labelId = useId();
  const suggested = suggestedRebookReminder(categorySlug);
  const options = suggested ? [...REBOOK_REMINDER_OPTIONS].sort((a, b) => Number(b.key === suggested) - Number(a.key === suggested)) : REBOOK_REMINDER_OPTIONS;

  async function save(value: RebookReminderKey | null) {
    setError(null);
    setBusy(value ?? "remove");
    try {
      await apiClient.updateGuidedRequestMyState(token, guidedRequestId, { rebookReminder: value });
      setChanging(false);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Non è stato salvato, riprova.");
    } finally {
      setBusy(null);
    }
  }

  const date = remindAt ? new Date(remindAt).toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Rome" }) : null;
  // "l'8 novembre", "l'11 marzo", "il 5 novembre".
  const when = date ? (/^(8|11) /.test(date) ? `l'${date}` : `il ${date}`) : null;

  return (
    <YStack className="rebook-box" gap="2" padding="3" borderRadius={20} backgroundColor={brand.gesso} borderWidth={1} borderColor={brand.filetto}>
      {when && !changing ? (
        <>
          <XStack gap="2" alignItems="center">
            <Icon name="bell" size={18} color={brand.verificato} />
            <Text fontSize={15} fontWeight="700" color={brand.grafite}>
              Te lo ricordiamo {when}
            </Text>
          </XStack>
          <Text fontSize={13} color={brand.grafite70}>
            Ti scriviamo anche per email, per prenotare di nuovo da {businessName}.
          </Text>
          <XStack gap="2" flexWrap="wrap">
            <CardButton onPress={() => setChanging(true)} disabled={busy !== null}>
              Cambia
            </CardButton>
            <CardButton tone="danger" onPress={() => save(null)} disabled={busy !== null}>
              {busy === "remove" ? "Tolgo..." : "Togli"}
            </CardButton>
          </XStack>
        </>
      ) : (
        <>
          <Text id={labelId} fontSize={15} fontWeight="700" color={brand.grafite}>
            Ti servirà di nuovo?
          </Text>
          <Text fontSize={13} color={brand.grafite70}>
            Scegli quando: te lo ricordiamo noi, anche per email.
          </Text>
          <div className="slot-pills" role="group" aria-labelledby={labelId}>
            {options.map((option) => (
              <button key={option.key} type="button" className={`slot-pill rebook-pill${option.key === suggested ? " is-suggested" : ""}`} onClick={() => save(option.key)} disabled={busy !== null}>
                {busy === option.key ? "Salvo..." : option.label}
              </button>
            ))}
          </div>
          {changing ? (
            <button type="button" className="rebook-keep" onClick={() => setChanging(false)}>
              Lascia {when}
            </button>
          ) : null}
        </>
      )}
      {error ? (
        <Text fontSize={13} color={brand.urgenza} role="alert">
          {error}
        </Text>
      ) : null}
      {rebookHref ? (
        <Link href={rebookHref} style={{ textDecoration: "none", alignSelf: "flex-start" }}>
          <CardButton tone="primary" arrow>
            Prenota di nuovo
          </CardButton>
        </Link>
      ) : null}
    </YStack>
  );
}
