"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { motionEasing } from "@professionisti/ui";

// Più lenta e con uno spostamento più ampio della transizione standard
// (`motionBase`, 220ms/12px): l'entrata delle sezioni deve vedersi
// (docs/CHANGELOG.md §219, idea presa dal sito Volt).
const REVEAL_DURATION = "560ms";

/**
 * Rivela il contenuto con una dissolvenza + leggero slide quando entra nel
 * viewport, invece di comparire di colpo — dà al sito una sensazione più
 * dinamica scorrendo la pagina. Nessuna libreria esterna: solo
 * IntersectionObserver + transizione CSS. Le classi `fade-in-section` e
 * `is-visible` fanno entrare a cascata gli elementi marcati con
 * `data-stagger` (regole in globals.css).
 */
export function FadeInSection({ children, delay = 0 }: { children: ReactNode; delay?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.1, rootMargin: "0px 0px -60px 0px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={isVisible ? "fade-in-section is-visible" : "fade-in-section"}
      style={{
        width: "100%",
        display: "flex",
        justifyContent: "center",
        opacity: isVisible ? 1 : 0,
        transform: isVisible ? "translateY(0)" : "translateY(28px)",
        transition: `opacity ${REVEAL_DURATION} ${motionEasing} ${delay}ms, transform ${REVEAL_DURATION} ${motionEasing} ${delay}ms`,
      }}
    >
      {children}
    </div>
  );
}
