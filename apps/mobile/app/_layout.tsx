import { Stack } from "expo-router";
import { TamaguiProvider, tamaguiConfig } from "@professionisti/ui";

export default function RootLayout() {
  return (
    <TamaguiProvider config={tamaguiConfig} defaultTheme="light">
      <Stack>
        <Stack.Screen name="index" options={{ title: "Professionisti" }} />
        <Stack.Screen name="cerca/[categoria]" options={{ title: "Ricerca" }} />
      </Stack>
    </TamaguiProvider>
  );
}
