import type { animations as nativeAnimations } from "@tamagui/config";

/**
 * Sul sito nessun componente usa la prop `animation` di Tamagui (le
 * animazioni sono in CSS): al posto del driver di React Native, che portava
 * in ogni pagina le animazioni di React Native con FlatList e
 * VirtualizedList (circa 95 KB, docs/CHANGELOG.md §335), un driver vuoto.
 * Ha gli stessi valori di quello di React Native per i componenti senza
 * animazione (`supportsCSS` spento: Tamagui converte gli stili come prima)
 * ed è segnato `isStub`, così una prop `animation` sul web viene ignorata
 * invece di rompere la pagina. Il tipo resta quello dell'app, così i
 * componenti condivisi (Hero) si controllano allo stesso modo.
 */
const noAnimations = () => undefined;
export const animations = {
  isReactNative: true,
  supportsCSS: false,
  isStub: true,
  animations: {},
  useAnimations: noAnimations,
  usePresence: noAnimations,
  ResetPresence: noAnimations,
  useAnimatedNumber: noAnimations,
  useAnimatedNumberStyle: noAnimations,
  useAnimatedNumberReaction: noAnimations,
} as unknown as typeof nativeAnimations;
