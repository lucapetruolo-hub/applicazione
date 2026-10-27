"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { formatEurCents, ONLINE_APP_FEE_PERCENT, type ProfessionalPayoutTotals } from "@professionisti/shared";
import { Icon, Text, XStack, YStack, brand, type IconName } from "@professionisti/ui";
import { apiClient } from "@/lib/apiClient";
import { useAuth } from "@/lib/AuthContext";

/** Importo esatto di un pagamento, stesso formato di tutto il sito (§349). */
function eur(cents: number): string {
  return formatEurCents(cents);
}

const TILES: Array<{ key: keyof Omit<ProfessionalPayoutTotals, "hasFailed">; label: string; icon: IconName; color: string; bg: string }> = [
  { key: "blockedEurCents", label: "Bloccati", icon: "lock", color: brand.cianografiaScuro, bg: brand.cianografiaVelo },
  { key: "preparingEurCents", label: "Sbloccati", icon: "lock-open", color: brand.cianografiaScuro, bg: brand.cianografiaVelo },
  { key: "sentEurCents", label: "In arrivo in banca", icon: "landmark", color: brand.verificato, bg: "#E6F4EC" },
  { key: "paidEurCents", label: "Arrivati in banca", icon: "check", color: brand.verificato, bg: "#E6F4EC" },
];

/**
 * Riepilogo dei pagamenti online del professionista (docs/CHANGELOG.md
 * §249): quanto è bloccato in attesa della conferma dei clienti, quanto è
 * sbloccato, in arrivo e già arrivato in banca, al netto della trattenuta
 * unica con l'IVA (§378). Non compare finché non ha ricevuto pagamenti online.
 */
export function PayoutSummary() {
  const { token } = useAuth();
  const [totals, setTotals] = useState<ProfessionalPayoutTotals | null>(null);

  useEffect(() => {
    if (!token) return;
    apiClient
      .professionalPayoutSummary(token)
      .then(setTotals)
      .catch(() => setTotals(null));
  }, [token]);

  if (!totals || TILES.every((tile) => totals[tile.key] <= 0)) return null;

  return (
    <YStack gap="$2">
      <XStack flexWrap="wrap" gap="$2">
        {TILES.map((tile) => (
          <YStack
            key={tile.key}
            flexGrow={1}
            flexBasis="40%"
            $gtSm={{ flexBasis: "20%" }}
            minWidth={140}
            gap={6}
            padding="$3"
            borderRadius="$3"
            borderWidth={1}
            borderColor={brand.filetto}
            backgroundColor={brand.calce}
          >
            <XStack gap="$2" alignItems="center">
              <YStack width={24} height={24} borderRadius={20} backgroundColor={tile.bg} alignItems="center" justifyContent="center">
                <Icon name={tile.icon} size={13} strokeWidth={2.4} color={tile.color} />
              </YStack>
              <Text fontSize={13} color={brand.grafite70}>
                {tile.label}
              </Text>
            </XStack>
            <Text fontSize="$5" fontWeight="700" color={totals[tile.key] > 0 ? brand.grafite : brand.grafite70} style={{ fontVariantNumeric: "tabular-nums" }}>
              {eur(totals[tile.key])}
            </Text>
          </YStack>
        ))}
      </XStack>
      {totals.hasFailed ? (
        <Text fontSize={16} color={brand.urgenza} role="alert">
          Un bonifico non è arrivato alla tua banca: controlla il conto bancario su Stripe.
        </Text>
      ) : (
        <Text fontSize={13} color={brand.grafite70}>
          Importi al netto della trattenuta ({ONLINE_APP_FEE_PERCENT}% + IVA), che comprende le commissioni Stripe per il pagamento e per il bonifico.{" "}
          <Link href="/dashboard/documenti" style={{ color: brand.cianografiaScuro, fontWeight: 700 }}>
            Estratto e fatture
          </Link>
        </Text>
      )}
    </YStack>
  );
}
