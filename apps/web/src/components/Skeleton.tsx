"use client";

import { brand, radiusDoc, XStack, YStack } from "@professionisti/ui";

/**
 * Stati "a scheletro" (richiesta esplicita dell'utente: "rendi più
 * innovativa la homepage/il sito", scelto tra le proposte come miglioria
 * a basso rischio) — sostituiscono `<LoadingState />` (il testo pulsante
 * "Caricamento...") nelle liste/tessere dove è facile anticipare la forma
 * reale del contenuto: righe compatte, card di richieste/professionisti,
 * tabelle admin, tessere KPI. `LoadingState` resta in uso dove il
 * contenuto in arrivo non ha una forma prevedibile (es. un singolo
 * messaggio di errore, un pulsante che aspetta un salvataggio) — sostituire
 * anche lì un pulsare generico con un rettangolo sagomato non aggiungeva
 * nulla.
 *
 * `SkeletonBlock`/`SkeletonCircle` sono i due soli primitivi con lo shimmer
 * vero (`.skeleton-shimmer`, `globals.css`): ogni skeleton composito qui
 * sotto è costruito solo componendo questi due, mai un secondo stile di
 * animazione. Colori dalla palette "Vicinato" (tinta `grafite` diluita,
 * stessa già usata per gli hairline del resto del sito) — mai un grigio
 * generico fuori palette.
 */
export function SkeletonBlock({
  width = "100%",
  height = 14,
  radius = 6,
}: {
  width?: number | string;
  height?: number | string;
  radius?: number;
}) {
  return <div className="skeleton-shimmer" style={{ width, height, borderRadius: radius }} />;
}

export function SkeletonCircle({ size = 40 }: { size?: number }) {
  return <div className="skeleton-shimmer" style={{ width: size, height: size, borderRadius: size / 2, flexShrink: 0 }} />;
}

/**
 * Riga compatta — stessa sagoma di `LeadSummaryRow`/`BookingSummaryRow`
 * (`/dashboard`, CLAUDE.md §85): card bianca, filetto colorato a sinistra
 * (qui neutro, non essendoci ancora uno stato reale da colorare), due
 * righe di testo + una pillola a destra.
 */
export function SkeletonSummaryRow() {
  return (
    <XStack
      alignItems="center"
      gap="$2"
      backgroundColor={brand.calce}
      borderRadius="$3"
      borderLeftWidth={3}
      borderLeftColor={brand.filetto}
      padding="$3"
    >
      <YStack flex={1} minWidth={200} gap="$2">
        <SkeletonBlock width="45%" height={14} />
        <SkeletonBlock width="65%" height={12} />
      </YStack>
      <SkeletonBlock width={72} height={22} radius={11} />
    </XStack>
  );
}

/**
 * Riga di conversazione — stessa sagoma di `ChatThreadRow` (`/chat`):
 * avatar circolare + due righe di testo + un blocco piccolo a destra
 * (orario).
 */
export function SkeletonThreadRow({ zebra = false }: { zebra?: boolean }) {
  return (
    <XStack alignItems="center" gap="$3" paddingHorizontal="$3" paddingVertical="$3" backgroundColor={zebra ? brand.gesso : "transparent"}>
      <SkeletonCircle size={48} />
      <YStack flex={1} minWidth={0} gap="$2">
        <SkeletonBlock width="40%" height={13} />
        <SkeletonBlock width="70%" height={12} />
      </YStack>
      <SkeletonBlock width={36} height={11} />
    </XStack>
  );
}

/**
 * Card professionista — stessa sagoma di `ProfessionalCard` (usata in
 * `/professionisti-salvati`): avatar grande a sinistra, nome/categoria/
 * città/rating a destra, una riga di prestazioni sotto.
 */
