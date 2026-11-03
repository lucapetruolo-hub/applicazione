"use client";

// Logica di business del raggio di ingaggio (stato dei due raggi,
// validazione, salvataggio): deliberatamente separata da
// EngagementRadiusMap (che contiene SOLO il rendering della mappa, Google
// Maps da docs/CHANGELOG.md §133) — un cambio di provider tocca solo quel
// file, non questo. Questo componente non importa mai la libreria di mappe
// direttamente: vede EngagementRadiusMap tramite next/dynamic (ssr:false,
// stesso pattern di ResultsMap in ResultsListWithMap.tsx) e gli passa solo
// i valori correnti come props.
import { useState } from "react";
import dynamic from "next/dynamic";
import { Button, Surface, Text, XStack, YStack, brand } from "@professionisti/ui";
import { MAX_ENGAGEMENT_RADIUS_KM, MAX_URGENT_ENGAGEMENT_RADIUS_KM } from "@professionisti/shared";

const EngagementRadiusMap = dynamic(() => import("./EngagementRadiusMap").then((mod) => mod.EngagementRadiusMap), {
  ssr: false,
  loading: () => (
    <YStack height={360} width="100%" borderRadius="$2" backgroundColor={brand.gesso} alignItems="center" justifyContent="center">
      <Text color={brand.grafite70}>Caricamento mappa…</Text>
    </YStack>
  ),
});

const MIN_RADIUS_KM = 1;

function FieldLabel({ children }: { children: string }) {
  return (
    <Text fontFamily="$body" fontSize={13} fontWeight="700" color={brand.grafite70}>
      {children}
    </Text>
  );
}

export type EngagementRadiusSectionProps = {
  latitude: number;
  longitude: number;
  engagementRadiusKm: number;
  urgentEngagementRadiusKm: number;
  /** I raggi scelti: si salvano con "Salva profilo", insieme al resto (collaudo E-04). */
  onChange: (radius: { engagementRadiusKm: number; urgentEngagementRadiusKm: number }) => void;
  /** I raggi salvati, per "Annulla". */
  savedEngagementRadiusKm: number;
  savedUrgentEngagementRadiusKm: number;
};

/**
 * Raggio di ingaggio nel modulo del profilo. Prima aveva un suo "Salva" e
 * "Salva profilo" non lo salvava: chi spostava i cursori e premeva "Salva
 * profilo" lo perdeva (collaudo E-04). Ora i valori stanno nel modulo e si
 * salvano con lui; "Modifica" sblocca i cursori, per non trascinarli per
 * sbaglio scorrendo la pagina.
 */
export function EngagementRadiusSection({
  latitude,
  longitude,
  engagementRadiusKm,
  urgentEngagementRadiusKm,
  onChange,
  savedEngagementRadiusKm,
  savedUrgentEngagementRadiusKm,
}: EngagementRadiusSectionProps) {
  const changed = engagementRadiusKm !== savedEngagementRadiusKm || urgentEngagementRadiusKm !== savedUrgentEngagementRadiusKm;
  const [isEditing, setIsEditing] = useState(false);

  function handleCancelEditing() {
    onChange({ engagementRadiusKm: savedEngagementRadiusKm, urgentEngagementRadiusKm: savedUrgentEngagementRadiusKm });
    setIsEditing(false);
  }

  return (
    <Surface gap="$4">
      <YStack gap="$1">
        <Text fontFamily="$heading" fontWeight="800" fontSize="$5" color={brand.grafite}>
          Raggio di ingaggio
        </Text>
        {/* Una riga e "Scopri di più" (docs/CHANGELOG.md §349), prima due paragrafi. */}
        <Text fontSize={13} color={brand.grafite70}>
          Fin dove ti mandiamo in automatico le richieste dei clienti vicini.
        </Text>
        <details className="bio-tips radius-more">
          <summary>Scopri di più</summary>
          <YStack gap="$1" paddingTop="$1">
            <Text fontSize={13} color={brand.grafite70}>
              Di partenza sono 25 km, per le richieste standard puoi arrivare fino a {MAX_ENGAGEMENT_RADIUS_KM} km. Per le richieste
              urgenti puoi scegliere un raggio diverso.
            </Text>
            <Text fontSize={13} color={brand.grafite70}>
              Il raggio non ti limita: nella ricerca del sito resti visibile a tutti i clienti, e chiunque, anche da più lontano, può
              aprire il tuo profilo e mandarti una richiesta direttamente.
            </Text>
          </YStack>
        </details>
      </YStack>

      <EngagementRadiusMap
        latitude={latitude}
        longitude={longitude}
        engagementRadiusKm={engagementRadiusKm}
        urgentEngagementRadiusKm={urgentEngagementRadiusKm}
      />

      <YStack gap="$2">
        <XStack justifyContent="space-between" alignItems="center">
          <XStack alignItems="center" gap="$2">
            <YStack width={12} height={12} borderRadius={10} backgroundColor={brand.verificato} />
            <FieldLabel>Richieste standard</FieldLabel>
          </XStack>
          <Text fontVariant={["tabular-nums"]} fontWeight="700" color={brand.grafite}>
            {engagementRadiusKm} km
          </Text>
        </XStack>
        <input
          type="range"
          min={MIN_RADIUS_KM}
          max={MAX_ENGAGEMENT_RADIUS_KM}
          step={1}
          value={engagementRadiusKm}
          onChange={(e) => onChange({ engagementRadiusKm: Number(e.target.value), urgentEngagementRadiusKm })}
          disabled={!isEditing}
          // Traccia/maniglia colorate come il resto del sito (Verbale
          // Cognitivo F5.1: erano gli unici due controlli rimasti sul blu
          // nativo del browser) — stesso verde già usato per il pallino
          // "Richieste standard" accanto.
          style={{ accentColor: brand.verificato, width: "100%", opacity: isEditing ? 1 : 0.55 }}
          aria-label="Raggio di ingaggio per le richieste standard, in chilometri"
        />
      </YStack>

      <YStack gap="$2">
        <XStack justifyContent="space-between" alignItems="center">
          <XStack alignItems="center" gap="$2">
            <YStack width={12} height={12} borderRadius={10} backgroundColor={brand.ottone} />
            <FieldLabel>Richieste urgenti</FieldLabel>
          </XStack>
          <Text fontVariant={["tabular-nums"]} fontWeight="700" color={brand.grafite}>
            {urgentEngagementRadiusKm} km
          </Text>
        </XStack>
        <input
          type="range"
          min={MIN_RADIUS_KM}
          max={MAX_URGENT_ENGAGEMENT_RADIUS_KM}
          step={1}
          value={urgentEngagementRadiusKm}
          onChange={(e) => onChange({ engagementRadiusKm, urgentEngagementRadiusKm: Number(e.target.value) })}
          disabled={!isEditing}
          style={{ accentColor: brand.ottone, width: "100%", opacity: isEditing ? 1 : 0.55 }}
          aria-label="Raggio di ingaggio per le richieste urgenti, in chilometri"
        />
      </YStack>

      {isEditing ? (
        <XStack gap="$3" flexWrap="wrap" alignItems="center">
          <Button variant="ghost" onPress={handleCancelEditing} alignSelf="flex-start">
            Annulla
          </Button>
          <Text fontSize={16} color={brand.grafite70} flex={1} minWidth={200}>
            {changed ? "Si salva con «Salva profilo»." : "Sposta i cursori, poi premi «Salva profilo»."}
          </Text>
        </XStack>
      ) : (
        <Button variant="secondary" onPress={() => setIsEditing(true)} alignSelf="flex-start">
          Modifica
        </Button>
      )}
    </Surface>
  );
}
