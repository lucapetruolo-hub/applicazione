"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { X } from "lucide-react";
import {
  completionDeclaration,
  completionDeviation,
  completionDeviationText,
  formatEurCents,
  formatServicePriceRange,
  type CompleteBookingInput,
} from "@professionisti/shared";
import { Button, Text, XStack, YStack, brand } from "@professionisti/ui";
import { LearnMoreToggle } from "@/components/LearnMore";
import { MediaPreview } from "@/components/MediaPreview";
import { UploadingDots } from "@/components/UploadingDots";
import { apiClient } from "@/lib/apiClient";
import { useAuth } from "@/lib/AuthContext";

const MAX_COMPLETION_PHOTOS = 5;
const MAX_NOTE_LENGTH = 1000;

const textareaStyle = {
  width: "100%",
  boxSizing: "border-box" as const,
  minHeight: 76,
  padding: 10,
  borderRadius: 6,
  border: `1px solid ${brand.bordoCampo}`,
  fontSize: 16,
  fontFamily: "inherit",
  color: brand.grafite,
  resize: "vertical" as const,
};

const smallInputStyle = {
  padding: 10,
  borderRadius: 6,
  border: `1px solid ${brand.bordoCampo}`,
  fontSize: 16,
  fontFamily: "inherit",
  color: brand.grafite,
};

type QuotedRow = { name: string; hint: string; price: string };
type ExtraRow = { name: string; price: string };

