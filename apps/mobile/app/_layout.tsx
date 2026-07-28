import { Stack } from "expo-router";
import { TamaguiProvider, tamaguiConfig } from "@professionisti/ui";
import { useFonts as useArchivo, Archivo_700Bold, Archivo_800ExtraBold } from "@expo-google-fonts/archivo";
import {
  useFonts as useInterTight,
  InterTight_400Regular,
  InterTight_500Medium,
  InterTight_600SemiBold,
} from "@expo-google-fonts/inter-tight";
import { useFonts as useIbmPlexMono, IBMPlexMono_500Medium } from "@expo-google-fonts/ibm-plex-mono";

// Stessi ruoli tipografici del web (Archivo/Inter Tight/IBM Plex Mono, vedi
// packages/ui/src/config.ts): su native ogni peso è una famiglia caricata a
// parte, non un'unica famiglia variabile come sul web — se ne caricano più
// di una per ruolo, anche se il token Tamagui oggi ne referenzia solo un
// peso rappresentativo (limite noto, documentato in config.ts).
export default function RootLayout() {
  const [archivoLoaded] = useArchivo({ Archivo_700Bold, Archivo_800ExtraBold });
  const [interTightLoaded] = useInterTight({ InterTight_400Regular, InterTight_500Medium, InterTight_600SemiBold });
  const [plexMonoLoaded] = useIbmPlexMono({ IBMPlexMono_500Medium });

  if (!archivoLoaded || !interTightLoaded || !plexMonoLoaded) {
    return null;
  }

  return (
    <TamaguiProvider config={tamaguiConfig} defaultTheme="light">
      <Stack>
        <Stack.Screen name="index" options={{ title: "Professionisti" }} />
        <Stack.Screen name="cerca/[categoria]" options={{ title: "Ricerca" }} />
      </Stack>
    </TamaguiProvider>
  );
}
