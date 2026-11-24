"use client";

import { useEffect, useState } from "react";
import type { PlatformFeeRule } from "@professionisti/api-client";
import { H2, Text, XStack, YStack, brand } from "@professionisti/ui";
import { ONLINE_APP_FEE_PERCENT, formatEurCents } from "@professionisti/shared";
import { apiClient } from "@/lib/apiClient";
import { SkeletonTableRows } from "@/components/Skeleton";

/**
 * Regole di commissione (prima in fondo a "Le nostre fatture", dal 24/11/2026
 * in "Società e commercialista": docs/changelog/2026-11-24-fatture-del-mese-zip.md).
 */
export function AdminFeeRulesSection({ token }: { token: string }) {
  const [feeRules, setFeeRules] = useState<PlatformFeeRule[] | null>(null);

  useEffect(() => {
    apiClient
      .adminListFeeRules(token)
      .then(setFeeRules)
      .catch(() => {});
  }, [token]);

  return (
    <YStack gap="4">
      <XStack
        justifyContent="space-between"
        alignItems="center"
        flexWrap="wrap"
        gap="3"
      >
        <H2 size="7">Regole di commissione</H2>
        <Text fontSize={12} color={brand.grafite70}>
          Le cambi da qui quando vuoi, senza chiamare un tecnico.
        </Text>
      </XStack>
      {/* Collaudo dell'8/11/2026, E3-10: sui pagamenti online la trattenuta si tiene all'addebito. */}
      <Text fontSize={14} color={brand.grafite70}>
        Sui pagamenti online all&apos;addebito si tiene al massimo il{" "}
        {ONLINE_APP_FEE_PERCENT}% + IVA: una regola più alta conta solo fino a
        lì, la differenza non si incassa.
      </Text>
      {feeRules === null ? (
        <SkeletonTableRows rows={3} cols={7} />
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Nome</th>
                <th>% (IVA esclusa)</th>
                <th>Fisso</th>
                <th>Min/Max</th>
                <th>Ambito</th>
                <th>Attiva dal</th>
                <th>Fino a</th>
              </tr>
            </thead>
            <tbody>
              {feeRules.map((rule) => (
                <tr key={rule.id}>
                  <td>{rule.name}</td>
                  <td>
                    {(rule.percentageBasisPoints / 100).toFixed(2)}%
                    {rule.percentageBasisPoints >
                      ONLINE_APP_FEE_PERCENT * 100 ||
                    rule.fixedFeeEurCents > 0 ||
                    (rule.minFeeEurCents ?? 0) > 0 ? (
                      <Text fontSize={13} color={brand.urgenza}>
                        {" "}
                        (online al massimo {ONLINE_APP_FEE_PERCENT}%)
                      </Text>
                    ) : null}
                  </td>
                  <td>{formatEurCents(rule.fixedFeeEurCents)}</td>
                  <td>
                    {rule.minFeeEurCents !== null
                      ? formatEurCents(rule.minFeeEurCents)
                      : "—"}{" "}
                    /{" "}
                    {rule.maxFeeEurCents !== null
                      ? formatEurCents(rule.maxFeeEurCents)
                      : "—"}
                  </td>
                  <td>
                    {rule.professionalProfileId
                      ? "Professionista specifico"
                      : rule.categoryId
                        ? "Categoria"
                        : "Globale"}
                  </td>
                  <td>
                    {new Date(rule.effectiveFrom).toLocaleDateString("it-IT")}
                  </td>
                  <td>
                    {rule.effectiveTo
                      ? new Date(rule.effectiveTo).toLocaleDateString("it-IT")
                      : "Attiva"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </YStack>
  );
}
