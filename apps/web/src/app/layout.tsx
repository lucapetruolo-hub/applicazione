import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Analytics } from "@vercel/analytics/react";
import { Providers } from "./providers";
import { StyledJsxRegistry } from "./StyledJsxRegistry";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { ToastStack } from "@/components/ToastStack";
import { CookieBanner } from "@/components/CookieBanner";
import { EmailVerificationBanner } from "@/components/EmailVerificationBanner";
import { ServiceWorkerRegistration } from "@/components/ServiceWorkerRegistration";
import { TrafficSourceTracker } from "@/components/TrafficSourceTracker";
import { KeyboardActivation } from "@/components/KeyboardActivation";
import { SITE_URL } from "@/lib/siteUrl";
import { SITE_INDEXABLE } from "@/lib/siteIndexing";
import { display, body, mono } from "./fonts";
import "./globals.css";
import { BRAND } from "@professionisti/shared";
import { ACCOUNT_NAV_BOOT_SCRIPT } from "@/lib/accountNavCollapsed";

const TAMAGUI_CSS_VERSION = (process.env.VERCEL_GIT_COMMIT_SHA ?? String(Date.now())).slice(0, 13);

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
    default: BRAND.tagline,
    template: `%s | ${BRAND.name}`,
  },
  description:
    "Cerca imbianchini, elettricisti, idraulici e altri professionisti vicino a te.",
  // Sito non ancora ufficiale: fuori dai motori di ricerca finché
  // NEXT_PUBLIC_SITE_INDEXABLE non vale "true" (vedi lib/siteIndexing.ts).
  ...(SITE_INDEXABLE ? {} : { robots: { index: false, follow: false } }),
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    // suppressHydrationWarning: l'attributo del menu ridotto lo scrive lo
    // script qui sotto prima che React prenda la pagina.
    <html lang="it" className={`${display.variable} ${body.variable} ${mono.variable}`} suppressHydrationWarning>
      <head>
        {/* Stili di Tamagui in un file a parte, tenuto in cache dal browser
            (docs/CHANGELOG.md §206). `v` cambia a ogni deploy. */}
        <link rel="stylesheet" href={`/tamagui.css?v=${TAMAGUI_CSS_VERSION}`} />
        {/* Menu laterale ridotto a icone, se scelto (lib/accountNavCollapsed.ts). */}
        <script dangerouslySetInnerHTML={{ __html: ACCOUNT_NAV_BOOT_SCRIPT }} />
      </head>
      <body>
        {/* Sfondo sfocato di tutto il sito (docs/CHANGELOG.md §180): due forme
            sfumate fisse dietro ai contenuti, visibili dove le pagine hanno
            fondo trasparente. Solo decorazione, nessun contenuto. */}
        <div className="site-blobs" aria-hidden="true">
          <div className="auth-page-blob auth-page-blob--one" />
          <div className="auth-page-blob auth-page-blob--two" />
        </div>
        <StyledJsxRegistry>
          <Providers>
            <ServiceWorkerRegistration />
            <TrafficSourceTracker />
            <KeyboardActivation />
            {/* Skip link (Fase 6, accessibilità): invisibile finché non riceve il
                focus da tastiera, permette di saltare header+mega-menu e arrivare
                dritti al contenuto — senza, un utente da tastiera/screen reader
                deve attraversare tutta la navigazione a ogni cambio pagina. */}
            <a href="#main-content" className="skip-link">
              Vai al contenuto
            </a>
            <ToastStack />
            <SiteHeader />
            <EmailVerificationBanner />
            <main id="main-content">{children}</main>
            <SiteFooter />
            <CookieBanner />
          </Providers>
        </StyledJsxRegistry>
        {/* Statistiche visite (docs/CHANGELOG.md §132): Vercel Web Analytics,
            senza cookie né dati personali, quindi fuori dal consenso del
            CookieBanner. Conta solo quando è attivato nella dashboard Vercel. */}
        <Analytics />
      </body>
    </html>
  );
}
