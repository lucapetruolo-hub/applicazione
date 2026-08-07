import type { ReactNode } from "react";
import { Text, XStack, YStack } from "tamagui";
import { Icon } from "./Icon";
import { Rating } from "./Rating";
import { Surface } from "./Surface";
import { brand, radiusDoc } from "./tokens";

export type ProfessionalCardService = {
  id: string;
  name: string;
  priceMinEurCents: number | null;
  priceMaxEurCents: number | null;
};

/** Un orario configurato in un giorno della mini-agenda, libero o già al completo. */
export type ProfessionalCardAvailabilitySlot = {
  time: string;
  available: boolean;
};

/** Un giorno della mini-agenda ("Oggi"/"Domani"/...): ogni fascia configurata, libera o al completo. */
export type ProfessionalCardAvailabilityDay = {
  date: string;
  label: string;
  dateLabel: string;
  times: ProfessionalCardAvailabilitySlot[];
};

/** Mostrato al posto della griglia quando nessun giorno della finestra ha orari liberi. */
export type ProfessionalCardNextAvailableSlot = {
  date: string;
  dateLabel: string;
  time: string;
};

const AGENDA_COLUMN_WIDTH = 58;

// Duplicata (non importata da @professionisti/shared): packages/ui non
// dipende dal resto del monorepo, resta un design system consumabile da solo
// — vedi formatServicePriceRange in packages/shared/src/professionals.ts per
// la stessa logica lato pagina profilo pubblica.
function formatServicePrice(priceMinEurCents: number | null, priceMaxEurCents: number | null): string {
  const format = (cents: number) => `${(cents / 100).toFixed(2)} €`;
  if (priceMinEurCents !== null && priceMaxEurCents !== null && priceMaxEurCents > priceMinEurCents) {
    return `${format(priceMinEurCents)} - ${format(priceMaxEurCents)}`;
  }
  const single = priceMinEurCents ?? priceMaxEurCents;
  return single !== null ? format(single) : "Su richiesta";
}

export type ProfessionalCardProps = {
  businessName: string;
  categoryLabel: string;
  city: string;
  /** Sotto-tag di specializzazione (es. "impianti civili"), mostrati accanto alla categoria — fino a 3. */
  subTags?: string[];
  rating?: number;
  reviewCount?: number;
  verified?: boolean;
  remoteAvailable?: boolean;
  /** Prestazioni offerte con prezzo facoltativo, mostrate sotto categoria/città. */
  services?: ProfessionalCardService[];
  /** Griglia agenda (Oggi + 3 giorni), ogni fascia configurata a prescindere dalla capienza — vuoto/assente nasconde la mini-agenda. */
  availabilityPreview?: ProfessionalCardAvailabilityDay[];
  /** Mostrato al posto della griglia quando nessun giorno della finestra ha orari liberi. */
  nextAvailableSlot?: ProfessionalCardNextAvailableSlot | null;
  onPress?: () => void;
  /** Click su una singola cella orario libera (o sul bottone "Mostra orari disponibili"): non deve propagare al click della card intera. Naviga sempre al profilo, non prenota mai direttamente da qui. */
  onSlotPress?: (date: string, time: string) => void;
  /** Slot opzionale per un'icona/badge categoria (passato da chi consuma il componente, così l'icona custom resta web-only senza sporcare packages/ui). */
  icon?: ReactNode;
};

