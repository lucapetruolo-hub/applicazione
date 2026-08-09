"use client";

import { useEffect } from "react";
import { buildWhatsAppLink } from "@professionisti/shared";
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

/**
 * Scheda profilo del cliente, aperta cliccando il suo nome in una richiesta
 * ricevuta (`/dashboard`, `LeadCard`) — richiesta esplicita dell'utente
 * ("nelle richieste ricevute deve esserci anche il nome, cliccando si
 * aprirà la scheda profilo della persona"). Stesso pattern overlay di
 * BookingDetailPanel/PhotoLightbox (role="dialog", chiusura con
 * Escape/click sul backdrop, nessuna libreria aggiunta).
 *
 * Il cliente non ha un profilo pubblico in questo marketplace (solo i
 * professionisti ne hanno uno, /professionista/[id]): questa scheda mostra
 * nome + contatti. Telefono/email sono visibili già dalla prima richiesta
 * ricevuta, non solo dopo l'accettazione del preventivo — correzione
 * esplicita dell'utente rispetto alla scelta iniziale (CLAUDE.md §12), che
 * li mostrava solo su ProfessionalBooking/AcceptedJobCard.
 */
export function ClientProfileModal({
  name,
  phone,
  email,
  imageUrl,
  reviews,
  onClose,
}: {
  name: string;
  phone: string | null;
  email: string | null;
  /** Foto profilo dell'account cliente, se presente — richiesta esplicita dell'utente. */
  imageUrl?: string | null;
  /** Recensioni ricevute dal cliente da parte di professionisti che hanno lavorato con lui. */
  reviews?: ClientReviewSummary[];
  onClose: () => void;
}) {
  const whatsAppLink = buildWhatsAppLink(phone);

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

        {phone || email ? (
          <YStack gap="$2" width="100%">
            {phone ? (
              <a href={`tel:${phone}`} style={{ textDecoration: "none" }}>
                <XStack alignItems="center" justifyContent="center" gap="$2">
                  <Icon name="phone" size={14} color={brand.cianografia} strokeWidth={1.5} />
                  <Text color={brand.cianografia} fontSize="$3" fontWeight="600">
                    {phone}
                  </Text>
                </XStack>
              </a>
            ) : null}
            {whatsAppLink ? (
              <a href={whatsAppLink} target="_blank" rel="noreferrer" style={{ textDecoration: "none" }}>
                <XStack alignItems="center" justifyContent="center" gap="$2">
                  <Icon name="message-circle" size={14} color={brand.verificato} strokeWidth={1.5} />
                  <Text color={brand.verificato} fontSize="$3" fontWeight="600">
                    WhatsApp
                  </Text>
                </XStack>
              </a>
            ) : null}
            {email ? (
              <a href={`mailto:${email}`} style={{ textDecoration: "none" }}>
                <XStack alignItems="center" justifyContent="center" gap="$2">
                  <Icon name="mail" size={14} color={brand.cianografia} strokeWidth={1.5} />
                  <Text color={brand.cianografia} fontSize="$3" fontWeight="600">
                    {email}
                  </Text>
                </XStack>
              </a>
            ) : null}
          </YStack>
        ) : (
          <Text fontSize="$3" color={brand.grafite70} textAlign="center">
            Nessun contatto disponibile per questo cliente.
          </Text>
        )}

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
