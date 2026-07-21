import comuniRaw from "./comuni.json";

export type Comune = {
  name: string;
  province: string;
  region: string;
  lat: number;
  lon: number;
  capoluogo: boolean;
};

/**
 * Elenco completo dei comuni italiani (ISTAT, ~7900 voci) con coordinate
 * reali, non solo i capoluoghi di provincia — usato per l'autocomplete del
 * campo "Città" in ricerca e per geolocalizzare il comune scelto dal
 * professionista in fase di registrazione profilo.
 */
export const ITALIAN_COMUNI: Comune[] = comuniRaw as Comune[];

const comuniByName = new Map(ITALIAN_COMUNI.map((c) => [c.name.toLowerCase(), c]));

export function findComuneByName(name: string): Comune | undefined {
  return comuniByName.get(name.trim().toLowerCase());
}

/** Nomi di tutti i comuni, per popolare autocomplete testuali semplici. */
export const ALL_ITALIAN_CITY_NAMES: string[] = ITALIAN_COMUNI.map((c) => c.name);
