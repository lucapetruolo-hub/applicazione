/**
 * Chiave con cui si riconoscono le prestazioni uguali: la usano il "Quanto
 * costa in media", le pagine "Quanto costa" e la ricerca che si apre
 * cliccando una voce (docs/CHANGELOG.md §398), così l'elenco mostra sempre
 * chi è contato nella voce. Per unire anche i nomi simili basta cambiare
 * solo questa funzione.
 */
export function serviceGroupKey(name: string): string {
  return name.trim().toLowerCase();
}
