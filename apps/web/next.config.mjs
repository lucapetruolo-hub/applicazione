/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
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
