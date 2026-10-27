import { TRAFFIC_SOURCES, type TrafficSource } from "@professionisti/shared";

/** Chiave di sessionStorage con la provenienza della visita (docs/CHANGELOG.md §296). */
export const TRAFFIC_SOURCE_STORAGE_KEY = "traffic_source";

/**
 * Provenienza della visita salvata da `TrafficSourceTracker`, se valida.
 * Controllata sull'elenco, non con zod: questo file sta in ogni pagina
 * (passa per `apiClient`) e zod pesa 25 kB (docs/CHANGELOG.md §372).
 */
export function storedTrafficSource(): TrafficSource | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const value = window.sessionStorage.getItem(TRAFFIC_SOURCE_STORAGE_KEY);
    return TRAFFIC_SOURCES.find((source) => source === value);
  } catch {
    return undefined;
  }
}
