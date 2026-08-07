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
  cianografia: "#189A63",
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
} as const;

// Ombra soffice unica, usata al posto del filetto hairline sui pannelli
// (Surface, Button, Badge, Chip) — stringa CSS grezza (non token Tamagui)
// per gli stessi punti web-only che già scrivono `boxShadow` a mano.
export const shadowVicinato = "0 1px 1px rgba(43,32,19,0.02), 0 4px 10px -8px rgba(43,32,19,0.05)";

// Angoli morbidi e amichevoli ("Vicinato"), non più il raggio quasi nullo
// da documento tecnico di "Scheda Intervento". Letterali semplici (non
// token Tamagui condivisi con la scala esistente $1..$12) per lo stesso
// motivo di prima: un solo punto da cui ricolorare/ridimensionare tutti i
// componenti che lo importano.
export const radiusDoc = 20;
export const radiusDocLg = 32;

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
