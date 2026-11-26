"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { SUBSCRIPTION_WITHDRAWAL_DAYS, formatEurCents, type SubscriptionWithdrawalOption } from "@professionisti/shared";
import { Button, Surface, Text, XStack, brand, radiusDoc } from "@professionisti/ui";
import { apiClient } from "@/lib/apiClient";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Rome" });
}

/**
 * Recesso entro 14 giorni per chi lavora senza partita IVA (consumatore,
 * docs/changelog/2026-11-26-recesso-abbonamento.md): compare solo se il
 * server dice che si può, con il rimborso stimato (pagato meno la parte usata).
 * Lo decide la Finanza in Admin, poi arriva l'email.
 */
export function SubscriptionWithdrawalCard({ token, onRequested }: { token: string; onRequested?: () => void }) {
  const [option, setOption] = useState<SubscriptionWithdrawalOption | null>(null);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    apiClient
      .getSubscriptionWithdrawal(token)
      .then((result) => active && setOption(result.withdrawal))
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [token]);

  if (!option) return null;

  async function send() {
    setPending(true);
    setError(null);
    try {
      const result = await apiClient.requestSubscriptionWithdrawal(token, reason.trim() || undefined);
      setOption(result.withdrawal);
      setOpen(false);
      onRequested?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Non riusciamo a mandare la richiesta: riprova tra poco.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Surface borderRadius={radiusDoc} padding="5" gap="3">
      <Text render="h2" fontFamily="heading" fontWeight="700" fontSize="6" color={brand.inchiostro}>
        Recesso entro {SUBSCRIPTION_WITHDRAWAL_DAYS} giorni
      </Text>
      {option.state === "REQUESTED" ? (
        <Text color={brand.grafite70}>
          Richiesta mandata il {formatDate(option.requestedAt)}. La controlliamo entro pochi giorni e ti scriviamo per email con l&apos;importo del rimborso.
        </Text>
      ) : (
        <>
          <Text color={brand.grafite70}>
            Lavori senza partita IVA, quindi puoi recedere dal livello {option.tierLabel} fino al {formatDate(option.until)}. L&apos;abbonamento si chiude e ti
            rimborsiamo quanto hai pagato meno la parte già usata: oggi circa{" "}
            <Text render="span" fontWeight="700" color={brand.grafite}>
              {formatEurCents(option.estimatedRefundEurCents)}
            </Text>{" "}
            su {formatEurCents(option.paidEurCents)}.{" "}
            <Link href="/termini#abbonamento" style={{ color: brand.cianografiaScuro, fontWeight: 700 }}>
              Scopri di più
            </Link>
          </Text>
          {open ? (
            <>
              <label htmlFor="withdrawal-reason">
                <Text fontWeight="700" color={brand.grafite}>
                  Perché recedi? (facoltativo)
                </Text>
              </label>
              <textarea
                id="withdrawal-reason"
                value={reason}
                maxLength={500}
                rows={3}
                onChange={(event) => setReason(event.target.value)}
                style={{ width: "100%", boxSizing: "border-box", borderRadius: 10, border: `1px solid ${brand.filetto}`, padding: 12, font: "inherit", fontSize: 16 }}
              />
              {error ? (
                <Text color={brand.urgenza} role="alert">
                  {error}
                </Text>
              ) : null}
              <XStack gap="2" flexWrap="wrap">
                <Button variant="urgent" disabled={pending} opacity={pending ? 0.6 : 1} onPress={() => void send()}>
                  {pending ? "Attendi..." : "Sì, chiedo il recesso"}
                </Button>
                <Button variant="secondary" onPress={() => setOpen(false)}>
                  No, tienilo
                </Button>
              </XStack>
            </>
          ) : (
            <Button variant="secondary" alignSelf="flex-start" onPress={() => setOpen(true)}>
              Chiedi il recesso
            </Button>
          )}
        </>
      )}
    </Surface>
  );
}
