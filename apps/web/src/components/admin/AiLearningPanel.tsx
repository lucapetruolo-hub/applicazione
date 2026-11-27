"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AI_BANK_AREA_LABEL,
  AI_BANK_ORIGIN_LABEL,
  adminCan,
  agreementPercent,
  monthLabel,
  type AiLearningOverview,
} from "@professionisti/shared";
import { Button, Text, XStack, YStack, brand } from "@professionisti/ui";
import { apiClient } from "@/lib/apiClient";
import { useAuth } from "@/lib/AuthContext";
import {
  AdminCard,
  ShowNumbers,
  errorMessage,
  formatAdminDate,
} from "@/components/admin/adminUi";
import { SkeletonTableRows } from "@/components/Skeleton";

/**
 * "Cosa impara l'IA" in Impostazioni → Proposte dell'IA
 * (docs/changelog/2026-11-27-il-sito-impara.md, migliorie 1-2-3 scelte da
 * Luca): misura mese per mese, regole approvate da togliere, banco di prova
 * fatto di errori veri. Niente cambia da solo: le regole nuove arrivano in
 * Da approvare, già provate sul banco.
 */
export function AiLearningPanel() {
  const { token, user } = useAuth();
  const isSuper = adminCan(user?.adminRoles ?? [], "SUPER");
  const [data, setData] = useState<AiLearningOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!token) return;
    apiClient
      .adminAiLearning(token)
      .then(setData)
      .catch((err) => setError(errorMessage(err)));
  }, [token]);

  useEffect(load, [load]);

  async function run(key: string, action: () => Promise<string | null>) {
    setBusy(key);
    setError(null);
    setNotice(null);
    try {
      setNotice(await action());
      load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  if (!data && !error) return <SkeletonTableRows rows={4} cols={3} />;
  if (!data) return <Text color={brand.urgenza}>{error}</Text>;

  const lastMonth = data.agreement[0] ?? null;
  const lastPct = agreementPercent(lastMonth);

  return (
    <YStack gap="6">
      {error ? (
        <Text color={brand.urgenza} role="alert">
          {error}
        </Text>
      ) : null}
      {notice ? (
        <Text color={brand.verificato} role="status">
          {notice}
        </Text>
      ) : null}

      {/* Misura mese per mese (miglioria 3). */}
      <YStack gap="2">
        <SectionTitle>Mese per mese</SectionTitle>
        {lastMonth && lastPct !== null ? (
          <Text fontSize="4" color={brand.grafite}>
            A {monthLabel(lastMonth.month)} hai approvato così com&apos;erano{" "}
            <strong>{lastPct}%</strong> delle proposte ({lastMonth.agreed} su{" "}
            {lastMonth.decided}).
          </Text>
        ) : (
          <Text fontSize="3" color={brand.grafite70}>
            Ancora nessuna decisione da contare.
          </Text>
        )}
        {data.agreement.length > 1 ? (
          <ShowNumbers label="Vedi i mesi prima">
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Mese</th>
                    <th>Approvate così</th>
                  </tr>
                </thead>
                <tbody>
                  {data.agreement.map((m) => (
                    <tr key={m.month}>
                      <td data-label="Mese">{monthLabel(m.month)}</td>
                      <td data-label="Approvate così">
                        {m.agreed} su {m.decided} ({agreementPercent(m)}%)
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </ShowNumbers>
        ) : null}
      </YStack>

      {/* Regole approvate (miglioria 3). */}
      <YStack gap="2" id="regole">
        <SectionTitle>Regole che hai insegnato all&apos;IA</SectionTitle>
        {data.rules.length === 0 ? (
          <Text fontSize="3" color={brand.grafite70}>
            Ancora nessuna. Se decidi in modo diverso dall&apos;IA, la domenica
            ti propone una regola. La trovi in Da approvare.
          </Text>
        ) : (
          <YStack gap="2">
            {data.rules.map((r) => (
              <AdminCard key={r.id}>
                <XStack gap="3" alignItems="center" flexWrap="wrap">
                  <YStack gap="1" flexGrow={1} flexShrink={1} flexBasis={0} minWidth={220}>
                    <Text fontSize="4" color={brand.grafite}>
                      {r.text}
                    </Text>
                    <Text fontSize={13} color={brand.grafite70}>
                      Dal {formatAdminDate(r.createdAt)} · sul banco {r.before}{" "}
                      → {r.after} giuste su {r.total}
                    </Text>
                  </YStack>
                  {isSuper ? (
                    <Button
                      variant="ghost"
                      size="2"
                      height={36}
                      disabled={busy !== null}
                      aria-label={`Togli la regola: ${r.text}`}
                      onPress={() =>
                        token &&
                        run(`rule:${r.id}`, async () => {
                          await apiClient.adminRemoveAiRule(token, r.id);
                          return "Regola tolta: dalla prossima proposta l'IA non la usa più.";
                        })
                      }
                    >
                      {busy === `rule:${r.id}` ? "…" : "Togli"}
                    </Button>
                  ) : null}
                </XStack>
              </AdminCard>
            ))}
          </YStack>
        )}
      </YStack>

      {/* Banco di prova (miglioria 2). */}
      <YStack gap="3">
        <SectionTitle>Banco di prova</SectionTitle>
        <Text fontSize="3" color={brand.grafite70}>
          Ogni errore vero dell&apos;IA entra qui da solo. Quando le sue
          istruzioni cambiano, l&apos;IA rifà tutti i casi.
        </Text>
        {data.worse ? (
          <Text fontWeight="700" color={brand.urgenza} role="alert">
            {data.worse}
          </Text>
        ) : null}
        <div className="ai-bank-grid">
          {data.bank.map((b) => {
            const run = data.runs.find((r) => r.area === b.area);
            return (
              <AdminCard key={b.area}>
                <Text fontWeight="700" color={brand.grafite}>
                  {AI_BANK_AREA_LABEL[b.area]}
                </Text>
                <Text
                  fontFamily="heading"
                  fontWeight="700"
                  fontSize="7"
                  color={brand.grafite}
                >
                  {b.total} {b.total === 1 ? "caso" : "casi"}
                </Text>
                <Text fontSize={13} color={brand.grafite70}>
                  {b.lastWeek > 0
                    ? `${b.lastWeek} ${b.lastWeek === 1 ? "nuovo" : "nuovi"} questa settimana`
                    : "Nessuno nuovo questa settimana"}
                </Text>
                <Text fontSize={13} color={brand.grafite70}>
                  {run
                    ? `Ultimo giro ${formatAdminDate(run.ranAt)}: ${run.correct} giuste su ${run.total}${run.newInstructions ? " (istruzioni nuove)" : ""}`
                    : "Ancora nessun giro"}
                </Text>
              </AdminCard>
            );
          })}
        </div>
        {isSuper ? (
          <XStack>
            <Button
              variant="primary"
              size="3"
              height={40}
              disabled={busy !== null}
              onPress={() =>
                token &&
                run("run", async () => {
                  const results = await apiClient.adminRunAiBank(token);
                  if (results.length === 0)
                    return "Niente da rifare: il banco è vuoto o l'IA non risponde.";
                  return results
                    .map(
                      (r) =>
                        `${AI_BANK_AREA_LABEL[r.area]}: ${r.correct} giuste su ${r.total}`,
                    )
                    .join(" · ");
                })
              }
            >
              {busy === "run"
                ? "Sto rifacendo il banco…"
                : "Rifai il banco adesso"}
            </Button>
          </XStack>
        ) : null}

        {data.recentCases.length > 0 ? (
          <ShowNumbers label="Vedi gli ultimi casi entrati">
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Quando</th>
                    <th>Perché è entrato</th>
                    <th>Caso</th>
                    <th>Risposta</th>
                    {isSuper ? <th aria-label="Azioni" /> : null}
                  </tr>
                </thead>
                <tbody>
                  {data.recentCases.map((c) => (
                    <tr key={c.id}>
                      <td data-label="Quando">
                        {formatAdminDate(c.createdAt)}
                      </td>
                      <td data-label="Perché è entrato">
                        {AI_BANK_ORIGIN_LABEL[c.origin]}
                      </td>
                      <td data-label="Caso">
                        {c.input}
                        {c.withPhoto
                          ? " (con foto: si rifà solo a parole)"
                          : ""}
                      </td>
                      <td data-label="Risposta">
                        L&apos;IA: {c.aiAnswer}
                        <span className="admin-cell-note">
                          Giusto: <strong>{c.expected}</strong>
                        </span>
                      </td>
                      {isSuper ? (
                        <td data-label="Azioni">
                          <Button
                            variant="ghost"
                            size="2"
                            height={32}
                            disabled={busy !== null}
                            aria-label="Togli dal banco questo caso"
                            onPress={() =>
                              token &&
                              run(`case:${c.id}`, async () => {
                                await apiClient.adminRemoveAiBankCase(
                                  token,
                                  c.id,
                                );
                                return "Caso tolto dal banco.";
                              })
                            }
                          >
                            {busy === `case:${c.id}` ? "…" : "Togli"}
                          </Button>
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Text fontSize={13} color={brand.grafite70}>
              Togli un caso se la risposta giusta è un&apos;altra. Per esempio:
              il cliente ha cambiato idea, non mestiere.
            </Text>
          </ShowNumbers>
        ) : null}
      </YStack>
    </YStack>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <Text
      render="h2"
      fontFamily="heading"
      fontWeight="700"
      fontSize="5"
      color={brand.grafite}
    >
      {children}
    </Text>
  );
}
