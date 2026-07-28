"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button, Logo, Text, XStack } from "@professionisti/ui";
import { useAuth } from "@/lib/AuthContext";
import { AccountMenu } from "./AccountMenu";
import { MegaMenu } from "./MegaMenu";

/**
 * Header sticky (brief redesign §4.1): bordo inferiore hairline visibile
 * solo dopo 8px di scroll, per non avere una linea netta già sulla hero
 * (che ha il suo sfondo `--gesso` distinto dal bianco dell'header).
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
        backgroundColor: "rgba(255,255,255,0.9)",
        backdropFilter: "blur(8px)",
        borderBottom: `1px solid ${scrolled ? "#D6DAD5" : "transparent"}`,
        transition: "border-color 150ms ease",
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
            <Logo size={26} />
          </Link>
          <XStack alignItems="center" gap="$5">
            <MegaMenu />
            <XStack alignItems="center" gap="$5" display="none" $gtMd={{ display: "flex" }}>
              <Link href="/#come-funziona" style={{ textDecoration: "none" }}>
                <Text fontSize="$3" fontWeight="600" color="$color12">
                  Come funziona
                </Text>
              </Link>
              <Link href="/per-professionisti" style={{ textDecoration: "none" }}>
                <Text fontSize="$3" fontWeight="600" color="$color12">
                  Prezzi
                </Text>
              </Link>
            </XStack>
          </XStack>
        </XStack>

        <XStack alignItems="center" gap="$4">
          {isLoading ? null : user ? (
            <AccountMenu />
          ) : (
            <Link href="/accedi" style={{ textDecoration: "none" }}>
              <Text fontSize="$3" fontWeight="600" color="$blue10">
                Accedi
              </Text>
            </Link>
          )}
          <Link href="/preventivo" style={{ textDecoration: "none" }}>
            <Button variant="primary" size="$3" height={40} paddingHorizontal="$4">
              Richiedi preventivo
            </Button>
          </Link>
        </XStack>
      </XStack>
    </div>
  );
}
