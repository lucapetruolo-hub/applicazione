/**
 * Luci sfumate che si muovono piano, con una grana leggera: il segno "wow"
 * del sito (scelta dell'utente, docs/CHANGELOG.md §305-§306). Va dentro un
 * contenitore con `position: relative`; prende la sua forma (`inset: 0`) e il
 * raggio passato. Usarlo in pochi punti scelti, non dappertutto, perché resti
 * speciale: hero della home, riquadro scuro per i professionisti, tessera
 * "Non trovi il tuo lavoro?", apertura di /per-professionisti. Ferme con
 * "riduci movimento". Stili in globals.css (.glow-lights).
 *
 * Il tono "verde-opaco" (hero della home, scelta di Luca del 28/10/2026,
 * docs/changelog/2026-10-28-richiedi-preventivo-in-alto.md) è solo il verde
 * con una grana leggerissima: niente luci, che davano l'effetto metallico.
 */
export function GlowLights({
  tone,
  radius = 0,
}: {
  tone: "verde" | "verde-opaco" | "scuro" | "chiaro";
  radius?: number;
}) {
  return (
    <div className={`glow-lights glow-lights--${tone}`} style={{ borderRadius: radius }} aria-hidden="true">
      {tone === "verde-opaco" ? null : (
        <>
          <span className="glow-lights__light glow-lights__light--one" />
          <span className="glow-lights__light glow-lights__light--two" />
          <span className="glow-lights__light glow-lights__light--three" />
        </>
      )}
    </div>
  );
}
