"use client";

import { useEffect, useState } from "react";
import { Icon, Rating, Section, Surface, Text, XStack, YStack, brand } from "@professionisti/ui";
import { apiClient } from "@/lib/apiClient";
import { CategoryIcon, CATEGORY_ACCENT } from "./icons/CategoryIcons";

type RecentReview = {
  id: string;
  rating: number;
  comment: string | null;
  isAutomatic: boolean;
  createdAt: string;
  professional: { businessName: string; categoryLabel: string; categorySlug: string; city: string; imageUrl: string | null };
};

/**
 * Riprova sociale reale in home (audit, punto J): le ultime recensioni
 * pubbliche della piattaforma, dallo stesso criterio "doppio cieco" della
 * pagina profilo (GET /reviews/recent). Mai una recensione inventata: se
 * non ce ne sono ancora, la sezione non viene proprio renderizzata — lo
 * stesso principio "niente dati finti" seguito per prezzi e vetrina.
 */
export function RecentReviews() {
  const [reviews, setReviews] = useState<RecentReview[] | null>(null);

  useEffect(() => {
    apiClient
      .getRecentReviews()
      .then(setReviews)
      .catch(() => setReviews([]));
  }, []);

  if (!reviews || reviews.length === 0) return null;

  return (
    <Section eyebrow="Recensioni verificate" title="Chi ha già trovato il professionista giusto" maxWidth={1080}>
      <XStack flexWrap="wrap" gap="$4" width="100%" justifyContent="center">
        {reviews.map((review) => {
          const accent = CATEGORY_ACCENT[review.professional.categorySlug as keyof typeof CATEGORY_ACCENT] ?? { bg: "#F1F5F9", fg: "#334155" };
          return (
            <Surface key={review.id} width={320} flexGrow={1} flexBasis={280} maxWidth={360} padding={0} overflow="hidden">
              {/* Foto del professionista grande quanto l'intera card, non
                  un'icona piccola in un angolo — richiesta esplicita
                  dell'utente: "deve essere la prima cosa che salta
                  all'occhio". Colonna a larghezza fissa dentro una riga
                  flex, si allunga da sola all'altezza della card (default
                  `alignItems: stretch` di un XStack, mai impostato qui
                  esplicitamente) — nessun ingrandimento della card stessa,
                  solo il contenuto testuale si stringe nella colonna
                  restante. Fallback identico al resto del sito quando il
                  professionista non ha caricato un'immagine profilo:
                  l'icona colorata di categoria, qui a piena altezza invece
                  che nel cerchio piccolo di `CategoryIconBadge`. */}
              <XStack width="100%">
                <YStack width={132} flexShrink={0}>
                  {review.professional.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={review.professional.imageUrl}
                      alt=""
                      style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                    />
                  ) : (
                    <YStack width="100%" height="100%" minHeight={132} alignItems="center" justifyContent="center" backgroundColor={accent.bg}>
                      <CategoryIcon slug={review.professional.categorySlug} size={40} color={accent.fg} />
                    </YStack>
                  )}
                </YStack>
                <YStack flex={1} minWidth={0} padding="$4" gap="$3">
                  {/* Bug reale trovato in verifica (agente Playwright): a
                      larghezza massima della card, la colonna testo (ridotta
                      dalla nuova foto a piena altezza a sinistra) non aveva
                      più spazio per stelle+badge affiancati senza `flexWrap`
                      — "Lavoro confermato" sforava il bordo destro della
                      card. Il badge va a capo sotto le stelle quando non c'è
                      spazio, invece di sforare. */}
                  <XStack alignItems="center" justifyContent="space-between" gap="$2" flexWrap="wrap">
                    <Rating value={review.rating} size={14} />
                    <XStack alignItems="center" gap="$1">
                      <Icon name="badge-check" size={13} color={brand.verificato} strokeWidth={2} />
                      <Text fontFamily="$body" fontSize={11} fontWeight="700" color={brand.verificato}>
                        Lavoro confermato
                      </Text>
                    </XStack>
                  </XStack>
                  <Text fontSize={14} lineHeight={21} color={brand.grafite} fontStyle="italic">
                    {review.isAutomatic ? "(recensione automatica)" : `“${review.comment ?? ""}”`}
                  </Text>
                  <YStack gap={2} borderTopWidth={1} borderTopColor={brand.filetto} paddingTop="$2">
                    <Text fontSize={13} fontWeight="700" color={brand.grafite}>
                      {review.professional.businessName}
                    </Text>
                    <Text fontSize={12} color={brand.grafite70}>
                      {review.professional.categoryLabel} · {review.professional.city}
                    </Text>
                  </YStack>
                </YStack>
              </XStack>
            </Surface>
          );
        })}
      </XStack>
    </Section>
  );
}
