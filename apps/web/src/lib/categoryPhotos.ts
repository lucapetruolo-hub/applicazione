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
 * Foto da Unsplash (licenza Unsplash) e Pexels (licenza Pexels), entrambe
 * con uso commerciale libero e senza obbligo di attribuzione. Scelte
 * dall'utente categoria per categoria tra tre alternative (docs/CHANGELOG.md
 * §217 e §219):
 * - idraulico: pexels.com/photo/6419128
 * - elettricista: pexels.com/photo/34054464
 * - imbianchino: pexels.com/photo/5493653
 * - pulizie: pexels.com/photo/6196566
 * - giardiniere: pexels.com/photo/6728926
 * - traslochi: Vitaly Gariev, unsplash.com/photos/wS40ELZROLE
 * - fabbro: pexels.com/photo/5691693
 * - climatizzazione: José Andrés Pacheco Cortes, pexels.com/photo/5463579
 * - muratore: pexels.com/photo/5691606
 * - falegname: pexels.com/photo/4888598
 * - tuttofare: pexels.com/photo/5691544
 * - dogsitter: pexels.com/photo/7210537
 * - babysitter: pexels.com/photo/6986430
 * - elettrodomestici: Bulat843, pexels.com/photo/34734504 (tagliata sotto il volto, senza il
 *   cartello in alto e senza le scritte di tuta ed etichetta; controllata con
 *   TinEye)
 * - tende-da-sole: Ian MacKay, pexels.com/photo/18348172 (scelta di Luca del
 *   06/11/2026, controllata con TinEye: nessuna copia a pagamento altrove,
 *   docs/changelog/2026-11-06-mestiere-elettrodomestici.md)
 *
 * - per-professionisti (pagina): pexels.com/photo/4792521, galleria 6195125, 6231851, 7464702, 5463575
 *
 * Le foto di `/registrati` e `/per-professionisti` sono copie separate in
 * `public/page-photos/`, così cambiare la foto di una categoria non cambia
 * quelle pagine.
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
  elettrodomestici: "/category-photos/elettrodomestici.webp",
  "tende-da-sole": "/category-photos/tende-da-sole.webp",
};

/**
 * Punto da tenere al centro quando la foto (3:2) viene ritagliata in
 * verticale nelle schede della homepage: senza, il volto finiva tagliato
 * fuori dal bordo. Le categorie non elencate restano centrate.
 */
export const CATEGORY_PHOTO_FOCUS: Partial<Record<string, string>> = {
  climatizzazione: "30% 50%",
  babysitter: "40% 50%",
  // Spostata a destra perché si vedano le mani e la lavastoviglie, non
  // solo il tecnico (richiesta di Luca del 06/11/2026).
  elettrodomestici: "70% 50%",
  // Il balcone giallo con la tenda a righe, non il pluviale al centro.
  "tende-da-sole": "22% 50%",
};