function formatRangeHint(priceMinEurCents: number | null, priceMaxEurCents: number | null): string {
  if (priceMinEurCents == null && priceMaxEurCents == null) return "Preventivato: su richiesta";
  return `Preventivato: ${formatServicePriceRange(priceMinEurCents, priceMaxEurCents)}`;
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
  jobName,
  onClose,
  onComplete,
  uploadPhoto,
}: {
  quotedItems: { name: string; priceMinEurCents: number | null; priceMaxEurCents: number | null }[];
  /** Nome del lavoro (es. "Idraulico"): già scritto nella voce quando il preventivo non ha voci (U2, §310). */
  jobName?: string | null;
  onClose: () => void;
  onComplete: (input: CompleteBookingInput) => Promise<void>;
  /** Upload di una foto/video del lavoro terminato (richiesta esplicita dell'utente), restituisce l'URL. */
  uploadPhoto: (file: File) => Promise<string>;
}) {
  const { token } = useAuth();
  const [quotedRows, setQuotedRows] = useState<QuotedRow[]>(
    quotedItems.length > 0
      ? quotedItems.map((item) => ({ name: item.name, hint: formatRangeHint(item.priceMinEurCents, item.priceMaxEurCents), price: "" }))
      : [],
  );
  const [extraRows, setExtraRows] = useState<ExtraRow[]>(quotedItems.length === 0 ? [{ name: jobName ?? "", price: "" }] : []);
  const [photoUrls, setPhotoUrls] = useState<string[]>([]);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  // Casella da correggere: in rosso e con il cursore dentro (T8 del test dei compiti, docs/CHANGELOG.md §311).
  const [invalidField, setInvalidField] = useState<string | null>(null);
  function fail(message: string, field: string | null) {
    setError(message);
    setInvalidField(field);
    if (field) requestAnimationFrame(() => document.getElementById(field)?.focus());
  }
  const fieldStyle = (field: string, base: React.CSSProperties): React.CSSProperties =>
    invalidField === field ? { ...base, borderColor: brand.urgenza, boxShadow: `0 0 0 1px ${brand.urgenza}` } : base;
  const [isSaving, setIsSaving] = useState(false);
  const [note, setNote] = useState("");
  const [changeReason, setChangeReason] = useState("");
  // Dichiarazione sull'importo (DAC7, docs/CHANGELOG.md §246-§247): si
  // accetta premendo "Conferma", il testo completo è dietro "Scopri di più".
  // Il testo dipende dal tipo fiscale del professionista: `undefined` finché
  // non è caricato; se il caricamento fallisce si usa il testo valido per
  // tutti (il server rifiuta comunque una versione diversa dalla sua).
  const [entityType, setEntityType] = useState<"PRIVATE_INDIVIDUAL" | "SOLE_PROPRIETOR" | "BUSINESS" | null | undefined>(undefined);
  const [declarationOpen, setDeclarationOpen] = useState(false);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    apiClient
      .myFiscalProfile(token)
      .then((profile) => !cancelled && setEntityType(profile?.entityType ?? null))
      .catch(() => !cancelled && setEntityType(null));
    return () => {
      cancelled = true;
    };
  }, [token]);
  const declaration = entityType === undefined ? null : completionDeclaration(entityType);

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

  async function handlePhotoChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setPhotoError(null);
    setIsUploadingPhoto(true);
    try {
      const imageUrl = await uploadPhoto(file);
      setPhotoUrls((prev) => [...prev, imageUrl].slice(0, MAX_COMPLETION_PHOTOS));
    } catch (err) {
      setPhotoError(err instanceof Error ? err.message : "Errore durante il caricamento della foto.");
    } finally {
      setIsUploadingPhoto(false);
    }
  }

  function removePhoto(url: string) {
    setPhotoUrls((prev) => prev.filter((u) => u !== url));
  }

  const parsedQuoted = quotedRows.map((row) => ({ name: row.name, cents: parseEuroToCents(row.price) }));
  const parsedExtra = extraRows
    .filter((row) => row.name.trim() || row.price.trim())
    .map((row) => ({ name: row.name.trim(), cents: parseEuroToCents(row.price) }));
  const totalEurCents = [...parsedQuoted, ...parsedExtra].reduce((sum, row) => sum + (row.cents ?? 0), 0);
  // Voci aggiunte o totale fuori dal preventivo: motivo obbligatorio
  // (docs/CHANGELOG.md §163). Calcolato solo quando tutti gli importi del
  // preventivo sono compilati, per non chiederlo a metà inserimento.
  const deviation = parsedQuoted.every((row) => row.cents !== null)
    ? completionDeviation(
        quotedItems,
        [...parsedQuoted, ...parsedExtra].filter((row) => row.name && row.cents !== null).map((row) => ({ name: row.name, priceEurCents: row.cents as number })),
      )
    : null;
  const needsReason = Boolean(deviation?.needsReason);

  async function handleSubmit() {
    setError(null);
    setInvalidField(null);

    const badQuoted = quotedRows.findIndex((row) => parseEuroToCents(row.price) === null);
    if (badQuoted >= 0) {
      fail(`Scrivi l'importo di "${quotedRows[badQuoted]!.name}".`, `complete-q-${badQuoted}`);
      return;
    }
    const badExtraName = extraRows.findIndex((row) => !row.name.trim() && row.price.trim());
    if (badExtraName >= 0) {
      fail("Scrivi il nome della voce, o toglila.", `complete-x-${badExtraName}-name`);
      return;
    }
    const badExtraPrice = extraRows.findIndex((row) => row.name.trim() && parseEuroToCents(row.price) === null);
    if (badExtraPrice >= 0) {
      fail(`Scrivi l'importo di "${extraRows[badExtraPrice]!.name.trim()}".`, `complete-x-${badExtraPrice}-price`);
      return;
    }

    const items = [...parsedQuoted, ...parsedExtra]
      .filter((row) => row.cents !== null)
      .map((row) => ({ name: row.name, priceEurCents: row.cents as number }));

    if (items.length === 0) {
      fail("Aggiungi almeno una voce con il suo importo.", extraRows.length > 0 ? "complete-x-0-name" : null);
      return;
    }
    if (needsReason && !changeReason.trim()) {
      fail("Spiega il motivo delle differenze rispetto al preventivo.", null);
      return;
    }
    if (!declaration) return;

    setIsSaving(true);
    try {
      await onComplete({
        items,
        photoUrls,
        note: note.trim() || undefined,
        changeReason: needsReason ? changeReason.trim() : undefined,
        declarationVersion: declaration.version,
      });
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
        // `alignItems: "flex-start"` (non "center"): con contenuto più alto
        // del viewport un contenitore centrato rende irraggiungibile la
        // parte superiore anche scorrendo — stesso bug reale già corretto
        // altrove per lo stesso pattern (CLAUDE.md §35), qui rilevante
        // perché la sezione foto aggiunge altezza al modulo.
        alignItems: "flex-start",
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
          <Text fontSize={16} color={brand.grafite70}>
            Scrivi l&apos;importo finale di ogni voce.
          </Text>
        </YStack>

        <YStack gap="$3">
          {quotedRows.map((row, index) => (
            <YStack key={index} gap="$1">
              <Text fontSize={16} fontWeight="600" color={brand.grafite}>
                {row.name}
              </Text>
              <XStack alignItems="center" gap="$2" flexWrap="wrap">
                <Text fontSize={13} color={brand.grafite70} flex={1} minWidth={140}>
                  {row.hint}
                </Text>
                <XStack alignItems="center" gap="$1">
                  <Text fontSize={13} color={brand.grafite70}>
                    Importo finale (€) *
                  </Text>
                  <input aria-label="Importo finale in euro"
                    id={`complete-q-${index}`}
                    aria-invalid={invalidField === `complete-q-${index}` || undefined}
                    value={row.price}
                    onChange={(e) => updateQuotedPrice(index, e.target.value)}
                    placeholder="0"
                    inputMode="decimal"
                    style={fieldStyle(`complete-q-${index}`, { ...smallInputStyle, width: 90 })}
                  />
                </XStack>
              </XStack>
            </YStack>
          ))}

          {extraRows.length > 0 ? (
            <YStack gap="$2">
              <Text fontSize={16} fontWeight="600" color={brand.grafite}>
                {/* "Altre" solo se ci sono anche le voci del preventivo (T8, §311). */}
                {quotedRows.length > 0 ? "Altre voci" : "Voci"}
              </Text>
              {extraRows.map((row, index) => (
                <XStack key={index} gap="$2" alignItems="center" flexWrap="wrap">
                  <input aria-label="Descrizione della voce"
                    id={`complete-x-${index}-name`}
                    aria-invalid={invalidField === `complete-x-${index}-name` || undefined}
                    value={row.name}
                    onChange={(e) => updateExtraRow(index, "name", e.target.value)}
                    placeholder="Es. Materiale extra"
                    style={fieldStyle(`complete-x-${index}-name`, { ...smallInputStyle, flex: 1, minWidth: 140 })}
                  />
                  <input aria-label="Importo in euro"
                    id={`complete-x-${index}-price`}
                    aria-invalid={invalidField === `complete-x-${index}-price` || undefined}
                    value={row.price}
                    onChange={(e) => updateExtraRow(index, "price", e.target.value)}
                    placeholder="€"
                    inputMode="decimal"
                    style={fieldStyle(`complete-x-${index}-price`, { ...smallInputStyle, width: 90 })}
                  />
                  <XStack
                    width={36}
                    height={36}
                    alignItems="center"
                    justifyContent="center"
                    borderWidth={1}
                    borderColor={brand.filetto}
                    borderRadius="$2"
                    cursor="pointer"
                    onPress={() => removeExtraRow(index)}
                    accessibilityRole="button"
                    accessibilityLabel="Rimuovi voce"
                  >
                    <X size={16} strokeWidth={1.5} color={brand.grafite70} />
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
          <Text fontWeight="800" fontSize="$5" color={brand.cianografiaScuro}>
            {formatEurCents(totalEurCents)}
          </Text>
        </XStack>

        {needsReason && deviation ? (
          <YStack gap="$1" padding="$3" borderRadius="$3" backgroundColor={brand.urgenzaVelo}>
            <Text fontSize={16} fontWeight="700" color={brand.grafite}>
              {completionDeviationText(deviation)}: spiega il motivo *
            </Text>
            <Text fontSize={13} color={brand.grafite70}>
              Preventivo: {formatServicePriceRange(deviation.quoteMinEurCents, deviation.quoteMaxEurCents)}. Lo legge anche il cliente.
            </Text>
            <textarea
              value={changeReason}
              onChange={(e) => setChangeReason(e.target.value.slice(0, MAX_NOTE_LENGTH))}
              placeholder="Es. il tubo era da sostituire per intero, non solo il raccordo"
              aria-label="Motivo delle differenze dal preventivo"
              style={textareaStyle}
            />
          </YStack>
        ) : null}

        <YStack gap="$1">
          <Text fontSize={13} color={brand.grafite70}>
            Note sul lavoro svolto (opzionale)
          </Text>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value.slice(0, MAX_NOTE_LENGTH))}
            placeholder="Es. consigliato un controllo tra 6 mesi"
            aria-label="Note sul lavoro svolto"
            style={textareaStyle}
          />
        </YStack>

        {/* Foto/video del lavoro terminato (richiesta esplicita
            dell'utente), distinte dalle foto della recensione. */}
        <YStack gap="$1">
          <Text fontSize={13} color={brand.grafite70}>
            Foto o video del lavoro svolto (opzionale, fino a {MAX_COMPLETION_PHOTOS})
          </Text>
          <YStack flexDirection="row" flexWrap="wrap" gap="$2">
            {photoUrls.map((url) => (
              <YStack key={url} width={64} height={64} borderRadius="$3" overflow="hidden" position="relative" borderWidth={1} borderColor={brand.filetto}>
                <MediaPreview url={url} />
                <YStack
                  position="absolute"
                  top={2}
                  right={2}
                  width={18}
                  height={18}
                  borderRadius={9}
                  backgroundColor="rgba(20,24,30,0.7)"
                  alignItems="center"
                  justifyContent="center"
                  cursor="pointer"
                  onPress={() => removePhoto(url)}
                  accessibilityRole="button"
                  accessibilityLabel="Rimuovi foto"
                >
                  <X size={11} strokeWidth={2} color="white" />
                </YStack>
              </YStack>
            ))}
            {photoUrls.length < MAX_COMPLETION_PHOTOS ? (
              <YStack
                width={64}
                height={64}
                borderRadius="$3"
                borderWidth={1}
                borderColor={brand.filetto}
                borderStyle="dashed"
                alignItems="center"
                justifyContent="center"
                cursor="pointer"
                opacity={isUploadingPhoto ? 0.6 : 1}
                onPress={() => !isUploadingPhoto && photoInputRef.current?.click()}
                accessibilityRole="button"
                accessibilityLabel="Aggiungi foto"
              >
                {isUploadingPhoto ? (
                  <UploadingDots dotSize={6} />
                ) : (
                  <Text fontSize="$6" color={brand.grafite70}>
                    +
                  </Text>
                )}
              </YStack>
            ) : null}
          </YStack>
          <input ref={photoInputRef} type="file" accept="image/*,video/*" onChange={handlePhotoChange} disabled={isUploadingPhoto} style={{ display: "none" }} />
          {photoError ? (
            <div role="alert">
              <Text color={brand.urgenza} fontSize={13}>
                {photoError}
              </Text>
            </div>
          ) : null}
        </YStack>

        {error ? (
          // Annunciato dal lettore di schermo (U2, docs/CHANGELOG.md §310).
          <div role="alert">
            <Text color={brand.urgenza} fontSize={16}>
              {error}
            </Text>
          </div>
        ) : null}

        {/* Dichiarazione sull'importo (DAC7, docs/CHANGELOG.md §247): una
            riga accanto al pulsante, accettata premendo "Conferma" e salvata
            con data e versione; il testo completo dietro "Scopri di più". */}
        <YStack gap="$2">
          <Text fontSize={13} color={brand.grafite70}>
            Confermando dichiari che {formatEurCents(totalEurCents)} è l&apos;importo che ricevi per questo lavoro.{" "}
            <LearnMoreToggle open={declarationOpen} onToggle={() => setDeclarationOpen((v) => !v)} controls="completion-declaration" />
          </Text>
          {declarationOpen ? (
            <YStack id="completion-declaration" padding="$3" borderRadius="$3" backgroundColor={brand.gesso}>
              <Text fontSize={13} color={brand.grafite70}>
                {declaration ? declaration.text : "Carico il testo..."}
              </Text>
            </YStack>
          ) : null}
        </YStack>
        <XStack gap="$2" flexWrap="wrap">
          <Button
            variant="primary"
            size="$3"
            height={44}
            onPress={handleSubmit}
            disabled={isSaving || isUploadingPhoto || !declaration}
            opacity={isSaving || !declaration ? 0.6 : 1}
          >
            {isSaving ? "Salvataggio..." : "Conferma"}
          </Button>
          <Button variant="ghost" size="$3" height={44} onPress={onClose} disabled={isSaving}>
            Annulla
          </Button>
        </XStack>
      </YStack>
    </div>
  );
}
