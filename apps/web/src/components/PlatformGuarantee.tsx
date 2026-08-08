"use client";

import { Icon, Section, Surface, Text, XStack, YStack, brand } from "@professionisti/ui";

const POINTS = [
  "Professionista verificato (documenti e assicurazione RC controllati)",
  "Pagamento protetto: paghi solo quando il lavoro è fatto",
  "Se qualcosa va storto, ci occupiamo noi della mediazione",
];

/**
 * "Garanzia Piattaforma": testo fornito verbatim dall'utente, pubblicato
 * come scritto su sua esplicita autorizzazione (richiesto tramite
 * AskUserQuestion, risposta: "Pubblicale come scritte" — se ne assume la
 * responsabilità come titolare della piattaforma). A differenza del resto
 * del prodotto, dove non si pubblica mai una promessa non corrispondente a
 * una funzionalità reale, qui la scelta è stata fatta consapevolmente
 * dall'utente: la verifica documenti/RC, il pagamento protetto in
 * piattaforma e la mediazione in caso di controversia non sono ancora
 * implementati (vedi CLAUDE.md §9, pagamento in-app per il lavoro
 * rimandato) — nessun badge "in arrivo" richiesto qui, testo pubblicato
 * identico a quello fornito.
 */
export function PlatformGuarantee() {
  return (
    <Section eyebrow="Garanzia Piattaforma" title="Ogni intervento è coperto dalla Garanzia Piattaforma" maxWidth={880}>
      <Surface width="100%" padding="$5" gap="$4">
        {POINTS.map((point) => (
          <XStack key={point} alignItems="flex-start" gap="$3">
            <YStack
              width={28}
              height={28}
              borderRadius={14}
              backgroundColor={brand.cianografiaVelo}
              alignItems="center"
              justifyContent="center"
              flexShrink={0}
              marginTop={2}
            >
              <Icon name="check" size={15} strokeWidth={2.5} color={brand.cianografia} />
            </YStack>
            <Text fontSize="$4" color={brand.grafite} flex={1} lineHeight={24}>
              {point}
            </Text>
          </XStack>
        ))}
      </Surface>
    </Section>
  );
}
