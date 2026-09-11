import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Providers } from "./providers";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { ToastStack } from "@/components/ToastStack";
import { CookieBanner } from "@/components/CookieBanner";
import { ServiceWorkerRegistration } from "@/components/ServiceWorkerRegistration";
import { SITE_URL } from "@/lib/siteUrl";
import { display, body, mono } from "./fonts";
import "./globals.css";

// Necessario per l'installabilità PWA (manifest.ts) e per una barra di stato
// mobile coerente col brand invece del bianco/nero di default del browser.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#189A63",
};

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
          <ServiceWorkerRegistration />
          {/* Skip link (Fase 6, accessibilità): invisibile finché non riceve il
              focus da tastiera, permette di saltare header+mega-menu e arrivare
              dritti al contenuto — senza, un utente da tastiera/screen reader
              deve attraversare tutta la navigazione a ogni cambio pagina. */}
          <a href="#main-content" className="skip-link">
            Vai al contenuto
          </a>
          <ToastStack />
          <SiteHeader />
          <main id="main-content">{children}</main>
          <SiteFooter />
          <CookieBanner />
        </Providers>
      </body>
    </html>
  );
}
