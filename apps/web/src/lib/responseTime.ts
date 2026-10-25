/**
 * Tempo medio di risposta del professionista detto al cliente ("risponde
 * entro 2 ore"), da `ProfessionalMetrics.avgResponseTimeMinutes`. Arrotonda
 * alla misura più leggibile: "entro 2 giorni", mai "entro 2880 minuti".
 * Unico punto per profilo, modulo di richiesta e "Richiesta inviata"
 * (docs/CHANGELOG.md §341). Sotto i 5 minuti le pagine dicono "risponde
 * subito" (`respondsRightAway`) invece di "entro 1 minuto" (§346).
 */
export const RIGHT_AWAY_MINUTES = 5;

export function respondsRightAway(minutes: number): boolean {
  return minutes < RIGHT_AWAY_MINUTES;
}

export function formatResponseTime(minutes: number): string {
  if (minutes < 60) {
    const rounded = Math.max(1, Math.round(minutes));
    return `${rounded} ${rounded === 1 ? "minuto" : "minuti"}`;
  }
  if (minutes < 24 * 60) {
    const hours = Math.round(minutes / 60);
    return `${hours} ${hours === 1 ? "ora" : "ore"}`;
  }
  const days = Math.round(minutes / (24 * 60));
  return `${days} ${days === 1 ? "giorno" : "giorni"}`;
}
