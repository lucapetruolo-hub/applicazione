"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { AdminFinanceSummary, Dac7ReportingPeriod, Dac7Record, PlatformFeeRule, PlatformDac7Settings } from "@professionisti/api-client";
import { Button, Field, H1, H2, Paragraph, Text, XStack, YStack, brand } from "@professionisti/ui";
import { apiClient } from "@/lib/apiClient";
import { useAuth } from "@/lib/AuthContext";
import { SkeletonBlock, SkeletonTableRows } from "@/components/Skeleton";

function euro(cents: number): string {
  return `${(cents / 100).toFixed(2)} €`;
}

/**
 * Finanza, DAC7, regole di commissione — CLAUDE.md §88. Pagina separata da
 * /admin (troppo contenuto per un'ancora in più sulla stessa pagina, stesso
 * principio già seguito altrove nel sito per pagine dense). Nessun'azione
 * qui muove denaro reale o invia una dichiarazione reale: tutto ciò che
 * tocca Stripe/l'Agenzia delle Entrate resta gated dietro credenziali non
 * configurate in questo ambiente, coerente col resto del progetto.
 */
export default function AdminFinanzaPage() {
  const { user, token, isLoading } = useAuth();
  const [finance, setFinance] = useState<AdminFinanceSummary | null>(null);
  const [feeRules, setFeeRules] = useState<PlatformFeeRule[] | null>(null);
  const [periods, setPeriods] = useState<Dac7ReportingPeriod[] | null>(null);
  const [selectedPeriod, setSelectedPeriod] = useState<(Dac7ReportingPeriod & { records: Dac7Record[] }) | null>(null);
  const [platformSettings, setPlatformSettings] = useState<PlatformDac7Settings | null>(null);
  const [settingsFields, setSettingsFields] = useState<{ sendingEntityIn: string; platformName: string; platformIdValue: string }>({
    sendingEntityIn: "",
    platformName: "",
    platformIdValue: "",
  });
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  function reloadAll() {
    if (!token) return;
    apiClient.adminFinanceSummary(token).then(setFinance).catch(() => {});
    apiClient.adminListFeeRules(token).then(setFeeRules).catch(() => {});
    apiClient.adminListDac7Periods(token).then(setPeriods).catch(() => {});
    apiClient
      .adminGetDac7Settings(token)
      .then((s) => {
        setPlatformSettings(s);
        setSettingsFields({ sendingEntityIn: s.sendingEntityIn ?? "", platformName: s.platformName ?? "", platformIdValue: s.platformIdValue ?? "" });
      })
      .catch(() => {});
  }

  async function handleSaveSettings() {
    if (!token) return;
    setSettingsSaving(true);
    setError(null);
    try {
      const updated = await apiClient.adminSetDac7Settings(token, {
        sendingEntityIn: settingsFields.sendingEntityIn || undefined,
        platformName: settingsFields.platformName || undefined,
        platformIdValue: settingsFields.platformIdValue || undefined,
      });
      setPlatformSettings(updated);
      setActionMessage("Impostazioni piattaforma DAC7 salvate.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Impossibile salvare le impostazioni.");
    } finally {
      setSettingsSaving(false);
    }
  }

  useEffect(() => {
    if (!token || user?.role !== "ADMIN") return;
    reloadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, user]);

  async function openPeriod(id: string) {
    if (!token) return;
    const detail = await apiClient.adminGetDac7Period(token, id);
    setSelectedPeriod(detail);
  }

  async function handleAggregateNow() {
    if (!token) return;
    setError(null);
    setActionMessage(null);
    try {
      await apiClient.adminAggregateDac7Now(token);
      setActionMessage("Aggregazione DAC7 aggiornata.");
      reloadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Errore durante l'aggregazione.");
    }
  }

  async function handleExport(id: string) {
    if (!token) return;
    setError(null);
    try {
      const result = await apiClient.adminExportDac7Period(token, id);
      // Nessun invio/salvataggio file reale in questo giro (CLAUDE.md §88,
      // §17 della specifica: bozza JSON, non il tracciato ufficiale DPI23):
      // mostrata a schermo per revisione manuale, non offerta come download
      // automatico (i download avviati da script sono comunque inerti nella
      // sandbox di anteprima di questo prodotto).
      setActionMessage(JSON.stringify(result, null, 2));
      reloadAll();
      if (selectedPeriod?.id === id) openPeriod(id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Errore durante l'esportazione.");
    }
  }

  async function handleMarkSubmitted(id: string) {
    if (!token) return;
    setError(null);
    try {
      await apiClient.adminMarkDac7Submitted(token, id);
      setActionMessage("Periodo segnato come inviato.");
      reloadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Errore.");
    }
  }

  async function handleCorrect(id: string) {
    if (!token) return;
    setError(null);
    try {
      await apiClient.adminCorrectDac7Period(token, id);
      setActionMessage("Periodo corretto (nuova versione).");
      reloadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Errore.");
    }
  }

  if (isLoading) return null;

  if (!user || !token || user.role !== "ADMIN") {
    return (
      <YStack width="100%" alignItems="center" paddingVertical="$9" paddingHorizontal="$4">
        <Paragraph color={brand.grafite70}>Questa pagina è visibile solo agli amministratori.</Paragraph>
      </YStack>
    );
  }

  return (
    <YStack width="100%" alignItems="center" paddingVertical="$8" paddingHorizontal="$4">
      <YStack width="100%" maxWidth={900} gap="$7">
        <YStack gap="$2">
          <Link href="/admin" style={{ textDecoration: "none" }}>
            <Text color={brand.cianografia} fontSize={13}>
              ← Torna ad Amministrazione
            </Text>
          </Link>
          <H1 size="$8">Finanza e DAC7</H1>
        </YStack>

        {error && <Text color={brand.urgenza}>{error}</Text>}
        {actionMessage && (
          <YStack backgroundColor={brand.gesso} padding="$3" borderRadius={8} maxHeight={240} style={{ overflow: "auto" as const }}>
            <Text fontSize={12} fontFamily="$mono" style={{ whiteSpace: "pre-wrap" as const }}>
              {actionMessage}
            </Text>
          </YStack>
        )}

        <YStack gap="$4">
          <H2 size="$6">Riepilogo finanza</H2>
          {finance === null ? (
            <YStack gap="$2" maxWidth={400}>
              <SkeletonBlock height={16} />
              <SkeletonBlock height={16} width="80%" />
              <SkeletonBlock height={16} width="60%" />
            </YStack>
          ) : (
            <YStack gap="$4">
              <YStack gap="$2">
                <Text fontWeight="700">Ricavo Manovia per fonte</Text>
                {finance.revenueBySource.length === 0 ? (
                  <Text color={brand.grafite70}>Nessun ricavo registrato finora.</Text>
                ) : (
                  finance.revenueBySource.map((r) => (
                    <XStack key={r.source} justifyContent="space-between" maxWidth={400}>
                      <Text>{r.source}</Text>
                      <Text fontFamily="$mono">{euro(r.totalEurCents)}</Text>
                    </XStack>
                  ))
                )}
              </YStack>
              <YStack gap="$2">
                <Text fontWeight="700">Pagamenti del lavoro per metodo</Text>
                {finance.jobPaymentsByMethod.map((m) => (
                  <XStack key={m.method} justifyContent="space-between" maxWidth={400}>
                    <Text>
                      {m.method === "MANOVIA" ? "Tramite Manovia" : "Diretti"} ({m.count})
                    </Text>
                    <Text fontFamily="$mono">{euro(m.totalGrossEurCents)}</Text>
                  </XStack>
                ))}
              </YStack>
              <YStack gap="$2">
                <Text fontWeight="700">Pagamenti del lavoro per stato</Text>
                {finance.jobPaymentsByStatus.map((s) => (
                  <XStack key={s.status} justifyContent="space-between" maxWidth={400}>
                    <Text>{s.status}</Text>
                    <Text fontFamily="$mono">{s.count}</Text>
                  </XStack>
                ))}
              </YStack>
            </YStack>
          )}
        </YStack>

        <YStack gap="$4">
          <XStack justifyContent="space-between" alignItems="center" flexWrap="wrap" gap="$3">
            <H2 size="$6">Regole di commissione</H2>
            <Text fontSize={12} color={brand.grafite70}>
              Mai valori fissi nel codice — ogni regola è un dato, modificabile qui senza deploy.
            </Text>
          </XStack>
          {feeRules === null ? (
            <SkeletonTableRows rows={3} cols={7} />
          ) : (
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Nome</th>
                    <th>%</th>
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
                      <td>{(rule.percentageBasisPoints / 100).toFixed(2)}%</td>
                      <td>{euro(rule.fixedFeeEurCents)}</td>
                      <td>
                        {rule.minFeeEurCents !== null ? euro(rule.minFeeEurCents) : "—"} / {rule.maxFeeEurCents !== null ? euro(rule.maxFeeEurCents) : "—"}
                      </td>
                      <td>{rule.professionalProfileId ? "Professionista specifico" : rule.categoryId ? "Categoria" : "Globale"}</td>
                      <td>{new Date(rule.effectiveFrom).toLocaleDateString("it-IT")}</td>
                      <td>{rule.effectiveTo ? new Date(rule.effectiveTo).toLocaleDateString("it-IT") : "Attiva"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </YStack>

        <YStack gap="$4">
          <XStack justifyContent="space-between" alignItems="center" flexWrap="wrap" gap="$3">
            <H2 size="$6">Impostazioni piattaforma DAC7</H2>
            <Text fontSize={12} color={brand.grafite70}>
              Identità richiesta dallo schema OECD DPI (MessageSpec/Platform) — senza questi dati l&apos;export non può costruire un
              identificativo di trasmissione valido.
            </Text>
          </XStack>
          {platformSettings?.sendingEntityIn && platformSettings?.platformName && platformSettings?.platformIdValue ? null : (
            <Text fontSize={13} color={brand.urgenza}>
              Dati incompleti: l&apos;export segnalerà esplicitamente questa mancanza (non blocca l&apos;esportazione, la contrassegna).
            </Text>
          )}
          <YStack gap="$3" maxWidth={460}>
            <Field label="P.IVA / identificativo fiscale di Manovia (es. IT01234567890)" value={settingsFields.sendingEntityIn} onChangeText={(v) => setSettingsFields((p) => ({ ...p, sendingEntityIn: v }))} />
            <Field label="Nome piattaforma" value={settingsFields.platformName} onChangeText={(v) => setSettingsFields((p) => ({ ...p, platformName: v }))} />
            <Field
              label="Numero di registrazione della piattaforma (PlatformID)"
              value={settingsFields.platformIdValue}
              onChangeText={(v) => setSettingsFields((p) => ({ ...p, platformIdValue: v }))}
            />
            <XStack>
              <Button variant="primary" onPress={handleSaveSettings} disabled={settingsSaving}>
                {settingsSaving ? "Salvataggio..." : "Salva impostazioni"}
              </Button>
            </XStack>
          </YStack>
        </YStack>

        <YStack gap="$4">
          <XStack justifyContent="space-between" alignItems="center" flexWrap="wrap" gap="$3">
            <H2 size="$6">Periodi DAC7</H2>
            <Button variant="secondary" onPress={handleAggregateNow}>
              Aggiorna aggregazione ora
            </Button>
          </XStack>
          <Text fontSize={12} color={brand.grafite70}>
            L&apos;aggregazione riflette solo i pagamenti CONFERMATI (MANOVIA sempre, DIRETTI se previsto dalla regola DAC7 attiva). Nessun invio
            reale all&apos;Agenzia delle Entrate: &quot;Segna come inviato&quot; è un&apos;azione manuale di registrazione, non un&apos;integrazione
            reale con il Desktop Telematico.
          </Text>
          {periods === null ? (
            <SkeletonTableRows rows={3} cols={4} />
          ) : periods.length === 0 ? (
            <Text color={brand.grafite70}>Nessun periodo ancora aggregato.</Text>
          ) : (
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Periodo</th>
                    <th>Stato</th>
                    <th>Versione</th>
                    <th>Azioni</th>
                  </tr>
                </thead>
                <tbody>
                  {periods.map((p) => (
                    <tr key={p.id}>
                      <td>
                        {p.year} {p.quarter ? `Q${p.quarter}` : "(anno intero)"}
                      </td>
                      <td>{p.status}</td>
                      <td>{p.reportVersion}</td>
                      <td>
                        <XStack gap="$2" flexWrap="wrap">
                          <Button size="$2" variant="secondary" onPress={() => openPeriod(p.id)}>
                            Dettaglio
                          </Button>
                          <Button size="$2" variant="secondary" onPress={() => handleExport(p.id)}>
                            Esporta
                          </Button>
                          {p.status === "EXPORTED" && (
                            <Button size="$2" variant="secondary" onPress={() => handleMarkSubmitted(p.id)}>
                              Segna come inviato
                            </Button>
                          )}
                          {(p.status === "SUBMITTED" || p.status === "REJECTED") && (
                            <Button size="$2" variant="secondary" onPress={() => handleCorrect(p.id)}>
                              Correggi
                            </Button>
                          )}
                        </XStack>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {selectedPeriod && (
            <YStack gap="$2" backgroundColor={brand.gesso} padding="$4" borderRadius={8}>
              <Text fontWeight="700">
                Dettaglio {selectedPeriod.year} {selectedPeriod.quarter ? `Q${selectedPeriod.quarter}` : "(anno)"}
              </Text>
              {selectedPeriod.records.length === 0 ? (
                <Text color={brand.grafite70}>Nessun professionista con pagamenti confermati in questo periodo.</Text>
              ) : (
                selectedPeriod.records.map((r) => (
                  <XStack key={r.id} justifyContent="space-between" flexWrap="wrap" gap="$2">
                    <Text fontSize={13}>
                      {r.professionalProfileId} {r.missingFiscalData ? "· dati fiscali mancanti/non verificati" : ""}
                    </Text>
                    <Text fontSize={13} fontFamily="$mono">
                      {euro(r.considerationEurCents)} · {r.numberOfTransactions} transazioni
                    </Text>
                  </XStack>
                ))
              )}
            </YStack>
          )}
        </YStack>
      </YStack>
    </YStack>
  );
}
