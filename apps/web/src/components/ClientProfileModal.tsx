"use client";

import { useEffect } from "react";
import { Avatar, Icon, Text, XStack, YStack, brand } from "@professionisti/ui";
import { MediaPreview } from "@/components/MediaPreview";

export type ClientReviewSummary = {
  id: string;
  rating: number;
  comment: string | null;
  mediaUrls: string[];
  createdAt: string;
  isAutomatic: boolean;
  reviewerBusinessName: string;
};

function formatBirthDate(birthDate: string): string {
  const parts = birthDate.split("-").map(Number);
  const year = parts[0] ?? 1970;
  const month = parts[1] ?? 1;
  const day = parts[2] ?? 1;
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString("it-IT", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

/**
 * Scheda profilo del cliente, aperta cliccando il suo nome in una richiesta
 * ricevuta (`/dashboard/richieste`, `RequestCard`) — richiesta esplicita
 * dell'utente ("nelle richieste ricevute deve esserci anche il nome,
 * cliccando si aprirà la scheda profilo della persona"). Stesso pattern
 * overlay di BookingDetailPanel/PhotoLightbox (role="dialog", chiusura con
 * Escape/click sul backdrop, nessuna libreria aggiunta).
 *
 * Il cliente non ha un profilo pubblico in questo marketplace (solo i
 * professionisti ne hanno uno, /professionista/[id]): questa scheda mostra
 * solo l'identità (nome/cognome, data di nascita, foto profilo) — richiesta
 * esplicita dell'utente, che ha ribaltato di nuovo la decisione di privacy
 * presa in un giro precedente (CLAUDE.md §12, mostrava telefono/email già
 * da qui): "tutte le info relative al cliente gli verranno visualizzate
 * solo ad accettazione del lavoro". Telefono/email/indirizzo non sono più
 * props di questo componente — restano disponibili solo dopo l'accettazione
 * del preventivo, mostrati direttamente nella sezione "Contatti" della
 * card di un lavoro accettato (già esistente, sorgente ProfessionalBooking),
 * non in questa scheda identità. Le recensioni ricevute dal cliente restano
 * invece visibili subito (richiesta esplicita dell'utente): non sono un
 * dato di contatto personale, sono già "doppio cieco" per costruzione.
 */
export function ClientProfileModal({
  name,
  birthDate,
  imageUrl,
  reviews,
  onClose,
}: {
  name: string;
  /** Data di nascita del cliente (YYYY-MM-DD), se compilata. */
  birthDate?: string | null;
  /** Foto profilo dell'account cliente, se presente — richiesta esplicita dell'utente. */
  imageUrl?: string | null;
  /** Recensioni ricevute dal cliente da parte di professionisti che hanno lavorato con lui. */
  reviews?: ClientReviewSummary[];
  onClose: () => void;
}) {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Scheda cliente"
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
      }}
    >
      <YStack
        onPress={(e: { stopPropagation: () => void }) => e.stopPropagation()}
        width="100%"
        maxWidth={420}
        maxHeight="85vh"
        overflow="scroll"
        backgroundColor={brand.calce}
        borderRadius="$3"
        borderWidth={1}
        borderColor={brand.filetto}
        padding="$5"
        gap="$4"
        alignItems="center"
      >
        <XStack width="100%" justifyContent="flex-end">
          <Text fontSize="$5" color={brand.grafite70} cursor="pointer" onPress={onClose} accessibilityRole="button" accessibilityLabel="Chiudi">
            ✕
          </Text>
        </XStack>

        <Avatar name={name} imageUrl={imageUrl ?? null} size={72} />

        <YStack gap="$1" alignItems="center">
          <Text fontFamily="$heading" fontWeight="800" fontSize="$6" color={brand.grafite} textAlign="center">
            {name}
          </Text>
          <Text fontFamily="$body" fontWeight="700" fontSize={11} color={brand.grafite70}>
            Cliente
          </Text>
        </YStack>

        {birthDate ? (
          <XStack alignItems="center" justifyContent="center" gap="$2">
            <Icon name="calendar" size={14} color={brand.grafite70} strokeWidth={1.5} />
            <Text color={brand.grafite70} fontSize="$3" fontWeight="600">
              Nato/a il {formatBirthDate(birthDate)}
            </Text>
          </XStack>
        ) : null}

        <Text fontSize="$2" color={brand.grafite70} textAlign="center">
          Telefono, email e indirizzo saranno visibili qui e in agenda non appena il preventivo verrà accettato.
        </Text>

        {reviews && reviews.length > 0 ? (
          <YStack width="100%" gap="$3" borderTopWidth={1} borderColor={brand.filetto} paddingTop="$3">
            <Text fontFamily="$body" fontWeight="700" fontSize={11} color={brand.grafite70}>
              Recensioni ricevute ({reviews.length})
            </Text>
            {reviews.map((review) => (
              <YStack key={review.id} gap="$1" width="100%">
                <XStack alignItems="center" gap="$2" flexWrap="wrap">
                  <XStack gap={2}>
                    {[1, 2, 3, 4, 5].map((value) => (
                      <Icon
                        key={value}
                        name="star"
                        size={13}
                        strokeWidth={1.5}
                        color={brand.ottone}
                        fill={value <= review.rating ? brand.ottone : "none"}
                      />
                    ))}
                  </XStack>
                  <Text fontSize="$2" color={brand.grafite} fontWeight="600">
                    {review.reviewerBusinessName}
                  </Text>
                  {review.isAutomatic ? (
                    <Text fontSize={11} color={brand.grafite70} fontStyle="italic">
                      (recensione automatica)
                    </Text>
                  ) : null}
                </XStack>
                {review.comment ? (
                  <Text fontSize="$2" color={brand.grafite70}>
                    {review.comment}
                  </Text>
                ) : null}
                {review.mediaUrls.length > 0 ? (
                  <XStack gap="$2" flexWrap="wrap">
                    {review.mediaUrls.map((url) => (
                      <YStack key={url} width={48} height={48} borderRadius="$2" overflow="hidden" borderWidth={1} borderColor={brand.filetto}>
                        <MediaPreview url={url} />
                      </YStack>
                    ))}
                  </XStack>
                ) : null}
              </YStack>
            ))}
          </YStack>
        ) : null}
      </YStack>
    </div>
  );
}
