"use client";

import { Icon, Text, XStack, YStack, brand } from "@professionisti/ui";

const selectStyle = {
  padding: "8px 10px",
  borderRadius: 4,
  border: `1px solid ${brand.filetto}`,
  fontSize: 13,
  fontFamily: "inherit",
  backgroundColor: brand.calce,
  color: brand.grafite,
};

/** Chiavi di ordinamento condivise dalle quattro liste (richieste esplicite dell'utente). */
export type ListSortKey = "createdAt" | "updatedAt" | "scheduledAt";

export const SORT_LABELS: Record<ListSortKey, string> = {
  createdAt: "Data di ricezione",
  updatedAt: "Ultimo aggiornamento",
  scheduledAt: "Data di intervento",
};

export const PAGE_SIZE_OPTIONS = [5, 10, 20] as const;

/**
 * Ordinamento condiviso dalle quattro liste: "scheduledAt" (quando
 * applicabile, es. prenotazioni) è cronologico ascendente — il prossimo
 * intervento in cima è più utile del più lontano, stesso principio già
 * seguito in ProfessionalsService.getMyBookings. "createdAt"/"updatedAt"
 * restano invece discendenti (il più recente in cima), la lettura naturale
 * per "cosa è successo per ultimo".
 */
export function sortListItems<T>(
  items: T[],
  key: ListSortKey,
  getters: { createdAt: (item: T) => string; updatedAt: (item: T) => string; scheduledAt?: (item: T) => string | null },
): T[] {
  const sorted = [...items];
  sorted.sort((a, b) => {
    if (key === "scheduledAt" && getters.scheduledAt) {
      const aDate = getters.scheduledAt(a);
      const bDate = getters.scheduledAt(b);
      if (aDate && bDate) return new Date(aDate).getTime() - new Date(bDate).getTime();
      if (aDate) return -1;
      if (bDate) return 1;
      return 0;
    }
    const aDate = key === "createdAt" ? getters.createdAt(a) : getters.updatedAt(a);
    const bDate = key === "createdAt" ? getters.createdAt(b) : getters.updatedAt(b);
    return new Date(bDate).getTime() - new Date(aDate).getTime();
  });
  return sorted;
}

function ControlLabel({ children }: { children: string }) {
  return (
    <Text fontFamily="$body" fontSize={10} fontWeight="700" color={brand.grafite70}>
      {children}
    </Text>
  );
}

/**
 * Barra filtri/ordinamento/quantità condivisa dalle quattro liste (Richieste
 * ricevute, Lavori accettati lato professionista; Le mie richieste, Lavori
 * accettati lato cliente) — richiesta esplicita dell'utente: filtro per
 * stato, ordinamento (per data di ricezione/intervento/ultimo aggiornamento),
 * e quantità visibile (5/10/20, default 5). Tutto calcolato client-side: alla
 * scala attesa (CLAUDE.md §7, lancio in 1 città) le liste sono già
 * interamente scaricate, non serve introdurre parametri di query lato
 * server per un filtro che opera su poche decine di righe al massimo.
 */
export function ListControls<S extends string>({
  statusValue,
  statusOptions,
  onStatusChange,
  sortValue,
  sortOptions,
  onSortChange,
  pageSize,
  onPageSizeChange,
}: {
  statusValue: S;
  statusOptions: { value: S; label: string }[];
  onStatusChange: (value: S) => void;
  sortValue: ListSortKey;
  sortOptions: ListSortKey[];
  onSortChange: (value: ListSortKey) => void;
  pageSize: number;
  onPageSizeChange: (value: number) => void;
}) {
  return (
    <XStack flexWrap="wrap" gap="$4" alignItems="flex-end">
      <YStack gap="$1">
        <ControlLabel>Filtra</ControlLabel>
        <select value={statusValue} onChange={(e) => onStatusChange(e.target.value as S)} style={selectStyle}>
          {statusOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </YStack>

      <YStack gap="$1">
        <ControlLabel>Ordina per</ControlLabel>
        <select value={sortValue} onChange={(e) => onSortChange(e.target.value as ListSortKey)} style={selectStyle}>
          {sortOptions.map((key) => (
            <option key={key} value={key}>
              {SORT_LABELS[key]}
            </option>
          ))}
        </select>
      </YStack>

      <YStack gap="$1">
        <ControlLabel>Mostra</ControlLabel>
        <select value={pageSize} onChange={(e) => onPageSizeChange(Number(e.target.value))} style={selectStyle}>
          {PAGE_SIZE_OPTIONS.map((size) => (
            <option key={size} value={size}>
              {size}
            </option>
          ))}
        </select>
      </YStack>
    </XStack>
  );
}

/**
 * Pagine selezionabili sotto una lista quando ce ne sono più di una a
 * quantità "Mostra" corrente — richiesta esplicita dell'utente: "su mostra
 * ad esempio 5, se ce ne sono di più ad esempio andranno in altre pagine
 * selezionabili" (prima gli elementi oltre la quantità scelta sparivano
 * semplicemente, senza modo di raggiungerli). `null` quando c'è una sola
 * pagina, per non occupare spazio con un controllo inutile.
 */
export function Pagination({ page, totalPages, onPageChange }: { page: number; totalPages: number; onPageChange: (page: number) => void }) {
  if (totalPages <= 1) return null;
  const pages = Array.from({ length: totalPages }, (_, i) => i + 1);

  return (
    <XStack gap="$1" alignItems="center" flexWrap="wrap">
      <XStack
        width={28}
        height={28}
        borderRadius="$2"
        borderWidth={1}
        borderColor={brand.filetto}
        alignItems="center"
        justifyContent="center"
        opacity={page === 1 ? 0.4 : 1}
        cursor={page === 1 ? "default" : "pointer"}
        onPress={() => page > 1 && onPageChange(page - 1)}
        accessibilityRole="button"
        accessibilityLabel="Pagina precedente"
      >
        <Icon name="chevron-left" size={14} color={brand.grafite} />
      </XStack>
      {pages.map((p) => (
        <XStack
          key={p}
          width={28}
          height={28}
          borderRadius="$2"
          alignItems="center"
          justifyContent="center"
          borderWidth={1}
          borderColor={p === page ? brand.cianografia : brand.filetto}
          backgroundColor={p === page ? brand.cianografiaVelo : "transparent"}
          cursor="pointer"
          onPress={() => onPageChange(p)}
          accessibilityRole="button"
          accessibilityLabel={`Pagina ${p}`}
        >
          <Text fontSize="$2" fontWeight={p === page ? "700" : "400"} color={p === page ? brand.cianografia : brand.grafite70}>
            {p}
          </Text>
        </XStack>
      ))}
      <XStack
        width={28}
        height={28}
        borderRadius="$2"
        borderWidth={1}
        borderColor={brand.filetto}
        alignItems="center"
        justifyContent="center"
        opacity={page === totalPages ? 0.4 : 1}
        cursor={page === totalPages ? "default" : "pointer"}
        onPress={() => page < totalPages && onPageChange(page + 1)}
        accessibilityRole="button"
        accessibilityLabel="Pagina successiva"
      >
        <Icon name="chevron-right" size={14} color={brand.grafite} />
      </XStack>
    </XStack>
  );
}
