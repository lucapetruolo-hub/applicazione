"use client";

import { Icon, Text, XStack, YStack, brand } from "@professionisti/ui";

const STAGES = ["Richiesta", "Preventivo inviato", "Preventivo accettato", "Completato"] as const;

/**
 * Stepper di stato in stile Deliveroo (richiesta esplicita dell'utente):
 * "Trasparenza totale. Il cliente sa sempre a che punto è la sua
 * richiesta." Calcolato dal chiamante (`computeRequestStage`, sotto) invece
 * che qui dentro — il componente si limita a renderizzare uno stadio
 * 0-3 già risolto, per restare riusabile anche altrove senza duplicare la
 * logica di derivazione dello stato.
 */
export function RequestStepper({ stage }: { stage: number }) {
  return (
    <XStack width="100%" alignItems="flex-start">
      {STAGES.map((label, index) => {
        const done = index <= stage;
        const isLast = index === STAGES.length - 1;
        return (
          <XStack key={label} flex={isLast ? 0 : 1} alignItems="center">
            <YStack alignItems="center" gap="$1" width={isLast ? "auto" : undefined} flexShrink={0}>
              <YStack
                width={22}
                height={22}
                borderRadius={11}
                alignItems="center"
                justifyContent="center"
                backgroundColor={done ? brand.cianografia : brand.calce}
                borderWidth={done ? 0 : 2}
                borderColor={brand.filetto}
              >
                {done ? <Icon name="check" size={12} strokeWidth={3} color="white" /> : null}
              </YStack>
              <Text
                fontSize={10}
                fontWeight={done ? "700" : "600"}
                color={done ? brand.cianografia : brand.grafite70}
                textAlign="center"
                width={72}
              >
                {label}
              </Text>
            </YStack>
            {!isLast ? (
              <YStack flex={1} height={2} backgroundColor={index < stage ? brand.cianografia : brand.filetto} marginBottom={16} />
            ) : null}
          </XStack>
        );
      })}
    </XStack>
  );
}

/**
 * Deriva lo stadio (0-3) dallo stato reale della richiesta — mai un valore
 * inventato: stadio 0 sempre raggiunto (la richiesta esiste), 1 se almeno
 * un preventivo è stato inviato, 2 se un preventivo è stato accettato
 * (crea sempre una Booking), 3 solo se quella prenotazione risulta
 * COMPLETED. Un preventivo accettato ma poi annullato (CANCELED/NO_SHOW)
 * resta fermo allo stadio 2 — coerente, il lavoro non è stato completato.
 */
export function computeRequestStage(quotes: { status: string; bookingStatus: string | null }[]): number {
  if (quotes.length === 0) return 0;
  const accepted = quotes.find((q) => q.status === "ACCEPTED");
  if (!accepted) return 1;
  if (accepted.bookingStatus === "COMPLETED") return 3;
  return 2;
}
