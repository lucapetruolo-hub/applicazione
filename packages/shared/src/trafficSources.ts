/**
 * Da dove arriva una visita (docs/CHANGELOG.md §296): l'elenco senza zod,
 * così il sito lo legge in ogni pagina senza caricare zod (§372). Schema ed
 * etichette in `trafficSource.ts`.
 */
export const TRAFFIC_SOURCES = ["GOOGLE", "OTHER_SEARCH", "SOCIAL", "DIRECT", "OTHER"] as const;
export type TrafficSource = (typeof TRAFFIC_SOURCES)[number];
