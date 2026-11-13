// Limiti numerici usati sia dagli schemi (schemas.ts) sia dalle pagine
// pubbliche del sito. Stanno qui e non in schemas.ts perché importare anche
// solo una costante da schemas.ts porta nel browser tutto zod e gli schemi
// (circa 40 KB compressi su pagina città e profilo,
// docs/changelog/2026-11-09-meno-javascript-comune.md).

/**
 * Categorie di un professionista (docs/CHANGELOG.md §217, richiesta
 * dell'utente): da 1 a 3, scelte in registrazione e modificabili dal
 * profilo. La prima è la principale.
 */
export const MAX_PROFESSIONAL_CATEGORIES = 3;

/** Categorie scelte insieme in una richiesta di preventivo generale (docs/CHANGELOG.md §259). */
export const MAX_REQUEST_CATEGORIES = 3;

/** Professionisti scelti dai risultati per una sola richiesta (docs/CHANGELOG.md §393, decisione di Luca: fino a 5). */
export const MAX_CHOSEN_PROFESSIONALS = 5;

/** Lunghezza massima della descrizione del problema scritta dal cliente. */
export const PROBLEM_DESCRIPTION_MAX = 1000;

/**
 * Ricerca con foto (docs/changelog/2026-11-13-ricerca-con-foto.md): la foto si
 * rimpicciolisce nel browser (lato lungo 1280 px); sopra questo peso è un errore.
 */
export const PROBLEM_PHOTO_MAX_BYTES = 3 * 1024 * 1024;
export const PROBLEM_PHOTO_MAX_EDGE = 1280;
