import { fileURLToPath } from "node:url";

/** @type {import('next').NextConfig} */
// Indirizzo dell'API (fetch e stream in tempo reale): l'unica origine
// esterna a cui il sito parla oltre a Google e Cloudflare.
function apiOrigin() {
  try {
    return new URL(process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001").origin;
  } catch {
    return "";
  }
}

// Regola sugli script e sulle connessioni (CSP, docs/CHANGELOG.md §294):
// il browser carica script, stili, riquadri e connessioni solo dalle origini
// elencate, così uno script iniettato non può caricarne altri da fuori né
// mandare dati a un server qualsiasi. Google Maps con l'elenco ufficiale di
// Google (developers.google.com/maps/documentation/javascript/content-security-policy),
// Cloudflare Turnstile, Vercel Analytics. `'unsafe-inline'` resta perché
// Next.js 14 scrive script in pagina senza nonce; con Next.js 15 e i nonce
// si potrà togliere. Solo in produzione: `next dev` usa `eval`.
const contentSecurityPolicy = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' blob: https://*.googleapis.com https://*.gstatic.com *.google.com https://*.ggpht.com *.googleusercontent.com https://challenges.cloudflare.com https://va.vercel-scripts.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "img-src 'self' data: blob: https:",
  "media-src 'self' blob: https://res.cloudinary.com",
  `connect-src 'self' ${apiOrigin()} https://*.googleapis.com *.google.com https://*.gstatic.com https://challenges.cloudflare.com https://res.cloudinary.com data: blob:`,
  "frame-src *.google.com https://challenges.cloudflare.com",
  "worker-src 'self' blob:",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "object-src 'none'",
].join("; ");

// Intestazioni di sicurezza su tutte le pagine (controllo sicurezza,
// docs/CHANGELOG.md §292). `frame-ancestors`/`X-Frame-Options`: nessun sito
// può mostrare il nostro dentro un riquadro per far cliccare a sua insaputa.
// La fotocamera serve solo alla chat (foto scattate dal sito); il resto è spento.
const securityHeaders = [
  {
    key: "Content-Security-Policy",
    value: process.env.NODE_ENV === "production" ? contentSecurityPolicy : "frame-ancestors 'none'; base-uri 'self'; object-src 'none'",
  },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // geolocation=(self): "Vicino a me" nel campo Città (docs/CHANGELOG.md §384), solo dopo il clic.
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=(self), payment=(), usb=()" },
];

const nextConfig = {
  reactStrictMode: true,
  // Niente "X-Powered-By: Next.js": non serve dire a chi cerca falle cosa usiamo.
  poweredByHeader: false,
  images: {
    // Cloudinary (immagini profilo/portfolio, CLAUDE.md §2) è l'unica
    // origine remota servita tramite `next/image` nel sito — il cloud
    // name varia per ambiente (env var, mai nel codice), l'host resta
    // sempre `res.cloudinary.com`.
    remotePatterns: [{ protocol: "https", hostname: "res.cloudinary.com" }],
    // Ridimensionamento fatto da Cloudinary, non da Vercel (quota Image
    // Optimization del piano gratuito) — vedi src/lib/cloudinaryImageLoader.ts.
    loader: "custom",
    loaderFile: "./src/lib/cloudinaryImageLoader.ts",
  },
  experimental: {
    // Niente cache client-side delle pagine (Router Cache): le pagine
    // risultati devono rileggere i searchParams ad ogni navigazione, anche
    // verso lo stesso percorso con query diverse (cambio Online/Domicilio).
    staleTimes: { dynamic: 0, static: 0 },
    // React Compiler (docs/CHANGELOG.md §345): ricorda da solo i valori e i
    // componenti che non cambiano, così React ridisegna meno a ogni
    // aggiornamento. Tutto il sito tranne i componenti con `<style jsx>`, che
    // hanno la direttiva "use no memo": compilati perdono le classi jsx-...
    // (es. il testo breve del banner cookie compariva insieme a quello lungo).
    // Un componente nuovo con `<style jsx>` deve avere "use no memo".
    reactCompiler: true,
  },
  // Sito privato finché NEXT_PUBLIC_SITE_INDEXABLE non vale "true" (vedi
  // src/lib/siteIndexing.ts): l'header copre anche le pagine client e le
  // risorse non HTML, dove il meta robots del layout non arriva.
  async headers() {
    // /tamagui.css è richiesto sempre con `?v=<commit>` (layout.tsx): un
    // deploy nuovo cambia l'indirizzo, quindi il browser può tenerlo per
    // sempre (docs/CHANGELOG.md §206).
    const tamaguiCss = {
      source: "/tamagui.css",
      headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
    };
    const security = { source: "/:path*", headers: securityHeaders };
    if (process.env.NEXT_PUBLIC_SITE_INDEXABLE === "true") return [tamaguiCss, security];
    return [tamaguiCss, security, { source: "/:path*", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }] }];
  },
  transpilePackages: ["@professionisti/ui", "@professionisti/shared"],
  // packages/ui/src/config.ts importa `Platform` da "react-native" per
  // scegliere la famiglia di font per piattaforma (vedi commento lì):
  // Metro (Expo/apps/mobile) risolve "react-native" -> "react-native-web"
  // in automatico quando builda per il target web, ma il webpack di
  // Next.js no — serve l'alias esplicito, altrimenti prova a bundlare il
  // vero pacchetto react-native (sintassi Flow, non parsabile da SWC).
  // Pattern standard per ogni integrazione Tamagui + Next.js.
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      "react-native$": "react-native-web",
      // Il sito usa i sorgenti di packages/shared (ESM) e non dist/
      // (CommonJS): con `sideEffects: false` ogni pagina prende solo le parti
      // che usa (zod 4, elenco dei comuni...) invece di tutto il pacchetto.
      // docs/CHANGELOG.md §326 e §345. L'API continua a usare dist/.
      "@professionisti/shared$": fileURLToPath(new URL("../../packages/shared/src/index.ts", import.meta.url)),
    };
    config.resolve.extensions = [".web.js", ".web.jsx", ".web.ts", ".web.tsx", ...config.resolve.extensions];
    return config;
  },
};

export default nextConfig;
