"use client";

import { useEffect, useState } from "react";
import type {
  Dac7ReportingPeriod,
  Dac7Record,
  PlatformDac7Settings,
} from "@professionisti/api-client";
import {
  Button,
  Field,
  H2,
  Text,
  XStack,
  YStack,
  brand,
} from "@professionisti/ui";
import { apiClient } from "@/lib/apiClient";
import { useAuth } from "@/lib/AuthContext";
import { SkeletonTableRows } from "@/components/Skeleton";
import { AdminConfirmModal } from "@/components/admin/AdminConfirmModal";
import { BRAND, DAC7_PROTOCOL_MIN, formatEurCents } from "@professionisti/shared";

/**
 * Fisco e fatture → DAC7 (CLAUDE.md §88): compensi dei professionisti da
 * dichiarare all'Agenzia delle Entrate entro il 31 gennaio. Scheda separata
 * da "Le nostre fatture" dal riordino del 30/10/2026
 * (docs/changelog/2026-10-30-admin-riordino.md). Nessun invio reale da qui:
 * "Segna come inviato" registra l'invio fatto a mano.
 */
const DAC7_STATUS_LABEL: Record<string, string> = {
  OPEN: "Aperto",
  DATA_COLLECTION: "Raccolta dati",
  VALIDATION: "In controllo",
  READY: "Pronto",
  EXPORTED: "File scaricato",
  SUBMITTED: "Inviato",
  REJECTED: "Respinto",
  CORRECTED: "Corretto",
};

