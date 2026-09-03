/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // Niente cache client-side delle pagine (Router Cache): le pagine
    // risultati devono rileggere i searchParams ad ogni navigazione, anche
    // verso lo stesso percorso con query diverse (cambio Online/Domicilio).
    staleTimes: { dynamic: 0, static: 0 },
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
    };
    config.resolve.extensions = [".web.js", ".web.jsx", ".web.ts", ".web.tsx", ...config.resolve.extensions];
    return config;
  },
};

export default nextConfig;
