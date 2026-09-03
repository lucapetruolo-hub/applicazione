"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button, Logo, Text, XStack, brand, motionEasing, motionFast } from "@professionisti/ui";
import { useAuth } from "@/lib/AuthContext";
import { AccountMenu } from "./AccountMenu";
import { MegaMenu } from "./MegaMenu";

/**
 * Header sticky (brief "Vicinato", CLAUDE.md §19): niente più hairline —
 * un'ombra morbida compare solo dopo 8px di scroll, coerente con il resto
 * del sito che segnala la profondità con `shadowVicinato` invece di un
 * bordo netto.
 *
 * `MegaMenu` è un'unica istanza, mai duplicata: mostra da sola il trigger
 * "Servizi" desktop o l'hamburger mobile a seconda della larghezza,
 * tramite il proprio CSS interno (media query a 860px) — annidarla in un
 * wrapper Tamagui `$gtMd`-only nasconderebbe anche il suo trigger mobile.
 */
export function SiteHeader() {
  const { user, isLoading } = useAuth();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    function onScroll() {
      setScrolled(window.scrollY > 8);
    }
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    // `position: sticky` non è tipizzato su Tamagui/React Native (stesso
    // limite già documentato per ResultsListWithMap.tsx): wrapper DOM
    // grezzo invece del prop Tamagui, che accetta solo i valori che RN
    // supporta (absolute/relative/static).
    <div
      style={{
        position: "sticky",
        top: 0,
        zIndex: 40,
        width: "100%",
        backgroundColor: "rgba(255,255,255,0.92)",
        backdropFilter: "blur(8px)",
        boxShadow: scrolled ? "0 1px 4px rgba(43,32,19,0.015)" : "none",
        transition: `box-shadow ${motionFast} ${motionEasing}`,
      }}
    >
      <XStack
        width="100%"
        height={64}
        paddingHorizontal="$4"
        $gtSm={{ paddingHorizontal: "$5" }}
        alignItems="center"
        justifyContent="space-between"
      >
        <XStack alignItems="center" gap="$6">
          <Link href="/" style={{ textDecoration: "none" }}>
            {/* Solo marchio sotto $xs (≤660px, telefoni): il wordmark
                "Professionisti" (~120px) più Accedi+bottone CTA a destra
                sforavano la larghezza viewport sui telefoni più stretti
                (bug reale segnalato dall'utente, scroll orizzontale sulla
                homepage) — `variant="mark"` esiste già in Logo.web.tsx
                proprio per questo caso ("per spazi stretti"). */}
            <XStack display="none" $gtXs={{ display: "flex" }}>
              <Logo size={26} />
            </XStack>
            <XStack $gtXs={{ display: "none" }}>
              <Logo size={26} variant="mark" />
            </XStack>
          </Link>
          <XStack alignItems="center" gap="$5">
            <MegaMenu />
            <XStack alignItems="center" gap="$5" display="none" $gtMd={{ display: "flex" }}>
              <Link href="/#come-funziona" style={{ textDecoration: "none" }}>
                <Text fontSize="$3" fontWeight="600" color={brand.grafite}>
                  Come funziona
                </Text>
              </Link>
              <Link href="/per-professionisti" style={{ textDecoration: "none" }}>
                <Text fontSize="$3" fontWeight="600" color={brand.grafite}>
                  Prezzi
                </Text>
              </Link>
            </XStack>
          </XStack>
        </XStack>

        <XStack alignItems="center" gap="$4" $xs={{ gap: "$3" }}>
          {isLoading ? null : user ? (
            <AccountMenu />
          ) : (
            <Link href="/accedi" style={{ textDecoration: "none" }}>
              {/* brand.cianografia invece di $blue10 stock (Fase 6): 3.84:1 di
                  contrasto su bianco a questa dimensione, sotto la soglia
                  4.5:1 richiesta per testo normale (Lighthouse color-contrast). */}
              <Text fontSize="$3" fontWeight="600" color={brand.cianografia}>
                Accedi
              </Text>
            </Link>
          )}
          {/* Nascosto per un account professionista già autenticato (richiesta
              esplicita dell'utente): "Richiedi un preventivo" è un'azione da
              cliente, non pertinente per chi gestisce il proprio profilo
              professionale. `isLoading` va controllato qui esplicitamente
              (bug reale): mentre l'autenticazione è ancora in corso `user`
              è `null`/`undefined`, quindi `!user?.isProfessional`
              risultava vero per un istante anche per un professionista già
              loggato, facendo comparire il bottone per un breve lampo ad
              ogni caricamento di pagina prima di sparire. */}
          {!isLoading && !user?.isProfessional ? (
            <Link href="/preventivo" style={{ textDecoration: "none" }}>
              {/* paddingHorizontal ridotto sotto $xs (≤660px): a 320px (iPhone
                  SE, il più stretto tra i telefoni comuni) il bottone a piena
                  dimensione sforava ancora di qualche px anche dopo aver
                  ridotto il logo — stesso bug segnalato dall'utente. */}
              <Button variant="primary" size="$3" height={40} paddingHorizontal="$4" $xs={{ paddingHorizontal: "$3" }}>
                Richiedi preventivo
              </Button>
            </Link>
          ) : null}
        </XStack>
      </XStack>
    </div>
  );
}
