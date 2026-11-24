/**
 * "Idraulico a domicilio a Marcianise" oppure "Idraulico online": il mestiere
 * con il tipo di intervento, come lo leggono i professionisti nelle notifiche
 * delle richieste (campanella, popup ed email; richiesta di Luca,
 * docs/changelog/2026-11-24-domicilio-online-nelle-notifiche.md). Le fasce
 * dell'agenda sono separate tra domicilio e online: il professionista deve
 * capirlo prima di aprire la richiesta.
 *
 * Online la città non si scrive: il lavoro non si fa lì. Senza il tipo
 * (notifiche di prima) resta il testo di sempre, "Idraulico a Marcianise".
 */
export function jobPlaceLabel(category: string, city: string | null | undefined, serviceMode: unknown): string {
  const where = city?.trim() ? ` a ${city.trim()}` : "";
  if (serviceMode === "ONLINE") return `${category} online`;
  if (serviceMode === "HOME") return `${category} a domicilio${where}`;
  return `${category}${where}`;
}

/** "A domicilio" / "Online", come nelle schede del sito; null senza il tipo. */
export function serviceModeLabel(serviceMode: unknown): string | null {
  return serviceMode === "HOME" ? "A domicilio" : serviceMode === "ONLINE" ? "Online" : null;
}
