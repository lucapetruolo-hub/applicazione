// Al posto del driver delle animazioni dell'app quando scripts/generate-tamagui-css.ts
// carica la config di packages/ui (alias in scripts/tsconfig.json): con
// Tamagui 3 il driver di React Native si rifiuta di partire fuori dal
// telefono, e il sito non ha animazioni Tamagui (packages/ui/src/animations.web.ts).
export const animationsReactNative = undefined;
