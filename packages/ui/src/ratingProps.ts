// Tipi di Rating in un file a parte: li usano sia Rating.tsx (app) sia
// Rating.web.tsx (sito), che non possono importarsi a vicenda.
export type RatingProps = {
  value: number;
  count?: number;
  size?: number;
  /** Testo di voto e conteggio: più piccolo dove le stelle stanno sotto un nome (docs/CHANGELOG.md §342). */
  textSize?: number;
};
