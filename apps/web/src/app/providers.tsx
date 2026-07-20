"use client";

import type { ReactNode } from "react";
import { TamaguiProvider, tamaguiConfig } from "@professionisti/ui";

// Renderizzato solo client-side (vedi ClientShellLoader): niente bisogno di
// iniettare CSS nello stream SSR qui, il browser esegue tutto dopo l'idratazione.
export function Providers({ children }: { children: ReactNode }) {
  return (
    <TamaguiProvider config={tamaguiConfig} defaultTheme="light">
      {children}
    </TamaguiProvider>
  );
}
