/**
 * Foto reali per categoria da mostrare al posto dell'icona colorata nella
 * griglia categorie della homepage (`CategoryTile.tsx`) — richiesta
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
 * Eccezione autorizzata dall'utente (docs/CHANGELOG.md §214): le foto qui
 * sotto vengono da Unsplash, licenza Unsplash (uso commerciale libero,
 * senza obbligo di attribuzione):
 * - traslochi: Vitaly Gariev, unsplash.com/photos/wS40ELZROLE
 * - fabbro: Maria Ziegler, unsplash.com/photos/1AmEImwtnFk
 * - muratore: Bermix Studio, unsplash.com/photos/nZZfP9QiQ6w
 * - falegname: Ali Mkumbwa, unsplash.com/photos/PxlKOcj0a3Q
 * - tuttofare: Kevin Grieve, unsplash.com/photos/3CKZS3-o3XU
 * - dogsitter: Andriyko Podilnyk, unsplash.com/photos/VehdYPKnX8Y
 * - babysitter: Vitaly Gariev, unsplash.com/photos/IGnXUcRKZzQ
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
