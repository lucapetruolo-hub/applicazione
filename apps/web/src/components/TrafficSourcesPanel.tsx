"use client";

import type { AdminTrafficSources } from "@professionisti/api-client";
import { TRAFFIC_SOURCE_LABELS } from "@professionisti/shared";
import { Surface, Text, XStack, YStack, brand } from "@professionisti/ui";

/**
 * "Da dove arrivano le richieste" (docs/CHANGELOG.md §291, strategia SEO):
 * richieste di preventivo degli ultimi 30 giorni per provenienza della
 * visita. Google in evidenza perché è la misura che conta per la SEO.
 */
export function TrafficSourcesPanel({ data }: { data: AdminTrafficSources }) {
  const max = Math.max(1, ...data.bySource.map((row) => row.count));
  const rows = data.bySource.filter((row) => row.source !== "unknown" || row.count > 0);

  return (
    <Surface padding="$5" gap="$4">
      <YStack gap="$1">
        <Text fontWeight="700" fontSize={17}>
          Da dove arrivano le richieste
        </Text>
        <Text fontSize={12} color={brand.grafite70}>
          Richieste di preventivo degli ultimi {data.days} giorni: {data.total}. Una richiesta a più categorie conta una volta.
        </Text>
      </YStack>
      <YStack gap="$3">
        {rows.map((row) => {
          const label = row.source === "unknown" ? "Non registrata" : TRAFFIC_SOURCE_LABELS[row.source];
          const percent = data.total > 0 ? Math.round((row.count / data.total) * 100) : 0;
          return (
            <YStack key={row.source} gap={6}>
              <XStack justifyContent="space-between" gap="$3">
                <Text fontSize={13.5} fontWeight={row.source === "GOOGLE" ? "700" : "500"}>
                  {label}
                </Text>
                <Text fontSize={13.5} color={brand.grafite70}>
                  {row.count} · {percent}%
                </Text>
              </XStack>
              <div className="traffic-bar" aria-hidden="true">
                <div
                  className={row.source === "GOOGLE" ? "traffic-bar-fill traffic-bar-fill--google" : "traffic-bar-fill"}
                  style={{ width: `${(row.count / max) * 100}%` }}
                />
              </div>
            </YStack>
          );
        })}
      </YStack>
    </Surface>
  );
}
