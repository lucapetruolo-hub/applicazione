// Palette "Scheda Intervento": griglia cianografica, filetti sottili,
// niente ombre/gradienti. Valori grezzi esportati (oltre ai token Tamagui in
// config.ts) per i punti che devono scriverli in CSS puro invece che via
// prop Tamagui (es. il pattern di sfondo cianografico in Section, che usa
// repeating-linear-gradient — web-only, vedi Section.tsx).
export const brand = {
  gesso: "#F1F3F0",
  calce: "#FFFFFF",
  grafite: "#14181E",
  grafite70: "#4A525E",
  filetto: "#D6DAD5",
  cianografia: "#1B4D8F",
  cianografiaScuro: "#123361",
  cianografiaVelo: "#E8EEF6",
  verificato: "#1F7A52",
  urgenza: "#C8362B",
  // Tinta chiara di sfondo per segnalare un conflitto/errore (es. due fasce
  // dell'agenda sovrapposte), stesso principio di cianografiaVelo: colore
  // pieno solo per bordi/testo, mai per sfondi estesi.
  urgenzaVelo: "#FBEAE7",
  ottone: "#B4893A",
} as const;

// Raggio quasi nullo: linguaggio da documento tecnico, non da app consumer.
// Letterali semplici (non token Tamagui condivisi con la scala esistente
// $1..$12 già usata in tutto il sito) per non alterare il raggio di
// componenti non ancora coinvolti nel redesign.
export const radiusDoc = 4;
export const radiusDocLg = 8;

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
