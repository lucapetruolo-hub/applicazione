import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Providers } from "./providers";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { display, body, mono } from "./fonts";
import "./globals.css";

export const metadata: Metadata = {
  // Necessario perché opengraph-image.tsx/apple-icon.tsx risolvano URL
  // assoluti corretti nei link condivisi (Slack, WhatsApp...) invece del
  // fallback "http://localhost:3000" usato altrimenti in produzione.
  metadataBase: new URL("https://applicazione-web.vercel.app"),
  title: {
    default: "Trova un professionista vicino a te",
    template: "%s | Professionisti",
  },
  description:
    "Cerca imbianchini, elettricisti, idraulici e altri professionisti locali verificati vicino a te.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="it" className={`${display.variable} ${body.variable} ${mono.variable}`}>
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
