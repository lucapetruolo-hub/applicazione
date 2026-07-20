/**
 * Capoluoghi di provincia italiani, per l'autocomplete del campo "Città"
 * nella ricerca. Elenco statico: non richiede una chiamata di rete.
 */
export const ITALIAN_CITIES = [
  "Torino", "Alessandria", "Asti", "Biella", "Cuneo", "Novara", "Verbania", "Vercelli",
  "Aosta",
  "Milano", "Bergamo", "Brescia", "Como", "Cremona", "Lecco", "Lodi", "Mantova", "Monza", "Pavia", "Sondrio", "Varese",
  "Trento", "Bolzano",
  "Venezia", "Belluno", "Padova", "Rovigo", "Treviso", "Verona", "Vicenza",
  "Trieste", "Gorizia", "Pordenone", "Udine",
  "Genova", "Imperia", "La Spezia", "Savona",
  "Bologna", "Ferrara", "Forlì", "Modena", "Parma", "Piacenza", "Ravenna", "Reggio Emilia", "Rimini",
  "Firenze", "Arezzo", "Grosseto", "Livorno", "Lucca", "Massa", "Pisa", "Pistoia", "Prato", "Siena",
  "Perugia", "Terni",
  "Ancona", "Ascoli Piceno", "Fermo", "Macerata", "Pesaro",
  "Roma", "Frosinone", "Latina", "Rieti", "Viterbo",
  "L'Aquila", "Chieti", "Pescara", "Teramo",
  "Campobasso", "Isernia",
  "Napoli", "Avellino", "Benevento", "Caserta", "Salerno",
  "Bari", "Barletta", "Brindisi", "Foggia", "Lecce", "Taranto",
  "Potenza", "Matera",
  "Catanzaro", "Cosenza", "Crotone", "Reggio Calabria", "Vibo Valentia",
  "Palermo", "Agrigento", "Caltanissetta", "Catania", "Enna", "Messina", "Ragusa", "Siracusa", "Trapani",
  "Cagliari", "Nuoro", "Oristano", "Sassari",
] as const;

export type ItalianCity = (typeof ITALIAN_CITIES)[number];
