/**
 * Luci sfumate che si muovono piano, con una grana leggera: il segno "wow"
 * del sito (scelta dell'utente, docs/CHANGELOG.md §296-§297). Va dentro un
 * contenitore con `position: relative`; prende la sua forma (`inset: 0`) e il
 * raggio passato. Usarlo in pochi punti scelti, non dappertutto, perché resti
 * speciale: hero della home, riquadro scuro per i professionisti, tessera
 * "Non trovi il tuo lavoro?", apertura di /per-professionisti. Ferme con
 * "riduci movimento". Stili in globals.css (.glow-lights).
 */
export function GlowLights({ tone, radius = 0 }: { tone: "verde" | "scuro" | "chiaro"; radius?: number }) {
  return (
    <div className={`glow-lights glow-lights--${tone}`} style={{ borderRadius: radius }} aria-hidden="true">
      <span className="glow-lights__light glow-lights__light--one" />
      <span className="glow-lights__light glow-lights__light--two" />
      <span className="glow-lights__light glow-lights__light--three" />
    </div>
  );
}
