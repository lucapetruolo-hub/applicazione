"use client";

import { useState, type ReactNode } from "react";
import { useServerInsertedHTML } from "next/navigation";
import { StyleRegistry, createStyleRegistry } from "styled-jsx";

/**
 * Stili `<style jsx>` già nell'HTML del server (docs/CHANGELOG.md §393).
 * Senza questo registro l'App Router li aggiungeva solo dopo il JavaScript:
 * all'apertura le parti che li usano comparivano senza stile e poi si
 * spostavano (es. "Salva/Condividi" nel profilo, 16 px di salto).
 * Schema ufficiale di Next.js per styled-jsx con l'App Router.
 */
export function StyledJsxRegistry({ children }: { children: ReactNode }) {
  const [registry] = useState(() => createStyleRegistry());
  useServerInsertedHTML(() => {
    const styles = registry.styles();
    registry.flush();
    return <>{styles}</>;
  });
  return <StyleRegistry registry={registry}>{children}</StyleRegistry>;
}
