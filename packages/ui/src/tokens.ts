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
  ottone: "#B4893A",
} as const;

// Raggio quasi nullo: linguaggio da documento tecnico, non da app consumer.
// Letterali semplici (non token Tamagui condivisi con la scala esistente
// $1..$12 già usata in tutto il sito) per non alterare il raggio di
// componenti non ancora coinvolti nel redesign.
export const radiusDoc = 4;
export const radiusDocLg = 8;
