"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { accountingMonthLabel, freePeriodSummary, subscriptionTierInfo, vatOnEurCents, type MySubscription } from "@professionisti/shared";
import { Button, Text, XStack, YStack, brand } from "@professionisti/ui";
import { apiClient } from "@/lib/apiClient";
import { useAuth } from "@/lib/AuthContext";
import { AmountRow, BigTotal, DocumentPage, LoadingDocument, NoteBox, documentDate, eur } from "../_components/DocumentParts";

const subtitle = (free: { month: number; months: number }) => `Mese gratis ${free.month} di ${free.months}, livello Base.`;

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/**
 * Riepilogo a 0 € del mese gratuito in corso (decisione dell'utente del
 * 27/10/2026, docs/CHANGELOG.md §378, anteprima 6): le voci e lo sconto che
 * le porta a zero. Non è una fattura.
 */
export default function FreeMonthPage() {
  const { token } = useAuth();
  const [sub, setSub] = useState<MySubscription | null | undefined>(undefined);

  useEffect(() => {
    if (!token) return;
    apiClient
      .getMySubscription(token)
      .then(setSub)
      .catch(() => setSub(null));
  }, [token]);

  const back = { href: "/dashboard/abbonamento", label: "Abbonamento" };
  if (sub === undefined) return <LoadingDocument />;
  const now = new Date();
  const free = sub ? freePeriodSummary(sub, now) : null;
  if (!sub || !free) {
    return (
      <DocumentPage back={back} title="Mese gratuito">
        <Text fontSize={16} color={brand.grafite70}>
          Non sei in un mese gratuito: le fatture dell&apos;abbonamento sono in{" "}
          <Link href="/dashboard/documenti" style={{ color: brand.cianografiaScuro, fontWeight: 700 }}>
            Fatture e documenti
          </Link>
          .
        </Text>
      </DocumentPage>
    );
  }

  const base = subscriptionTierInfo("BASE");
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const limit = sub.usage.limit ?? base.monthlyAcceptedJobs;

  return (
    <DocumentPage back={back} title={`${capitalize(accountingMonthLabel(month))}: 0 €`} subtitle={subtitle(free)}>
      <BigTotal label="Da pagare" value={eur(0)} badge={free.label}>
        <Text fontSize={16} color={brand.grafite70}>
          {free.months > 1 ? `Mese ${free.month} di ${free.months}, dal` : "Dal"} {documentDate(free.from)} al {documentDate(new Date(new Date(free.to).getTime() - 1).toISOString())}.
        </Text>
      </BigTotal>

      {free.months > 1 ? (
        <div style={{ display: "grid", gridTemplateColumns: `repeat(${free.months}, 1fr)`, gap: 8 }}>
          {Array.from({ length: free.months }, (_, index) => {
            const n = index + 1;
            const current = n === free.month;
            return (
              <YStack
                key={n}
                alignItems="center"
                paddingVertical="$2"
                borderRadius={10}
                borderWidth={current ? 2 : 1}
                borderColor={current ? brand.cianografiaScuro : brand.filetto}
                backgroundColor={current ? brand.cianografiaVelo : n < free.month ? brand.gesso : brand.calce}
              >
                <Text fontSize={15} fontWeight={current ? "800" : "400"} color={current ? brand.grafite : brand.grafite70}>
                  Mese {n}
                </Text>
                <Text fontSize={13} fontWeight={current ? "800" : "400"} color={current ? brand.grafite : brand.grafite70}>
                  {current ? "In corso" : n < free.month ? "Usato" : "Da fare"}
                </Text>
              </YStack>
            );
          })}
        </div>
      ) : null}

      <YStack>
        <AmountRow
          label={`Abbonamento ${base.label}, mensile`}
          detail={`${base.monthlyAcceptedJobs} lavori al mese${limit ? ` · questo mese ${sub.usage.used} su ${limit}` : ""}`}
          value={eur(free.baseMonthEurCents)}
        />
        <AmountRow label={free.label} detail={free.detail} value={`−${eur(free.baseMonthEurCents)}`} />
        <YStack paddingTop="$2">
          <AmountRow label="Imponibile" value={eur(0)} divider={false} />
          <AmountRow label="IVA 22%" value={eur(0)} divider={false} />
          <YStack borderTopWidth={2} borderColor={brand.grafite} marginTop="$2">
            <AmountRow label="Totale" value={eur(0)} strong large divider={false} />
          </YStack>
        </YStack>
      </YStack>

      <NoteBox>
        <Text fontSize={16} color={brand.grafite}>
          Non è una fattura: non c&apos;è nulla da pagare né da registrare.
          {sub.trialEndsAt
            ? ` Dal ${documentDate(sub.trialEndsAt)}, se vuoi continuare, ${base.label} costa ${eur(base.priceEurCents).replace(",00", "")} + IVA al mese (${eur(base.priceEurCents + vatOnEurCents(base.priceEurCents))}).`
            : ""}
        </Text>
      </NoteBox>

      <div data-print-hide>
        <XStack gap="$3" flexWrap="wrap">
          <Link href="/dashboard/abbonamento#livelli" style={{ textDecoration: "none" }}>
            <Button tabIndex={-1} variant="secondary">Vedi i livelli</Button>
          </Link>
        </XStack>
      </div>
    </DocumentPage>
  );
}
