"use client";

import { useEffect, useState } from "react";
import { CARD_WITHIN_24H_TARGET, CARD_WITHIN_7D_TARGET, SIGNUP_FUNNEL_LABEL, SIGNUP_FUNNEL_STEPS, sharePercentLabel, type AdminSignupFunnel } from "@professionisti/shared";
import { Text, YStack, brand } from "@professionisti/ui";
import { apiClient } from "@/lib/apiClient";
import { AdminCard, errorMessage, formatAdminDate } from "@/components/admin/adminUi";

const pct = (part: number, whole: number) => (whole > 0 ? part / whole : null);

/** "4 su 6 (67%)", rosso sotto la soglia. */
function TargetCell({ part, whole, target, label }: { part: number; whole: number; target: number; label: string }) {
  const ratio = pct(part, whole);
  if (ratio === null) return <td data-label={label}>—</td>;
  return (
    <td data-label={label} className={ratio < target ? "is-alert" : undefined}>
      {part} su {whole} ({Math.round(ratio * 100)}%)
    </td>
  );
}

/**
 * Imbuto dell'iscrizione per settimana (docs/changelog/2026-10-30-iscrizione-carta-solida.md):
 * quanti professionisti arrivano a ogni passo, senza account di prova, e la
 * carta data entro 24 ore ed entro 7 giorni dal profilo contro le soglie
 * proposte. Non segue i filtri della pagina.
 */
export function SignupFunnelCard({ token }: { token: string }) {
  const [data, setData] = useState<AdminSignupFunnel | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiClient
      .adminSignupFunnel(token)
      .then(setData)
      .catch((err) => setError(errorMessage(err)));
  }, [token]);

  if (error) {
    return (
      <AdminCard>
        <Text color={brand.urgenza}>{error}</Text>
      </AdminCard>
    );
  }
  if (!data) return null;
  const { total } = data;
  const accounts = total.counts.ACCOUNT;

  return (
    <AdminCard>
      <YStack gap="$1">
        <Text fontFamily="$heading" fontWeight="800" fontSize="$6" color={brand.grafite}>
          Iscrizione passo per passo
        </Text>
        <Text color={brand.grafite70} fontSize={13}>
          {data.countingFrom ? `Dal lancio (${formatAdminDate(data.countingFrom)}), ultime 12 settimane` : "Ultime 12 settimane"}, senza account di prova. Soglie: carta entro 24 ore dal profilo almeno{" "}
          {Math.round(CARD_WITHIN_24H_TARGET * 100)}%, entro 7 giorni almeno {Math.round(CARD_WITHIN_7D_TARGET * 100)}%.
        </Text>
      </YStack>

      {accounts === 0 ? (
        <Text color={brand.grafite70}>Ancora nessun professionista vero iscritto in questo periodo.</Text>
      ) : (
        <>
          <ul className="admin-bars">
            {SIGNUP_FUNNEL_STEPS.map((step) => {
              const count = total.counts[step];
              return (
                <li key={step} className={count === 0 ? "is-zero" : undefined}>
                  <div className="admin-bars-head">
                    <span className="admin-bars-label">{SIGNUP_FUNNEL_LABEL[step]}</span>
                    <span className="admin-bars-value">
                      <strong>{count}</strong> · {sharePercentLabel(count, accounts)}
                    </span>
                  </div>
                  <div className="admin-bars-track" aria-hidden="true">
                    <div className="admin-bars-fill" style={{ width: `${Math.min(100, (count / accounts) * 100)}%` }} />
                  </div>
                </li>
              );
            })}
          </ul>

          <div className="admin-table-wrap">
            <table className="admin-table admin-table-numbers">
              <thead>
                <tr>
                  <th>Settimana</th>
                  {SIGNUP_FUNNEL_STEPS.map((step) => (
                    <th key={step}>{SIGNUP_FUNNEL_LABEL[step]}</th>
                  ))}
                  <th>Carta entro 24 ore</th>
                  <th>Carta entro 7 giorni</th>
                </tr>
              </thead>
              <tbody>
                {data.weeks.map((week) => (
                  <tr key={week.weekStart}>
                    <td className="admin-cell-main">dal {formatAdminDate(week.weekStart)}</td>
                    {SIGNUP_FUNNEL_STEPS.map((step) => (
                      <td key={step} data-label={SIGNUP_FUNNEL_LABEL[step]}>
                        {week.counts[step]}
                      </td>
                    ))}
                    <TargetCell part={week.cardWithin24h} whole={week.counts.PROFILE} target={CARD_WITHIN_24H_TARGET} label="Carta entro 24 ore" />
                    <TargetCell part={week.cardWithin7d} whole={week.counts.PROFILE} target={CARD_WITHIN_7D_TARGET} label="Carta entro 7 giorni" />
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Text color={brand.grafite70} fontSize={12}>
            Ogni passo conta chi l&apos;ha fatto. La settimana è quella in cui è stato creato l&apos;account. La carta entro 24 ore e 7 giorni si conta su chi ha salvato il profilo, quindi
            l&apos;ultima settimana cresce ancora.
          </Text>
        </>
      )}
    </AdminCard>
  );
}
