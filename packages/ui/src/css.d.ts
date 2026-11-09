// Fogli di stile delle varianti per il sito (`*.web.tsx` con `*.module.css`,
// docs/changelog/2026-11-09-pagine-pubbliche-senza-tamagui.md): li legge solo
// Next.js, mai Metro (l'app non apre i file `.web.tsx`).
declare module "*.module.css" {
  const classes: Readonly<Record<string, string>>;
  export default classes;
}
