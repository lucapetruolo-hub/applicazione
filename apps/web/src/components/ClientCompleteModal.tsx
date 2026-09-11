"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { X } from "lucide-react";
import { Button, Text, XStack, YStack, brand } from "@professionisti/ui";
import { MediaPreview } from "@/components/MediaPreview";
import { UploadingDots } from "@/components/UploadingDots";

const MAX_COMPLETION_PHOTOS = 5;

/**
 * Conferma del cliente che il lavoro è davvero terminato dal suo lato
 * (richiesta esplicita dell'utente: "servono i completed da entrambi... dai
 * la possibilità di inserire delle foto del lavoro terminato") — solo foto/
 * video, nessun importo (quello resta di competenza del professionista,
 * vedi CompleteJobModal). Stesso pattern overlay.
 */
export function ClientCompleteModal({
  onClose,
  onConfirm,
  uploadPhoto,
}: {
  onClose: () => void;
  onConfirm: (photoUrls: string[]) => Promise<void>;
  uploadPhoto: (file: File) => Promise<string>;
}) {
  const [photoUrls, setPhotoUrls] = useState<string[]>([]);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

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

  async function handleSubmit() {
    setError(null);
    setIsSaving(true);
    try {
      await onConfirm(photoUrls);
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
      aria-label="Lavoro terminato"
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
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
        onPress={(e: { stopPropagation: () => void }) => e.stopPropagation()}
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
            Confermi che il lavoro è terminato?
          </Text>
          <Text fontSize="$3" color={brand.grafite70}>
            Puoi allegare qualche foto del lavoro svolto, poi ti chiederemo di lasciare una recensione al professionista.
          </Text>
        </YStack>

        <YStack gap="$1">
          <Text fontSize="$2" color={brand.grafite70}>
            Foto o video (opzionale, fino a {MAX_COMPLETION_PHOTOS})
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
            <Text color={brand.urgenza} fontSize="$2">
              {photoError}
            </Text>
          ) : null}
        </YStack>

        {error ? (
          <Text color={brand.urgenza} fontSize="$3">
            {error}
          </Text>
        ) : null}

        <XStack gap="$2" flexWrap="wrap">
          <Button variant="primary" size="$3" height={44} onPress={handleSubmit} disabled={isSaving || isUploadingPhoto} opacity={isSaving ? 0.6 : 1}>
            {isSaving ? "Conferma..." : "Conferma lavoro terminato"}
          </Button>
          <Button variant="ghost" size="$3" height={44} onPress={onClose} disabled={isSaving}>
            Annulla
          </Button>
        </XStack>
      </YStack>
    </div>
  );
}
