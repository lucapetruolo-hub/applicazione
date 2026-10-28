"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { X } from "lucide-react";
import { BANK_DISPUTE_PRO_PHOTOS_MAX, BANK_DISPUTE_REMINDER_DAYS, type BankDisputeProNoteInput, type ProfessionalBankDispute } from "@professionisti/shared";
import { Button, Icon, Text, XStack, YStack, brand } from "@professionisti/ui";
import { CardButton } from "@/components/CardButton";
import { MediaPreview } from "@/components/MediaPreview";
import { UploadingDots } from "@/components/UploadingDots";
import { closeOnBackdrop } from "@/lib/closeOnBackdrop";
import { formatIssueDeadline } from "@/lib/leadDeadline";

const DAY_MS = 24 * 60 * 60 * 1000;

const fieldStyle = {
  padding: 10,
  borderRadius: 10,
  border: `1px solid ${brand.bordoCampo}`,
  fontSize: 16,
  fontFamily: "inherit",
  color: brand.grafite,
  backgroundColor: brand.calce,
  width: "100%",
};

/** Entro quando conviene scrivere: prima che al nostro team arrivi l'avviso della scadenza. */
function writeBy(dueBy: string | null): string | null {
  if (!dueBy) return null;
  const by = new Date(new Date(dueBy).getTime() - BANK_DISPUTE_REMINDER_DAYS * DAY_MS);
  return by.getTime() > Date.now() ? formatIssueDeadline(by.toISOString()) : null;
}

function closedText(status: string): string {
  if (status === "won") return "La banca ti ha dato ragione: la cifra torna sul tuo conto.";
  if (status === "lost") return "La banca ha dato ragione al cliente.";
  if (status.includes("under_review")) return "Abbiamo mandato le prove alla banca: ora decide lei. Ti avvisiamo dell'esito.";
  return "La contestazione è chiusa.";
}

/**
 * Contestazione in banca vista dal professionista, sotto il pagamento del
 * lavoro (docs/changelog/2026-10-28-stripe-prova.md): scrive come è andato e
 * aggiunge foto, l'admin le rilegge e le manda alla banca con le prove.
 */
export function BankDisputeNotePanel({
  dispute,
  onSave,
  uploadPhoto,
}: {
  dispute: ProfessionalBankDispute;
  onSave: (input: BankDisputeProNoteInput) => Promise<void>;
  uploadPhoto: (file: File) => Promise<string>;
}) {
  const [open, setOpen] = useState(false);
  const by = writeBy(dispute.dueBy);

  return (
    <YStack gap="$2" padding="$3" borderRadius="$3" backgroundColor={brand.ottoneVelo} borderWidth={1} borderColor={brand.filetto}>
      <XStack gap="$3" alignItems="flex-start">
        <YStack width={36} height={36} borderRadius={18} backgroundColor={brand.calce} alignItems="center" justifyContent="center" flexShrink={0}>
          <Icon name="triangle-alert" size={18} strokeWidth={2.2} color="#8A6418" />
        </YStack>
        <YStack flex={1} gap={2}>
          <Text fontSize={16} fontWeight="700" color={brand.grafite} lineHeight={22}>
            Contestazione in banca
          </Text>
          {dispute.open ? (
            <Text fontSize={14} color={brand.grafite70}>
              {dispute.note
                ? `Spiegazione inviata${dispute.noteAt ? ` il ${formatIssueDeadline(dispute.noteAt)}` : ""}. Puoi cambiarla finché non mandiamo le prove alla banca.`
                : `Il cliente ha contestato il pagamento. Scrivi come è andato il lavoro e aggiungi le foto: le mandiamo noi alla banca.${by ? ` Scrivila entro ${by}.` : ""}`}
            </Text>
          ) : (
            <Text fontSize={14} color={brand.grafite70}>
              {closedText(dispute.status)}
            </Text>
          )}
        </YStack>
      </XStack>
      {dispute.open ? (
        <XStack>
          <CardButton tone={dispute.note ? "outline" : "primary"} onPress={() => setOpen(true)}>
            {dispute.note ? "Modifica la spiegazione" : "Scrivi la tua spiegazione"}
          </CardButton>
        </XStack>
      ) : null}
      {open ? <BankDisputeNoteModal dispute={dispute} onClose={() => setOpen(false)} onSave={onSave} uploadPhoto={uploadPhoto} /> : null}
    </YStack>
  );
}

