/**
 * Indirizzo dell'API, senza barra finale: con `NEXT_PUBLIC_API_URL` scritta
 * con la "/" in fondo le chiamate diventavano "//professionals/..." e
 * rispondevano 404, e la ricerca mostrava "nessuno vicino" invece di un errore
 * (migrazione a Francoforte, docs/changelog/2026-11-05-render-francoforte.md).
 */
export const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001").replace(/\/+$/, "");
