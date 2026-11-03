"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ComponentProps, FocusEvent, MouseEvent, TouchEvent } from "react";

type Props = Omit<ComponentProps<typeof Link>, "href" | "prefetch"> & { href: string };

/**
 * Link dell'intestazione, del menu e del piè di pagina: la pagina di
 * destinazione si prepara quando il dito la tocca, il mouse ci passa sopra o
 * ci si arriva col tasto Tab, non appena il link compare. Next.js prepara in
 * anticipo ogni link visibile e ne esegue il codice: aprendo Oggi erano 14
 * pagine mentre Oggi si caricava ancora
 * (docs/changelog/2026-11-02-oggi-piu-leggera.md).
 */
export default function IntentLink({ href, onMouseEnter, onTouchStart, onFocus, ...props }: Props) {
  const router = useRouter();
  const warm = () => router.prefetch(href);
  return (
    <Link
      {...props}
      href={href}
      prefetch={false}
      onMouseEnter={(event: MouseEvent<HTMLAnchorElement>) => {
        warm();
        onMouseEnter?.(event);
      }}
      onTouchStart={(event: TouchEvent<HTMLAnchorElement>) => {
        warm();
        onTouchStart?.(event);
      }}
      onFocus={(event: FocusEvent<HTMLAnchorElement>) => {
        warm();
        onFocus?.(event);
      }}
    />
  );
}
