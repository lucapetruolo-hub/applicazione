/**
 * Scrive nel link del modulo a chi va la richiesta: uno solo è la richiesta
 * diretta (`professionista`), da 2 a 5 `scelti`, nessuno una richiesta
 * generale. Usata dai risultati, da "Ripeti la richiesta" e dalla X del
 * modulo (docs/changelog/2026-11-10-ripeti-richiesta-scelti.md), così i tre
 * punti scrivono il link allo stesso modo.
 */
export function setChosenParams(params: URLSearchParams, chosen: { id: string; businessName: string; imageUrl: string | null }[]) {
  for (const key of ["professionista", "nomeProfessionista", "fotoProfessionista", "scelti"]) params.delete(key);
  const [first] = chosen;
  if (chosen.length === 1 && first) {
    params.set("professionista", first.id);
    params.set("nomeProfessionista", first.businessName);
    params.set("fotoProfessionista", first.imageUrl ?? "");
  } else if (chosen.length > 1) {
    params.set("scelti", chosen.map((pro) => pro.id).join(","));
  }
}