export function SkeletonProfessionalCard() {
  return (
    <XStack alignItems="center" gap="$4" backgroundColor={brand.calce} borderRadius={radiusDoc} padding="$4">
      <SkeletonCircle size={72} />
      <YStack flex={1} minWidth={0} gap="$2">
        <SkeletonBlock width="55%" height={18} />
        <SkeletonBlock width="35%" height={13} />
        <XStack gap="$2" marginTop="$1">
          <SkeletonBlock width={90} height={20} radius={10} />
          <SkeletonBlock width={70} height={20} radius={10} />
        </XStack>
      </YStack>
    </XStack>
  );
}

/**
 * Card richiesta/preventivo — stessa sagoma della card collassata di
 * `RequestCard`/`GuidedRequestCard` (`/dashboard/richieste`,
 * `/le-mie-richieste`): pillola di stadio + badge modalità in alto,
 * nome/categoria, descrizione su due righe.
 */
export function SkeletonRequestCard() {
  return (
    <YStack backgroundColor={brand.calce} borderRadius={radiusDoc} padding="$4" gap="$3">
      <XStack alignItems="center" gap="$2" flexWrap="wrap">
        <SkeletonBlock width={92} height={22} radius={11} />
        <SkeletonBlock width={64} height={22} radius={11} />
      </XStack>
      <SkeletonBlock width="50%" height={17} />
      <SkeletonBlock width="30%" height={13} />
      <YStack gap="$1">
        <SkeletonBlock width="90%" height={12} />
        <SkeletonBlock width="60%" height={12} />
      </YStack>
    </YStack>
  );
}

/** N card richiesta in colonna — scorciatoia per i punti che ne mostrano 3. */
export function SkeletonRequestList({ count = 3 }: { count?: number }) {
  return (
    <YStack gap="$3">
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonRequestCard key={i} />
      ))}
    </YStack>
  );
}

/**
 * Tessera KPI — stessa sagoma di `StatTile` (`RevenueAnalyticsPanel.tsx`,
 * dentro `.stats-kpi-grid`): etichetta piccola, valore grande, sottotitolo.
 */
export function SkeletonStatTile() {
  return (
    <YStack backgroundColor={brand.calce} borderRadius={radiusDoc} padding="$4" gap="$2">
      <SkeletonBlock width="60%" height={12} />
      <SkeletonBlock width="45%" height={26} />
      <SkeletonBlock width="70%" height={12} />
    </YStack>
  );
}

/**
 * Pannello "Statistiche" intero (4 tessere KPI + grafico) — stessa sagoma
 * di `RevenueAnalyticsPanel`, riusata identica da `/dashboard/statistiche`
 * e `/admin/statistiche` (CLAUDE.md §99/§103).
 */
export function SkeletonRevenuePanel() {
  return (
    <>
      <div className="stats-kpi-grid">
        <SkeletonStatTile />
        <SkeletonStatTile />
        <SkeletonStatTile />
        <SkeletonStatTile />
      </div>
      <YStack backgroundColor={brand.calce} borderRadius={radiusDoc} padding="$5" gap="$4" marginTop="$4">
        <XStack justifyContent="space-between" alignItems="flex-start" flexWrap="wrap" gap="$3">
          <YStack gap="$2" flexBasis={0} flexGrow={1} minWidth={220}>
            <SkeletonBlock width="55%" height={17} />
            <SkeletonBlock width="75%" height={12} />
          </YStack>
          <SkeletonBlock width={220} height={38} radius={19} />
        </XStack>
        <SkeletonBlock width="100%" height={220} radius={12} />
      </YStack>
    </>
  );
}

/**
 * Righe di tabella admin — stessa sagoma di `.admin-table` (`globals.css`,
 * CLAUDE.md §57): un blocco per cella, larghezza proporzionata alla
 * colonna per non farle sembrare tutte uguali.
 */
export function SkeletonTableRows({ rows = 4, cols = 3 }: { rows?: number; cols?: number }) {
  return (
    <div className="admin-table-wrap">
      <table className="admin-table">
        <tbody>
          {Array.from({ length: rows }).map((_, r) => (
            <tr key={r}>
              {Array.from({ length: cols }).map((_, c) => (
                <td key={c}>
                  <SkeletonBlock width={c === 0 ? "80%" : "55%"} height={13} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
