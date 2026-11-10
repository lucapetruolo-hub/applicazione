/**
 * A chi è arrivata una richiesta di preventivo, dal punto di vista di un
 * professionista che l'ha ricevuta
 * (docs/changelog/2026-11-10-richiesta-solo-per-te.md). Mostrata come
 * bollino nella scheda della richiesta e usata per l'email "Nuova
 * richiesta". Solo il tipo e, per i professionisti scelti dal cliente,
 * quanti sono: mai chi sono gli altri.
 *
 * - `direct`: il cliente l'ha mandata solo a te (dal tuo profilo o dalla tua agenda).
 * - `direct_forwarded`: era solo per te, ma non hai risposto in tempo ed è
 *   andata anche ad altri (casella "inoltrala se non risponde", §209).
 * - `chosen`: il cliente ha scelto te e altri, da 2 a 5 in tutto (§393).
 * - `shared`: richiesta mandata ai professionisti della zona, o arrivata a te
 *   per inoltro da un collega che non ha risposto.
 */
export type LeadAudience = { kind: "direct" } | { kind: "direct_forwarded" } | { kind: "chosen"; among: number } | { kind: "shared" };

export function leadAudience(
  request: { professionalProfileId: string | null; forwardedAt: Date | string | null; chosenProfileIds: string[] },
  professionalProfileId: string,
): LeadAudience {
  if (request.professionalProfileId === professionalProfileId) {
    return request.forwardedAt ? { kind: "direct_forwarded" } : { kind: "direct" };
  }
  if (request.chosenProfileIds.includes(professionalProfileId)) {
    return { kind: "chosen", among: request.chosenProfileIds.length };
  }
  return { kind: "shared" };
}

/** Testo del bollino: corto, si legge a colpo d'occhio nell'elenco. */
export function leadAudienceLabel(audience: LeadAudience): string {
  switch (audience.kind) {
    case "direct":
      return "Solo per te";
    case "direct_forwarded":
      return "Inoltrata anche ad altri";
    case "chosen":
      return `Scelto tra ${audience.among}`;
    case "shared":
      return "A più professionisti";
  }
}
