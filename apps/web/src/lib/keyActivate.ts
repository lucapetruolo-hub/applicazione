/**
 * Spazio e Invio su una casella fatta con un riquadro di Tamagui
 * (role="checkbox" o "radio"), come su una casella vera: senza, da tastiera
 * si raggiungeva ma non si spuntava (docs/CHANGELOG.md §358). L'evento è
 * quello del browser, ma Tamagui lo tipizza come quello di React Native.
 */
export function keyActivate(action: (() => void) | undefined) {
  return (event: unknown) => {
    const keyEvent = event as { key?: string; preventDefault?: () => void };
    if (!action || (keyEvent.key !== " " && keyEvent.key !== "Enter")) return;
    keyEvent.preventDefault?.();
    action();
  };
}
