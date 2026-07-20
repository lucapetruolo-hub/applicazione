"use client";

import type { ReactNode } from "react";
import { TamaguiProvider, tamaguiConfig } from "@professionisti/ui";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <TamaguiProvider config={tamaguiConfig} defaultTheme="light">
      {children}
    </TamaguiProvider>
  );
}
