"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import type { CompleteBookingInput } from "@professionisti/shared";
import { Button, Text, XStack, YStack, brand } from "@professionisti/ui";

const smallInputStyle = {
  padding: 10,
  borderRadius: 4,
  border: `1px solid ${brand.filetto}`,
  fontSize: 14,
  fontFamily: "inherit",
  color: brand.grafite,
};

type QuotedRow = { name: string; hint: string; price: string };
type ExtraRow = { name: string; price: string };

function formatRangeHint(priceMinEurCents: number | null, priceMaxEurCents: number | null): string {
  if (priceMinEurCents == null && priceMaxEurCents == null) return "Preventivato: su richiesta";
  const fmt = (cents: number) => `€${(cents / 100).toFixed(0)}`;
  if (priceMinEurCents != null && priceMaxEurCents != null && priceMinEurCents !== priceMaxEurCents) {
    return `Preventivato: ${fmt(priceMinEurCents)} – ${fmt(priceMaxEurCents)}`;
  }
  return `Preventivato: ${fmt(priceMinEurCents ?? priceMaxEurCents!)}`;
}

function parseEuroToCents(value: string): number | null {
  const normalized = value.trim().replace(",", ".");
  if (!normalized) return null;
  const euros = Number(normalized);
  if (Number.isNaN(euros) || euros < 0) return null;
  return Math.round(euros * 100);
}

/**
 * "Segnala lavoro terminato" (richiesta esplicita dell'utente): a
 * differenza di un semplice cambio di stato, raccoglie l'importo preciso
 * seguendo le voci del preventivo originale (mostrate con il range
 * preventivato come riferimento, ma con un prezzo esatto da inserire) più
 * eventuali voci aggiuntive non preventivate — stesso pattern overlay di
 * AcceptQuoteModal/BookingDetailPanel.
 */
