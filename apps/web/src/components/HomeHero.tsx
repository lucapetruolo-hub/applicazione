"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ALL_ITALIAN_CITY_NAMES, findCategoryByQuery } from "@professionisti/shared";
import { Autocomplete, Button, Eyebrow, Icon, Text, XStack, YStack, type ProfessionalSuggestion } from "@professionisti/ui";
import { buildSearchSuggestions } from "@/lib/searchSuggestions";
import { SchedaIntervento } from "./SchedaIntervento";

type Urgency = "" | "appena_possibile" | "questa_settimana" | "nessuna_fretta";

const URGENCY_LABEL: Record<Exclude<Urgency, "">, string> = {
  appena_possibile: "Appena possibile",
  questa_settimana: "Questa settimana",
  nessuna_fretta: "Nessuna fretta",
};

/**
 * Hero della homepage — l'elemento firma del redesign (brief §4.2): a
 * sinistra i tre campi che guidano la richiesta, a destra la Scheda
 * Intervento che si compila in tempo reale con gli stessi valori.
 * Componente web-only (apps/web): non un primitivo condiviso, è la messa
 * in scena specifica di questa sezione.
 */
export function HomeHero() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [city, setCity] = useState("");
  const [urgency, setUrgency] = useState<Urgency>("");
  const professionalSuggestions: ProfessionalSuggestion[] = buildSearchSuggestions();

  const matchedCategory = findCategoryByQuery(query);

  function handleSubmit() {
    const params = new URLSearchParams();
    if (matchedCategory) params.set("categoria", matchedCategory.slug);
    if (city.trim()) params.set("citta", city.trim());

    if (!matchedCategory) {
      // Categoria non riconosciuta: niente da precompilare in un preventivo,
      // ricade sulla ricerca a testo libero come prima del redesign.
      const qs = new URLSearchParams();
      if (city.trim()) qs.set("citta", city.trim());
      if (query.trim()) qs.set("q", query.trim());
      router.push(`/cerca${qs.toString() ? `?${qs.toString()}` : ""}`);
      return;
    }

    const destination = urgency === "appena_possibile" ? "/urgente" : "/preventivo";
    router.push(`${destination}?${params.toString()}`);
  }

  return (
    <YStack width="100%" backgroundColor="$gesso" paddingVertical="$9" paddingHorizontal="$4" alignItems="center" className="bp-grid">
      <YStack width="100%" maxWidth={1200} $gtMd={{ flexDirection: "row" }} gap="$8" alignItems="center">
        {/* Colonna sinistra: 60% */}
        <YStack flex={3} gap="$4" maxWidth={640}>
          <Eyebrow>Preventivi verificati in 24h</Eyebrow>
          <Text fontFamily="$heading" fontWeight="800" fontSize={44} lineHeight={44} letterSpacing={-1} $gtSm={{ fontSize: 60, lineHeight: 58 }}>
            Descrivi il lavoro. Ricevi un preventivo vero.
          </Text>
          <Text fontSize="$5" color="$color10" maxWidth={520}>
            Idraulici, elettricisti, imbianchini e altri professionisti verificati. Nessun costo per richiederlo.
          </Text>

          <YStack
            width="100%"
            backgroundColor="white"
            borderRadius="$4"
            borderWidth={1}
            borderColor="$borderColor"
            padding="$3"
            gap="$3"
            marginTop="$4"
          >
            <YStack gap="$3" $gtSm={{ flexDirection: "row", alignItems: "flex-start" }}>
              <YStack flex={1}>
                <Autocomplete
                  items={professionalSuggestions}
                  getKey={(item) => item.id}
                  getLabel={(item) => item.name}
                  onSelect={(item) => setQuery(item.name)}
                  value={query}
                  onChangeText={setQuery}
                  placeholder="Cosa serve? Es. Idraulico"
                  size="$5"
                />
              </YStack>
              <YStack flex={1}>
                <Autocomplete
                  items={ALL_ITALIAN_CITY_NAMES}
                  getKey={(item) => item}
                  getLabel={(item) => item}
                  onSelect={setCity}
                  value={city}
                  onChangeText={setCity}
                  placeholder="Dove? Città"
                  size="$5"
                  minChars={3}
                />
              </YStack>
              <select
                value={urgency}
                onChange={(e) => setUrgency(e.target.value as Urgency)}
                style={{
                  padding: "0 12px",
                  height: 44,
                  borderRadius: 8,
                  border: "1px solid #d0d5dd",
                  fontSize: 15,
                  fontFamily: "inherit",
                  background: "white",
                  minWidth: 160,
                }}
              >
                <option value="">Quando?</option>
                <option value="appena_possibile">Appena possibile</option>
                <option value="questa_settimana">Questa settimana</option>
                <option value="nessuna_fretta">Nessuna fretta</option>
              </select>
            </YStack>
            <Button variant="primary" onPress={handleSubmit} alignSelf="flex-start" $gtSm={{ alignSelf: "stretch" }}>
              <XStack alignItems="center" gap="$2" justifyContent="center">
                <Text color="white" fontWeight="600">
                  Richiedi preventivo
                </Text>
                <Icon name="file-text" size={16} color="white" />
              </XStack>
            </Button>
          </YStack>

          <Text fontFamily="$mono" fontSize={11} letterSpacing={0.6} textTransform="uppercase" color="$color9">
            Richiesta gratuita · Nessun obbligo
          </Text>
        </YStack>

        {/* Colonna destra: 40% */}
        <YStack flex={2} width="100%" alignItems="center" $gtMd={{ alignItems: "flex-end" }}>
          <SchedaIntervento
            categoryLabel={matchedCategory?.label ?? null}
            city={city.trim() || null}
            urgencyLabel={urgency ? URGENCY_LABEL[urgency] : null}
          />
        </YStack>
      </YStack>
    </YStack>
  );
}