export default function AdminDac7Page() {
  const { token } = useAuth();
  const [periods, setPeriods] = useState<Dac7ReportingPeriod[] | null>(null);
  const [selectedPeriod, setSelectedPeriod] = useState<
    (Dac7ReportingPeriod & { records: Dac7Record[] }) | null
  >(null);
  const [platformSettings, setPlatformSettings] =
    useState<PlatformDac7Settings | null>(null);
  const [settingsFields, setSettingsFields] = useState<{
    sendingEntityIn: string;
    platformName: string;
    platformIdValue: string;
  }>({
    sendingEntityIn: "",
    platformName: "",
    platformIdValue: "",
  });
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  // Conferma prima delle azioni che non si annullano o scrivono a tutti (docs/changelog/2026-11-02-admin-protezioni.md).
  const [confirming, setConfirming] = useState<{ kind: "submit" | "notify"; period: Dac7ReportingPeriod } | null>(null);

  function reloadAll() {
    if (!token) return;
    apiClient
      .adminListDac7Periods(token)
      .then(setPeriods)
      .catch(() => {});
    apiClient
      .adminGetDac7Settings(token)
      .then((s) => {
        setPlatformSettings(s);
        setSettingsFields({
          sendingEntityIn: s.sendingEntityIn ?? "",
          platformName: s.platformName ?? "",
          platformIdValue: s.platformIdValue ?? "",
        });
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
      setActionMessage("I nostri dati per il fisco sono salvati.");
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Impossibile salvare le impostazioni.",
      );
    } finally {
      setSettingsSaving(false);
    }
  }

  useEffect(() => {
    if (!token) return;
    reloadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

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
      setActionMessage("Conti rifatti.");
      reloadAll();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Non sono riuscito a rifare i conti.",
      );
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
      setError(
        e instanceof Error ? e.message : "Errore durante l'esportazione.",
      );
    }
  }

  // Gli errori li mostra la finestra di conferma.
  async function handleMarkSubmitted(id: string, protocol: string) {
    if (!token) return;
    setError(null);
    const updated = await apiClient.adminMarkDac7Submitted(token, id, protocol);
    setActionMessage(
      updated.quarter === null
        ? "Fatto. Ogni professionista ha ricevuto un'email con quanto ha preso nell'anno."
        : "Periodo segnato come inviato.",
    );
    setConfirming(null);
    reloadAll();
  }

  async function handleNotifySellers(id: string) {
    if (!token) return;
    setError(null);
    const { sent } = await apiClient.adminNotifyDac7Sellers(token, id);
    setActionMessage(`Email con i guadagni dell'anno rimandata a ${sent} professionisti.`);
    setConfirming(null);
    if (selectedPeriod?.id === id) openPeriod(id);
  }

  async function handleCorrect(id: string) {
    if (!token) return;
    setError(null);
    try {
      await apiClient.adminCorrectDac7Period(token, id);
      setActionMessage("Corretto: ora scarica di nuovo il file e rimandalo.");
      reloadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Errore.");
    }
  }

  if (!token) return null;

  return (
    <YStack gap="7">
      {error && <Text color={brand.urgenza}>{error}</Text>}
      {actionMessage && (
        <YStack
          backgroundColor={brand.gesso}
          padding="3"
          borderRadius={10}
          maxHeight={240}
          style={{ overflow: "auto" as const }}
        >
          <Text fontSize={13} style={{ whiteSpace: "pre-wrap" as const }}>
            {actionMessage}
          </Text>
        </YStack>
      )}

      <YStack gap="4">
        <XStack
          justifyContent="space-between"
          alignItems="center"
          flexWrap="wrap"
          gap="3"
        >
          <H2 size="7">I nostri dati per il fisco</H2>
          <Text fontSize={13} color={brand.grafite70}>
            Servono per preparare il file da mandare all&apos;Agenzia delle
            Entrate. Si scrivono una volta sola.
          </Text>
        </XStack>
        {platformSettings?.sendingEntityIn &&
        platformSettings?.platformName &&
        platformSettings?.platformIdValue ? null : (
          // Avviso, non errore (docs/CHANGELOG.md §349): l'esportazione funziona lo stesso.
          <Text fontSize={13} color={brand.ottoneScuro}>
            Mancano dei dati: il file si scarica lo stesso, ma dirà che sono
            mancanti.
          </Text>
        )}
        <YStack gap="3" maxWidth={460}>
          <Field
            label={`Partita IVA di ${BRAND.name} (es. IT01234567890)`}
            value={settingsFields.sendingEntityIn}
            onChangeText={(v) =>
              setSettingsFields((p) => ({ ...p, sendingEntityIn: v }))
            }
          />
          <Field
            label="Nome del sito"
            value={settingsFields.platformName}
            onChangeText={(v) =>
              setSettingsFields((p) => ({ ...p, platformName: v }))
            }
          />
          <Field
            label="Numero di iscrizione del sito all'Agenzia delle Entrate"
            value={settingsFields.platformIdValue}
            onChangeText={(v) =>
              setSettingsFields((p) => ({ ...p, platformIdValue: v }))
            }
          />
          <XStack>
            <Button
              variant="primary"
              onPress={handleSaveSettings}
              disabled={settingsSaving}
            >
              {settingsSaving ? "Salvo..." : "Salva"}
            </Button>
          </XStack>
        </YStack>
      </YStack>

      <YStack gap="4">
        <XStack
          justifyContent="space-between"
          alignItems="center"
          flexWrap="wrap"
          gap="3"
        >
          <H2 size="7">Guadagni da mandare al fisco</H2>
          <Button variant="secondary" onPress={handleAggregateNow}>
            Rifai i conti adesso
          </Button>
        </XStack>
        <Text fontSize={12} color={brand.grafite70}>
          Ogni anno, entro il 31 gennaio, diciamo al fisco quanto ha preso ogni professionista. Scarica il
          file e mandalo al fisco. Poi premi &quot;Segna come inviato&quot;: il
          sito avvisa i professionisti.
        </Text>
        {periods === null ? (
          <SkeletonTableRows rows={3} cols={4} />
        ) : periods.length === 0 ? (
          <Text color={brand.grafite70}>Ancora nessun conto pronto.</Text>
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Periodo</th>
                  <th>Stato</th>
                  <th>Volte corretto</th>
                  <th>Azioni</th>
                </tr>
              </thead>
              <tbody>
                {periods.map((p) => (
                  <tr key={p.id}>
                    <td>
                      {p.year} {p.quarter ? `, ${p.quarter}° trimestre` : "(anno intero)"}
                    </td>
                    <td>
                      {DAC7_STATUS_LABEL[p.status] ?? p.status}
                      {p.submissionProtocol ? (
                        <Text display="flex" fontSize={12} color={brand.grafite70}>
                          Protocollo {p.submissionProtocol}
                        </Text>
                      ) : null}
                      {p.needsCorrectionAt ? (
                        <Text
                          display="flex"
                          fontSize={12}
                          fontWeight="700"
                          color={brand.urgenza}
                        >
                          Da correggere
                        </Text>
                      ) : null}
                    </td>
                    <td>{Math.max(0, p.reportVersion - 1)}</td>
                    <td>
                      <XStack gap="2" flexWrap="wrap">
                        <Button
                          size="2"
                          variant="secondary"
                          onPress={() => openPeriod(p.id)}
                        >
                          Dettaglio
                        </Button>
                        <Button
                          size="2"
                          variant="secondary"
                          onPress={() => handleExport(p.id)}
                        >
                          Scarica il file
                        </Button>
                        {p.status === "EXPORTED" && (
                          <Button
                            size="2"
                            variant="secondary"
                            onPress={() => setConfirming({ kind: "submit", period: p })}
                          >
                            Segna come inviato
                          </Button>
                        )}
                        {(p.status === "SUBMITTED" ||
                          p.status === "REJECTED") && (
                          <Button
                            size="2"
                            variant="secondary"
                            onPress={() => handleCorrect(p.id)}
                          >
                            Correggi
                          </Button>
                        )}
                        {p.quarter === null &&
                          (p.status === "SUBMITTED" ||
                            p.status === "CORRECTED") && (
                            <Button
                              size="2"
                              variant="secondary"
                              onPress={() => setConfirming({ kind: "notify", period: p })}
                            >
                              Rimanda l&apos;email ai professionisti
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
          <YStack
            gap="2"
            backgroundColor={brand.gesso}
            padding="4"
            borderRadius={10}
          >
            <Text fontWeight="700">
              Dettaglio {selectedPeriod.year}{" "}
              {selectedPeriod.quarter ? `, ${selectedPeriod.quarter}° trimestre` : "(anno intero)"}
            </Text>
            {selectedPeriod.needsCorrectionAt ? (
              <Text fontSize={13} color={brand.urgenza}>
                Le cifre sono cambiate dopo l&apos;invio: premi &quot;Correggi&quot;,
                poi scarica di nuovo il file e rimandalo.
              </Text>
            ) : null}
            {selectedPeriod.records.length === 0 ? (
              <Text color={brand.grafite70}>
                Nessun professionista con compensi in questo periodo.
              </Text>
            ) : (
              selectedPeriod.records.map((r) => (
                <XStack
                  key={r.id}
                  justifyContent="space-between"
                  flexWrap="wrap"
                  gap="2"
                >
                  <Text fontSize={13}>
                    <Text fontSize={13} fontWeight="700">
                      {r.businessName ?? r.professionalProfileId}
                    </Text>
                    {r.missingFiscalData ? (
                      <Text fontSize={13} color={brand.urgenza}>
                        {" "}
                        · dati fiscali mancanti
                      </Text>
                    ) : null}
                    {r.missingIban ? (
                      <Text fontSize={13} color={brand.urgenza}>
                        {" "}
                        · manca il conto (IBAN)
                      </Text>
                    ) : null}
                  </Text>
                  <Text fontSize={13} fontVariant={["tabular-nums"]}>
                    {formatEurCents(r.considerationEurCents)} (diretti{" "}
                    {formatEurCents(r.directConsiderationEurCents)}, online{" "}
                    {formatEurCents(r.onlineConsiderationEurCents)}) ·{" "}
                    {r.numberOfTransactions} lavori
                    {r.sellerNotifiedAt ? " · avvisato" : ""}
                  </Text>
                </XStack>
              ))
            )}
          </YStack>
        )}
      </YStack>
      {confirming ? (
        <AdminConfirmModal
          title={confirming.kind === "submit" ? "Segna come inviato" : "Rimanda l'email ai professionisti"}
          description={
            confirming.kind === "submit"
              ? `Segna ${confirming.period.year}${confirming.period.quarter ? `, ${confirming.period.quarter}° trimestre,` : ""} come inviato all'Agenzia delle Entrate. Non si annulla${confirming.period.quarter === null ? " e parte subito l'avviso via email a ogni professionista con i suoi dati" : ""}. Fallo solo dopo l'invio vero.`
              : `Ogni professionista del ${confirming.period.year} riceve di nuovo l'email con i suoi guadagni dell'anno. Serve dopo una correzione.`
          }
          confirmLabel={confirming.kind === "submit" ? "Segna come inviato" : "Rimanda l'email"}
          reasonLabel={confirming.kind === "submit" ? "Numero di protocollo della ricevuta" : undefined}
          reasonPlaceholder="Es. 26013112345678901"
          reasonMin={DAC7_PROTOCOL_MIN}
          reasonMissing="Scrivi il numero di protocollo della ricevuta"
          onClose={() => setConfirming(null)}
          onConfirm={(protocol) => (confirming.kind === "submit" ? handleMarkSubmitted(confirming.period.id, protocol ?? "") : handleNotifySellers(confirming.period.id))}
        />
      ) : null}
    </YStack>
  );
}
