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
    <YStack gap="$2" padding="$4" borderRadius={16} backgroundColor={brand.calce} borderWidth={1} borderColor={highlight ? brand.urgenza : brand.filetto}>
      {children}
    </YStack>
  );
}

export function AdminPill({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "danger" | "ok" | "warn" }) {
  const colors = {
    neutral: { bg: "#F1ECE6", fg: brand.grafite },
    danger: { bg: "#FDE7E9", fg: "#B02A37" },
    ok: { bg: "#E6F4EA", fg: "#1E7B34" },
    warn: { bg: "#FFF3CD", fg: "#8A6D00" },
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
            backgroundColor={active ? brand.grafite : brand.calce}
            borderWidth={1}
            borderColor={active ? brand.grafite : brand.filetto}
            cursor="pointer"
            onPress={() => onChange(tab.key)}
            accessibilityRole="button"
          >
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
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
