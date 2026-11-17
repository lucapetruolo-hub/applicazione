/**
 * Suono leggero per una notifica nuova (docs/CHANGELOG.md §152, richiesta
 * esplicita dell'utente), generato con la Web Audio API, nessun file audio
 * da scaricare. Dal 17/11/2026 il suono si sceglie in Notifiche e le notizie
 * urgenti e buone hanno un suono loro (docs/changelog/2026-11-17-suoni-notifica.md).
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

import type { NotificationSoundKey } from "@professionisti/shared";

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

type Note = {
  /** Frequenza in Hz. */
  freq: number;
  /** Quando parte, in secondi dall'inizio del suono. */
  at: number;
  /** Quanto dura al massimo. */
  dur: number;
  /** Velocità con cui si spegne (costante di tempo, in secondi). */
  decay: number;
  /** Armoniche: [moltiplicatore della frequenza, volume]. */
  partials?: ReadonlyArray<readonly [number, number]>;
  attack?: number;
  /** La nota scivola fino a freq × glide (goccia, bolla). */
  glide?: number;
  wave?: OscillatorType;
};

/**
 * I suoni a scelta (docs/changelog/2026-11-17-suoni-notifica.md): tutti
 * generati qui con la Web Audio API, nessun file da scaricare né diritti
 * d'autore. Le anteprime ascoltate da Luca sono in anteprime/suoni-notifica/.
 */
const BELL: Note["partials"] = [
  [1, 1],
  [2.76, 0.18],
  [5.4, 0.05],
];
const SOUNDS: Record<NotificationSoundKey | "urgente", { gain: number; notes: Note[] }> = {
  dolce: {
    gain: 0.32,
    notes: [
      { freq: 783.99, at: 0, dur: 0.6, decay: 0.16, partials: [[1, 1], [2, 0.12]] },
      { freq: 1046.5, at: 0.14, dur: 0.7, decay: 0.2, partials: [[1, 1], [2, 0.12]] },
    ],
  },
  vetro: { gain: 0.3, notes: [{ freq: 1568, at: 0, dur: 0.95, decay: 0.22, attack: 0.002, partials: [[1, 1], [2.32, 0.25], [4.25, 0.08]] }] },
  goccia: { gain: 0.36, notes: [{ freq: 1400, at: 0, dur: 0.35, decay: 0.07, attack: 0.002, glide: 0.55 }] },
  marimba: {
    gain: 0.3,
    notes: [523.25, 659.25, 783.99].map((freq, i) => ({ freq, at: i * 0.075, dur: 0.45, decay: 0.09, attack: 0.002, partials: [[1, 1], [4, 0.18], [10, 0.03]] as const })),
  },
  bolla: { gain: 0.3, notes: [{ freq: 420, at: 0, dur: 0.18, decay: 0.05, attack: 0.003, glide: 2.3 }] },
  campanella: {
    gain: 0.3,
    notes: [
      { freq: 1174.66, at: 0, dur: 1.1, decay: 0.32, attack: 0.003, partials: BELL },
      { freq: 880, at: 0.18, dur: 1.2, decay: 0.36, attack: 0.003, partials: BELL },
    ],
  },
  // Il suono di prima (§152): due note Mi5 → La5 a onda triangolare.
  classico: {
    gain: 0.35,
    notes: [
      { freq: 659.25, at: 0, dur: 0.5, decay: 0.09, attack: 0.02, wave: "triangle" },
      { freq: 880, at: 0.13, dur: 0.5, decay: 0.09, attack: 0.02, wave: "triangle" },
    ],
  },
  // Richieste urgenti e problemi: tre tocchi veloci, si riconosce senza guardare.
  urgente: {
    gain: 0.3,
    notes: [
      { freq: 1174.66, at: 0, dur: 0.3, decay: 0.07, attack: 0.003, partials: [[1, 1], [2, 0.2]] },
      { freq: 1174.66, at: 0.11, dur: 0.3, decay: 0.07, attack: 0.003, partials: [[1, 1], [2, 0.2]] },
      { freq: 1567.98, at: 0.22, dur: 0.5, decay: 0.12, attack: 0.003, partials: [[1, 1], [2, 0.2]] },
    ],
  },
};

