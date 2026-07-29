"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { motionBase, motionEasing } from "@professionisti/ui";

/**
 * Rivela il contenuto con una dissolvenza + leggero slide quando entra nel
 * viewport, invece di comparire di colpo — dà al sito una sensazione più
 * dinamica scorrendo la pagina. Nessuna libreria esterna: solo
 * IntersectionObserver + transizione CSS.
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
      style={{
        width: "100%",
        display: "flex",
        justifyContent: "center",
        opacity: isVisible ? 1 : 0,
        transform: isVisible ? "translateY(0)" : "translateY(12px)",
        transition: `opacity ${motionBase} ${motionEasing} ${delay}ms, transform ${motionBase} ${motionEasing} ${delay}ms`,
      }}
    >
      {children}
    </div>
  );
}
