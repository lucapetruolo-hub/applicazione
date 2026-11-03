/**
 * Sul sito nessun componente usa animazioni Tamagui (le animazioni sono in
 * CSS): nessun driver, così nessuna pagina scarica le animazioni di React
 * Native (docs/CHANGELOG.md §345). Con Tamagui 3 `createTamagui` accetta la
 * config senza driver, quindi non serve più il driver finto di prima
 * (docs/changelog/2026-11-02-tamagui-3.md). Il tipo resta quello dell'app,
 * così i componenti condivisi (Hero) si controllano allo stesso modo.
 */
import type { animationsReactNative } from "@tamagui/config/animations-rn";

export const animations = undefined as unknown as typeof animationsReactNative;
