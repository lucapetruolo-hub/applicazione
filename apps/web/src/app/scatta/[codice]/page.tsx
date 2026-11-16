import type { Metadata } from "next";
import { ScattaDalTelefono } from "./ScattaDalTelefono";

/**
 * Pagina che si apre dal codice QR del computer, "Scatta dal telefono"
 * (docs/changelog/2026-11-16-scatta-dal-telefono.md): si scatta e la foto
 * arriva da sola nella finestra del computer.
 */
export const metadata: Metadata = {
  title: "Scatta la foto dal telefono",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default async function ScattaPage({ params }: { params: Promise<{ codice: string }> }) {
  const { codice } = await params;
  return <ScattaDalTelefono code={codice} />;
}