export function CompleteJobModal({
  quotedItems,
  onClose,
  onComplete,
}: {
  quotedItems: { name: string; priceMinEurCents: number | null; priceMaxEurCents: number | null }[];
  onClose: () => void;
  onComplete: (input: CompleteBookingInput) => Promise<void>;
}) {
  const [quotedRows, setQuotedRows] = useState<QuotedRow[]>(
    quotedItems.length > 0
      ? quotedItems.map((item) => ({ name: item.name, hint: formatRangeHint(item.priceMinEurCents, item.priceMaxEurCents), price: "" }))
      : [],
  );
  const [extraRows, setExtraRows] = useState<ExtraRow[]>(quotedItems.length === 0 ? [{ name: "", price: "" }] : []);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  function updateQuotedPrice(index: number, price: string) {
    setQuotedRows((prev) => prev.map((row, i) => (i === index ? { ...row, price } : row)));
  }

  function updateExtraRow(index: number, field: "name" | "price", value: string) {
    setExtraRows((prev) => prev.map((row, i) => (i === index ? { ...row, [field]: value } : row)));
  }

  function removeExtraRow(index: number) {
    setExtraRows((prev) => prev.filter((_, i) => i !== index));
  }

  const parsedQuoted = quotedRows.map((row) => ({ name: row.name, cents: parseEuroToCents(row.price) }));
  const parsedExtra = extraRows
    .filter((row) => row.name.trim() || row.price.trim())
    .map((row) => ({ name: row.name.trim(), cents: parseEuroToCents(row.price) }));
  const totalEurCents = [...parsedQuoted, ...parsedExtra].reduce((sum, row) => sum + (row.cents ?? 0), 0);

  async function handleSubmit() {
    setError(null);

    if (quotedRows.some((row) => parseEuroToCents(row.price) === null)) {
      setError("Inserisci un importo valido per ogni voce del preventivo.");
      return;
    }
    if (extraRows.some((row) => (row.name.trim() && !row.price.trim()) || (!row.name.trim() && row.price.trim()))) {
      setError("Completa nome e importo di ogni voce aggiunta, o rimuovila.");
      return;
    }
    if (parsedExtra.some((row) => row.cents === null)) {
      setError("Inserisci un importo valido per ogni voce aggiunta.");
      return;
    }

    const items = [...parsedQuoted, ...parsedExtra]
      .filter((row) => row.cents !== null)
      .map((row) => ({ name: row.name, priceEurCents: row.cents as number }));

    if (items.length === 0) {
      setError("Aggiungi almeno una voce con il relativo importo.");
      return;
    }

    setIsSaving(true);
    try {
      await onComplete({ items });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore imprevisto, riprova.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Segnala lavoro terminato"
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(20,24,30,0.55)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
        padding: 16,
        overflowY: "auto",
      }}
    >
      <YStack
        onPress={(e: { stopPropagation: () => void }) => e.stopPropagation()}
        width="100%"
        maxWidth={520}
        backgroundColor={brand.calce}
        borderRadius="$3"
        borderWidth={1}
        borderColor={brand.filetto}
        padding="$5"
        gap="$4"
        marginVertical="$6"
      >
        <YStack gap="$1">
          <Text fontFamily="$heading" fontWeight="800" fontSize="$6" color={brand.grafite}>
            Lavoro terminato
          </Text>
          <Text fontSize="$3" color={brand.grafite70}>
            Inserisci l&apos;importo preciso per ogni voce del preventivo. I campi con * sono obbligatori.
          </Text>
        </YStack>

        <YStack gap="$3">
          {quotedRows.map((row, index) => (
            <YStack key={index} gap="$1">
              <Text fontSize="$3" fontWeight="600" color={brand.grafite}>
                {row.name}
              </Text>
              <XStack alignItems="center" gap="$2" flexWrap="wrap">
                <Text fontSize="$2" color={brand.grafite70} flex={1} minWidth={140}>
                  {row.hint}
                </Text>
                <XStack alignItems="center" gap="$1">
                  <Text fontSize="$2" color={brand.grafite70}>
                    Importo finale (€) *
                  </Text>
                  <input
                    value={row.price}
                    onChange={(e) => updateQuotedPrice(index, e.target.value)}
                    placeholder="0"
                    inputMode="decimal"
                    style={{ ...smallInputStyle, width: 90 }}
                  />
                </XStack>
              </XStack>
            </YStack>
          ))}

          {extraRows.length > 0 ? (
            <YStack gap="$2">
              <Text fontSize="$3" fontWeight="600" color={brand.grafite}>
                Altre voci
              </Text>
              {extraRows.map((row, index) => (
                <XStack key={index} gap="$2" alignItems="center" flexWrap="wrap">
                  <input
                    value={row.name}
                    onChange={(e) => updateExtraRow(index, "name", e.target.value)}
                    placeholder="Es. Materiale extra"
                    style={{ ...smallInputStyle, flex: 1, minWidth: 140 }}
                  />
                  <input
                    value={row.price}
                    onChange={(e) => updateExtraRow(index, "price", e.target.value)}
                    placeholder="€"
                    inputMode="decimal"
                    style={{ ...smallInputStyle, width: 90 }}
                  />
                  <XStack
                    width={36}
                    height={36}
                    alignItems="center"
                    justifyContent="center"
                    borderWidth={1}
                    borderColor={brand.urgenza}
                    backgroundColor={brand.urgenzaVelo}
                    borderRadius="$2"
                    cursor="pointer"
                    onPress={() => removeExtraRow(index)}
                    accessibilityRole="button"
                    accessibilityLabel="Rimuovi voce"
                  >
                    <X size={16} strokeWidth={1.5} color={brand.urgenza} />
                  </XStack>
                </XStack>
              ))}
            </YStack>
          ) : null}

          <Button
            variant="ghost"
            size="$2"
            height={36}
            alignSelf="flex-start"
            onPress={() => setExtraRows((prev) => [...prev, { name: "", price: "" }])}
          >
            + Aggiungi voce
          </Button>
        </YStack>

        <XStack justifyContent="space-between" alignItems="center" paddingTop="$2" borderTopWidth={1} borderTopColor={brand.filetto}>
          <Text fontWeight="700" color={brand.grafite}>
            Totale
          </Text>
          <Text fontWeight="800" fontSize="$5" color={brand.cianografia}>
            €{(totalEurCents / 100).toFixed(2)}
          </Text>
        </XStack>

        {error ? (
          <Text color={brand.urgenza} fontSize="$3">
            {error}
          </Text>
        ) : null}

        <XStack gap="$2" flexWrap="wrap">
          <Button variant="primary" size="$3" height={44} onPress={handleSubmit} disabled={isSaving} opacity={isSaving ? 0.6 : 1}>
            {isSaving ? "Salvataggio..." : "Conferma completamento"}
          </Button>
          <Button variant="ghost" size="$3" height={44} onPress={onClose} disabled={isSaving}>
            Annulla
          </Button>
        </XStack>
        <Text fontSize="$2" color={brand.grafite70}>
          * Campo obbligatorio.
        </Text>
      </YStack>
    </div>
  );
}
