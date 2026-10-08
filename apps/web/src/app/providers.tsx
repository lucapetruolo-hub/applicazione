"use client";

import type { ReactNode } from "react";
import { TamaguiProvider, tamaguiConfig } from "@professionisti/ui";
import { AuthProvider } from "@/lib/AuthContext";

export function Providers({ children }: { children: ReactNode }) {
  return (
    // disableInjectCSS: gli stili della config arrivano da /tamagui.css
    // (scripts/generate-tamagui-css.ts e il <link> in layout.tsx), non più
    // ripetuti dentro ogni pagina.
    <TamaguiProvider config={tamaguiConfig} defaultTheme="light" disableInjectCSS>
      <AuthProvider>{children}</AuthProvider>
    </TamaguiProvider>
  );
}
