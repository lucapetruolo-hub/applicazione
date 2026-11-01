"use client";

import { useCallback, useEffect, useState } from "react";
import { MAX_OFFER_FREE_MONTHS, adminCan, type AdminRoleValue, type AdminSubscriptionOffer } from "@professionisti/shared";
import { Button, Text, XStack, YStack, brand } from "@professionisti/ui";
import { apiClient } from "@/lib/apiClient";
import { AdminCard, AdminPill, errorMessage, formatAdminDate } from "@/components/admin/adminUi";

function monthsLabel(months: number): string {
  return months === 1 ? "1 mese" : `${months} mesi`;
}

/**
 * Offerta dei mesi gratis (decisione di Luca del 29/10/2026,
 * docs/changelog/2026-10-29-offerta-mesi-gratis.md): chi si iscrive mentre è
 * attiva ha quei mesi Base gratis, poi Base mensile sulla carta già data.
 * Accanto, gli iscritti professionisti e clienti per decidere quando
 * fermarla. Fermarla o crearne una nuova solo il super admin; chi è già
 * iscritto tiene sempre i suoi mesi.
 */
export function SubscriptionOfferCard({ token, adminRoles }: { token: string; adminRoles: readonly AdminRoleValue[] }) {
  const [offer, setOffer] = useState<AdminSubscriptionOffer | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmStop, setConfirmStop] = useState(false);
  const [newMonths, setNewMonths] = useState(1);
  const canEdit = adminCan(adminRoles, "SUPER");

  const load = useCallback(() => {
    apiClient
      .adminGetSubscriptionOffer(token)
      .then(setOffer)
      .catch((err) => setError(errorMessage(err)));
  }, [token]);
  useEffect(load, [load]);

  async function run(action: () => Promise<AdminSubscriptionOffer>) {
    setBusy(true);
    setError(null);
    try {
      setOffer(await action());
      setConfirmStop(false);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (!offer) {
    return error ? (
      <AdminCard>
        <Text color={brand.urgenza}>{error}</Text>
      </AdminCard>
    ) : null;
  }

  const { current, signups } = offer;
  const since = current?.startedAt ? ` dal ${formatAdminDate(current.startedAt)}` : "";
  return (
    <AdminCard>
      <XStack justifyContent="space-between" alignItems="center" gap="$2" flexWrap="wrap">
        <Text fontWeight="700" fontSize={18} color={brand.grafite}>
          Offerta mesi gratis
        </Text>
        <AdminPill tone={current ? "ok" : "neutral"}>{current ? `Attiva: ${monthsLabel(current.freeMonths)} Base gratis` : "Ferma"}</AdminPill>
      </XStack>
      <Text color={brand.grafite70}>
        {current
          ? `Chi si iscrive ora ha ${monthsLabel(current.freeMonths)} Base gratis, poi Base a 19 € + IVA al mese. Sul sito resta scritto "primi 100".`
          : "Chi si iscrive ora non ha mesi gratis. Chi era già iscritto tiene i suoi."}
      </Text>

      <XStack gap="$3" flexWrap="wrap">
        {[
          { label: "Professionisti iscritti", total: signups.professionals.total, since: signups.professionals.sinceOffer },
          { label: "Clienti iscritti", total: signups.clients.total, since: signups.clients.sinceOffer },
        ].map((item) => (
          <YStack key={item.label} flex={1} minWidth={180} padding="$3" borderRadius={10} backgroundColor={brand.gesso} gap={2}>
            <Text fontSize={14} color={brand.grafite70}>
              {item.label}
            </Text>
            <Text fontWeight="800" fontSize={24} color={brand.grafite}>
              {item.total}
            </Text>
            {item.since !== null ? (
              <Text fontSize={14} color={brand.grafite70}>
                {item.since} con questa offerta{since}
              </Text>
            ) : null}
          </YStack>
        ))}
      </XStack>
      <Text fontSize={14} color={brand.grafite70}>
        {offer.inFreeMonths} professionisti nei mesi gratis ora · {offer.withWaitingMonths} con mesi gratis in attesa (passati a Plus o Pro). Esclusi gli account di prova.
      </Text>

      {canEdit ? (
        <YStack gap="$2" marginTop="$2">
          {current ? (
            confirmStop ? (
              <YStack gap="$2">
                <Text color={brand.grafite}>Fermi l&apos;offerta? Da adesso chi si iscrive non ha mesi gratis; chi è già iscritto tiene i suoi. Potrai crearne una nuova quando vuoi.</Text>
                <XStack gap="$2" flexWrap="wrap">
                  <Button variant="urgent" disabled={busy} opacity={busy ? 0.6 : 1} onPress={() => run(() => apiClient.adminStopSubscriptionOffer(token))}>
                    {busy ? "Attendi..." : "Sì, ferma l'offerta"}
                  </Button>
                  <Button variant="secondary" onPress={() => setConfirmStop(false)}>
                    No
                  </Button>
                </XStack>
              </YStack>
            ) : (
              <Button variant="secondary" alignSelf="flex-start" onPress={() => setConfirmStop(true)}>
                Ferma l&apos;offerta
              </Button>
            )
          ) : null}
          <XStack gap="$2" alignItems="center" flexWrap="wrap">
            <label htmlFor="offer-months" style={{ color: brand.grafite }}>
              {current ? "Oppure sostituiscila con" : "Nuova offerta:"}
            </label>
            <select id="offer-months" className="admin-input" value={newMonths} onChange={(e) => setNewMonths(Number(e.target.value))}>
              {Array.from({ length: MAX_OFFER_FREE_MONTHS }, (_, index) => index + 1).map((months) => (
                <option key={months} value={months}>
                  {monthsLabel(months)} gratis
                </option>
              ))}
            </select>
            <Button variant="primary" disabled={busy} opacity={busy ? 0.6 : 1} onPress={() => run(() => apiClient.adminStartSubscriptionOffer(token, newMonths))}>
              {busy ? "Attendi..." : "Avvia"}
            </Button>
          </XStack>
        </YStack>
      ) : (
        <Text fontSize={14} color={brand.grafite70}>
          Solo il super admin può fermare o cambiare l&apos;offerta.
        </Text>
      )}
      {error ? <Text color={brand.urgenza}>{error}</Text> : null}

      {offer.history.length ? (
        <YStack gap={2} marginTop="$2">
          <Text fontSize={14} fontWeight="700" color={brand.grafite}>
            Offerte passate
          </Text>
          {offer.history
            .filter((row) => row.stoppedAt)
            .map((row) => (
              <Text key={`${row.startedAt}-${row.stoppedAt}`} fontSize={14} color={brand.grafite70}>
                {monthsLabel(row.freeMonths)} gratis
                {new Date(row.startedAt).getTime() > 0 ? ` dal ${formatAdminDate(row.startedAt)}` : " (offerta di partenza)"} fino al {formatAdminDate(row.stoppedAt!)}
              </Text>
            ))}
        </YStack>
      ) : null}
    </AdminCard>
  );
}
