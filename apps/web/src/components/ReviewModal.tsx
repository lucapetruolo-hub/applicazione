"use client";

import { useRef, useState, type ChangeEvent } from "react";
import { useDialogFocus } from "@/lib/useDialogFocus";
import { X } from "lucide-react";
import { Button, Icon, Text, XStack, YStack, brand } from "@professionisti/ui";
import { ConsentCheckbox } from "@/components/ConsentCheckbox";
import { MediaPreview } from "@/components/MediaPreview";
import { moveItem, usePhotoReorder } from "@/lib/usePhotoReorder";
import { UploadingDots } from "@/components/UploadingDots";
import { closeOnBackdrop } from "@/lib/closeOnBackdrop";

const MAX_REVIEW_MEDIA = 5;

const textareaStyle = {
  padding: 10,
  borderRadius: 10,
  border: `1px solid ${brand.bordoCampo}`,
  fontSize: 16,
  fontFamily: "inherit",
  color: brand.grafite,
  resize: "vertical" as const,
};

/**
 * Popup di recensione condiviso (richiesta esplicita dell'utente: "si
 * aprirà un altro popup... per fare una recensione... dove inseriranno il
 * numero di stelle da 1 a 5, un testo e delle foto/video") — usato dal
 * cliente per recensire il professionista (`onSubmit`/`uploadPhoto`
 * parametrizzati dal chiamante). Stesso pattern overlay di CompleteJobModal/BookingDetailPanel.
 */
