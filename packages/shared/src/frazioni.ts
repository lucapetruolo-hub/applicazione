/**
 * Frazioni e località cercabili nel campo "Città" (docs/CHANGELOG.md §372):
 * chi abita a Borgo Sabotino scrive "Borgo Sabotino", non "Latina".
 * Scegliendole si cerca nel loro comune, che resta l'unico luogo che la
 * ricerca conosce. Per ora solo la zona del lancio (Latina, CLAUDE.md §7),
 * dai borghi di fondazione elencati nella voce "Latina" di Wikipedia; per
 * una città nuova si aggiungono qui le sue frazioni, con il nome ISTAT del
 * comune.
 */
export const FRAZIONI: readonly { name: string; city: string }[] = [
  { name: "Latina Scalo", city: "Latina" },
  { name: "Latina Lido", city: "Latina" },
  { name: "Borgo Sabotino", city: "Latina" },
  { name: "Borgo Isonzo", city: "Latina" },
  { name: "Borgo San Michele", city: "Latina" },
  { name: "Borgo Faiti", city: "Latina" },
  { name: "Borgo Grappa", city: "Latina" },
  { name: "Borgo Carso", city: "Latina" },
  { name: "Borgo Podgora", city: "Latina" },
  { name: "Borgo Bainsizza", city: "Latina" },
  { name: "Borgo Santa Maria", city: "Latina" },
  { name: "Borgo Le Ferriere", city: "Latina" },
  { name: "Borgo Piave", city: "Latina" },
  { name: "Borgo Montello", city: "Latina" },
];
