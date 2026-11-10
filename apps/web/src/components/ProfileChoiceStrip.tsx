"use client";

import { useEffect, useState } from "react";
import { LIMIT_NOTICE_MS, chosenLimitText } from "@/lib/useChosenPros";
import Link from "next/link";
import { ArrowLeft, Check, Plus } from "lucide-react";
import { MAX_CHOSEN_PROFESSIONALS } from "@professionisti/shared";
import { Text, XStack, brand } from "@professionisti/ui";
import type { ChosenPro } from "./ChosenProsBar";
import { readChosenSearch, toggleChosenPro, writeChosenSearch, type ChosenSearch } from "@/lib/chosenProsStore";

/**
 * Profilo aperto dai risultati con "Scegli" (docs/changelog/2026-11-03-scelti-restano.md):
 * la scelta salvata nella scheda del browser, letta dopo il montaggio perché
 * nel render del server non c'è. `null` se non si arriva da lì.
 */
export function useProfileChoice(enabled: boolean, pro: ChosenPro) {
  const [search, setSearch] = useState<ChosenSearch | null>(null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (enabled) setSearch(readChosenSearch());
  }, [enabled]);
  function toggle() {
    if (!search) return;
    const next = { ...search, chosen: toggleChosenPro(search.chosen, pro) };
    writeChosenSearch(next);
    setSearch(next);
  }
  return { search, toggle };
}

/** "Torna ai risultati" e lo stesso "Scegli" delle schede, in cima al profilo. */
export function ProfileChoiceStrip({ search, pro, onToggle }: { search: ChosenSearch; pro: ChosenPro; onToggle: () => void }) {
  const selected = search.chosen.some((item) => item.id === pro.id);
  const blocked = !selected && search.chosen.length >= MAX_CHOSEN_PROFESSIONALS;
  // Avviso al tocco oltre il massimo, visibile anche da telefono.
  const [limitShown, setLimitShown] = useState(false);
  useEffect(() => {
    if (!limitShown) return;
    const timer = setTimeout(() => setLimitShown(false), LIMIT_NOTICE_MS);
    return () => clearTimeout(timer);
  }, [limitShown]);
  return (
    <XStack alignItems="center" justifyContent="space-between" gap="3" flexWrap="wrap">
      <Link href={search.url} style={{ textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 6, minHeight: 44 }}>
        <ArrowLeft size={18} color={brand.cianografiaScuro} aria-hidden />
        <Text fontSize={15} fontWeight="600" color={brand.cianografiaScuro}>
          Torna ai risultati
        </Text>
      </Link>
      <XStack alignItems="center" gap="3">
        {search.chosen.length > 0 ? (
          <Text fontSize={14} color={brand.grafite70} aria-live="polite">
            {limitShown ? chosenLimitText() : `${search.chosen.length === 1 ? "1 scelto" : `${search.chosen.length} scelti`} su ${MAX_CHOSEN_PROFESSIONALS}`}
          </Text>
        ) : null}
        <button
          type="button"
          className="choose-toggle"
          data-selected={selected ? "true" : undefined}
          aria-pressed={selected}
          aria-disabled={blocked || undefined}
          aria-label={selected ? `Scelto: ${pro.businessName}` : `Scegli ${pro.businessName}`}
          title={blocked ? `Puoi sceglierne al massimo ${MAX_CHOSEN_PROFESSIONALS}` : undefined}
          onClick={() => {
            if (blocked) setLimitShown(true);
            else onToggle();
          }}
        >
          {selected ? <Check size={16} strokeWidth={2.5} aria-hidden /> : <Plus size={16} strokeWidth={2.5} aria-hidden />}
          {selected ? "Scelto" : "Scegli"}
        </button>
      </XStack>
    </XStack>
  );
}
