"use client";

import { Icon, Section, Surface, Text, XStack, YStack, brand } from "@professionisti/ui";

const POINTS = [
  {
    text: "Recensioni vere, lasciate solo da chi ha davvero completato un lavoro confermato da entrambe le parti",
    comingSoon: false,
  },
  {
    text: "I tuoi contatti restano privati finché non decidi tu di accettare un preventivo",
    comingSoon: false,
  },
  {
    text: "Professionista verificato: controllo documenti e assicurazione RC",
    comingSoon: true,
  },
  {
    text: "Pagamento protetto in piattaforma: paghi solo a lavoro concluso",
    comingSoon: true,
  },
];

/**
 * "Garanzia Piattaforma": la versione precedente prometteva verifica
 * documenti/RC, pagamento protetto e mediazione come già attivi (testo
 * fornito verbatim dall'utente, pubblicato su sua esplicita autorizzazione
 * — "Pubblicale come scritte"). Corretta su richiesta esplicita
 * successiva dell'utente (analisi CEO, consiglio esperti — segnalato dal
 * Go-To-Market Lead come rischio reputazionale: una pagina pubblica che
 * promette protezioni non costruite): ora ogni punto riflette lo stato
 * reale — le due protezioni già vere (recensioni "doppio cieco",
 * CLAUDE.md §40; contatti privati fino all'accettazione, §12/§45) restano
 * senza badge, le due non ancora costruite (verifica identità/RC — nessun
 * KYC implementato; pagamento protetto in piattaforma — oggi il pagamento
 * è diretto tra cliente e professionista, Stripe Connect non configurato,
 * §9/§88) portano il badge "In arrivo" — stesso pattern già in uso in
 * `ProCtaSection.tsx` (`comingSoon`), riusato qui invece di inventarne uno
 * nuovo. "Mediazione in caso di controversia" è stata rimossa del tutto,
 * non solo marcata "in arrivo": non esiste alcuna infrastruttura, nemmeno
 * allo stadio di bozza, per una promessa specifica come questa.
 */
export function PlatformGuarantee() {
  return (
    <Section eyebrow="Garanzia Piattaforma" title="Ogni intervento è coperto dalla Garanzia Piattaforma" maxWidth={880}>
      <Surface width="100%" padding="$5" gap="$4">
        {POINTS.map((point) => (
          <XStack key={point.text} alignItems="flex-start" gap="$3">
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
            <XStack flex={1} alignItems="center" gap="$2" flexWrap="wrap">
              <Text fontSize="$4" color={brand.grafite} lineHeight={24}>
                {point.text}
              </Text>
              {point.comingSoon ? (
                <XStack backgroundColor={brand.ottoneVelo} paddingHorizontal={8} paddingVertical={2} borderRadius={999}>
                  <Text fontSize={11} fontWeight="700" color={brand.ottone}>
                    In arrivo
                  </Text>
                </XStack>
              ) : null}
            </XStack>
          </XStack>
        ))}
      </Surface>
    </Section>
  );
}
