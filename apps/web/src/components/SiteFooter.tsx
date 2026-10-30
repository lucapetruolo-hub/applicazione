"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BRAND, COMPANY, PROFESSIONAL_CATEGORIES, companyDataReady } from "@professionisti/shared";
import { Icon, Logo, Text, XStack, YStack, brand } from "@professionisti/ui";
import { reopenCookieChoice } from "@/lib/cookieConsent";
import { useAuth } from "@/lib/AuthContext";

const MAIN_CATEGORIES = PROFESSIONAL_CATEGORIES.slice(0, 8);

function FooterColumnTitle({ children }: { children: string }) {
  return (
    <Text fontFamily="$body" fontSize={16} fontWeight="700" color={brand.grafite}>
      {children}
    </Text>
  );
}

function FooterLink({ href, children }: { href: string; children: string }) {
  return (
    <Link href={href} style={{ textDecoration: "none" }}>
      <Text fontSize={16} color={brand.grafite}>
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
/** Aree riservate (cliente, professionista, admin): piede corto, senza i link di marketing. */
const RESERVED_AREAS = ["/dashboard", "/admin", "/account", "/chat", "/le-mie-richieste", "/professionisti-salvati", "/le-mie-recensioni", "/segnalazioni"];

function ShortFooterLink({ href, children }: { href: string; children: string }) {
  return (
    <Link href={href} style={{ textDecoration: "none" }}>
      <Text fontFamily="$body" fontSize={13} color={brand.grafite70}>
        {children}
      </Text>
    </Link>
  );
}

export function SiteFooter() {
  const pathname = usePathname();
  const { user } = useAuth();
  // Dentro le aree riservate il piede completo (quattro colonne, "Iscriviti
  // gratis", "Accedi") non serve a chi è già dentro e su telefono era più
  // lungo della chat (docs/CHANGELOG.md §349): resta una riga sola.
  if (RESERVED_AREAS.some((area) => pathname === area || pathname.startsWith(`${area}/`))) {
    return (
      <YStack width="100%" alignItems="center" paddingVertical="$5" paddingHorizontal="$4">
        <XStack flexWrap="wrap" justifyContent="center" alignItems="center" columnGap="$4" rowGap="$2">
          <Text fontFamily="$body" fontSize={13} color={brand.grafite70}>
            © {new Date().getFullYear()} {BRAND.name}
          </Text>
          <ShortFooterLink href="/privacy">Privacy</ShortFooterLink>
          <ShortFooterLink href="/termini">Termini</ShortFooterLink>
          <ShortFooterLink href="/cookie">Cookie</ShortFooterLink>
          {/* Il banner dice di cambiare idea "in fondo alla pagina": serve anche qui (collaudo del 29/10/2026, M-13). */}
          <button type="button" onClick={reopenCookieChoice} style={{ background: "none", border: "none", padding: 0, cursor: "pointer" }}>
            <Text fontFamily="$body" fontSize={13} color={brand.grafite70}>
              Preferenze cookie
            </Text>
          </button>
          <ShortFooterLink href="/note-legali">Note legali</ShortFooterLink>
          <ShortFooterLink href="/contatti">Aiuto</ShortFooterLink>
        </XStack>
      </YStack>
    );
  }
  return (
    <YStack width="100%" backgroundColor="transparent" alignItems="center">
      <YStack width="100%" maxWidth={1200} paddingVertical="$8" paddingHorizontal="$4" gap="$7">
        {/* Su telefono "Servizi" e "Per i clienti" stanno affiancate (docs/CHANGELOG.md §349). */}
        <XStack flexWrap="wrap" columnGap="$5" rowGap="$6" justifyContent="space-between">
          <YStack gap="$3" maxWidth={280} flexBasis="100%" $gtSm={{ flexBasis: "auto" }}>
            <Logo name={BRAND.name} size={22} />
            <Text fontSize={16} color={brand.grafite70}>
              Trova e prenota professionisti per la casa e la famiglia: idraulici, elettricisti,
              imbianchini, babysitter, dogsitter e altro, vicino a te.
            </Text>
          </YStack>

          <YStack gap="$2" flexBasis={150} flexGrow={1} maxWidth={240}>
            <FooterColumnTitle>Servizi</FooterColumnTitle>
            {MAIN_CATEGORIES.map((category) => (
              <FooterLink key={category.slug} href={`/cerca/${category.slug}`}>
                {category.label}
              </FooterLink>
            ))}
            {/* "Contatti" dentro la colonna "Servizi" (richiesta esplicita
                dell'utente, corretta rispetto a un giro precedente che
                aveva sostituito l'intera colonna con un form inline) —
                apre una pagina dedicata in stile MioDottore (screenshot
                fornito), non più un form compatto nel footer stesso. */}
            <FooterLink href="/contatti">Contatti</FooterLink>
          </YStack>

          <YStack gap="$2" flexBasis={150} flexGrow={1} maxWidth={240}>
            <FooterColumnTitle>Per i clienti</FooterColumnTitle>
            <FooterLink href="/preventivo">Richiedi preventivo</FooterLink>
            <FooterLink href="/urgente">Richiesta urgente</FooterLink>
            <FooterLink href="/#come-funziona">Come funziona</FooterLink>
            <FooterLink href="/#quanto-costa">Quanto costa</FooterLink>
            {/* Chi è già dentro non deve vedere "Accedi" (collaudo L, migliorie). */}
            {user ? null : <FooterLink href="/accedi">Accedi</FooterLink>}
            <FooterLink href="/faq">Domande frequenti</FooterLink>
            <FooterLink href="/problemi-e-rimborsi">Problemi e rimborsi</FooterLink>
            <FooterLink href="/sicurezza">Sicurezza e truffe</FooterLink>
          </YStack>

          <YStack gap="$2" flexBasis={150} flexGrow={1} maxWidth={240}>
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
          <XStack alignItems="center" gap="$2" flexShrink={1} minWidth={0}>
            <Icon name="badge-check" size={16} color={brand.grafite70} strokeWidth={1.5} />
            <Text fontSize={13} fontWeight="600" color={brand.grafite70} flexShrink={1}>
              Badge Verificato: identità controllata con documento e selfie
            </Text>
          </XStack>
          <XStack alignItems="center" gap="$2" flexShrink={1} minWidth={0}>
            <Icon name="shield" size={16} color={brand.grafite70} strokeWidth={1.5} />
            <Text fontSize={13} fontWeight="600" color={brand.grafite70} flexShrink={1}>
              Recensioni solo da lavori confermati
            </Text>
          </XStack>
          <XStack alignItems="center" gap="$2" flexShrink={1} minWidth={0}>
            <Icon name="tag" size={16} color={brand.grafite70} strokeWidth={1.5} />
            <Text fontSize={13} fontWeight="600" color={brand.grafite70} flexShrink={1}>
              Gratis per chi cerca
            </Text>
          </XStack>
        </XStack>

        <XStack flexWrap="wrap" alignItems="center" gap="$4">
          <XStack alignItems="center" gap="$2">
            <Icon name="map-pin" size={14} color={brand.grafite70} strokeWidth={1.5} />
            <Text fontFamily="$body" fontSize={13} color={brand.grafite70}>
              © {new Date().getFullYear()} {BRAND.name} · Tutti i diritti riservati.
              {/* Ragione sociale e P.IVA in ogni pagina (D.Lgs. 70/2003 art. 7, M-01), appena compilate in `COMPANY`. */}
              {companyDataReady() ? ` ${COMPANY.legalName} · P.IVA ${COMPANY.vatNumber}` : null}
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
          <button type="button" onClick={reopenCookieChoice} style={{ background: "none", border: "none", padding: 0, cursor: "pointer" }}>
            <Text fontFamily="$body" fontSize={13} color={brand.grafite70}>
              Preferenze cookie
            </Text>
          </button>
          <Link href="/accessibilita" style={{ textDecoration: "none" }}>
            <Text fontFamily="$body" fontSize={13} color={brand.grafite70}>
              Accessibilità
            </Text>
          </Link>
          <Link href="/note-legali" style={{ textDecoration: "none" }}>
            <Text fontFamily="$body" fontSize={13} color={brand.grafite70}>
              Note legali
            </Text>
          </Link>
          {/* Chiunque, anche senza account, può segnalare un contenuto
              illegale (DSA art. 16 c. 1, docs/CHANGELOG.md §319). */}
          <Link href="/contatti?motivo=segnalazione" style={{ textDecoration: "none" }}>
            <Text fontFamily="$body" fontSize={13} color={brand.grafite70}>
              Segnala un contenuto illegale
            </Text>
          </Link>
        </XStack>
      </YStack>
    </YStack>
  );
}
