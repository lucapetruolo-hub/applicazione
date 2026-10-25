/**
 * Tempo medio di risposta del professionista detto al cliente ("risponde
 * entro 2 ore"), da `ProfessionalMetrics.avgResponseTimeMinutes`. Arrotonda
 * alla misura più leggibile: "entro 2 giorni", mai "entro 2880 minuti".
 * Unico punto per profilo, modulo di richiesta e "Richiesta inviata"
 * (docs/CHANGELOG.md §339).
 */
export function formatResponseTime(minutes: number): string {
  if (minutes < 60) return `${Math.max(1, Math.round(minutes))} minuti`;
  if (minutes < 24 * 60) {
    const hours = Math.round(minutes / 60);
    return `${hours} ${hours === 1 ? "ora" : "ore"}`;
  }
  const days = Math.round(minutes / (24 * 60));
  return `${days} ${days === 1 ? "giorno" : "giorni"}`;
}
