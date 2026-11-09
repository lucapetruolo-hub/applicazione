import type { ReactNode } from "react";
import { BadgeCheck, MapPin, Shield, Tag, type LucideIcon } from "lucide-react";
import Link from "@/components/IntentLink";
import { BRAND, COMPANY, PROFESSIONAL_CATEGORIES, companyDataReady } from "@professionisti/shared";
import { LogoPlain } from "@/components/LogoPlain";
import { CookiePreferencesButton, FooterByPath, FooterLoginLink } from "./SiteFooterParts";
import styles from "./SiteFooter.module.css";

// Componente del server in HTML semplice, non più Tamagui
// (docs/changelog/2026-11-09-pagine-pubbliche-senza-tamagui.md): il piede è
// su ogni pagina e il telefono calcolava gli stili di una sessantina di
// elementi a ogni apertura. Disegno identico (confronto pixel per pixel);
// le sole parti che servono al browser sono in SiteFooterParts.tsx.
// Colore delle icone: brand.grafite70 (packages/ui/src/tokens.ts).
const ICON_COLOR = "#6E6459";

// Prima i quattro mestieri del lancio (CLAUDE.md §7), poi gli altri fino a
// otto: Falegname restava fuori (collaudo N-13,
// docs/changelog/2026-10-30-velocita-telefono.md). Tutti gli altri da
// "Tutti i servizi" e dal menu in alto.
const LAUNCH_SLUGS = ["idraulico", "elettricista", "pulizie", "falegname"];
const MAIN_CATEGORIES = [
  ...PROFESSIONAL_CATEGORIES.filter((category) => LAUNCH_SLUGS.includes(category.slug)),
  ...PROFESSIONAL_CATEGORIES.filter((category) => !LAUNCH_SLUGS.includes(category.slug)),
].slice(0, 8);

function FooterColumnTitle({ children }: { children: string }) {
  return <span className={`is_Text font_body ${styles.columnTitle}`}>{children}</span>;
}

function FooterLink({ href, children }: { href: string; children: string }) {
  return (
    <Link href={href} className={styles.link}>
      <span className={`is_Text ${styles.linkText}`}>{children}</span>
    </Link>
  );
}

/** Link piccoli della riga in fondo (piede completo e piede corto). */
function SmallLink({ href, children }: { href: string; children: string }) {
  return (
    <Link href={href} className={styles.link}>
      <span className={`is_Text font_body ${styles.small}`}>{children}</span>
    </Link>
  );
}

function TrustBadge({ icon: IconComponent, children }: { icon: LucideIcon; children: ReactNode }) {
  return (
    <div className={`is_View ${styles.badge}`}>
      <IconComponent size={16} color={ICON_COLOR} strokeWidth={1.5} fill="none" />
      <span className={`is_Text ${styles.badgeText}`}>{children}</span>
    </div>
  );
}

// Riga legale (Privacy/Cookie/Termini) presente dal refactor post-audit:
// le pagine /privacy, /termini e /cookie sono bozze standard da far
// verificare a un legale prima del lancio definitivo — il titolare del
// trattamento è indicato con segnaposto da compilare con i dati reali
// dell'azienda (ragione sociale, P.IVA, sede) appena disponibili.
function ShortFooter() {
  return (
    <div className={`is_View ${styles.short}`}>
      <div className={`is_View ${styles.shortRow}`}>
        <span className={`is_Text font_body ${styles.small}`}>
          © {new Date().getFullYear()} {BRAND.name}
        </span>
        <SmallLink href="/privacy">Privacy</SmallLink>
        <SmallLink href="/termini">Termini</SmallLink>
        <SmallLink href="/cookie">Cookie</SmallLink>
        <CookiePreferencesButton />
        <SmallLink href="/note-legali">Note legali</SmallLink>
        <SmallLink href="/contatti">Aiuto</SmallLink>
      </div>
    </div>
  );
}