/** Nomi e descrizioni per la scelta in Notifiche, nello stesso ordine della preferenza. */
export const NOTIFICATION_SOUND_OPTIONS: ReadonlyArray<{ key: NotificationSoundKey; label: string }> = [
  { key: "dolce", label: "Due toni dolci" },
  { key: "vetro", label: "Vetro" },
  { key: "goccia", label: "Goccia" },
  { key: "marimba", label: "Marimba" },
  { key: "bolla", label: "Bolla" },
  { key: "campanella", label: "Campanella" },
  { key: "classico", label: "Classico" },
];

function scheduleSound(ctx: AudioContext, sound: { gain: number; notes: Note[] }): void {
  const start = ctx.currentTime + 0.02;
  for (const note of sound.notes) {
    const t0 = start + note.at;
    const attack = note.attack ?? 0.006;
    const partials = note.partials ?? [[1, 1]];
    const total = partials.reduce((sum, [, amp]) => sum + amp, 0);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t0);
    env.gain.linearRampToValueAtTime(sound.gain, t0 + attack);
    env.gain.setTargetAtTime(0.0001, t0 + attack, note.decay);
    env.connect(ctx.destination);
    for (const [mult, amp] of partials) {
      const osc = ctx.createOscillator();
      const level = ctx.createGain();
      osc.type = note.wave ?? "sine";
      osc.frequency.setValueAtTime(note.freq * mult, t0);
      if (note.glide) osc.frequency.exponentialRampToValueAtTime(note.freq * mult * note.glide, t0 + note.dur);
      level.gain.value = amp / total;
      osc.connect(level).connect(env);
      osc.start(t0);
      osc.stop(t0 + note.dur);
    }
  }
}

/** Che notizia è: le urgenti e le buone hanno un suono loro, qualunque sia la scelta. */
export type NotificationSoundKind = "normal" | "good" | "urgent";

/** Più notifiche in pochi secondi: un suono solo. */
const QUIET_WINDOW_MS = 4000;
let lastPlayedAt = 0;

/**
 * Suona il campanello. Chiamata dentro un gesto (es. "Prova il suono") la
 * ripresa del contesto è sempre consentita; fuori da un gesto suona solo se
 * l'audio è già stato sbloccato, altrimenti non fa nulla (mai un errore).
 *
 * `kind` sceglie il suono: "urgent" (richieste urgenti e problemi) e "good"
 * (buone notizie, la marimba) hanno un suono fisso, il resto quello scelto
 * in Notifiche. Una prova (`preview`) suona sempre; una notifica vera no se
 * ne è appena suonata un'altra.
 */
export function playNotificationSound(
  choice: NotificationSoundKey = "dolce",
  kind: NotificationSoundKind = "normal",
  options: { preview?: boolean } = {},
): void {
  const now = Date.now();
  if (!options.preview && now - lastPlayedAt < QUIET_WINDOW_MS) return;
  const ctx = getContext();
  if (!ctx) return;
  const sound = SOUNDS[kind === "urgent" ? "urgente" : kind === "good" ? "marimba" : choice] ?? SOUNDS.dolce;
  try {
    if (ctx.state === "running") {
      lastPlayedAt = now;
      scheduleSound(ctx, sound);
      return;
    }
    playSilentTick(ctx);
    void ctx
      .resume()
      .then(() => {
        if (ctx.state === "running") {
          lastPlayedAt = Date.now();
          scheduleSound(ctx, sound);
        }
      })
      .catch(() => undefined);
  } catch {
    // Mai bloccare l'app per un suono.
  }
}
