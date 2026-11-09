/** A cosa si riferisce un prezzo nelle schede (docs/CHANGELOG.md §398). */
export type ProfessionalCardPriceUnit = "JOB" | "HOUR" | "DAY" | "SQUARE_METER";

// Stesse parole di PRICE_UNIT_LABEL in ProfessionalCard.tsx: "a lavoro" non si scrive.
const UNIT_LABEL: Record<ProfessionalCardPriceUnit, string | undefined> = {
  JOB: undefined,
  HOUR: "all'ora",
  DAY: "al giorno",
  SQUARE_METER: "al m²",
};

/**
 * " all'ora" dopo il prezzo, niente per "a lavoro". Il controllo va fatto
 * sull'etichetta e non sull'unità: con "JOB" l'unità c'è ma l'etichetta no, e
 * nelle schede dei risultati compariva "da 50 € undefined" (collaudo
 * dell'08/11/2026, E6-02).
 */
export function priceUnitSuffix(unit: ProfessionalCardPriceUnit | undefined): string {
  const label = unit ? UNIT_LABEL[unit] : undefined;
  return label ? `\u00A0${label}` : "";
}

/** "a 3,5 km"; sotto il chilometro "a meno di 1 km", mai "a 0 km" (E6-20). */
export function formatDistanceKm(distanceKm: number): string {
  if (distanceKm < 1) return "a meno di 1 km";
  const rounded = distanceKm < 10 ? Math.round(distanceKm * 10) / 10 : Math.round(distanceKm);
  return `a ${rounded.toString().replace(".", ",")} km`;
}

