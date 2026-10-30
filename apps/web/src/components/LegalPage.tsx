"use client";

import type { ReactNode } from "react";
import { Text, YStack, brand } from "@professionisti/ui";

/**
 * `id` serve per i link diretti a una sezione (es. /privacy#verifica-identita);
 * `after` per una tabella o un elenco sotto il testo, fuori dal paragrafo.
 */
type LegalSection = { heading: string; body: ReactNode; id?: string; after?: ReactNode };

/**
 * Layout condiviso delle pagine legali (Privacy, Termini, Cookie) — testo
 * leggibile su colonna stretta, stesso stile tipografico del resto del
 * sito. I contenuti sono bozze standard post-audit: da far verificare a un
 * legale e da completare con i dati reali del titolare (ragione sociale,
 * P.IVA, sede, email privacy) prima del lancio definitivo — i segnaposto
 * [DA COMPILARE] rendono evidente dove intervenire.
 */
export function LegalPage({ title, updatedAt, sections, intro }: { title: string; updatedAt: string; sections: LegalSection[]; intro?: ReactNode }) {
  return (
    <YStack width="100%" alignItems="center" backgroundColor="transparent" paddingVertical="$9" paddingHorizontal="$4">
      <YStack width="100%" maxWidth={720} gap="$5">
        <YStack gap="$2">
          <Text tag="h1" margin={0} fontFamily="$heading" fontWeight="800" fontSize="$9" color={brand.grafite}>
            {title}
          </Text>
          <Text fontSize={13} color={brand.grafite70}>
            Ultimo aggiornamento: {updatedAt}
          </Text>
        </YStack>
        {intro}
        {sections.map((section) => (
          <YStack key={section.heading} id={section.id} gap="$2" style={{ scrollMarginTop: 96 }}>
            <Text fontFamily="$heading" fontWeight="700" fontSize="$6" color={brand.grafite}>
              {section.heading}
            </Text>
            <Text fontSize={16} color={brand.grafite70} lineHeight={24}>
              {section.body}
            </Text>
            {section.after}
          </YStack>
        ))}
      </YStack>
    </YStack>
  );
}

/**
 * Elenco a schede per le tabelle delle pagine legali (tempi di conservazione,
 * cookie): una scheda per voce invece di una tabella a colonne, che da
 * telefono costringerebbe a scorrere di lato.
 */
export function LegalList({ items }: { items: { title: string; rows: [label: string, value: string][] }[] }) {
  return (
    <YStack tag="ul" margin={0} padding={0} gap="$2" style={{ listStyle: "none" }}>
      {items.map((item) => (
        <YStack key={item.title} tag="li" gap="$1" padding="$3" borderWidth={1} borderColor={brand.filetto} borderRadius={10} backgroundColor={brand.calce}>
          <Text fontWeight="700" fontSize={16} color={brand.grafite}>
            {item.title}
          </Text>
          {item.rows.map(([label, value]) => (
            <Text key={label} fontSize={14} color={brand.grafite70} lineHeight={20}>
              <Text fontSize={14} fontWeight="600" color={brand.grafite}>
                {label}:
              </Text>{" "}
              {value}
            </Text>
          ))}
        </YStack>
      ))}
    </YStack>
  );
}

/**
 * "In breve" in cima a Termini e Privacy: le cose più importanti in poche
 * righe per chi non è un giurista. Vale il testo completo che segue.
 */
export function LegalSummary({ points }: { points: string[] }) {
  return (
    <YStack gap="$2" padding="$4" borderRadius={20} backgroundColor={brand.cianografiaVelo}>
      <Text tag="h2" margin={0} fontFamily="$heading" fontWeight="700" fontSize="$6" color={brand.grafite}>
        In breve
      </Text>
      <YStack tag="ul" margin={0} paddingLeft={20} gap="$1">
        {points.map((point) => (
          <Text key={point} tag="li" fontSize={16} color={brand.grafite} lineHeight={24}>
            {point}
          </Text>
        ))}
      </YStack>
      <Text fontSize={14} color={brand.grafite70}>
        È un riassunto: vale il testo completo qui sotto.
      </Text>
    </YStack>
  );
}
