/**
 * Segnaposto verde del brand per le mappe Google, disegnato come SVG dentro
 * `AdvancedMarker` invece del `<Pin>` di @vis.gl/react-google-maps: quel
 * componente passa a `google.maps.marker.PinElement` opzioni vuote
 * (`glyphText`/`glyphSrc` undefined) che le versioni recenti delle API
 * possono rifiutare, facendo andare in errore l'intera mappa
 * (docs/CHANGELOG.md §135). Un semplice SVG non dipende da nessuna API di
 * Google. Ancorato in basso al centro, come il pin standard.
 */
export function MapPin() {
  return (
    <svg width="28" height="38" viewBox="0 0 28 38" aria-hidden="true" style={{ display: "block", cursor: "pointer" }}>
      <path d="M14 1C7 1 1.5 6.5 1.5 13.5 1.5 23 14 37 14 37s12.5-14 12.5-23.5C26.5 6.5 21 1 14 1z" fill="#189A63" stroke="#0F6B44" strokeWidth="1.5" />
      <circle cx="14" cy="13.5" r="4.5" fill="#FFFFFF" />
    </svg>
  );
}