function FullFooter() {
  return (
    <div className={`is_View ${styles.root}`}>
      <div className={`is_View ${styles.inner}`}>
        {/* Su telefono "Servizi" e "Per i clienti" stanno affiancate (docs/CHANGELOG.md §349). */}
        <div className={`is_View ${styles.columns}`}>
          <div className={`is_View ${styles.intro}`}>
            <LogoPlain name={BRAND.name} size={22} />
            <span className={`is_Text ${styles.introText}`}>
              Trova e prenota professionisti per la casa e la famiglia: idraulici, elettricisti,
              imbianchini, babysitter, dogsitter e altro, vicino a te.
            </span>
          </div>

          <div className={`is_View ${styles.column}`}>
            <FooterColumnTitle>Servizi</FooterColumnTitle>
            {MAIN_CATEGORIES.map((category) => (
              <FooterLink key={category.slug} href={`/cerca/${category.slug}`}>
                {category.label}
              </FooterLink>
            ))}
            <FooterLink href="/cerca">Tutti i servizi</FooterLink>
            {/* "Contatti" dentro la colonna "Servizi" (richiesta esplicita
                dell'utente): apre una pagina dedicata in stile MioDottore. */}
            <FooterLink href="/contatti">Contatti</FooterLink>
          </div>

          <div className={`is_View ${styles.column}`}>
            <FooterColumnTitle>Per i clienti</FooterColumnTitle>
            <FooterLink href="/preventivo">Richiedi preventivo</FooterLink>
            <FooterLink href="/urgente">Richiesta urgente</FooterLink>
            <FooterLink href="/#come-funziona">Come funziona</FooterLink>
            <FooterLink href="/#quanto-costa">Quanto costa</FooterLink>
            {/* Pagine dei prezzi per mestiere (collaudo N-05). */}
            <FooterLink href="/prezzi">Prezzi per mestiere</FooterLink>
            <FooterLoginLink />
            <FooterLink href="/faq">Domande frequenti</FooterLink>
            <FooterLink href="/problemi-e-rimborsi">Problemi e rimborsi</FooterLink>
            <FooterLink href="/sicurezza">Sicurezza e truffe</FooterLink>
          </div>

          <div className={`is_View ${styles.column}`}>
            <FooterColumnTitle>Per i professionisti</FooterColumnTitle>
            <FooterLink href="/registrati?ruolo=professionista">Iscriviti gratis</FooterLink>
            <FooterLink href="/per-professionisti">Piani e prezzi</FooterLink>
          </div>
        </div>

        {/* Badge di fiducia: solo claim veri e verificabili oggi (niente
            assicurazione RC, associazioni o metodi di pagamento non
            attivi: promesse false nel piede sarebbero pratica commerciale
            ingannevole). */}
        <div className={`is_View ${styles.badges}`}>
          <TrustBadge icon={BadgeCheck}>Badge Verificato: identità controllata con documento e selfie</TrustBadge>
          <TrustBadge icon={Shield}>Recensioni solo da lavori fatti tramite il sito</TrustBadge>
          <TrustBadge icon={Tag}>Gratis per chi cerca</TrustBadge>
        </div>

        <div className={`is_View ${styles.legal}`}>
          <div className={`is_View ${styles.copyright}`}>
            <MapPin size={14} color={ICON_COLOR} strokeWidth={1.5} fill="none" />
            <span className={`is_Text font_body ${styles.small}`}>
              © {new Date().getFullYear()} {BRAND.name} · Tutti i diritti riservati.
              {/* Ragione sociale e P.IVA in ogni pagina (D.Lgs. 70/2003 art. 7, M-01), appena compilate in `COMPANY`. */}
              {companyDataReady() ? ` ${COMPANY.legalName} · P.IVA ${COMPANY.vatNumber}` : null}
            </span>
          </div>
          {/* Nomi corti come nell'area account (prova con persone simulate, docs/changelog/2026-11-08-prova-persone-simulate.md). */}
          <SmallLink href="/privacy">Privacy</SmallLink>
          <SmallLink href="/termini">Termini</SmallLink>
          <SmallLink href="/cookie">Cookie</SmallLink>
          <CookiePreferencesButton />
          <SmallLink href="/accessibilita">Accessibilità</SmallLink>
          <SmallLink href="/note-legali">Note legali</SmallLink>
          {/* Chiunque, anche senza account, può segnalare un contenuto
              illegale (DSA art. 16 c. 1, docs/CHANGELOG.md §319). */}
          <SmallLink href="/contatti?motivo=segnalazione">Segnala un contenuto illegale</SmallLink>
        </div>
      </div>
    </div>
  );
}

export function SiteFooter() {
  return <FooterByPath full={<FullFooter />} short={<ShortFooter />} />;
}
