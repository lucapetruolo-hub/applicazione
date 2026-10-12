/**
 * Foto reali per categoria da mostrare al posto dell'icona colorata nella
 * schede categorie della homepage (`CategoryStoryRail.tsx`) — richiesta
 * esplicita dell'utente, già segnalata come rimandata in CLAUDE.md §19
 * ("richiede una decisione sulla fonte delle foto... per non introdurre
 * hotlink a immagini esterne non verificate o scelte a casuale"): qui la
 * fonte è la foto fornita direttamente dall'utente, non uno stock esterno
 * né una generazione — risolve esattamente quella riserva.
 *
 * Popolata categoria per categoria via `apps/web/public/category-photos/`
 * man mano che l'utente fornisce una foto reale — una categoria senza
 * voce qui resta sull'icona colorata di `CategoryIconBadge`, mai un
 * placeholder generico o una foto scelta a caso per lei.
 *
 * Eccezione autorizzata dall'utente (docs/CHANGELOG.md §217): le foto qui
 * sotto vengono da Unsplash, licenza Unsplash (uso commerciale libero,
 * senza obbligo di attribuzione):
 * - traslochi: Vitaly Gariev, unsplash.com/photos/wS40ELZROLE
 * - fabbro: Maria Ziegler, unsplash.com/photos/1AmEImwtnFk
 * - falegname: Ali Mkumbwa, unsplash.com/photos/PxlKOcj0a3Q
 * - tuttofare: Kevin Grieve, unsplash.com/photos/3CKZS3-o3XU
 * - dogsitter: Andriyko Podilnyk, unsplash.com/photos/VehdYPKnX8Y
 * - babysitter: Vitaly Gariev, unsplash.com/photos/IGnXUcRKZzQ
 *
 * Sostituite su richiesta dell'utente perché "sembravano troppo AI"
 * (docs/CHANGELOG.md §219), con foto vere da Pexels, licenza Pexels (uso
 * commerciale libero, senza obbligo di attribuzione):
 * - elettricista: ranjeet, pexels.com/photo/27928762
 * - imbianchino: Ivan S, pexels.com/photo/5799084
 * - giardiniere: pexels.com/photo/24595771
 * - climatizzazione: José Andrés Pacheco Cortes, pexels.com/photo/5463575
 * - muratore: Yura Forrat, pexels.com/photo/11429199
 */
export const CATEGORY_PHOTOS: Partial<Record<string, string>> = {
  idraulico: "/category-photos/idraulico.webp",
  elettricista: "/category-photos/elettricista.webp",
  imbianchino: "/category-photos/imbianchino.webp",
  pulizie: "/category-photos/pulizie.webp",
  giardiniere: "/category-photos/giardiniere.webp",
  traslochi: "/category-photos/traslochi.webp",
  fabbro: "/category-photos/fabbro.webp",
  climatizzazione: "/category-photos/climatizzazione.webp",
  muratore: "/category-photos/muratore.webp",
  falegname: "/category-photos/falegname.webp",
  tuttofare: "/category-photos/tuttofare.webp",
  dogsitter: "/category-photos/dogsitter.webp",
  babysitter: "/category-photos/babysitter.webp",
};

/**
 * Punto da tenere al centro quando la foto (3:2) viene ritagliata in
 * verticale nelle schede della homepage: senza, il volto finiva tagliato
 * fuori dal bordo. Le categorie non elencate restano centrate.
 */
export const CATEGORY_PHOTO_FOCUS: Partial<Record<string, string>> = {
  elettricista: "15% 50%",
  imbianchino: "72% 50%",
  giardiniere: "68% 50%",
  climatizzazione: "45% 50%",
  muratore: "30% 50%",
};
