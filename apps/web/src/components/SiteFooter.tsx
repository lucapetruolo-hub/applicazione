"use client";

import Link from "next/link";
import { PROFESSIONAL_CATEGORIES } from "@professionisti/shared";
import { Icon, Logo, Text, XStack, YStack, brand } from "@professionisti/ui";

const MAIN_CATEGORIES = PROFESSIONAL_CATEGORIES.slice(0, 8);

function FooterColumnTitle({ children }: { children: string }) {
  return (
    <Text fontFamily="$body" fontSize={13} fontWeight="700" color={brand.grafite}>
      {children}
    </Text>
  );
}

function FooterLink({ href, children }: { href: string; children: string }) {
  return (
    <Link href={href} style={{ textDecoration: "none" }}>
      <Text fontSize="$3" color={brand.grafite}>
        {children}
      </Text>
    </Link>
  );
}

// Nessuna riga legale (Privacy/Cookie/Termini/P.IVA/PEC/ODR, prevista dal
// brief §4.8): richiederebbe dati reali di un'azienda registrata che non
// sono disponibili in questa sessione — meglio ometterla che inventarla o
// linkare pagine che non esistono ancora.
export function SiteFooter() {
  return (
    <YStack width="100%" backgroundColor={brand.gesso} alignItems="center">
      <YStack width="100%" maxWidth={1200} paddingVertical="$8" paddingHorizontal="$4" gap="$7">
        <XStack flexWrap="wrap" gap="$7" justifyContent="space-between">
          <YStack gap="$3" maxWidth={280}>
            <Logo size={22} />
            <Text fontSize="$3" color={brand.grafite70}>
              Trova e prenota professionisti verificati per la casa: idraulici, elettricisti, imbianchini e altro,
              vicino a te.
            </Text>
          </YStack>

          <YStack gap="$2" minWidth={160}>
            <FooterColumnTitle>Servizi</FooterColumnTitle>
            {MAIN_CATEGORIES.map((category) => (
              <FooterLink key={category.slug} href={`/cerca/${category.slug}`}>
                {category.label}
              </FooterLink>
            ))}
          </YStack>

          <YStack gap="$2" minWidth={160}>
            <FooterColumnTitle>Per i clienti</FooterColumnTitle>
            <FooterLink href="/preventivo">Richiedi preventivo</FooterLink>
            <FooterLink href="/urgente">Richiesta urgente</FooterLink>
            <FooterLink href="/#come-funziona">Come funziona</FooterLink>
            <FooterLink href="/accedi">Accedi</FooterLink>
          </YStack>

          <YStack gap="$2" minWidth={160}>
            <FooterColumnTitle>Per i professionisti</FooterColumnTitle>
            <FooterLink href="/registrati?ruolo=professionista">Iscriviti gratis</FooterLink>
            <FooterLink href="/per-professionisti">Piani e prezzi</FooterLink>
          </YStack>
        </XStack>

        {/* Loghi/badge di fiducia (assicurazione RC, associazione di
            categoria, pagamenti sicuri) — richiesta esplicita dell'utente,
            inseriti anche se non ancora implementati (stessa
            autorizzazione di "Garanzia Piattaforma"/"Cosa succede se...",
            §30). Badge testuali con icona invece di loghi reali di terzi
            (Stripe/PayPal, associazioni di categoria): riprodurre un
            marchio altrui senza un accordo reale sarebbe un problema di
            per sé, indipendentemente dall'autorizzazione a pubblicare
            promesse non ancora implementate. */}
        <XStack flexWrap="wrap" gap="$4" paddingTop="$5" borderTopWidth={1} borderTopColor={brand.filetto}>
          <XStack alignItems="center" gap="$2">
            <Icon name="shield" size={16} color={brand.grafite70} strokeWidth={1.5} />
            <Text fontSize="$2" fontWeight="600" color={brand.grafite70}>
              Professionisti con assicurazione RC
            </Text>
          </XStack>
          <XStack alignItems="center" gap="$2">
            <Icon name="badge-check" size={16} color={brand.grafite70} strokeWidth={1.5} />
            <Text fontSize="$2" fontWeight="600" color={brand.grafite70}>
              Aderente ad associazione di categoria
            </Text>
          </XStack>
          <XStack alignItems="center" gap="$2">
            <Icon name="credit-card" size={16} color={brand.grafite70} strokeWidth={1.5} />
            <Text fontSize="$2" fontWeight="600" color={brand.grafite70}>
              Pagamenti sicuri (Stripe · PayPal)
            </Text>
          </XStack>
        </XStack>

        <XStack alignItems="center" gap="$2">
          <Icon name="map-pin" size={14} color={brand.grafite70} strokeWidth={1.5} />
          <Text fontFamily="$body" fontSize={13} color={brand.grafite70}>
            © {new Date().getFullYear()} Professionisti · Tutti i diritti riservati.
          </Text>
        </XStack>
      </YStack>
    </YStack>
  );
}
