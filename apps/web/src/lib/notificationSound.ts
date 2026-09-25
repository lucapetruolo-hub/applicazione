/**
 * Suono leggero per una notifica nuova (docs/CHANGELOG.md §152, richiesta
 * esplicita dell'utente): due note brevi e morbide generate con la Web
 * Audio API, nessun file audio da scaricare. I browser permettono l'audio
 * solo dopo un'interazione dell'utente: il contesto audio si sblocca al
 * primo tocco/tasto sulla pagina; prima di allora il suono semplicemente
 * non parte (mai un errore). Volume basso di proposito.
 */

let context: AudioContext | null = null;
let unlockInstalled = false;

function getContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!context) {
    try {
      context = new Ctor();
    } catch {
      return null;
    }
  }
  return context;
}

/** Da chiamare una volta all'avvio: sblocca l'audio al primo gesto dell'utente. */
export function installNotificationSoundUnlock(): void {
  if (unlockInstalled || typeof window === "undefined") return;
  unlockInstalled = true;
  const unlock = () => {
    const ctx = getContext();
    if (ctx && ctx.state === "suspended") void ctx.resume().catch(() => undefined);
    window.removeEventListener("pointerdown", unlock);
    window.removeEventListener("keydown", unlock);
  };
  window.addEventListener("pointerdown", unlock, { passive: true });
  window.addEventListener("keydown", unlock);
}

export function playNotificationSound(): void {
  const ctx = getContext();
  if (!ctx || ctx.state !== "running") return;
  try {
    const start = ctx.currentTime + 0.01;
    // Due note (Mi5 → La5), attacco e rilascio morbidi.
    [
      { freq: 659.25, at: 0 },
      { freq: 880, at: 0.12 },
    ].forEach(({ freq, at }) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, start + at);
      gain.gain.linearRampToValueAtTime(0.08, start + at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + at + 0.35);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start + at);
      osc.stop(start + at + 0.4);
    });
  } catch {
    // Mai bloccare l'app per un suono.
  }
}
