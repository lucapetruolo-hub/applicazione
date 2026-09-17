"use client";

import type { ComponentType } from "react";
import { Section, Text, XStack, YStack, brand } from "@professionisti/ui";
import {
  BookConfirmIllustration,
  ClearQuoteIllustration,
  RequestPhotoIllustration,
  type IllustrationProps,
} from "./icons/HowItWorksIllustrations";

const STEPS: {
  number: string;
  title: string;
  text: string;
  Illustration: ComponentType<IllustrationProps>;
}[] = [
  {
    number: "01",
    title: "Raccontaci il problema",
    text: "Una foto e due righe. Nessun impegno.",
    Illustration: RequestPhotoIllustration,
  },
  {
    number: "02",
    title: "Ricevi preventivi chiari",
    text: "Manodopera, materiali e tempi separati. Confronta prima di dire sì.",
    Illustration: ClearQuoteIllustration,
  },
  {
    number: "03",
    title: "Scegli e prenota",
    text: "Conferma in piattaforma. Promemoria via email e SMS prima dell'appuntamento.",
    Illustration: BookConfirmIllustration,
  },
];

/**
 * "Come funziona" (brief redesign §4.4): tre step collegati da una linea
 * tratteggiata — la numerazione resta legittima qui (descrive davvero una
 * sequenza), ma il semplice cerchio-con-un-numero-dentro è stato sostituito
 * da una piccola illustrazione a più tratti specifica per ciascun passaggio
 * (`HowItWorksIllustrations.tsx`), richiesta esplicita dell'utente come
 * alternativa al pattern "icona in un cerchio colorato" ripetuto ovunque
 * nel sito — il numero resta, ma come piccolo badge d'angolo secondario
 * (l'informazione di sequenza, non più il disegno principale). Copy
 * riscritto in verbi attivi/seconda persona, "Per chi cerca, il servizio è
 * gratuito" al posto dell'ambiguo "nessun costo aggiuntivo per richiederlo".
 */
export function HowItWorks() {
  return (
    <Section eyebrow="Come funziona" title="Dalla richiesta al lavoro fatto" maxWidth={1080}>
      <YStack width="100%" flexDirection="column" $gtMd={{ flexDirection: "row" }} gap="$6" position="relative">
        {STEPS.map((step, index) => (
          <YStack key={step.number} flex={1} gap="$3" position="relative">
            <XStack alignItems="center" gap="$3">
              <YStack
                width={48}
                height={48}
                borderRadius={18}
                backgroundColor={brand.cianografiaVelo}
                alignItems="center"
                justifyContent="center"
                position="relative"
                flexShrink={0}
              >
                <step.Illustration size={28} style={{ color: brand.cianografiaScuro }} />
                <YStack
                  position="absolute"
                  top={-6}
                  right={-6}
                  width={20}
                  height={20}
                  borderRadius={10}
                  backgroundColor={brand.cianografia}
                  borderWidth={2}
                  borderColor={brand.gesso}
                  alignItems="center"
                  justifyContent="center"
                >
                  <Text fontFamily="$body" fontSize={10} fontWeight="700" color="white">
                    {index + 1}
                  </Text>
                </YStack>
              </YStack>
              {index < STEPS.length - 1 ? (
                <YStack flex={1} height={2} borderRadius={1} backgroundColor={brand.filetto} display="none" $gtMd={{ display: "flex" }} />
              ) : null}
            </XStack>
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
