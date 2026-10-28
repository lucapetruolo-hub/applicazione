import { canonicalServiceName, serviceNameKey } from "@professionisti/shared";

/** Nome con cui contare una prestazione: `ServiceNamesService.canonicalizer()` o, senza database, la tabella di shared. */
export type ServiceCanonicalizer = (name: string) => string;

/**
 * Chiave con cui si riconoscono le prestazioni uguali: la usano il "Quanto
 * costa in media", le pagine "Quanto costa" e la ricerca che si apre
 * cliccando una voce (docs/CHANGELOG.md §398), così l'elenco mostra sempre
 * chi è contato nella voce. Dal §405 unisce anche i sinonimi (§392):
 * "riparazione perdite" e "Riparazione perdita d'acqua" sono la stessa voce.
 */
export function serviceGroupKey(name: string, canonicalize: ServiceCanonicalizer = canonicalServiceName): string {
  return serviceNameKey(canonicalize(name));
}
