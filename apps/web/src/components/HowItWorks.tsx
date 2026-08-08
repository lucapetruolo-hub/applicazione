"use client";

import { Section, Text, YStack, brand } from "@professionisti/ui";

const STEPS = [
  {
    number: "01",
    title: "Raccontaci il problema",
    text: "Una foto e due righe. Nessun impegno.",
  },
  {
    number: "02",
    title: "Ricevi preventivi chiari",
    text: "Manodopera, materiali e tempi separati. Confronta prima di dire sì.",
  },
  {
    number: "03",
    title: "Scegli e prenota",
    text: "Conferma in piattaforma. Promemoria via email e SMS prima dell'appuntamento.",
  },
];

/**
 * "Come funziona" (brief redesign §4.4): tre step collegati da una linea
 * tratteggiata, numerazione mono — l'unico punto del sito dove la
 * numerazione è legittima perché descrive davvero una sequenza. Copy
 * riscritto in verbi attivi/seconda persona, "Per chi cerca, il servizio è
 * gratuito" al posto dell'ambiguo "nessun costo aggiuntivo per richiederlo".
 */
export function HowItWorks() {
  return (
    <Section eyebrow="Come funziona" title="Dalla richiesta al lavoro fatto" maxWidth={1080}>
      <YStack width="100%" flexDirection="column" $gtMd={{ flexDirection: "row" }} gap="$6" position="relative">
        {STEPS.map((step, index) => (
          <YStack key={step.number} flex={1} gap="$3" position="relative">
            <YStack flexDirection="row" alignItems="center" gap="$3">
              <YStack width={32} height={32} borderRadius={16} backgroundColor={brand.cianografiaVelo} alignItems="center" justifyContent="center">
                <Text fontFamily="$body" fontSize={13} fontWeight="700" color={brand.cianografiaScuro}>
                  {index + 1}
                </Text>
              </YStack>
              {index < STEPS.length - 1 ? (
                <YStack flex={1} height={2} borderRadius={1} backgroundColor={brand.filetto} display="none" $gtMd={{ display: "flex" }} />
              ) : null}
            </YStack>
            <Text fontFamily="$heading" fontWeight="600" fontSize="$6" color={brand.grafite}>
              {step.title}
            </Text>
            <Text fontSize="$4" color={brand.grafite70}>
              {step.text}
            </Text>
          </YStack>
        ))}
      </YStack>
      <Text fontSize="$3" color={brand.grafite70} marginTop="$4">
        Per chi cerca, il servizio è gratuito.
      </Text>
    </Section>
  );
}