function BankDisputeNoteModal({
  dispute,
  onClose,
  onSave,
  uploadPhoto,
}: {
  dispute: ProfessionalBankDispute;
  onClose: () => void;
  onSave: (input: BankDisputeProNoteInput) => Promise<void>;
  uploadPhoto: (file: File) => Promise<string>;
}) {
  const [note, setNote] = useState(dispute.note ?? "");
  const [photoUrls, setPhotoUrls] = useState<string[]>(dispute.photoUrls);
  const [isUploading, setIsUploading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  async function handlePhoto(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError(null);
    setIsUploading(true);
    try {
      const url = await uploadPhoto(file);
      setPhotoUrls((prev) => [...prev, url].slice(0, BANK_DISPUTE_PRO_PHOTOS_MAX));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore durante il caricamento.");
    } finally {
      setIsUploading(false);
    }
  }

  async function handleSubmit() {
    setError(null);
    if (note.trim().length < 20) {
      setError("Racconta in qualche riga come è andato il lavoro.");
      return;
    }
    setIsSaving(true);
    try {
      await onSave({ note: note.trim(), photoUrls });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore imprevisto, riprova.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div
      role="presentation"
      onClick={closeOnBackdrop(onClose)}
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(20,24,30,0.55)",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        zIndex: 1000,
        padding: 16,
        overflowY: "auto",
      }}
    >
      <YStack
        role="dialog"
        aria-modal
        aria-label="La tua spiegazione per la banca"
        width="100%"
        maxWidth={480}
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
            La tua spiegazione
          </Text>
          <Text fontSize={16} color={brand.grafite70}>
            Racconta come è andato il lavoro: quando sei andato, cosa hai fatto, se il cliente era d&apos;accordo. La rileggiamo e la mandiamo alla banca con le prove.
          </Text>
        </YStack>

        <YStack gap="$2">
          <Text fontFamily="$body" fontSize={13} fontWeight="700" color={brand.grafite70}>
            Come è andato
          </Text>
          <textarea
            aria-label="Come è andato"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Es. Sono andato il 31 ottobre alle 9, ho cambiato il rubinetto e il cliente ha provato l'acqua davanti a me."
            rows={6}
            maxLength={5000}
            style={{ ...fieldStyle, resize: "vertical" }}
          />
        </YStack>

        <YStack gap="$1">
          <Text fontSize={13} color={brand.grafite70}>
            Foto del lavoro (facoltative, fino a {BANK_DISPUTE_PRO_PHOTOS_MAX})
          </Text>
          <XStack flexWrap="wrap" gap="$2">
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
                  onPress={() => setPhotoUrls((prev) => prev.filter((u) => u !== url))}
                  accessibilityRole="button"
                  accessibilityLabel="Rimuovi foto"
                >
                  <X size={11} strokeWidth={2} color="white" />
                </YStack>
              </YStack>
            ))}
            {photoUrls.length < BANK_DISPUTE_PRO_PHOTOS_MAX ? (
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
                opacity={isUploading ? 0.6 : 1}
                onPress={() => !isUploading && inputRef.current?.click()}
                accessibilityRole="button"
                accessibilityLabel="Aggiungi foto"
              >
                {isUploading ? (
                  <UploadingDots dotSize={6} />
                ) : (
                  <Text fontSize="$6" color={brand.grafite70}>
                    +
                  </Text>
                )}
              </YStack>
            ) : null}
          </XStack>
          <input ref={inputRef} type="file" accept="image/*,video/*" onChange={handlePhoto} disabled={isUploading} style={{ display: "none" }} />
        </YStack>

        {error ? (
          <Text color={brand.urgenza} fontSize={16}>
            {error}
          </Text>
        ) : null}

        <XStack gap="$2" flexWrap="wrap">
          <Button variant="primary" size="$3" height={44} onPress={handleSubmit} disabled={isSaving || isUploading} opacity={isSaving ? 0.6 : 1}>
            {isSaving ? "Invio..." : "Invia la spiegazione"}
          </Button>
          <Button variant="ghost" size="$3" height={44} onPress={onClose} disabled={isSaving}>
            Annulla
          </Button>
        </XStack>
      </YStack>
    </div>
  );
}