export function ReviewModal({
  title,
  subtitle,
  uploadPhoto,
  onSubmit,
  onClose,
  initial,
  showcase,
  submitLabel = "Invia recensione",
}: {
  title: string;
  subtitle: string;
  /** Recensione da aggiornare (una volta, dopo una segnalazione a lavoro chiuso): parte dai valori di prima. */
  initial?: { rating: number; comment: string | null; mediaUrls: string[] };
  /**
   * "Lavori fatti" (docs/changelog/2026-11-08-lavori-fatti.md): foto di fine
   * lavoro del professionista, che il cliente può far vedere sul suo profilo.
   * Casella spenta di serie: le foto sono di casa sua.
   */
  showcase?: { photoUrls: string[]; professionalName: string };
  submitLabel?: string;
  uploadPhoto: (file: File) => Promise<string>;
  onSubmit: (input: { rating: number; comment?: string; mediaUrls: string[]; showcase: boolean }) => Promise<void>;
  onClose: () => void;
}) {
  const [rating, setRating] = useState(initial?.rating ?? 5);
  const [comment, setComment] = useState(initial?.comment ?? "");
  const [mediaUrls, setMediaUrls] = useState<string[]>(initial?.mediaUrls ?? []);
  // Ordine delle foto: si trascinano col dito, col mouse o con le frecce
  // (richiesta di Luca del 18/11, docs/changelog/2026-11-18-luci-ia-solo-con-ia.md).
  const {
    containerRef: photoReorderRef,
    itemProps: photoReorderItemProps,
    announcement: photoReorderAnnouncement,
  } = usePhotoReorder({
    count: mediaUrls.length,
    move: (from, to) => setMediaUrls((prev) => moveItem(prev, from, to)),
    label: (index) => `Foto ${index + 1}`,
  });
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  // Riga grigia (non un errore) quando si scelgono più file dei posti liberi.
  const [photoNotice, setPhotoNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showcaseChecked, setShowcaseChecked] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);

  // Fuoco dentro, Tab chiuso nella finestra, Esc chiude, fuoco restituito alla chiusura (lib/useDialogFocus.ts).
  const dialogRef = useRef<HTMLDivElement>(null);
  useDialogFocus(dialogRef, onClose);

  // Più foto o video scelti insieme, fino al massimo (richiesta di Luca del 18/11,
  // docs/changelog/2026-11-18-luci-ia-solo-con-ia.md): uno alla volta, nell'ordine scelto.
  async function handlePhotoChange(e: ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (picked.length === 0) return;
    const kept = picked.slice(0, Math.max(0, MAX_REVIEW_MEDIA - mediaUrls.length));
    setPhotoNotice(
      picked.length > kept.length
        ? `Si possono aggiungere fino a ${MAX_REVIEW_MEDIA} foto o video: ne abbiamo ${kept.length === 1 ? "aggiunto 1" : `aggiunti ${kept.length}`}.`
        : null,
    );

    setPhotoError(null);
    setIsUploadingPhoto(true);
    try {
      for (const file of kept) {
        const imageUrl = await uploadPhoto(file);
        setMediaUrls((prev) => [...prev, imageUrl].slice(0, MAX_REVIEW_MEDIA));
      }
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
      await onSubmit({ rating, comment: comment.trim() || undefined, mediaUrls, showcase: showcase !== undefined && showcaseChecked });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore imprevisto, riprova.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div
      role="presentation"
      onClick={closeOnBackdrop(onClose)}
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
        ref={dialogRef as never} role="dialog"
        aria-modal
        aria-label={title}
        width="100%"
        maxWidth={480}
        backgroundColor={brand.calce}
        borderRadius="3"
        borderWidth={1}
        borderColor={brand.filetto}
        padding="5"
        gap="4"
        marginVertical="6"
      >
        <YStack gap="1">
          <Text fontFamily="heading" fontWeight="800" fontSize="6" color={brand.grafite}>
            {title}
          </Text>
          <Text fontSize={16} color={brand.grafite70}>
            {subtitle}
          </Text>
        </YStack>

        <YStack flexDirection="row" gap="1">
          {[1, 2, 3, 4, 5].map((value) => (
            <YStack key={value} cursor="pointer" onPress={() => setRating(value)} role="button" aria-label={`${value} stelle`}>
              <Icon name="star" size={28} strokeWidth={1.5} color={brand.ottone} fill={value <= rating ? brand.ottone : "none"} />
            </YStack>
          ))}
        </YStack>

        <textarea aria-label="Com'è andata?" value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Com'è andata? (opzionale)" rows={3} style={textareaStyle} />

        <YStack gap="1">
          <Text fontSize={13} color={brand.grafite70}>
            Foto o video (opzionale, fino a {MAX_REVIEW_MEDIA})
          </Text>
          <div ref={photoReorderRef} className="portfolio-thumbs">
            {mediaUrls.map((url, index) => (
              <div
                key={url}
                className={mediaUrls.length > 1 ? "portfolio-thumb portfolio-thumb-mini reorder-item" : "portfolio-thumb portfolio-thumb-mini"}
                {...(mediaUrls.length > 1 ? photoReorderItemProps(index) : {})}
              >
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
                  role="button"
                  aria-label="Rimuovi foto"
                >
                  <X size={11} strokeWidth={2} color="white" />
                </YStack>
              </div>
            ))}
            {mediaUrls.length < MAX_REVIEW_MEDIA ? (
              <YStack
                width={64}
                height={64}
                borderRadius="3"
                borderWidth={1}
                borderColor={brand.filetto}
                borderStyle="dashed"
                alignItems="center"
                justifyContent="center"
                cursor="pointer"
                opacity={isUploadingPhoto ? 0.6 : 1}
                onPress={() => !isUploadingPhoto && photoInputRef.current?.click()}
                role="button"
                aria-label="Aggiungi foto"
              >
                {isUploadingPhoto ? (
                  <UploadingDots dotSize={6} />
                ) : (
                  <Text fontSize="6" color={brand.grafite70}>
                    +
                  </Text>
                )}
              </YStack>
            ) : null}
          </div>
          {mediaUrls.length > 1 ? (
            <Text fontSize={13} color={brand.grafite70}>
              Per cambiare l&apos;ordine, tieni premuta una foto e spostala.
            </Text>
          ) : null}
          <span className="sr-only" aria-live="polite">
            {photoReorderAnnouncement}
          </span>
          {photoNotice ? (
            <Text fontSize={13} color={brand.grafite70} role="status">
              {photoNotice}
            </Text>
          ) : null}
          <input ref={photoInputRef} type="file" accept="image/*,video/*" multiple onChange={handlePhotoChange} disabled={isUploadingPhoto} style={{ display: "none" }} />
          {photoError ? (
            <Text color={brand.urgenza} fontSize={13}>
              {photoError}
            </Text>
          ) : null}
        </YStack>

        {showcase && showcase.photoUrls.length > 0 ? (
          <YStack className="review-showcase" gap="2" paddingTop="3" borderTopWidth={1} borderTopColor={brand.filetto}>
            <XStack gap="2" flexWrap="wrap">
              {showcase.photoUrls.slice(0, 4).map((url) => (
                <YStack key={url} width={48} height={48} borderRadius="2" overflow="hidden" borderWidth={1} borderColor={brand.filetto}>
                  <MediaPreview url={url} />
                </YStack>
              ))}
            </XStack>
            <ConsentCheckbox checked={showcaseChecked} onToggle={() => setShowcaseChecked((v) => !v)}>
              Mostra le foto del lavoro nel profilo di {showcase.professionalName}. Senza il tuo nome né l&apos;indirizzo, le togli quando vuoi.
            </ConsentCheckbox>
          </YStack>
        ) : null}

        {error ? (
          <Text color={brand.urgenza} fontSize={16}>
            {error}
          </Text>
        ) : null}

        <XStack gap="2" flexWrap="wrap">
          <Button variant="primary" size="3" height={44} onPress={handleSubmit} disabled={isSubmitting || isUploadingPhoto} opacity={isSubmitting ? 0.6 : 1}>
            {isSubmitting ? "Invio..." : submitLabel}
          </Button>
          <Button variant="ghost" size="3" height={44} onPress={onClose} disabled={isSubmitting}>
            Più tardi
          </Button>
        </XStack>
      </YStack>
    </div>
  );
}
