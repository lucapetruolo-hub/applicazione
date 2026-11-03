import Link from "next/link";
import { professionalPath, type ProfessionalSearchResult } from "@professionisti/shared";
import { Icon, Text, XStack, YStack, brand } from "@professionisti/ui";
import { ProfessionalAvatar } from "@/components/ProfessionalAvatar";

/**
 * "Potrebbero fare anche questo lavoro" sotto i risultati della ricerca per
 * problema (scelta di Luca, al condizionale,
 * docs/changelog/2026-11-03-preventivo-descrizione-per-prima.md): al massimo 3
 * professionisti di altri mestieri che hanno quel lavoro tra le prestazioni.
 * Mai con un avviso di sicurezza e mai nelle richieste a tutti: si contattano
 * solo dal loro profilo.
 */
export function AlsoDoThisJob({ professionals }: { professionals: ProfessionalSearchResult[] }) {
  if (professionals.length === 0) return null;
  return (
    <section aria-labelledby="also-do-this-job" style={{ width: "100%", marginTop: 8 }}>
      <YStack gap="3">
        <YStack gap="1">
          <Text id="also-do-this-job" render="h2" fontFamily="heading" fontWeight="800" fontSize={20} color={brand.grafite}>
            Potrebbero fare anche questo lavoro
          </Text>
          <Text fontSize={14} color={brand.grafite70}>
            Sono di un altro mestiere, ma tra i loro lavori c&apos;è anche questo.
          </Text>
        </YStack>
        {professionals.map((pro) => {
          const service = pro.services.find((item) => item.id === pro.matchedServiceId);
          return (
            <Link
              key={pro.id}
              // Con la prestazione, "Richiedi preventivo" sul profilo parte con il lavoro già scritto (§398).
              href={`${professionalPath(pro)}${service ? `?servizio=${encodeURIComponent(service.name)}` : ""}`}
              className="also-job-row"
              aria-label={`${pro.businessName}, ${pro.categoryLabel}${service ? `, offre ${service.name}` : ""}`}
            >
              <ProfessionalAvatar imageUrl={pro.imageUrl} categorySlug={pro.categorySlug} size={48} />
              <YStack flex={1} minWidth={0} gap="1">
                <Text fontWeight="700" fontSize={16} color={brand.grafite} numberOfLines={1}>
                  {pro.businessName}
                </Text>
                <Text fontSize={14} color={brand.grafite70} numberOfLines={2}>
                  {pro.categoryLabel}
                  {service ? ` · offre «${service.name}»` : ""}
                </Text>
              </YStack>
              <XStack alignItems="center" gap="1" flexShrink={0}>
                {pro.rating !== null && pro.reviewCount > 0 ? (
                  <Text fontSize={14} fontWeight="700" color={brand.grafite}>
                    ★ {pro.rating.toFixed(1)}
                  </Text>
                ) : null}
                <Icon name="chevron-right" size={18} color={brand.cianografiaScuro} />
              </XStack>
            </Link>
          );
        })}
      </YStack>
    </section>
  );
}
