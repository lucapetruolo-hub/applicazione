/**
 * Suono leggero per una notifica nuova (docs/CHANGELOG.md §152, richiesta
 * esplicita dell'utente): due note brevi generate con la Web Audio API,
 * nessun file audio da scaricare.
 *
 * I browser permettono l'audio solo dopo un gesto dell'utente. Bug reale
 * corretto (docs/CHANGELOG.md §153, "prova il suono non si sente"): il
 * contesto audio veniva "sbloccato" in modo asincrono e il suono partiva
 * solo se era già attivo, così al primo tocco su "Prova il suono" veniva
 * saltato; in più il volume era molto basso. Ora ogni riproduzione chiede
 * la ripresa del contesto dentro il gesto e suona appena è pronto; allo
 * sblocco si suona anche un campione muto (serve a Safari su iPhone).
 * Su iPhone con l'interruttore silenzioso attivo i suoni del sito restano
 * muti, come le notifiche delle altre app: è voluto.
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

/** Campione muto di un istante: su Safari iOS l'audio si sblocca davvero solo se qualcosa suona dentro il gesto. */
function playSilentTick(ctx: AudioContext): void {
  try {
    const buffer = ctx.createBuffer(1, 1, 22050);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    source.start(0);
  } catch {
    // ignorato
  }
}

/** Da chiamare una volta all'avvio: sblocca l'audio al primo gesto dell'utente. */
export function installNotificationSoundUnlock(): void {
  if (unlockInstalled || typeof window === "undefined") return;
  unlockInstalled = true;
  const unlock = () => {
    const ctx = getContext();
    if (!ctx) return;
    playSilentTick(ctx);
    if (ctx.state !== "running") void ctx.resume().catch(() => undefined);
    if (ctx.state === "running") {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    }
  };
  window.addEventListener("pointerdown", unlock, { passive: true });
  window.addEventListener("keydown", unlock);
}

function scheduleChime(ctx: AudioContext): void {
  const start = ctx.currentTime + 0.02;
  // Due note (Mi5 → La5), attacco e rilascio morbidi, volume udibile ma non invadente.
  [
    { freq: 659.25, at: 0 },
    { freq: 880, at: 0.13 },
  ].forEach(({ freq, at }) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "triangle";
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, start + at);
    gain.gain.exponentialRampToValueAtTime(0.35, start + at + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + at + 0.45);
    osc.connect(gain).connect(ctx.destination);
    osc.start(start + at);
    osc.stop(start + at + 0.5);
  });
}

/**
 * Suona il campanello. Chiamata dentro un gesto (es. "Prova il suono") la
 * ripresa del contesto è sempre consentita; fuori da un gesto suona solo se
 * l'audio è già stato sbloccato, altrimenti non fa nulla (mai un errore).
 */
export function playNotificationSound(): void {
  const ctx = getContext();
  if (!ctx) return;
  try {
    if (ctx.state === "running") {
      scheduleChime(ctx);
      return;
    }
    playSilentTick(ctx);
    void ctx
      .resume()
      .then(() => {
        if (ctx.state === "running") scheduleChime(ctx);
      })
      .catch(() => undefined);
  } catch {
    // Mai bloccare l'app per un suono.
  }
}
