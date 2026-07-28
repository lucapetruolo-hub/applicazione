import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Providers } from "./providers";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { SITE_URL } from "@/lib/siteUrl";
import { display, body, mono } from "./fonts";
import "./globals.css";

export const metadata: Metadata = {
  // Necessario perché opengraph-image.tsx/apple-icon.tsx risolvano URL
  // assoluti corretti nei link condivisi (Slack, WhatsApp...) invece del
  // fallback "http://localhost:3000" usato altrimenti in produzione.
  metadataBase: new URL(SITE_URL),
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
          {/* Skip link (Fase 6, accessibilità): invisibile finché non riceve il
              focus da tastiera, permette di saltare header+mega-menu e arrivare
              dritti al contenuto — senza, un utente da tastiera/screen reader
              deve attraversare tutta la navigazione a ogni cambio pagina. */}
          <a href="#main-content" className="skip-link">
            Vai al contenuto
          </a>
          <SiteHeader />
          <main id="main-content">{children}</main>
          <SiteFooter />
        </Providers>
      </body>
    </html>
  );
}
