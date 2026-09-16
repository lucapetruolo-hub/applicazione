"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Icon, Rating, Section, Surface, Text, XStack, YStack, brand, motionEasing, motionFast } from "@professionisti/ui";
import { apiClient } from "@/lib/apiClient";
import { CategoryCarousel } from "./CategoryCarousel";
import { ProfessionalAvatar } from "./ProfessionalAvatar";
import { useRevealOnScroll } from "./useRevealOnScroll";

type RecentReview = {
  id: string;
  rating: number;
  comment: string | null;
  isAutomatic: boolean;
  createdAt: string;
  clientName: string;
  professional: { id: string; businessName: string; categoryLabel: string; categorySlug: string; city: string; imageUrl: string | null };
};

const CARD_WIDTH = 380;
const PHOTO_SIZE = 104;
// Tetto al ritardo della cascata (richiesta esplicita dell'utente: "rendi
// più innovativa la visualizzazione... animazione di ingresso") — oltre le
// prime card l'attesa aggiuntiva non ha più senso, tutte compaiono entro
// mezzo secondo dall'ingresso in vista invece di un ritardo lineare
// illimitato se ci fossero molte recensioni.
const MAX_STAGGER_MS = 480;

/**
 * Riprova sociale reale in home (audit, punto J): le ultime recensioni
 * pubbliche della piattaforma, dallo stesso criterio "doppio cieco" della
 * pagina profilo (GET /reviews/recent). Mai una recensione inventata: se
 * non ce ne sono ancora, la sezione non viene proprio renderizzata — lo
 * stesso principio "niente dati finti" seguito per prezzi e vetrina.
 *
 * Layout richiesto esplicitamente dall'utente ("lascia in grande a sinistra
 * la foto del professionista a cui e stata fatta la recensione, con il
 * nome del professionista in alto cliccabile, e il nome da chi è stata
 * fatta la recensione a mò di firma in basso a destra"): sostituisce la
 * resa a "nuvoletta di chat" precedente (foto piccola solo in firma) con
 * un layout a due colonne — foto grande a sinistra (`ProfessionalAvatar`,
 * stessa foto vera/fallback icona categoria già in uso ovunque nel
 * prodotto), nome dell'attività in alto a destra come link verso il
 * profilo pubblico intero (mai verso la singola recensione — stessa
 * regola già stabilita in un giro precedente), nome del cliente che ha
 * scritto la recensione come firma in fondo a destra (`clientName`,
 * nuovo campo esposto da `GET /reviews/recent`: fallback "Cliente" sia
 * per un nome mai compilato sia per un account eliminato, il soft-delete
 * azzera già nome/cognome, CLAUDE.md §16 — nessuna logica di privacy
 * aggiuntiva necessaria qui).
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
        {reviews.map((review, index) => (
          <ReviewCard key={review.id} review={review} delayMs={Math.min(index * 90, MAX_STAGGER_MS)} />
        ))}
      </CategoryCarousel>
    </Section>
  );
}

function ReviewCard({ review, delayMs }: { review: RecentReview; delayMs: number }) {
  const { ref, style } = useRevealOnScroll(delayMs);
  const [hovered, setHovered] = useState(false);

  return (
    <div ref={ref} style={{ flexShrink: 0, width: CARD_WIDTH, scrollSnapAlign: "start", ...style }}>
      <Surface
        padding="$4"
        floating={hovered}
        onHoverIn={() => setHovered(true)}
        onHoverOut={() => setHovered(false)}
        style={{
          transition: `transform ${motionFast} ${motionEasing}`,
          transform: hovered ? "translateY(-4px)" : "none",
        }}
      >
        <XStack gap="$3" alignItems="stretch">
          {/* Foto grande a sinistra, cliccabile verso il profilo
              pubblico intero del professionista recensito. */}
          <Link href={`/professionista/${review.professional.id}`} style={{ textDecoration: "none", flexShrink: 0 }}>
            <ProfessionalAvatar imageUrl={review.professional.imageUrl} categorySlug={review.professional.categorySlug} size={PHOTO_SIZE} />
          </Link>

          {/* flexBasis={0}+minWidth={0}: senza, il testo non va a
              capo correttamente accanto a un blocco a larghezza
              fissa (stesso bug già documentato più volte in questo
              file per lo stesso identico pattern, CLAUDE.md §12). */}
          <YStack flex={1} flexBasis={0} minWidth={0} gap="$1">
            <Link href={`/professionista/${review.professional.id}`} style={{ textDecoration: "none" }}>
              <Text fontFamily="$heading" fontSize={17} fontWeight="700" color={brand.cianografia} numberOfLines={1}>
                {review.professional.businessName}
              </Text>
            </Link>
            <Text fontSize={12} color={brand.grafite70} numberOfLines={1}>
              {review.professional.categoryLabel} · {review.professional.city}
            </Text>
            <XStack alignItems="center" gap="$2" marginTop="$1">
              <Rating value={review.rating} size={13} />
              <XStack alignItems="center" gap="$1">
                <Icon name="badge-check" size={12} color={brand.verificato} strokeWidth={2} />
                <Text fontFamily="$body" fontSize={11} fontWeight="700" color={brand.verificato}>
                  Lavoro confermato
                </Text>
              </XStack>
            </XStack>

            <Text fontSize={14} lineHeight={21} color={brand.grafite} fontStyle="italic" marginTop="$1" numberOfLines={4}>
              {review.isAutomatic ? "(recensione automatica)" : `“${review.comment ?? ""}”`}
            </Text>

            {/* Firma: nome di chi ha scritto la recensione, in fondo
                a destra — mai un link, non è un dato pubblico
                raggiungibile (il cliente non ha un profilo pubblico
                in questo marketplace). */}
            <XStack justifyContent="flex-end" marginTop="$2">
              <Text fontSize={12} fontWeight="600" color={brand.grafite70}>
                — {review.clientName}
              </Text>
            </XStack>
          </YStack>
        </XStack>
      </Surface>
    </div>
  );
}
