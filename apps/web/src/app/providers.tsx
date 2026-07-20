"use client";

import type { ReactNode } from "react";
import { TamaguiProvider, tamaguiConfig } from "@professionisti/ui";
import { AuthProvider } from "@/lib/AuthContext";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <TamaguiProvider config={tamaguiConfig} defaultTheme="light">
      <AuthProvider>{children}</AuthProvider>
    </TamaguiProvider>
  );
}
