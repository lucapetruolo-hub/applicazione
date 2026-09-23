/**
 * Sito "privato" finché il lancio non è ufficiale (richiesta esplicita
 * dell'utente, docs/CHANGELOG.md §132): raggiungibile da chi ha il link, mai
 * proposto dai motori di ricerca. Aperto all'indicizzazione solo impostando
 * `NEXT_PUBLIC_SITE_INDEXABLE=true` su Vercel (e rifacendo il deploy): il
 * default è privato, così un deploy senza la variabile non rende mai
 * pubblico il sito per sbaglio.
 *
 * Il blocco è `noindex` (header `X-Robots-Tag` in next.config.mjs + meta
 * robots nel layout), non un `Disallow: /` in robots.txt: un crawler che non
 * può scaricare la pagina non vede nemmeno il `noindex`, e Google può
 * comunque elencare l'URL se lo trova linkato altrove.
 */
export const SITE_INDEXABLE = process.env.NEXT_PUBLIC_SITE_INDEXABLE === "true";
