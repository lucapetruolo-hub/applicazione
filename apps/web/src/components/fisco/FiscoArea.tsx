"use client";

import { useRef, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Section, Text, XStack, YStack, brand } from "@professionisti/ui";
import { useNavAttention } from "@/lib/useNavAttention";
import { useScrollMoreRight } from "@/lib/useScrollMoreRight";

/**
 * L'area "Fisco e pagamenti" del professionista
 * (docs/changelog/2026-10-28-fisco-e-pagamenti-schede.md, richiesta di
 * Luca): un solo titolo e quattro schede sempre nello stesso posto, in cima,
 * al posto dei due link in fondo a Dati fiscali. Sono collegamenti tra
 * pagine (gli indirizzi restano quelli delle email), quindi `nav` con
 * `aria-current`, non un `tablist`. Sul telefono la riga scorre e sfuma a
 * destra come il menu dell'account. Il pallino "da fare" del percorso
 * profilo compare sulla scheda del passo, oltre che nel menu.
 */
export type FiscoTab = "fiscale" | "pagamenti" | "documenti" | "dac7";

export const FISCO_TABS: { key: FiscoTab; href: string; label: string }[] = [
  { key: "fiscale", href: "/dashboard/fiscale", label: "Dati fiscali" },
  { key: "pagamenti", href: "/dashboard/fiscale/pagamenti", label: "Pagamenti online" },
  { key: "documenti", href: "/dashboard/documenti", label: "Fatture e documenti" },
  // "DAC7" da solo non dice niente a un artigiano: la sigla resta nel titolo della pagina, in piccolo.
  { key: "dac7", href: "/dashboard/fiscale/dac7", label: "Compensi al fisco" },
];

export function FiscoTabs({ active }: { active: FiscoTab }) {
  const pathname = usePathname();
  const attention = useNavAttention();
  const navRef = useRef<HTMLElement>(null);
  const moreRight = useScrollMoreRight(navRef);
  return (
    <nav ref={navRef} className="fisco-tabs" aria-label="Sezioni di Fisco e pagamenti" data-more-right={moreRight ? "true" : undefined}>
      {FISCO_TABS.map((tab) => {
        const current = tab.key === active || pathname === tab.href;
        return (
          <Link key={tab.key} href={tab.href} className={`fisco-tab${current ? " is-active" : ""}`} aria-current={current ? "page" : undefined}>
            {tab.label}
            {attention.has(tab.href) ? <span className="acct-nav-dot" role="img" aria-label="Da completare" /> : null}
          </Link>
        );
      })}
    </nav>
  );
}

/**
 * Pagina dell'area: titolo "Fisco e pagamenti" (h1), le schede, poi il
 * titolo della scheda (h2, con un'eventuale sigla in piccolo) e il contenuto.
 */
export function FiscoArea({
  tab,
  heading,
  tag,
  headingExtra,
  maxWidth = 760,
  children,
}: {
  tab: FiscoTab;
  heading: string;
  /** Sigla in piccolo accanto al titolo (es. "DAC7"). */
  tag?: string;
  /** Un badge accanto al titolo (es. "Verificati"). */
  headingExtra?: ReactNode;
  maxWidth?: number;
  children: ReactNode;
}) {
  return (
    <Section title="Fisco e pagamenti" pageTitle maxWidth={maxWidth}>
      <YStack gap="$5">
        <YStack gap="$4">
          <FiscoTabs active={tab} />
          <XStack alignItems="baseline" gap="$2" flexWrap="wrap">
            <Text tag="h2" fontFamily="$heading" fontWeight="800" fontSize={24} lineHeight={30} color={brand.grafite} margin={0}>
              {heading}
            </Text>
            {tag ? (
              <Text fontSize={13} fontWeight="700" color={brand.grafite70} letterSpacing={0.5}>
                {tag}
              </Text>
            ) : null}
            {headingExtra}
          </XStack>
        </YStack>
        {children}
      </YStack>
    </Section>
  );
}
