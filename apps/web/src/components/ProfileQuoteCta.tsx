"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { BUTTON_HEIGHT, Button, ButtonArrow, Text, XStack } from "@professionisti/ui";
import { MagneticButton } from "./MagneticButton";

/**
 * "Richiedi un preventivo a [nome]" nel profilo pubblico: stesso effetto
 * magnete e stessa pressione del pulsante "Cerca", con la freccia delle
 * azioni principali. Su telefono occupa tutta la larghezza e, quando esce
 * dallo schermo, ricompare in una barra fissa in basso (`.profile-cta-bar`
 * in globals.css): sul telefono il pulsante sta sotto la scheda, oltre la
 * prima schermata.
 */
export function ProfileQuoteCta({ href, name, preview = false }: { href: string; name: string; preview?: boolean }) {
  const anchorRef = useRef<HTMLDivElement>(null);
  const [showBar, setShowBar] = useState(false);

  useEffect(() => {
    const el = anchorRef.current;
    if (!el || preview || typeof IntersectionObserver === "undefined") return;
    // La barra compare solo dopo che il pulsante è uscito dallo schermo verso
    // l'alto o prima di arrivarci: mai insieme al pulsante visibile.
    const observer = new IntersectionObserver(([entry]) => setShowBar(entry ? !entry.isIntersecting : false), { threshold: 0 });
    observer.observe(el);
    return () => observer.disconnect();
  }, [preview]);

  const button = (
    // Altezza libera: con un nome lungo, su telefono il testo va su due righe
    // invece di essere tagliato.
    <Button variant="primary" width="100%" height="auto" minHeight={BUTTON_HEIGHT} paddingVertical={10} tabIndex={preview ? -1 : undefined}>
      <XStack alignItems="center" gap="$2" minWidth={0} maxWidth="100%" flexShrink={1}>
        <Text color="white" fontFamily="$body" fontSize={16} fontWeight="600" textAlign="center" flexShrink={1}>
          {`Richiedi un preventivo a ${name}`}
        </Text>
        <ButtonArrow />
      </XStack>
    </Button>
  );

  return (
    <>
      <div ref={anchorRef} className="profile-cta">
        <Link href={href} style={{ textDecoration: "none", display: "block", pointerEvents: preview ? "none" : undefined }} tabIndex={preview ? -1 : undefined}>
          <MagneticButton block>{button}</MagneticButton>
        </Link>
      </div>
      {preview ? null : (
        <div className="profile-cta-bar" data-visible={showBar ? "true" : undefined} aria-hidden={!showBar}>
          <Link href={href} style={{ textDecoration: "none", display: "block" }} tabIndex={showBar ? undefined : -1}>
            <Button variant="primary" width="100%" tabIndex={-1}>
              <XStack alignItems="center" gap="$2" minWidth={0} maxWidth="100%" flexShrink={1}>
                <Text color="white" fontFamily="$body" fontSize={16} fontWeight="600" numberOfLines={1} flexShrink={1}>
                  Richiedi un preventivo
                </Text>
                <ButtonArrow />
              </XStack>
            </Button>
          </Link>
        </div>
      )}
    </>
  );
}
