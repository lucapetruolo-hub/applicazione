"use client";

import Link from "next/link";
import { Icon, Logo, Text, XStack, YStack, brand } from "@professionisti/ui";
import { ContactFormFooter } from "@/components/ContactFormFooter";

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

// Riga legale (Privacy/Cookie/Termini) presente dal refactor post-audit:
// le pagine /privacy, /termini e /cookie sono bozze standard da far
// verificare a un legale prima del lancio definitivo — il titolare del
// trattamento è indicato con segnaposto da compilare con i dati reali
// dell'azienda (ragione sociale, P.IVA, sede) appena disponibili.
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

          {/* Colonna "Servizi" (elenco categorie) sostituita con "Contatti"
              (richiesta esplicita dell'utente, ispirata a un riferimento
              screenshot) — per ora un form reale funzionante, non un
              elenco di link. */}
          <ContactFormFooter />

          <YStack gap="$2" minWidth={160}>
            <FooterColumnTitle>Per i clienti</FooterColumnTitle>
            <FooterLink href="/preventivo">Richiedi preventivo</FooterLink>
            <FooterLink href="/urgente">Richiesta urgente</FooterLink>
            <FooterLink href="/#come-funziona">Come funziona</FooterLink>
            <FooterLink href="/accedi">Accedi</FooterLink>
            <FooterLink href="/faq">Domande frequenti</FooterLink>
          </YStack>

          <YStack gap="$2" minWidth={160}>
            <FooterColumnTitle>Per i professionisti</FooterColumnTitle>
            <FooterLink href="/registrati?ruolo=professionista">Iscriviti gratis</FooterLink>
            <FooterLink href="/per-professionisti">Piani e prezzi</FooterLink>
          </YStack>
        </XStack>

        {/* Badge di fiducia: solo claim veri e verificabili oggi. Rimossi
            "Professionisti con assicurazione RC", "Aderente ad associazione
            di categoria" e "Pagamenti sicuri (Stripe · PayPal)" dalla
            versione precedente: non corrispondono a nulla di implementato
            (nessuna verifica RC, nessuna associazione, Stripe non
            configurato e PayPal mai esistito nel codice) — promesse false
            nel footer distruggono la fiducia invece di costruirla e
            espongono legalmente (pratica commerciale ingannevole). */}
        <XStack flexWrap="wrap" gap="$4" paddingTop="$5" borderTopWidth={1} borderTopColor={brand.filetto}>
          <XStack alignItems="center" gap="$2">
            <Icon name="badge-check" size={16} color={brand.grafite70} strokeWidth={1.5} />
            <Text fontSize="$2" fontWeight="600" color={brand.grafite70}>
              Profili verificati dalla piattaforma
            </Text>
          </XStack>
          <XStack alignItems="center" gap="$2">
            <Icon name="shield" size={16} color={brand.grafite70} strokeWidth={1.5} />
            <Text fontSize="$2" fontWeight="600" color={brand.grafite70}>
              Recensioni solo da lavori confermati
            </Text>
          </XStack>
          <XStack alignItems="center" gap="$2">
            <Icon name="sparkles" size={16} color={brand.grafite70} strokeWidth={1.5} />
            <Text fontSize="$2" fontWeight="600" color={brand.grafite70}>
              Gratis per chi cerca
            </Text>
          </XStack>
        </XStack>

        <XStack flexWrap="wrap" alignItems="center" gap="$4">
          <XStack alignItems="center" gap="$2">
            <Icon name="map-pin" size={14} color={brand.grafite70} strokeWidth={1.5} />
            <Text fontFamily="$body" fontSize={13} color={brand.grafite70}>
              © {new Date().getFullYear()} Professionisti · Tutti i diritti riservati.
            </Text>
          </XStack>
          <Link href="/privacy" style={{ textDecoration: "none" }}>
            <Text fontFamily="$body" fontSize={13} color={brand.grafite70}>
              Privacy Policy
            </Text>
          </Link>
          <Link href="/termini" style={{ textDecoration: "none" }}>
            <Text fontFamily="$body" fontSize={13} color={brand.grafite70}>
              Termini di Servizio
            </Text>
          </Link>
          <Link href="/cookie" style={{ textDecoration: "none" }}>
            <Text fontFamily="$body" fontSize={13} color={brand.grafite70}>
              Cookie Policy
            </Text>
          </Link>
          <Link href="/accessibilita" style={{ textDecoration: "none" }}>
            <Text fontFamily="$body" fontSize={13} color={brand.grafite70}>
              Accessibilità
            </Text>
          </Link>
        </XStack>
      </YStack>
    </YStack>
  );
}
