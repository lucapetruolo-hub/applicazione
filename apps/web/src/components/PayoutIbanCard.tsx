"use client";

import { useEffect, useState } from "react";
import type { PayoutIbanView } from "@professionisti/api-client";
import { checkIban, formatIban } from "@professionisti/shared";
import { Badge, Button, Field, Text, XStack, YStack, brand } from "@professionisti/ui";
import { LearnMore } from "@/components/LearnMore";
import { apiClient } from "@/lib/apiClient";

const CHECK_LABEL = {
  MATCH: { variant: "verificato", label: "Corrisponde al conto su Stripe" },
  MISMATCH: { variant: "urgente", label: "Diverso dal conto su Stripe" },
  UNAVAILABLE: { variant: "nuovo", label: "Da confrontare con Stripe" },
} as const;

const CHECK_HINT = {
  MATCH: null,
  MISMATCH: "Le ultime 4 cifre non sono quelle del conto su Stripe: correggi qui o su Stripe.",
  UNAVAILABLE: null,
} as const;

/**
 * IBAN per la DAC7 (decisione di Luca, docs/CHANGELOG.md §246): solo per chi
 * ha attivato i pagamenti online. Stripe non ci dà l'IBAN in chiaro, ma la
 * comunicazione annuale al fisco lo chiede. Mai mostrato intero dopo il
 * salvataggio: torna solo mascherato, con l'esito del confronto con Stripe.
 */
export function PayoutIbanCard({ token, defaultHolderName }: { token: string; defaultHolderName: string }) {
  const [saved, setSaved] = useState<PayoutIbanView | null | undefined>(undefined);
  const [loadError, setLoadError] = useState(false);
  const [editing, setEditing] = useState(false);
  const [iban, setIban] = useState("");
  const [holderName, setHolderName] = useState(defaultHolderName);
  const [ibanTouched, setIbanTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);

  useEffect(() => {
    apiClient
      .myPayoutIban(token)
      .then((data) => {
        setSaved(data);
        if (data) setHolderName(data.holderName);
      })
      .catch(() => {
        setSaved(null);
        setLoadError(true);
      });
  }, [token]);

  useEffect(() => {
    if (!saved && !holderName && defaultHolderName) setHolderName(defaultHolderName);
  }, [defaultHolderName, holderName, saved]);

  const ibanCheck = checkIban(iban);
  const ibanError = ibanTouched && iban.trim() && !ibanCheck.ok ? ibanCheck.message : undefined;

  async function handleSave() {
    setIbanTouched(true);
    setError(null);
    if (!ibanCheck.ok) {
      setError(ibanCheck.message);
      return;
    }
    if (holderName.trim().length < 2) {
      setError("Scrivi il nome del titolare del conto.");
      return;
    }
    setSaving(true);
    try {
      const result = await apiClient.saveMyPayoutIban(token, { iban: ibanCheck.iban, holderName: holderName.trim() });
      setSaved(result);
      setEditing(false);
      setIban("");
      setIbanTouched(false);
      setJustSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Non siamo riusciti a salvare l'IBAN: riprova tra poco.");
    } finally {
      setSaving(false);
    }
  }

  const showForm = saved === null || editing;

  return (
    <YStack gap="$3" paddingTop="$3" borderTopWidth={1} borderTopColor={brand.filetto}>
      <YStack gap="$1">
        <Text fontSize={15} fontWeight="700">
          IBAN dei pagamenti online
        </Text>
        <LearnMore summary="Lo stesso conto che hai indicato a Stripe.">
          <Text fontSize={13} color={brand.grafite70}>
            Per legge (DAC7) comunichiamo ogni anno al fisco i pagamenti online che ricevi e il conto su cui arrivano.
            Stripe non ci mostra l&apos;IBAN, per questo te lo chiediamo.
          </Text>
          <Text fontSize={13} color={brand.grafite70}>
            Lo conserviamo cifrato e lo usiamo solo per questa comunicazione. Dopo il salvataggio vedi solo le ultime 4 cifre.
          </Text>
        </LearnMore>
      </YStack>

      {saved === undefined ? (
        <Text fontSize={13} color={brand.grafite70}>
          Caricamento...
        </Text>
      ) : showForm ? (
        <YStack gap="$3">
          <Field
            label="IBAN"
            accessibilityLabel="IBAN"
            value={iban}
            onChangeText={(v) => {
              setIban(formatIban(v));
              setError(null);
              setJustSaved(false);
            }}
            onBlur={() => setIbanTouched(true)}
            placeholder="IT60 X054 2811 1010 0000 0123 456"
            autoCapitalize="characters"
            autoCorrect={false}
            error={ibanError}
          />
          <Field
            label="Titolare del conto"
            accessibilityLabel="Titolare del conto"
            value={holderName}
            onChangeText={(v) => {
              setHolderName(v);
              setError(null);
            }}
            placeholder="Nome e cognome o ragione sociale"
          />
          {error ? (
            <Text fontSize={13} color={brand.urgenza} role="alert">
              {error}
            </Text>
          ) : null}
          {loadError ? (
            <Text fontSize={13} color={brand.grafite70}>
              Non riusciamo a leggere l&apos;IBAN salvato: riprova più tardi.
            </Text>
          ) : null}
          <XStack gap="$2" flexWrap="wrap">
            <Button variant="primary" onPress={handleSave} disabled={saving} opacity={saving ? 0.6 : 1}>
              {saving ? "Salvataggio..." : "Salva IBAN"}
            </Button>
            {editing ? (
              <Button
                variant="ghost"
                onPress={() => {
                  setEditing(false);
                  setIban("");
                  setIbanTouched(false);
                  setError(null);
                }}
                disabled={saving}
              >
                Annulla
              </Button>
            ) : null}
          </XStack>
        </YStack>
      ) : saved ? (
        <YStack gap="$2">
          <XStack gap="$3" alignItems="center" flexWrap="wrap" justifyContent="space-between">
            <YStack gap={2}>
              <Text fontSize={15} fontWeight="700" fontFamily="$mono" color={brand.grafite}>
                {saved.maskedIban}
              </Text>
              <Text fontSize={13} color={brand.grafite70}>
                {saved.holderName}
              </Text>
            </YStack>
            <Button variant="secondary" size="$3" onPress={() => setEditing(true)}>
              Cambia IBAN
            </Button>
          </XStack>
          {saved.stripeCheck ? (
            <YStack gap="$1">
              <Badge variant={CHECK_LABEL[saved.stripeCheck].variant}>{CHECK_LABEL[saved.stripeCheck].label}</Badge>
              {CHECK_HINT[saved.stripeCheck] ? (
                <Text fontSize={13} color={saved.stripeCheck === "MISMATCH" ? brand.urgenza : brand.grafite70}>
                  {CHECK_HINT[saved.stripeCheck]}
                </Text>
              ) : null}
            </YStack>
          ) : null}
          {justSaved ? (
            <Text fontSize={13} color={brand.verificato} aria-live="polite">
              IBAN salvato.
            </Text>
          ) : null}
        </YStack>
      ) : null}
    </YStack>
  );
}
