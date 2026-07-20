import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Providers } from "./providers";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Trova un professionista vicino a te",
    template: "%s | Professionisti",
  },
  description:
    "Cerca imbianchini, elettricisti, idraulici e altri professionisti locali verificati vicino a te.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="it">
      <body>
        <Providers>
          <SiteHeader />
          {children}
          <SiteFooter />
        </Providers>
      </body>
    </html>
  );
}
