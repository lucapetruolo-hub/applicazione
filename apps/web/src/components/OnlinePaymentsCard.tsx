"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { formatEurCents, ONLINE_APP_FEE_PERCENT, onlineFeeExample } from "@professionisti/shared";
import { Badge, Button, Icon, Text, XStack, YStack, brand } from "@professionisti/ui";
import { PayoutSummary } from "@/components/PayoutSummary";

/**
 * Pagamenti online in fondo a Dati fiscali e pagamenti (docs/CHANGELOG.md
 * §249, richiesta dell'utente: "non appesantire la pagina"). Finché non sono
 * attivi è solo un banner con una frase e un pulsante; dopo l'attivazione
 * mostra lo stato, i totali dei bonifici e l'accesso a Stripe. `children`
 * compare solo a pagamenti attivi (es. il conto bancario dei bonifici).
 * `step` è il passo prima di Stripe (l'IBAN, §250): aperto da "Attiva",
 * prende il posto del pulsante dentro lo stesso banner. Prima di attivare,
 * il costo con un esempio in euro (§372).
 */

const EXAMPLE = onlineFeeExample();
export function OnlinePaymentsCard({
  active,
  started,
  requirements,
  loading,
  error,
  onActivate,
  onOpenStripe,
  children,
  step,
}: {
  /** Stripe ha attivato i pagamenti del professionista. */
  active: boolean;
  /** Ha già iniziato la verifica su Stripe (conto creato). */
  started: boolean;
  /** Cosa chiede ancora Stripe, in parole sue. */
  requirements?: string | null;
  loading: boolean;
  error?: string | null;
  onActivate: () => void;
  onOpenStripe: () => void;
  children?: ReactNode;
  step?: ReactNode;
}) {
  if (!active) {
    return (
      <YStack gap="$3" padding="$4" borderRadius="$4" backgroundColor={brand.cianografiaVelo}>
      <YStack gap="$3" $gtXs={{ flexDirection: "row", alignItems: "center" }}>
        <XStack gap="$3" flex={1} alignItems="flex-start">
          <YStack width={40} height={40} borderRadius={20} backgroundColor={brand.calce} alignItems="center" justifyContent="center" flexShrink={0}>
            <Icon name="credit-card" size={20} strokeWidth={2.2} color={brand.cianografiaScuro} />
          </YStack>
          <YStack flex={1} gap={2}>
            <Text fontSize={16} fontWeight="700" color={brand.grafite}>
              {started ? "Completa l'attivazione dei pagamenti online" : "Attiva i pagamenti online"}
            </Text>
            <Text fontSize={16} color={brand.grafite70}>
              {started && requirements ? `Stripe ti chiede ancora: ${requirements}` : "Fatti pagare un acconto online prima ancora di iniziare il lavoro."}{" "}
              <Link href="/per-professionisti/pagamenti" style={{ color: brand.cianografiaScuro, fontWeight: 600, whiteSpace: "nowrap" }}>
                Scopri di più
              </Link>
            </Text>
            <Text fontSize={13} color={brand.grafite70}>
              Costo: {ONLINE_APP_FEE_PERCENT}% + IVA, commissioni Stripe comprese. Su {formatEurCents(EXAMPLE.amountEurCents)} ti arrivano{" "}
              {formatEurCents(EXAMPLE.netEurCents)}.
            </Text>
            {error ? (
              <Text fontSize={16} color={brand.urgenza} role="alert">
                {error}
              </Text>
            ) : null}
          </YStack>
        </XStack>
        {step ? null : (
          <Button variant="primary" onPress={onActivate} disabled={loading} width="100%" $gtXs={{ width: "auto" }}>
            {loading ? "Attendere..." : started ? "Continua" : "Attiva"}
          </Button>
        )}
      </YStack>
      {step ? (
        <YStack padding="$4" borderRadius="$3" backgroundColor={brand.calce}>
          {step}
        </YStack>
      ) : null}
      </YStack>
    );
  }

  return (
    <YStack gap="$3" padding="$4" borderRadius="$4" borderWidth={1} borderColor={brand.filetto} backgroundColor={brand.calce}>
      <XStack gap="$2" alignItems="center" justifyContent="space-between" flexWrap="wrap">
        <Text fontSize={16} fontWeight="700" color={brand.grafite}>
          Pagamenti online
        </Text>
        <Badge variant="verificato">Attivi</Badge>
      </XStack>
      <PayoutSummary />
      {children}
      <XStack gap="$3" alignItems="center" flexWrap="wrap">
        <Button variant="secondary" onPress={onOpenStripe} disabled={loading}>
          {loading ? "Attendere..." : "Apri il conto Stripe"}
        </Button>
        <Link href="/per-professionisti/pagamenti" style={{ color: brand.cianografiaScuro, fontWeight: 600, fontSize: 16 }}>
          Come funziona
        </Link>
      </XStack>
      {error ? (
        <Text fontSize={16} color={brand.urgenza} role="alert">
          {error}
        </Text>
      ) : null}
    </YStack>
  );
}
