"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { Button, Text, XStack, YStack, brand, radiusDoc } from "@professionisti/ui";
import { accountingDateLabel, formatEurCents, type InvoiceParty } from "@professionisti/shared";
import { downloadBlobFile } from "@/components/admin/adminUi";

/**
 * Pezzi comuni delle pagine di "Fatture e documenti" (docs/CHANGELOG.md
 * §374), come nelle anteprime approvate: titolo, scheda bianca, righe con
 * l'importo a destra, riquadri "Da" e "Per". Il PDF lo prepara il server
 * (§375); stampando la pagina esce solo `.print-document`, senza menu né
 * pulsanti (globals.css).
 */
export function DocumentPage({ back, title, subtitle, children }: { back: { href: string; label: string }; title: string; subtitle?: string | null; children: ReactNode }) {
  return (
    <YStack width="100%" alignItems="center" paddingVertical="$6" paddingHorizontal="$4">
      <YStack width="100%" maxWidth={760} gap="$3">
        <span data-print-hide>
          <Link href={back.href} style={{ color: brand.cianografiaScuro, fontWeight: 700, fontSize: 16, textDecoration: "none" }}>
            ← {back.label}
          </Link>
        </span>
        <div className="print-document">
          <YStack gap="$1" marginBottom="$4">
            <Text tag="h1" fontFamily="$heading" fontSize={30} fontWeight="800" color={brand.grafite}>
              {title}
            </Text>
            {subtitle ? (
              <Text fontSize={16} color={brand.grafite70}>
                {subtitle}
              </Text>
            ) : null}
          </YStack>
          <YStack backgroundColor={brand.calce} borderRadius={radiusDoc} borderWidth={1} borderColor={brand.filetto} padding="$5" gap="$4">
            {children}
          </YStack>
        </div>
      </YStack>
    </YStack>
  );
}

export function eur(cents: number): string {
  return formatEurCents(cents);
}

/** Il totale grande in cima, con l'etichetta e un bollino a destra. */
export function BigTotal({ label, value, badge, children }: { label: string; value: string; badge?: string | null; children?: ReactNode }) {
  return (
    <YStack gap="$2">
      <XStack justifyContent="space-between" alignItems="flex-start" gap="$3" flexWrap="wrap">
        <Text fontSize={13} fontWeight="800" color={brand.grafite70} textTransform="uppercase" letterSpacing={0.5}>
          {label}
        </Text>
        {badge ? (
          <Text fontSize={13} fontWeight="800" color={brand.cianografiaScuro} backgroundColor={brand.cianografiaVelo} paddingHorizontal="$2" paddingVertical={4} borderRadius={10}>
            {badge}
          </Text>
        ) : null}
      </XStack>
      <Text fontFamily="$heading" fontSize={40} fontWeight="800" color={brand.grafite} fontVariant={["tabular-nums"]}>
        {value}
      </Text>
      {children}
    </YStack>
  );
}

/** "Da" e "Per": chi emette e chi riceve. */
export function PartyBoxes({ from, to, fromLabel = "Da", toLabel = "Per" }: { from: InvoiceParty; to: InvoiceParty; fromLabel?: string; toLabel?: string }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12 }}>
      {[
        { label: fromLabel, party: from },
        { label: toLabel, party: to },
      ].map(({ label, party }) => (
        <YStack key={label} backgroundColor={brand.gesso} borderRadius={10} padding="$3" gap={2}>
          <Text fontSize={13} fontWeight="800" color={brand.grafite70} textTransform="uppercase" letterSpacing={0.5}>
            {label}
          </Text>
          <Text fontSize={16} fontWeight="800" color={brand.grafite}>
            {party.name || "—"}
          </Text>
          {party.lines.map((line) => (
            <Text key={line} fontSize={15} color={brand.grafite} userSelect="text">
              {line}
            </Text>
          ))}
        </YStack>
      ))}
    </div>
  );
}

/** Una riga con l'importo a destra; `strong` per i totali. */
export function AmountRow({ label, detail, value, strong, large, divider = true }: { label: ReactNode; detail?: ReactNode; value: string; strong?: boolean; large?: boolean; divider?: boolean }) {
  return (
    <XStack
      justifyContent="space-between"
      alignItems="flex-start"
      gap="$3"
      paddingVertical="$2"
      borderBottomWidth={divider ? 1 : 0}
      borderColor={brand.filetto}
    >
      <YStack flex={1} minWidth={0} gap={2}>
        <Text fontSize={large ? 20 : 16} fontWeight={strong ? "800" : "400"} color={brand.grafite}>
          {label}
        </Text>
        {detail ? (
          <Text fontSize={13} color={brand.grafite70}>
            {detail}
          </Text>
        ) : null}
      </YStack>
      <Text fontSize={large ? 20 : 16} fontWeight="800" color={brand.grafite} fontVariant={["tabular-nums"]} flexShrink={0}>
        {value}
      </Text>
    </XStack>
  );
}

/** Titolo di un gruppo di righe (il lavoro) con un dato a destra. */
export function GroupHeading({ title, aside }: { title: string; aside?: string | null }) {
  return (
    <XStack justifyContent="space-between" alignItems="baseline" gap="$3" flexWrap="wrap" paddingTop="$2">
      <Text fontSize={16} fontWeight="800" color={brand.grafite} flex={1} minWidth={0}>
        {title}
      </Text>
      {aside ? (
        <Text fontSize={15} color={brand.grafite70}>
          {aside}
        </Text>
      ) : null}
    </XStack>
  );
}

/** Riquadro verde (spiegazione) o sabbia (attenzione). */
export function NoteBox({ children, tone = "green" }: { children: ReactNode; tone?: "green" | "sand" }) {
  return (
    <YStack backgroundColor={tone === "green" ? brand.cianografiaVelo : brand.ottoneVelo} borderRadius={10} padding="$3" gap="$2">
      {children}
    </YStack>
  );
}

export function LoadingDocument() {
  return (
    <YStack width="100%" alignItems="center" paddingVertical="$6" paddingHorizontal="$4" aria-busy>
      <YStack width="100%" maxWidth={760} gap="$3">
        <YStack height={40} width="60%" borderRadius="$3" backgroundColor={brand.gesso} />
        <YStack height={320} borderRadius={radiusDoc} backgroundColor={brand.gesso} />
      </YStack>
    </YStack>
  );
}

export const documentDate = accountingDateLabel;

/**
 * "Scarica PDF": il file lo prepara il nostro server (docs/CHANGELOG.md
 * §375), uguale su telefono e computer. `before` gira prima (es. salvare il
 * numero della fattura).
 */
export function PdfButton({ load, fileName, label = "Scarica PDF", variant, before }: { load: () => Promise<Blob>; fileName: string; label?: string; variant?: "secondary"; before?: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function download() {
    setBusy(true);
    setError(null);
    try {
      await before?.();
      downloadBlobFile(fileName, await load());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Non riusciamo a preparare il PDF: riprova tra poco.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <YStack gap="$2">
      <Button alignSelf="flex-start" variant={variant ?? "primary"} disabled={busy} onPress={() => void download()}>
        {busy ? "Preparo il PDF…" : label}
      </Button>
      {error ? (
        <Text fontSize={16} color={brand.urgenza} role="alert">
          {error}
        </Text>
      ) : null}
    </YStack>
  );
}
