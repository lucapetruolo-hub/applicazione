// Palette A "Verde fiducia e terracotta" (scelta di Luca dell'11/11/2026,
// docs/changelog/2026-11-11-palette-e-figtree.md, prima "Vicinato" pesca):
// fondo crema #FAF2E8 (scelto da Luca al posto della carta #F7F3EE, più caldo), verde per pulsanti, link e bollino "Verificato", terracotta
// solo per luci di sfondo e categorie, angoli morbidi, ombra soffice al posto dei filetti — stessi NOMI di chiave di prima
// (mai rinominare/rimuovere: ~50 file in tutto il sito referenziano
// `brand.grafite`/`brand.cianografia`/ecc., ricolorare qui basta a
// ripropagare il nuovo stile ovunque senza toccare quei file uno per
// uno). Valori grezzi esportati (oltre ai token Tamagui in config.ts) per
// i punti che devono scriverli in CSS puro invece che via prop Tamagui.
export const brand = {
  gesso: "#FAF2E8",
  calce: "#FFFFFF",
  grafite: "#1B1A18",
  grafite70: "#5E5A54",
  // Non più un vero filetto strutturale (i pannelli usano ombra soffice
  // al suo posto, vedi shadowVicinato sotto) — resta come tinta di bordo
  // leggerissima per i pochi punti che ne hanno ancora bisogno (es. campi
  // di input).
  filetto: "#E7E0D7",
  // Bordo di campi, menu a tendina e caselle di spunta in tutto il sito
  // (docs/CHANGELOG.md §278-§279): 3,2:1 su bianco, il minimo perché si veda
  // dove scrivere (il filetto è 1,3:1). Il filetto resta per i divisori.
  bordoCampo: "#8E867C",
  cianografia: "#4C8A7A",
  // Verde dei testi verdi piccoli e dei link (5,4:1 su bianco, WCAG AA).
  // Sfondi, hero e pulsanti restano su cianografia (docs/CHANGELOG.md §172,
  // scelta dell'utente).
  cianografiaScuro: "#386C5F",
  // Sfondo dei pulsanti e delle aree piene con testo bianco (docs/CHANGELOG.md
  // §350): cianografia con il bianco sopra ha contrasto 3,6:1, sotto il 4,5:1
  // che serve ai testi di 16 px; questo tono, appena più scuro, arriva a 4,7:1.
  cianografiaPieno: "#40776A",
  cianografiaVelo: "#E1EEEB",
  // Verde scuro di "fatto" (salvato, confermato, pagato, lavoro concluso),
  // volutamente distinto dal verde dei pulsanti (cianografia): un messaggio
  // di conferma non deve confondersi con un bottone d'azione. 6,3:1 su
  // bianco. Il nome resta per i ~60 punti che lo usano; anche il bollino
  // "Verificato", su cianografiaVelo (docs/changelog/2026-11-11-verificato-verde.md).
  verificato: "#325F54",
  // Terracotta della palette A (docs/changelog/2026-11-11-palette-e-figtree.md):
  // luci dello sfondo e colori delle categorie, mai per pulsanti, messaggi o
  // bollini (accanto al rosso sembrava un errore, docs/changelog/2026-11-11-verificato-verde.md).
  // 5,6:1 sul fondo crema, 5,0:1 sulla sua tinta chiara.
  terracotta: "#A3441F",
  // Verde inchiostro dei titoli (h1-h3), scelta di Luca dell'11/11/2026: dà
  // carattere al marchio senza confondersi con il verde dei pulsanti, molto
  // più chiaro. 11,3:1 sul fondo crema. Il testo normale resta grafite.
  inchiostro: "#0F3B2C",
  terracottaVelo: "#F6E3D9",
  urgenza: "#B42318",
  // Tinta chiara di sfondo per segnalare un conflitto/errore (es. due fasce
  // dell'agenda sovrapposte), stesso principio di cianografiaVelo: colore
  // pieno solo per bordi/testo, mai per sfondi estesi. Resta rosso
  // (convenzione universale per distruttivo/urgente), appena più freddo per
  // stare con la palette A.
  urgenzaVelo: "#FDE8E6",
  // Blu ardesia: colore di base delle notifiche "Lavori e appuntamenti"
  // (docs/changelog/2026-11-12-notifiche-positive-verdi.md). Prima erano
  // verdi e una notizia normale sembrava una buona notizia, ora verde solo
  // per "fatto". 7,2:1 su bianco, 5,9:1 sulla sua tinta chiara.
  ardesia: "#3E5A73",
  ardesiaVelo: "#E3EAF1",
  ottone: "#D9A441",
  // Testo e icone sull'ottone chiaro (categoria principale in registrazione,
  // docs/CHANGELOG.md §248): l'ottone pieno sul chiaro non si legge. È l'unico
  // colore "attenzione" per i testi (scadenze, avvisi), come grafite70 è
  // l'unico grigio dei testi secondari: entrambi sopra 4,5:1 sui fondi chiari
  // (controllo dell'8/11, E7-05). Niente trasparenza sui testi.
  ottoneScuro: "#8A5A00",
  // Tinta chiara di sfondo per il badge "Sponsorizzato" (boost a pagamento in
  // ricerca) — stesso principio di cianografiaVelo/urgenzaVelo: colore
  // pieno solo per bordi/testo, mai per sfondi estesi.
  ottoneVelo: "#FBF0D9",
} as const;

// Ombra soffice unica, usata al posto del filetto hairline sui pannelli
// (Surface, Button, Badge, Chip) — stringa CSS grezza (non token Tamagui)
// per gli stessi punti web-only che già scrivono `boxShadow` a mano.
export const shadowVicinato = "0 1px 4px rgba(43,32,19,0.015)";

// Tre arrotondamenti in tutto il sito (sistema unico, docs/CHANGELOG.md
// §305, ammorbiditi nel §317 su richiesta dell'utente: "era più bello
// tondeggiante come prima"): 10 px per etichette e tessere piccole, 20 px
// per campi, riquadri, finestre e pannelli, tondo pieno per pulsanti
// ("stile Apple") e foto profilo. `radiusDocLg` resta come nome per i punti
// che lo importano, con lo stesso valore.
export const radiusSm = 10;
export const radiusDoc = 20;
export const radiusDocLg = 20;

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
