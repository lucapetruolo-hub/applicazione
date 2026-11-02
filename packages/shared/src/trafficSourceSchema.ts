import { z } from "zod";
import "./zod";
import { TRAFFIC_SOURCES } from "./trafficSources";

// Schemi in un file a parte (docs/changelog/2026-11-02-nextjs-16.md): le
// costanti di trafficSource.ts servono in ogni pagina del sito, zod solo dove si valida.

/**
 * Da dove arriva chi manda una richiesta di preventivo (docs/CHANGELOG.md
 * §296, strategia SEO): l'unica prova che Google porta lavoro vero. Solo una
 * categoria, mai l'indirizzo di provenienza né dati personali.
 */
export const trafficSourceSchema = z.enum(TRAFFIC_SOURCES);
