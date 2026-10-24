import { Stack } from "expo-router";
import { TamaguiProvider, tamaguiConfig } from "@professionisti/ui";
import {
  useFonts as useInstrumentSans,
  InstrumentSans_400Regular,
  InstrumentSans_500Medium,
  InstrumentSans_600SemiBold,
  InstrumentSans_700Bold,
} from "@expo-google-fonts/instrument-sans";
import { useFonts as useIbmPlexMono, IBMPlexMono_500Medium } from "@expo-google-fonts/ibm-plex-mono";
import { BRAND } from "@professionisti/shared";

// Stessi caratteri del web (Instrument Sans per titoli e testo, IBM Plex Mono
// per le cifre, docs/CHANGELOG.md §305; vedi
// packages/ui/src/config.ts): su native ogni peso è una famiglia caricata a
// parte, non un'unica famiglia variabile come sul web — se ne caricano più
// di una per ruolo, anche se il token Tamagui oggi ne referenzia solo un
// peso rappresentativo (limite noto, documentato in config.ts).
export default function RootLayout() {
  const [instrumentSansLoaded] = useInstrumentSans({
    InstrumentSans_400Regular,
    InstrumentSans_500Medium,
    InstrumentSans_600SemiBold,
    InstrumentSans_700Bold,
  });
  const [plexMonoLoaded] = useIbmPlexMono({ IBMPlexMono_500Medium });

  if (!instrumentSansLoaded || !plexMonoLoaded) {
    return null;
  }

  return (
    <TamaguiProvider config={tamaguiConfig} defaultTheme="light">
      <Stack>
        <Stack.Screen name="index" options={{ title: BRAND.name }} />
        <Stack.Screen name="cerca/[categoria]" options={{ title: "Ricerca" }} />
      </Stack>
    </TamaguiProvider>
  );
}
