// Palette "Vicinato" (sostituisce "Scheda Intervento", CLAUDE.md §19):
// pesca caldo, verde smeraldo come accento primario, angoli morbidi,
// ombra soffice al posto dei filetti — stessi NOMI di chiave di prima
// (mai rinominare/rimuovere: ~50 file in tutto il sito referenziano
// `brand.grafite`/`brand.cianografia`/ecc., ricolorare qui basta a
// ripropagare il nuovo stile ovunque senza toccare quei file uno per
// uno). Valori grezzi esportati (oltre ai token Tamagui in config.ts) per
// i punti che devono scriverli in CSS puro invece che via prop Tamagui.
export const brand = {
  gesso: "#FDEFE1",
  calce: "#FFFFFF",
  grafite: "#2B2420",
  grafite70: "#6E6459",
  // Non più un vero filetto strutturale (i pannelli usano ombra soffice
  // al suo posto, vedi shadowVicinato sotto) — resta come tinta di bordo
  // leggerissima per i pochi punti che ne hanno ancora bisogno (es. campi
  // di input).
  filetto: "#F0DCC0",
  // Bordo di campi, menu a tendina e caselle di spunta in tutto il sito
  // (docs/CHANGELOG.md §278-§279): 3,2:1 su bianco, il minimo perché si veda
  // dove scrivere (il filetto è 1,3:1). Il filetto resta per i divisori.
  bordoCampo: "#9C8E7F",
  cianografia: "#189A63",
  // Verde dei testi verdi piccoli e dei link (5,4:1 su bianco, WCAG AA).
  // Sfondi, hero e pulsanti restano su cianografia (docs/CHANGELOG.md §172,
  // scelta dell'utente).
  cianografiaScuro: "#0E7A4C",
  cianografiaVelo: "#DCF3E7",
  // Verde muto, volutamente distinto dal verde smeraldo (cianografia,
  // usato per i CTA): un badge "Verificato" non deve confondersi con un
  // bottone d'azione.
  verificato: "#3D6B3E",
  urgenza: "#C8362B",
  // Tinta chiara di sfondo per segnalare un conflitto/errore (es. due fasce
  // dell'agenda sovrapposte), stesso principio di cianografiaVelo: colore
  // pieno solo per bordi/testo, mai per sfondi estesi. Rosso invariato
  // rispetto alla palette precedente: convenzione universale per
  // distruttivo/urgente, cambiarlo confonderebbe l'utente.
  urgenzaVelo: "#FBEAE7",
  ottone: "#D9A441",
  // Testo e icone sull'ottone chiaro (categoria principale in registrazione,
  // docs/CHANGELOG.md §248): l'ottone pieno sul chiaro non si legge.
  ottoneScuro: "#8A5A00",
  // Tinta chiara di sfondo per il badge "Sponsorizzato" (boost a pagamento in
  // ricerca) — stesso principio di cianografiaVelo/urgenzaVelo: colore
  // pieno solo per bordi/testo, mai per sfondi estesi.
  ottoneVelo: "#F6ECD9",
} as const;

// Ombra soffice unica, usata al posto del filetto hairline sui pannelli
// (Surface, Button, Badge, Chip) — stringa CSS grezza (non token Tamagui)
// per gli stessi punti web-only che già scrivono `boxShadow` a mano.
export const shadowVicinato = "0 1px 4px rgba(43,32,19,0.015)";

// Tre soli arrotondamenti in tutto il sito (sistema unico, docs/CHANGELOG.md
// §296): 6 px per campi, etichette e tessere piccole, 12 px per riquadri e
// pannelli, tondo pieno per pulsanti (scelta dell'utente: "stile Apple") e
// foto profilo. Prima ce n'erano 22 diversi. `radiusDocLg` resta come nome
// per i punti che lo importano, con lo stesso valore.
export const radiusSm = 6;
export const radiusDoc = 12;
export const radiusDocLg = 12;

// Motion (brief redesign, fase "motion"): due velocità, una sola curva di
// accelerazione condivisa — prima ogni componente scriveva la propria
// stringa CSS `transition` con valori/easing leggermente diversi
// (`150ms ease` qui, `220ms cubic-bezier(...)` lì), risultato incoerente
// pur restando nello stesso ordine di grandezza. `fast` per il feedback
// immediato all'interazione (hover, press, apertura menu); `base` per le
// rivelazioni di contenuto più ampie (FadeInSection). Stringhe grezze (non
// token Tamagui `animation=`) perché i punti che le usano sono tutti CSS
// puro web-only (styled-jsx, style inline) — vedi la stessa nota sopra per
// `radiusDoc`.
export const motionEasing = "cubic-bezier(0.2, 0.8, 0.2, 1)";
export const motionFast = "150ms";
export const motionBase = "220ms";