export function ProfessionalCard({
  businessName,
  categoryLabel,
  city,
  subTags,
  rating,
  reviewCount,
  verified,
  remoteAvailable,
  services,
  availabilityPreview,
  nextAvailableSlot,
  onPress,
  onSlotPress,
  icon,
}: ProfessionalCardProps) {
  const specialtyLine = subTags && subTags.length > 0 ? `${categoryLabel} · ${subTags.slice(0, 3).join(", ")}` : categoryLabel;
  const hasAvailableInWindow = availabilityPreview?.some((day) => day.times.some((slot) => slot.available)) ?? false;
  // Unione di tutti gli orari configurati su almeno un giorno della finestra,
  // ordinata: righe della griglia. Un giorno senza quell'orario mostra "-".
  const timeRows = hasAvailableInWindow
    ? Array.from(new Set((availabilityPreview ?? []).flatMap((day) => day.times.map((slot) => slot.time)))).sort()
    : [];

  return (
    // Niente accessibilityLabel personalizzato: la card contiene già come
    // testo visibile nome/categoria/città/rating, un'etichetta diversa da
    // quel testo violerebbe WCAG 2.5.3 "Label in Name" (rilevato da axe/
    // Lighthouse in Fase 6 — un primo tentativo con un aria-label riassuntivo
    // fallisce perché non include tutto il contenuto visibile). Il solo
    // accessibilityRole basta a far annunciare la card come elemento
    // interattivo, leggendo poi il contenuto reale.
    <Surface
      onPress={onPress}
      cursor={onPress ? "pointer" : undefined}
      accessibilityRole={onPress ? "button" : undefined}
      padding="$5"
      hoverStyle={onPress ? { borderColor: brand.cianografia } : undefined}
      pressStyle={onPress ? { borderColor: brand.cianografiaScuro } : undefined}
    >
      <XStack gap="$5" alignItems="flex-start" flexWrap="wrap">
        {/* flexBasis 0 (non "auto", il default di flex={1} da solo): senza,
            il calcolo del wrap dell'XStack esterno usa la larghezza "a
            contenuto" del nome attività come ipotesi iniziale — un nome
            lungo (bug reale osservato: "Rossi Idraulica 194621734" vs "Rossi
            Idraulica Test") faceva andare a capo l'intera mini-agenda sotto
            invece che a fianco, pur restando spazio a sufficienza una volta
            che il testo si spezza correttamente su più righe. */}
        <XStack gap="$4" flex={1} flexBasis={0} minWidth={260} alignItems="flex-start">
          {icon}
          <YStack gap="$2" flex={1} minWidth={0}>
            <XStack alignItems="center" gap="$2" flexWrap="wrap">
              <Text fontFamily="$heading" fontWeight="800" fontSize={22} lineHeight={26} color={brand.grafite}>
                {businessName}
              </Text>
              {verified ? <Icon name="badge-check" size={19} color={brand.verificato} strokeWidth={2} /> : null}
            </XStack>
            <Text fontSize={15} color={brand.grafite70} fontWeight="500">
              {specialtyLine}
            </Text>
            <XStack gap="$3" alignItems="center" flexWrap="wrap" paddingTop="$1">
              {rating !== undefined ? <Rating value={rating} count={reviewCount} size={15} /> : null}
              {remoteAvailable ? (
                <XStack gap="$1" alignItems="center">
                  <Icon name="video" size={13} color={brand.cianografia} strokeWidth={1.5} />
                  <Text fontFamily="$body" fontSize={11} color={brand.cianografia} fontWeight="700">
                    Offre consulenza online
                  </Text>
                </XStack>
              ) : null}
            </XStack>
            <XStack gap="$1" alignItems="center">
              <Icon name="map-pin" size={13} color={brand.grafite70} strokeWidth={1.5} />
              <Text fontSize={13} color={brand.grafite70}>
                {city}
              </Text>
            </XStack>
            {services && services.length > 0 ? (
              <YStack gap="$1" paddingTop="$2" borderTopWidth={1} borderTopColor={brand.filetto} marginTop="$1">
                {services.slice(0, 3).map((service) => (
                  <XStack key={service.id} justifyContent="space-between" gap="$2">
                    <Text fontSize={14} color={brand.grafite70} flex={1}>
                      {service.name}
                    </Text>
                    <Text fontSize={14} color={brand.grafite} fontWeight="600" flexShrink={0} numberOfLines={1}>
                      {formatServicePrice(service.priceMinEurCents, service.priceMaxEurCents)}
                    </Text>
                  </XStack>
                ))}
              </YStack>
            ) : null}
          </YStack>
        </XStack>

        {availabilityPreview && availabilityPreview.length > 0 ? (
          <YStack
            gap="$2"
            minWidth={AGENDA_COLUMN_WIDTH * availabilityPreview.length}
            paddingLeft="$4"
            borderLeftWidth={1}
            borderLeftColor={brand.filetto}
            // Su una riga stretta il blocco cade sotto (flexWrap sul contenitore):
            // il bordo verticale sinistro non avrebbe più senso, si toglie da solo
            // (borderLeftWidth resta 0 solo se non c'è spazio, gestito dal wrap).
          >
            <Text fontFamily="$body" fontSize={10.5} fontWeight="700" color={brand.grafite70}>
              Prossima disponibilità
            </Text>
            <XStack>
              {availabilityPreview.map((day) => (
                <YStack key={day.date} width={AGENDA_COLUMN_WIDTH} alignItems="center" gap={2}>
                  <Text fontFamily="$body" fontSize={10.5} fontWeight="700" color={brand.grafite}>
                    {day.label}
                  </Text>
                  <Text fontFamily="$mono" fontSize={9.5} color={brand.grafite70}>
                    {day.dateLabel}
                  </Text>
                </YStack>
              ))}
            </XStack>

            {hasAvailableInWindow ? (
              <YStack gap="$1">
                {timeRows.map((time) => (
                  <XStack key={time}>
                    {availabilityPreview.map((day) => {
                      const slot = day.times.find((s) => s.time === time);
                      if (!slot) {
                        return (
                          <XStack key={day.date} width={AGENDA_COLUMN_WIDTH} alignItems="center" justifyContent="center" paddingVertical={4}>
                            <Text fontSize={12} color={brand.filetto}>
                              -
                            </Text>
                          </XStack>
                        );
                      }
                      if (!slot.available) {
                        return (
                          <XStack key={day.date} width={AGENDA_COLUMN_WIDTH} alignItems="center" justifyContent="center" paddingVertical={4}>
                            <Text fontFamily="$mono" fontSize={11} color={brand.grafite70} textDecorationLine="line-through">
                              {time}
                            </Text>
                          </XStack>
                        );
                      }
                      return (
                        <XStack
                          key={day.date}
                          width={AGENDA_COLUMN_WIDTH}
                          alignItems="center"
                          justifyContent="center"
                          paddingVertical={3}
                          cursor={onSlotPress ? "pointer" : undefined}
                          accessibilityRole={onSlotPress ? "button" : undefined}
                          accessibilityLabel={onSlotPress ? `Richiedi un preventivo per ${time} il ${day.label}` : undefined}
                          onPress={
                            onSlotPress
                              ? (e: unknown) => {
                                  (e as { stopPropagation?: () => void } | undefined)?.stopPropagation?.();
                                  onSlotPress(day.date, time);
                                }
                              : undefined
                          }
                        >
                          <XStack paddingHorizontal="$2" paddingVertical={3} borderRadius="$10" backgroundColor={brand.cianografiaVelo}>
                            <Text fontFamily="$mono" fontSize={11} fontWeight="700" color={brand.cianografiaScuro}>
                              {time}
                            </Text>
                          </XStack>
                        </XStack>
                      );
                    })}
                  </XStack>
                ))}
              </YStack>
            ) : nextAvailableSlot ? (
              <YStack gap="$2" padding="$3" borderRadius={radiusDoc} borderWidth={1} borderColor={brand.filetto}>
                <YStack gap={2}>
                  <Text fontSize={11.5} color={brand.grafite70}>
                    Prossimo giorno disponibile:
                  </Text>
                  <Text fontSize={13} fontWeight="700" color={brand.grafite}>
                    {nextAvailableSlot.dateLabel}, {nextAvailableSlot.time}
                  </Text>
                </YStack>
                <XStack
                  alignSelf="flex-start"
                  paddingHorizontal="$3"
                  paddingVertical={6}
                  borderRadius="$10"
                  backgroundColor={brand.cianografia}
                  cursor={onSlotPress ? "pointer" : undefined}
                  accessibilityRole={onSlotPress ? "button" : undefined}
                  accessibilityLabel={onSlotPress ? "Mostra orari disponibili" : undefined}
                  onPress={
                    onSlotPress
                      ? (e: unknown) => {
                          (e as { stopPropagation?: () => void } | undefined)?.stopPropagation?.();
                          onSlotPress(nextAvailableSlot.date, nextAvailableSlot.time);
                        }
                      : undefined
                  }
                >
                  <Text fontFamily="$body" fontSize={12} fontWeight="700" color="#FFFFFF">
                    Mostra orari disponibili →
                  </Text>
                </XStack>
              </YStack>
            ) : null}
          </YStack>
        ) : null}
      </XStack>
    </Surface>
  );
}
