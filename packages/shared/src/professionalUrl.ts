/**
 * Indirizzo leggibile del profilo pubblico (docs/CHANGELOG.md §295, SEO):
 * `/professionista/luca-idraulica-latina-<id>` invece del solo id. Il nome
 * serve a Google e a chi legge il link; il profilo si trova sempre dall'id in
 * coda, quindi un cambio di nome o città non rompe i link vecchi: la pagina
 * li porta all'indirizzo nuovo con un redirect permanente.
 */

const UUID_AT_END = /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

/** Lunghezza massima della parte con nome e città (l'id si aggiunge dopo). */
const MAX_NAME_SLUG_LENGTH = 60;

function slugPart(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    // "S.R.L." → "srl", non "s-r-l".
    .replace(/\./g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Parte con nome e città, senza id ("luca-idraulica-srl-latina"). */
function nameSlug(businessName: string, city?: string | null): string {
  const name = slugPart(businessName);
  const citySlug = city ? slugPart(city) : "";
  // La città non si ripete se il nome la contiene già ("Idraulica Latina").
  const full = citySlug && !`-${name}-`.includes(`-${citySlug}-`) ? `${name}-${citySlug}` : name;
  if (full.length <= MAX_NAME_SLUG_LENGTH) return full;
  return full.slice(0, MAX_NAME_SLUG_LENGTH).replace(/-[^-]*$/, "").replace(/-+$/, "");
}

/** Segmento finale dell'indirizzo: "luca-idraulica-srl-latina-<id>". */
export function professionalSlug(pro: { id: string; businessName: string; city?: string | null }): string {
  const name = nameSlug(pro.businessName, pro.city);
  return name ? `${name}-${pro.id}` : pro.id;
}

/** Percorso del profilo pubblico: "/professionista/luca-idraulica-srl-latina-<id>". */
export function professionalPath(pro: { id: string; businessName: string; city?: string | null }): string {
  return `/professionista/${professionalSlug(pro)}`;
}

/**
 * Id del profilo dal segmento dell'indirizzo: l'id in coda se c'è, altrimenti
 * il segmento intero (vecchi link col solo id, o id non nel formato atteso,
 * che l'API rifiuterà con 404).
 */
export function professionalIdFromSlug(slug: string): string {
  const id = UUID_AT_END.exec(slug)?.[1];
  return id ? id.toLowerCase() : slug;
}
