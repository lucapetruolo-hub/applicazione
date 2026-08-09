"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { X } from "lucide-react";
import { Button, Icon, Text, XStack, YStack, brand } from "@professionisti/ui";
import { MediaPreview } from "@/components/MediaPreview";

const MAX_REVIEW_MEDIA = 5;

const textareaStyle = {
  padding: 10,
  borderRadius: 4,
  border: `1px solid ${brand.filetto}`,
  fontSize: 14,
  fontFamily: "inherit",
  color: brand.grafite,
  resize: "vertical" as const,
};

/**
 * Popup di recensione condiviso (richiesta esplicita dell'utente: "si
 * aprirà un altro popup... per fare una recensione... dove inseriranno il
 * numero di stelle da 1 a 5, un testo e delle foto/video") — usato sia dal
 * cliente per recensire il professionista sia dal professionista per
 * recensire il cliente (stessa struttura, `onSubmit`/`uploadPhoto` parametrizzati
 * dal chiamante). Stesso pattern overlay di CompleteJobModal/BookingDetailPanel.
 */
export function ReviewModal({
  title,
  subtitle,
  uploadPhoto,
  onSubmit,
  onClose,
}: {
  title: string;
  subtitle: string;
  uploadPhoto: (file: File) => Promise<string>;
  onSubmit: (input: { rating: number; comment?: string; mediaUrls: string[] }) => Promise<void>;
  onClose: () => void;
}) {
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [mediaUrls, setMediaUrls] = useState<string[]>([]);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
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
      setMediaUrls((prev) => [...prev, imageUrl].slice(0, MAX_REVIEW_MEDIA));
    } catch (err) {
      setPhotoError(err instanceof Error ? err.message : "Errore durante il caricamento della foto.");
    } finally {
      setIsUploadingPhoto(false);
    }
  }

  function removeMedia(url: string) {
    setMediaUrls((prev) => prev.filter((u) => u !== url));
  }

  async function handleSubmit() {
    setError(null);
    setIsSubmitting(true);
    try {
      await onSubmit({ rating, comment: comment.trim() || undefined, mediaUrls });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore imprevisto, riprova.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={title}
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
            {title}
          </Text>
          <Text fontSize="$3" color={brand.grafite70}>
            {subtitle}
          </Text>
        </YStack>

        <YStack flexDirection="row" gap="$1">
          {[1, 2, 3, 4, 5].map((value) => (
            <YStack key={value} cursor="pointer" onPress={() => setRating(value)} accessibilityRole="button" accessibilityLabel={`${value} stelle`}>
              <Icon name="star" size={28} strokeWidth={1.5} color={brand.ottone} fill={value <= rating ? brand.ottone : "none"} />
            </YStack>
          ))}
        </YStack>

        <textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Com'è andata? (opzionale)" rows={3} style={textareaStyle} />

        <YStack gap="$1">
          <Text fontSize="$2" color={brand.grafite70}>
            Foto o video (opzionale, fino a {MAX_REVIEW_MEDIA})
          </Text>
          <YStack flexDirection="row" flexWrap="wrap" gap="$2">
            {mediaUrls.map((url) => (
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
                  onPress={() => removeMedia(url)}
                  accessibilityRole="button"
                  accessibilityLabel="Rimuovi foto"
                >
                  <X size={11} strokeWidth={2} color="white" />
                </YStack>
              </YStack>
            ))}
            {mediaUrls.length < MAX_REVIEW_MEDIA ? (
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
                <Text fontSize="$6" color={brand.grafite70}>
                  {isUploadingPhoto ? "…" : "+"}
                </Text>
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
          <Button variant="primary" size="$3" height={44} onPress={handleSubmit} disabled={isSubmitting || isUploadingPhoto} opacity={isSubmitting ? 0.6 : 1}>
            {isSubmitting ? "Invio..." : "Invia recensione"}
          </Button>
          <Button variant="ghost" size="$3" height={44} onPress={onClose} disabled={isSubmitting}>
            Più tardi
          </Button>
        </XStack>
      </YStack>
    </div>
  );
}
