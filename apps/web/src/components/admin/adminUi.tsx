"use client";

import type { ReactNode } from "react";
import { Text, XStack, YStack, brand } from "@professionisti/ui";

/** Piccoli pezzi condivisi dalle pagine admin (docs/CHANGELOG.md §144). */

export function AdminPageHeader({ title, description, right }: { title: string; description?: string; right?: ReactNode }) {
  return (
    <XStack justifyContent="space-between" alignItems="flex-end" gap="$3" flexWrap="wrap" marginBottom="$4">
      <YStack gap="$1" flexShrink={1}>
        <Text fontFamily="$heading" fontWeight="800" fontSize="$8" color={brand.grafite}>
          {title}
        </Text>
        {description ? <Text color={brand.grafite70}>{description}</Text> : null}
      </YStack>
      {right}
    </XStack>
  );
}

export function AdminCard({ children, highlight }: { children: ReactNode; highlight?: boolean }) {
  return (
    <YStack gap="$2" padding="$4" borderRadius={20} backgroundColor={brand.calce} borderWidth={1} borderColor={highlight ? brand.urgenza : brand.filetto}>
      {children}
    </YStack>
  );
}

export function AdminPill({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "danger" | "ok" | "warn" }) {
  const colors = {
    neutral: { bg: "#F1ECE6", fg: brand.grafite },
    danger: { bg: "#FDE7E9", fg: "#B02A37" },
    ok: { bg: "#E6F4EA", fg: "#1E7B34" },
    // #7A5F00: 5,5:1 sul giallo; #8A6D00 si fermava a 4,4:1 (axe, docs/CHANGELOG.md §395).
    warn: { bg: "#FFF3CD", fg: "#7A5F00" },
  }[tone];
  return (
    <XStack paddingHorizontal={10} paddingVertical={3} borderRadius={999} backgroundColor={colors.bg} alignSelf="flex-start">
      <Text fontSize={12} fontWeight="700" color={colors.fg}>
        {children}
      </Text>
    </XStack>
  );
}

/** Tab semplici basate su pulsanti, per le viste "Da gestire / Archivio". */
export function AdminTabs<T extends string>({ tabs, value, onChange }: { tabs: { key: T; label: string }[]; value: T; onChange: (key: T) => void }) {
  return (
    <XStack gap="$2" flexWrap="wrap" marginBottom="$3">
      {tabs.map((tab) => {
        const active = tab.key === value;
        return (
          <XStack
            key={tab.key}
            paddingHorizontal="$3"
            paddingVertical={8}
            borderRadius={999}
            backgroundColor={active ? brand.cianografia : brand.calce}
            borderWidth={1}
            borderColor={active ? brand.cianografia : brand.filetto}
            cursor="pointer"
            onPress={() => onChange(tab.key)}
            accessibilityRole="button"
            aria-pressed={active}
          >
            {/* Verde come le pillole attive dell'area cliente e professionista (§349). */}
            <Text fontSize={14} fontWeight="700" color={active ? "#ffffff" : brand.grafite}>
              {tab.label}
            </Text>
          </XStack>
        );
      })}
    </XStack>
  );
}

export function formatAdminDate(iso: string | null | undefined, withTime = false): string {
  if (!iso) return "—";
  const date = new Date(iso);
  const day = date.toLocaleDateString("it-IT", { day: "numeric", month: "short", year: "numeric" });
  return withTime ? `${day}, ${date.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}` : day;
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "Errore imprevisto, riprova.";
}

/** Fa scaricare al browser un testo come file (CSV admin). */
export function downloadTextFile(filename: string, content: string, type = "text/csv;charset=utf-8") {
  downloadBlobFile(filename, new Blob([content], { type }));
}

/** Salva un file arrivato dal server (es. i PDF dei documenti, docs/CHANGELOG.md §379). */
export function downloadBlobFile(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Safari legge il file dopo il clic: l'indirizzo resta valido ancora un momento.
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/**
 * Da quando contano i numeri (docs/CHANGELOG.md §395): prima del lancio si
 * vedono anche le prove, dal lancio i numeri ripartono da zero da soli. Una
 * riga sola, con il dettaglio in "Scopri di più".
 */
export function CountingFromNote({ countingFrom, launchDate }: { countingFrom: string | null; launchDate: string | null }) {
  const title = countingFrom
    ? `Numeri dal lancio, ${formatAdminDate(countingFrom)}`
    : launchDate
      ? `Prima del lancio: qui ci sono anche le tue prove. Dal ${formatAdminDate(launchDate)} si riparte da zero.`
      : "Prima del lancio: qui ci sono anche le tue prove. Dal giorno del lancio si riparte da zero.";
  return (
    <div className="counting-from">
      <AdminPill tone={countingFrom ? "ok" : "warn"}>{countingFrom ? "Dati veri" : "Dati di prova"}</AdminPill>
      <Text color={brand.grafite} fontSize={14}>
        {title}
      </Text>
      <details className="counting-from-more">
        <summary>Scopri di più</summary>
        <Text color={brand.grafite70} fontSize={13}>
          Richieste, ricerche, visite e preventivi contano dal giorno del lancio
          (la data impostata come LAUNCH_DATE). I professionisti iscritti prima
          restano contati. Gli account segnati &quot;Account di prova&quot; non
          contano mai. Niente viene cancellato.
        </Text>
      </details>
    </div>
  );
}
