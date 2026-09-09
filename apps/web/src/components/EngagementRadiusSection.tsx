"use client";

// Logica di business del raggio di ingaggio (stato dei due raggi,
// validazione, salvataggio): deliberatamente separata da
// EngagementRadiusMap (che contiene SOLO il rendering Leaflet) — così la
// futura migrazione a Google Maps tocca solo quel file, non questo. Questo
// componente non importa mai "leaflet"/"react-leaflet" direttamente: vede
// EngagementRadiusMap tramite next/dynamic (ssr:false, la mappa legge
// `window` al caricamento del modulo — stesso pattern già in uso per
// ResultsMap in ResultsListWithMap.tsx) e gli passa solo i valori correnti
// come props.
import { useState } from "react";
import dynamic from "next/dynamic";
import { Button, Surface, Text, XStack, YStack, brand } from "@professionisti/ui";
import { apiClient } from "@/lib/apiClient";

const EngagementRadiusMap = dynamic(() => import("./EngagementRadiusMap").then((mod) => mod.EngagementRadiusMap), {
  ssr: false,
  loading: () => (
    <YStack height={360} width="100%" borderRadius="$2" backgroundColor={brand.gesso} alignItems="center" justifyContent="center">
      <Text color={brand.grafite70}>Caricamento mappa…</Text>
    </YStack>
  ),
});

const MIN_RADIUS_KM = 1;
const MAX_RADIUS_KM = 25;

function FieldLabel({ children }: { children: string }) {
  return (
    <Text fontFamily="$body" fontSize={11} fontWeight="700" color={brand.grafite70}>
      {children}
    </Text>
  );
}

export type EngagementRadiusSectionProps = {
  token: string;
  latitude: number;
  longitude: number;
  initialEngagementRadiusKm: number;
  initialUrgentEngagementRadiusKm: number;
};

export function EngagementRadiusSection({
  token,
  latitude,
  longitude,
  initialEngagementRadiusKm,
  initialUrgentEngagementRadiusKm,
}: EngagementRadiusSectionProps) {
  const [engagementRadiusKm, setEngagementRadiusKm] = useState(initialEngagementRadiusKm);
  const [urgentEngagementRadiusKm, setUrgentEngagementRadiusKm] = useState(initialUrgentEngagementRadiusKm);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  // Richiesta esplicita dell'utente: gli slider non sono più modificabili
  // direttamente — "Modifica" li sblocca, "Salva" conferma e li richiude.
  // Riduce il rischio di trascinare per sbaglio uno slider decisivo per il
  // fan-out dei lead (proprio la funzione che decide quante richieste
  // riceve un professionista) durante un normale scroll della pagina.
  const [isEditing, setIsEditing] = useState(false);

  function handleStartEditing() {
    setError(null);
    setSaved(false);
    setIsEditing(true);
  }

  function handleCancelEditing() {
    setEngagementRadiusKm(initialEngagementRadiusKm);
    setUrgentEngagementRadiusKm(initialUrgentEngagementRadiusKm);
    setError(null);
    setIsEditing(false);
  }

  async function handleSave() {
    setIsSaving(true);
    setError(null);
    setSaved(false);
    try {
      await apiClient.updateEngagementRadius(token, { engagementRadiusKm, urgentEngagementRadiusKm });
      setSaved(true);
      setIsEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore imprevisto, riprova.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Surface gap="$4">
      <YStack gap="$1">
        <Text fontFamily="$heading" fontWeight="800" fontSize="$5" color={brand.grafite}>
          Raggio di ingaggio
        </Text>
        <Text fontSize="$2" color={brand.grafite70}>
          Distanza massima entro cui ricevi le richieste di preventivo — puoi impostare un raggio diverso per le
          richieste urgenti.
        </Text>
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
            <YStack width={12} height={12} borderRadius={6} backgroundColor={brand.verificato} />
            <FieldLabel>Richieste standard</FieldLabel>
          </XStack>
          <Text fontFamily="$mono" fontWeight="700" color={brand.grafite}>
            {engagementRadiusKm} km
          </Text>
        </XStack>
        <input
          type="range"
          min={MIN_RADIUS_KM}
          max={MAX_RADIUS_KM}
          step={1}
          value={engagementRadiusKm}
          onChange={(e) => setEngagementRadiusKm(Number(e.target.value))}
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
            <YStack width={12} height={12} borderRadius={6} backgroundColor={brand.ottone} />
            <FieldLabel>Richieste urgenti</FieldLabel>
          </XStack>
          <Text fontFamily="$mono" fontWeight="700" color={brand.grafite}>
            {urgentEngagementRadiusKm} km
          </Text>
        </XStack>
        <input
          type="range"
          min={MIN_RADIUS_KM}
          max={MAX_RADIUS_KM}
          step={1}
          value={urgentEngagementRadiusKm}
          onChange={(e) => setUrgentEngagementRadiusKm(Number(e.target.value))}
          disabled={!isEditing}
          style={{ accentColor: brand.ottone, width: "100%", opacity: isEditing ? 1 : 0.55 }}
          aria-label="Raggio di ingaggio per le richieste urgenti, in chilometri"
        />
      </YStack>

      {error ? (
        <Text color={brand.urgenza} fontSize="$3">
          {error}
        </Text>
      ) : null}
      {saved ? (
        <Text color={brand.verificato} fontSize="$3">
          Raggio di ingaggio salvato!
        </Text>
      ) : null}

      {isEditing ? (
        <XStack gap="$3" flexWrap="wrap">
          <Button variant="secondary" onPress={handleSave} disabled={isSaving} opacity={isSaving ? 0.6 : 1} alignSelf="flex-start">
            {isSaving ? "Salvataggio..." : "Salva"}
          </Button>
          <Button variant="ghost" onPress={handleCancelEditing} disabled={isSaving} alignSelf="flex-start">
            Annulla
          </Button>
        </XStack>
      ) : (
        <Button variant="secondary" onPress={handleStartEditing} alignSelf="flex-start">
          Modifica
        </Button>
      )}
    </Surface>
  );
}
