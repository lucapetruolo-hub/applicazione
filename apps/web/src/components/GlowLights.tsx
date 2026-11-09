"use client";

import { useEffect, useRef } from "react";

/**
 * Luci sfumate che si muovono piano, con una grana leggera: il segno "wow"
 * del sito (scelta dell'utente, docs/CHANGELOG.md §305-§306). Va dentro un
 * contenitore con `position: relative`; prende la sua forma (`inset: 0`) e il
 * raggio passato. Usarlo in pochi punti scelti, non dappertutto, perché resti
 * speciale: riquadro scuro per i professionisti, tessera "Non trovi il tuo
 * lavoro?", apertura di /per-professionisti, "Richiesta inviata". Ferme con
 * "riduci movimento". Stili in globals.css (.glow-lights).
 *
 * Il tono "verde-opaco" (hero della home, scelta di Luca del 28/10/2026,
 * docs/changelog/2026-10-28-richiedi-preventivo-in-alto.md) è solo il verde
 * con una grana leggerissima: niente luci, che davano l'effetto metallico.
 * Le luci compaiono lì solo con `speed` (attesa della ricerca per problema).
 *
 * Luci che accelerano (idea di Luca da un video,
 * docs/changelog/2026-11-03-luci-che-accelerano.md): la velocità cambia in
 * modo fluido con `updatePlaybackRate` delle animazioni CSS, mai cambiando
 * `animation-duration`, che farebbe saltare le luci di colpo.
 * - `pressBoost`: un tocco sul pulsante principale del contenitore (quello
 *   con `data-glow-boost`) le fa correre per un attimo, poi tornano piano.
 * - `speed`: velocità tenuta finché resta impostata (es. 3 durante un'attesa).
 * - `burst`: partono veloci all'apertura e rallentano fino al passo normale.
 * Fuori dallo schermo sono ferme, per non consumare batteria.
 */
export function GlowLights({
  tone,
  radius = 0,
  pressBoost = false,
  speed,
  burst = false,
  className,
}: {
  tone: "verde" | "verde-opaco" | "scuro" | "chiaro";
  radius?: number;
  pressBoost?: boolean;
  speed?: number;
  burst?: boolean;
  className?: string;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const controlRef = useRef<LightsControl | null>(null);
  const showLights = tone !== "verde-opaco" || speed !== undefined;

  useEffect(() => {
    const root = rootRef.current;
    if (!root || !showLights) return;
    const control = createLightsControl(root);
    controlRef.current = control;

    const observer =
      typeof IntersectionObserver === "function"
        ? new IntersectionObserver(([entry]) => control.setVisible(entry?.isIntersecting ?? true))
        : null;
    observer?.observe(root);

    let removePress: (() => void) | undefined;
    const container = root.parentElement;
    if (pressBoost && container) {
      const onPress = (event: Event) => {
        if (event instanceof KeyboardEvent && event.key !== "Enter" && event.key !== " ") return;
        const target = event.target instanceof Element ? event.target : null;
        if (target?.closest("[data-glow-boost]")) control.boost();
      };
      container.addEventListener("pointerdown", onPress);
      container.addEventListener("keydown", onPress);
      removePress = () => {
        container.removeEventListener("pointerdown", onPress);
        container.removeEventListener("keydown", onPress);
      };
    }

    if (burst) control.burst();

    return () => {
      observer?.disconnect();
      removePress?.();
      control.stop();
      controlRef.current = null;
    };
  }, [pressBoost, burst, showLights]);

  useEffect(() => {
    controlRef.current?.setBase(speed ?? 1);
  }, [speed, showLights]);

  return (
    <div
      ref={rootRef}
      className={`glow-lights glow-lights--${tone}${speed !== undefined ? " glow-lights--attesa" : ""}${className ? ` ${className}` : ""}`}
      style={{ borderRadius: radius }}
      aria-hidden="true"
    >
      {showLights ? (
        <>
          <span className="glow-lights__light glow-lights__light--one" />
          <span className="glow-lights__light glow-lights__light--two" />
          <span className="glow-lights__light glow-lights__light--three" />
        </>
      ) : null}
    </div>
  );
}

type LightsControl = {
  setBase: (rate: number) => void;
  boost: () => void;
  burst: () => void;
  setVisible: (visible: boolean) => void;
  stop: () => void;
};

/** Velocità del tocco e della partenza, e quanto dura il ritorno al passo normale. */
const BOOST_RATE = 5;
const BOOST_HOLD_MS = 600;
const EASE_UP_MS = 250;
const EASE_DOWN_MS = 1800;

/**
 * Regola la velocità delle animazioni CSS delle luci. Con "riduci movimento"
 * le luci non hanno animazioni (`animation: none` in globals.css), quindi
 * qui non c'è nulla da muovere.
 */
function createLightsControl(root: HTMLElement): LightsControl {
  const animations = () =>
    Array.from(root.querySelectorAll<HTMLElement>(".glow-lights__light")).flatMap((light) =>
      typeof light.getAnimations === "function" ? light.getAnimations() : [],
    );

  let base = 1;
  let current = 1;
  let frame = 0;
  let holdTimer: number | undefined;
  let boostedUntil = 0;

  const apply = (rate: number) => {
    current = rate;
    for (const animation of animations()) {
      if (typeof animation.updatePlaybackRate === "function") animation.updatePlaybackRate(rate);
      else animation.playbackRate = rate;
    }
  };

  // Porta la velocità a `target` in `duration` ms, con una curva morbida.
  const easeTo = (target: number, duration: number) => {
    cancelAnimationFrame(frame);
    const from = current;
    // Già a quella velocità: niente da fare. Prima all'apertura di ogni
    // pagina girava lo stesso per 1,8 secondi, e ogni fotogramma chiedeva
    // al browser le animazioni (getAnimations), costringendolo a ricalcolare
    // gli stili di tutta la pagina mentre si stava ancora caricando
    // (docs/changelog/2026-11-09-meno-javascript-comune.md).
    if (Math.abs(target - from) < 0.001) return;
    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      apply(from + (target - from) * eased);
      if (t < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
  };

  const settle = () => {
    if (performance.now() < boostedUntil) return;
    easeTo(base, EASE_DOWN_MS);
  };

  return {
    setBase(rate) {
      base = rate;
      if (performance.now() >= boostedUntil) easeTo(base, rate > current ? EASE_UP_MS * 2 : EASE_DOWN_MS);
    },
    boost() {
      boostedUntil = performance.now() + BOOST_HOLD_MS;
      easeTo(Math.max(BOOST_RATE, base), EASE_UP_MS);
      window.clearTimeout(holdTimer);
      holdTimer = window.setTimeout(settle, BOOST_HOLD_MS);
    },
    burst() {
      apply(BOOST_RATE);
      boostedUntil = performance.now() + BOOST_HOLD_MS;
      window.clearTimeout(holdTimer);
      holdTimer = window.setTimeout(settle, BOOST_HOLD_MS);
    },
    setVisible(visible) {
      for (const animation of animations()) {
        if (visible && animation.playState === "paused") animation.play();
        else if (!visible && animation.playState === "running") animation.pause();
      }
    },
    stop() {
      cancelAnimationFrame(frame);
      window.clearTimeout(holdTimer);
    },
  };
}
