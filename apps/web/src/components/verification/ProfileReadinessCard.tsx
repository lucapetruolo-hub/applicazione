"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { MyVerificationStatus } from "@professionisti/shared";
import { Button, Icon, Surface, Text, XStack, YStack, brand, type IconName } from "@professionisti/ui";
import { apiClient } from "@/lib/apiClient";

type Item = { icon: IconName; ok: boolean; okText: string; todoText: string; action: { href: string; label: string } };

/** Le tre cose che il profilo deve poter fare, in ordine: farsi trovare, rispondere, incassare online. */
export function profileReadinessItems(status: MyVerificationStatus, stripeVerified: boolean): Item[] {
  return [
    {
      icon: "search",
      ok: status.publicVisible,
      okText: "Compari nelle ricerche",
      todoText: "Non compari nelle ricerche",
      action: { href: "/dashboard/fiscale", label: status.fiscalDataComplete ? "Correggi i dati fiscali" : "Completa i dati fiscali" },
    },
    {
      icon: "file-text",
      ok: status.canSendQuotes,
      okText: "Puoi rispondere alle richieste",
      todoText: "Non puoi rispondere alle richieste di preventivo",
      action: { href: "/dashboard/verifica-identita", label: "Verifica la tua identità" },
    },
    {
      icon: "credit-card",
      ok: stripeVerified,
      okText: "Ricevi pagamenti online",
      todoText: "Non puoi ricevere pagamenti online",
      action: { href: "/dashboard/fiscale", label: "Attiva i pagamenti online" },
    },
  ];
}

/**
 * "Completa il profilo" in Oggi (richiesta dell'utente, docs/CHANGELOG.md
 * §259): a che punto è, cosa non può ancora fare e il prossimo passo. Sparisce
 * quando è tutto fatto.
 */
export function ProfileReadinessCard({ token }: { token: string }) {
  const [status, setStatus] = useState<MyVerificationStatus | null>(null);
  const [stripeVerified, setStripeVerified] = useState<boolean | null>(null);

  useEffect(() => {
    apiClient
      .myVerificationStatus(token)
      .then(setStatus)
      .catch(() => setStatus(null));
    apiClient
      .getMyProfessionalProfile(token)
      .then((profile) => setStripeVerified(profile?.stripeVerified ?? false))
      .catch(() => setStripeVerified(null));
  }, [token]);

  if (!status || stripeVerified === null) return null;
  const items = profileReadinessItems(status, stripeVerified);
  const done = items.filter((item) => item.ok).length;
  if (done === items.length) return null;
  const next = items.find((item) => !item.ok)!;

  return (
    <Surface gap="$4" role="status" aria-label="Completa il profilo">
      <YStack gap="$2">
        <XStack alignItems="baseline" justifyContent="space-between" gap="$3" flexWrap="wrap">
          <Text fontFamily="$heading" fontWeight="800" fontSize="$6" color={brand.grafite}>
            Completa il profilo
          </Text>
          <Text fontSize={13} fontWeight="700" color={brand.grafite70}>
            {done} di {items.length} fatto
          </Text>
        </XStack>
        <div className="readiness-bar" aria-hidden="true">
          <span style={{ width: `${(done / items.length) * 100}%` }} />
        </div>
      </YStack>

      <YStack tag="ul" margin={0} padding={0} gap="$3">
        {items.map((item) => (
          <XStack tag="li" key={item.icon} gap="$3" alignItems="center" style={{ listStyle: "none" }}>
            <YStack
              width={36}
              height={36}
              borderRadius={999}
              alignItems="center"
              justifyContent="center"
              flexShrink={0}
              backgroundColor={item.ok ? brand.cianografiaVelo : brand.ottoneVelo}
              aria-hidden
            >
              <Icon name={item.ok ? "check" : item.icon} size={17} strokeWidth={2.2} color={item.ok ? brand.verificato : "#8A6416"} />
            </YStack>
            <YStack flex={1} minWidth={0} gap={2}>
              <Text fontWeight="700" color={item.ok ? brand.grafite70 : brand.grafite}>
                {item.ok ? item.okText : item.todoText}
              </Text>
              {!item.ok && item !== next ? (
                <Link href={item.action.href} style={{ color: brand.cianografiaScuro, fontWeight: 700, fontSize: 14, textDecoration: "none" }}>
                  {item.action.label} →
                </Link>
              ) : null}
            </YStack>
          </XStack>
        ))}
      </YStack>

      <Link href={next.action.href} style={{ textDecoration: "none", alignSelf: "flex-start" }}>
        <Button variant="primary">{next.action.label}</Button>
      </Link>
    </Surface>
  );
}
