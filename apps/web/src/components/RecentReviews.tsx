"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Icon, Rating, Section, Text, XStack, YStack, brand, radiusDoc } from "@professionisti/ui";
import { apiClient } from "@/lib/apiClient";
import { CategoryCarousel } from "./CategoryCarousel";

type RecentReview = {
  id: string;
  rating: number;
  comment: string | null;
  isAutomatic: boolean;
  createdAt: string;
  professional: { id: string; businessName: string; categoryLabel: string; categorySlug: string; city: string; imageUrl: string | null };
};

const CARD_WIDTH = 300;

/**
 * Riprova sociale reale in home (audit, punto J): le ultime recensioni
 * pubbliche della piattaforma, dallo stesso criterio "doppio cieco" della
 * pagina profilo (GET /reviews/recent). Mai una recensione inventata: se
 * non ce ne sono ancora, la sezione non viene proprio renderizzata — lo
 * stesso principio "niente dati finti" seguito per prezzi e vetrina.
 *
 * Riscritta come carosello su un'unica riga in stile messaggio (richiesta
 * esplicita dell'utente): ogni recensione è una "nuvoletta" di chat (sfondo
 * pieno, angoli arrotondati) con la firma del professionista recensito in
 * basso a destra — stesso pattern del carosello categorie
 * (`CategoryCarousel`), riusato invece di duplicare frecce/scroll. A
 * differenza della card precedente (l'intera card era un `<Link>` verso
 * `#recensione-{id}`), solo la firma è ora cliccabile e porta al profilo
 * del professionista (pagina intera, non l'ancora della singola
 * recensione) — richiesta esplicita dell'utente: "se si clicca sul nome
 * del professionista deve portare alla pagina del professionista e non
 * alla recensione".
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
      <CategoryCarousel>
        {reviews.map((review) => (
          <div key={review.id} style={{ flexShrink: 0, width: CARD_WIDTH, scrollSnapAlign: "start" }}>
            <YStack gap="$2">
              <XStack alignItems="center" gap="$2">
                <Rating value={review.rating} size={13} />
                <XStack alignItems="center" gap="$1">
                  <Icon name="badge-check" size={12} color={brand.verificato} strokeWidth={2} />
                  <Text fontFamily="$body" fontSize={11} fontWeight="700" color={brand.verificato}>
                    Lavoro confermato
                  </Text>
                </XStack>
              </XStack>

              {/* Nuvoletta di chat: sfondo pieno, mai bianco (si deve
                  distinguere dalla `Surface` bianca usata ovunque altrove
                  nel sito), coda in basso a sinistra via bordo triangolare
                  — stesso principio "CSS puro per un dettaglio che Tamagui
                  non rende bene" già seguito altrove nel prodotto (es.
                  CalendarShell, MegaMenu). */}
              <div style={{ position: "relative" }}>
                <YStack backgroundColor={brand.gesso} borderRadius={radiusDoc} padding="$3" minHeight={104}>
                  <Text fontSize={14} lineHeight={21} color={brand.grafite} fontStyle="italic">
                    {review.isAutomatic ? "(recensione automatica)" : `“${review.comment ?? ""}”`}
                  </Text>
                  {/* Firma: nome del professionista recensito, piccolo, in
                      basso a destra della nuvoletta — solo questo testo è
                      cliccabile, verso il profilo pubblico intero. */}
                  <XStack justifyContent="flex-end" marginTop="$2">
                    <Link href={`/professionista/${review.professional.id}`} style={{ textDecoration: "none" }}>
                      <Text fontSize={12} fontWeight="700" color={brand.cianografia}>
                        — {review.professional.businessName}
                      </Text>
                    </Link>
                  </XStack>
                </YStack>
                <div
                  style={{
                    position: "absolute",
                    left: 16,
                    bottom: -8,
                    width: 0,
                    height: 0,
                    borderLeft: "8px solid transparent",
                    borderRight: "8px solid transparent",
                    borderTop: `8px solid ${brand.gesso}`,
                  }}
                />
              </div>

              <Text fontSize={12} color={brand.grafite70}>
                {review.professional.categoryLabel} · {review.professional.city}
              </Text>
            </YStack>
          </div>
        ))}
      </CategoryCarousel>
    </Section>
  );
}
