"use client";

import { useId, useRef, useState } from "react";
import Link from "next/link";
import {
  formatServicePrice,
  quickQuoteServices,
  quoteItemFromService,
  type QuickQuoteService,
  type SimilarQuote,
} from "@professionisti/shared";
import { Icon, Text, XStack, YStack, brand } from "@professionisti/ui";
import type { QuoteItemDraft } from "./requestHelpers";

/**
 * Preventivo in 30 secondi (docs/changelog/2026-11-08-preventivo-in-30-secondi.md):
 * sopra le voci del preventivo, le prestazioni del profilo come pillole da
 * toccare e "Usa il preventivo del …" per ripartire dall'ultimo mandato per
 * lo stesso mestiere. Tutto resta modificabile prima di inviare.
 */

const centsToField = (cents: number | null) => (cents != null ? (cents / 100).toString() : "");

function draftFromItem(item: { name: string; priceMinEurCents: number | null; priceMaxEurCents: number | null }): QuoteItemDraft {
  return { name: item.name, priceMin: centsToField(item.priceMinEurCents), priceMax: centsToField(item.priceMaxEurCents) };
}

/** La riga vuota con cui si apre il modulo ("Manodopera" senza prezzi): si sostituisce invece di restare in coda. */
function isUntouched(items: readonly QuoteItemDraft[]): boolean {
  return items.length === 1 && !items[0]!.priceMin.trim() && !items[0]!.priceMax.trim() && ["", "manodopera"].includes(items[0]!.name.trim().toLowerCase());
}

const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** "di oggi", "di ieri", "dell'8 novembre", "del 5 novembre". */
function whenSent(iso: string): string {
  const day = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: "Europe/Rome" });
  const sent = new Date(iso);
  if (day(sent) === day(new Date())) return "di oggi";
  if (day(sent) === day(new Date(Date.now() - 24 * 60 * 60 * 1000))) return "di ieri";
  const label = sent.toLocaleDateString("it-IT", { day: "numeric", month: "long", timeZone: "Europe/Rome" });
  return /^(8|11) /.test(label) ? `dell'${label}` : `del ${label}`;
}

function excerpt(text: string, max = 70): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}…` : clean;
}

export function QuoteQuickFill({
  services,
  request,
  similarQuote,
  items,
  setItems,
  notes,
  setNotes,
}: {
  services: readonly QuickQuoteService[];
  request: { categoryLabel: string; description: string };
  similarQuote: SimilarQuote | null;
  items: QuoteItemDraft[];
  setItems: (next: QuoteItemDraft[]) => void;
  notes: string;
  setNotes: (next: string) => void;
}) {
  const shown = quickQuoteServices(services, request);
  // Voci e nota di prima, per "Annulla" dopo aver copiato un preventivo.
  const beforeCopy = useRef<{ items: QuoteItemDraft[]; notes: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const labelId = useId();

  function toggleService(service: QuickQuoteService) {
    const present = items.findIndex((it) => sameName(it.name, service.name));
    if (present >= 0) {
      const rest = items.filter((_, i) => i !== present);
      setItems(rest.length > 0 ? rest : [{ name: "Manodopera", priceMin: "", priceMax: "" }]);
      return;
    }
    const draft = draftFromItem(quoteItemFromService(service));
    setItems(isUntouched(items) ? [draft] : [...items, draft]);
  }

  function copySimilar() {
    if (!similarQuote) return;
    beforeCopy.current = { items, notes };
    setItems(similarQuote.items.map(draftFromItem));
    if (similarQuote.notes && !notes.trim()) setNotes(similarQuote.notes);
    setCopied(true);
  }

  function undoCopy() {
    if (beforeCopy.current) {
      setItems(beforeCopy.current.items);
      setNotes(beforeCopy.current.notes);
    }
    beforeCopy.current = null;
    setCopied(false);
  }

  if (shown.length === 0 && !similarQuote) {
    return (
      <Text fontSize={13} color={brand.grafite70}>
        Con le prestazioni nel profilo le aggiungi qui con un tocco.{" "}
        <Link href="/dashboard/profilo#profilo-prestazioni" style={{ color: brand.cianografiaScuro, fontWeight: 700, textDecoration: "underline" }}>
          Aggiungile
        </Link>
      </Text>
    );
  }

  return (
    <YStack gap="3">
      {similarQuote ? (
        copied ? (
          <XStack gap="2" alignItems="center" flexWrap="wrap" role="status">
            <Icon name="check" size={16} color={brand.verificato} />
            <Text fontSize={14} color={brand.grafite}>
              Voci copiate: controlla i prezzi.
            </Text>
            <button type="button" className="quick-undo" onClick={undoCopy} aria-label="Annulla la copia">
              Annulla
            </button>
          </XStack>
        ) : (
          <button type="button" className="quick-last-quote" onClick={copySimilar}>
            <Icon name="rotate-ccw" size={18} color={brand.verificato} />
            <span className="quick-last-quote-text">
              <span className="quick-last-quote-title">Usa il preventivo {whenSent(similarQuote.sentAt)}</span>
              <span className="quick-last-quote-sub">{excerpt(similarQuote.description)}</span>
            </span>
          </button>
        )
      ) : null}

      {shown.length > 0 ? (
        <YStack gap="2">
          <Text id={labelId} fontSize={13} fontWeight="700" color={brand.grafite}>
            Dalle tue prestazioni
          </Text>
          <div className="slot-pills" role="group" aria-labelledby={labelId}>
            {shown.map(({ service, suggested }) => {
              const on = items.some((it) => sameName(it.name, service.name));
              const price = service.priceMinEurCents != null || service.priceMaxEurCents != null ? formatServicePrice(service.priceMinEurCents, service.priceMaxEurCents, service.priceUnit) : null;
              return (
                <button
                  key={service.id}
                  type="button"
                  aria-pressed={on}
                  className={`slot-pill quick-service-pill${on ? " is-on" : ""}${suggested && !on ? " is-suggested" : ""}`}
                  onClick={() => toggleService(service)}
                >
                  <Icon name={on ? "check" : "plus"} size={14} color={on ? "#fff" : brand.verificato} />
                  <span>{service.name}</span>
                  {price ? <span className="quick-service-price">{price}</span> : null}
                  {suggested && !on ? <span className="quick-service-tag">Adatta alla richiesta</span> : null}
                </button>
              );
            })}
          </div>
        </YStack>
      ) : null}
    </YStack>
  );
}
