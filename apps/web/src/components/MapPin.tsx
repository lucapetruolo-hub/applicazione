/**
 * Icona del segnaposto verde del brand per i `Marker` classici di Google
 * Maps (docs/CHANGELOG.md §138): un SVG in data URL, nessuna API di Google
 * coinvolta nel disegno. Sostituisce `AdvancedMarker` + `<Pin>`/SVG, che
 * con la versione recente delle API (mappa vettoriale, componenti web
 * `gmp-*`) andavano in errore dentro il codice di Google su Safari.
 * Google ancora le icone dei Marker in basso al centro: la punta del pin
 * cade esattamente sul punto.
 */
const PIN_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="28" height="38" viewBox="0 0 28 38">' +
  '<path d="M14 1C7 1 1.5 6.5 1.5 13.5 1.5 23 14 37 14 37s12.5-14 12.5-23.5C26.5 6.5 21 1 14 1z" fill="#189A63" stroke="#0F6B44" stroke-width="1.5"/>' +
  '<circle cx="14" cy="13.5" r="4.5" fill="#FFFFFF"/></svg>';

export const MAP_PIN_ICON_URL = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(PIN_SVG)}`;
