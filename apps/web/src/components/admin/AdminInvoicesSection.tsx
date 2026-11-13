"use client";

import { useCallback, useEffect, useState } from "react";
import {
  INVOICE_SOURCE_LABEL,
  formatEurCents,
  monthlyInvoiceLate,
  platformInvoiceSettingsSchema,
  type FeeReconciliation,
  type InvoiceSdiStatusValue,
  type PlatformInvoiceAdminRow,
  type PlatformInvoiceSettingsInput,
  type PlatformInvoiceSettingsView,
  type SdiSandboxTestResult,
} from "@professionisti/shared";
import { Button, Field, H2, Text, XStack, YStack, brand } from "@professionisti/ui";
import { apiClient } from "@/lib/apiClient";
import { TechNote, downloadTextFile, errorMessage } from "./adminUi";
import { AdminConfirmModal } from "./AdminConfirmModal";

const SDI_LABEL: Record<InvoiceSdiStatusValue, string> = {
  NOT_SENT: "Da inviare",
  SENT: "Inviata",
  DELIVERED: "Consegnata",
  REJECTED: "Rifiutata",
};

const FIELDS: {
  key: keyof PlatformInvoiceSettingsInput;
  label: string;
  hint?: string;
}[] = [
  { key: "companyName", label: "Ragione sociale" },
  { key: "vatNumber", label: "Partita IVA" },
  {
    key: "taxCode",
    label: "Codice fiscale",
    hint: "Se diverso dalla partita IVA",
  },
  { key: "street", label: "Via della sede" },
  { key: "houseNumber", label: "Civico" },
  { key: "postalCode", label: "CAP" },
  { key: "city", label: "Comune" },
  { key: "province", label: "Provincia (sigla)" },
  { key: "taxRegime", label: "Regime fiscale", hint: "RF01 = ordinario" },
  { key: "reaOffice", label: "Camera di commercio (sigla)", hint: "Dalla visura camerale" },
  { key: "reaNumber", label: "Numero di iscrizione (REA)" },
  { key: "shareCapital", label: "Capitale sociale" },
  { key: "pecEmail", label: "Posta certificata (PEC)" },
  {
    key: "invoicesFrom",
    label: "Fatture da (AAAA-MM-GG)",
    hint: "Prima di questa data solo gli estratti",
  },
];

function lastMonth(): string {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * Admin → Finanza, "Le nostre fatture" (docs/CHANGELOG.md §378): i dati
 * della società che le emette, le fatture emesse con il loro stato allo SdI,
 * l'XML da scaricare e il giro del mese da rilanciare a mano.
 */
export function AdminInvoicesSection({ token }: { token: string }) {
  const [settings, setSettings] = useState<PlatformInvoiceSettingsView | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [invoices, setInvoices] = useState<PlatformInvoiceAdminRow[] | null>(null);
  const [month, setMonth] = useState(lastMonth());
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [confirm, setConfirm] = useState<{ kind: "run" } | { kind: "resend"; id: string; number: string } | null>(null);
  const [reconciliation, setReconciliation] = useState<FeeReconciliation | null>(null);
  const [sdiTest, setSdiTest] = useState<SdiSandboxTestResult | null>(null);

  const load = useCallback(() => {
    apiClient
      .adminInvoiceSettings(token)
      .then((view) => {
        setSettings(view);
        setDraft(Object.fromEntries(FIELDS.map((f) => [f.key, view[f.key] ?? ""])));
      })
      .catch((e) => setError(errorMessage(e)));
    apiClient
      .adminInvoices(token)
      .then(setInvoices)
      .catch((e) => setError(errorMessage(e)));
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  async function saveSettings() {
    const values = Object.fromEntries(Object.entries(draft).map(([k, v]) => [k, v.trim() || undefined]));
    const parsed = platformInvoiceSettingsSchema.safeParse({
      ...values,
      taxRegime: values.taxRegime ?? "RF01",
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Controlla i dati.");
      return;
    }
    setPending(true);
    setError(null);
    try {
      setSettings(await apiClient.adminUpdateInvoiceSettings(token, parsed.data));
      setMessage("Dati della società salvati.");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setPending(false);
    }
  }

  // Emettere e rimandare allo SdI passano dalla finestra di conferma, che mostra
  // anche l'errore (docs/changelog/2026-11-02-admin-protezioni.md).
  async function runMonth() {
    setPending(true);
    setError(null);
    try {
      const { issued, notified, statements, abroad } = await apiClient.adminRunInvoiceMonth(token, month);
      const abroadNote = abroad > 0 ? ` ${abroad === 1 ? "Un professionista ha" : `${abroad} professionisti hanno`} la residenza fiscale all'estero: la fattura va fatta a mano.` : "";
      setMessage(`${monthRerunMessage(issued, notified, statements)}${abroadNote}`);
      setConfirm(null);
      load();
    } finally {
      setPending(false);
    }
  }

  async function checkReconciliation() {
    setPending(true);
    setError(null);
    try {
      setReconciliation(await apiClient.adminFeeReconciliation(token, month));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setPending(false);
    }
  }

  async function runSdiTest() {
    setPending(true);
    setError(null);
    setSdiTest(null);
    try {
      setSdiTest(await apiClient.adminSdiSandboxTest(token));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setPending(false);
    }
  }

  async function downloadXml(id: string) {
    try {
      const file = await apiClient.adminInvoiceXml(token, id);
      downloadTextFile(file.fileName, file.xml, "application/xml;charset=utf-8");
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  async function resend(id: string) {
    const row = await apiClient.adminResendInvoice(token, id);
    setInvoices((current) => current?.map((r) => (r.id === id ? row : r)) ?? null);
    setMessage(row.sdiStatus === "SENT" ? "Fattura mandata all'Agenzia delle Entrate." : (row.sdiMessage ?? "Fattura rifatta."));
    setConfirm(null);
  }

  return (
    <YStack gap="4">
      <H2 size="7">Le nostre fatture</H2>
      {settings ? (
        <Text color={brand.grafite70}>
          {settings.ready ? "Dati della società completi: le fatture partono." : "Mancano i dati della società: per ora i professionisti vedono solo gli estratti."}{" "}
          {settings.sdiConfigured
            ? settings.sdiSandbox
              ? "Le fatture partono solo per prova: al fisco non arriva niente."
              : "Le fatture partono da sole verso l'Agenzia delle Entrate."
            : "Le fatture non partono da sole. Scaricale e caricale a mano sul sito del fisco."}
        </Text>
      ) : null}
      {settings ? (
        <TechNote>
          Invio allo SdI con Openapi: {settings.sdiConfigured ? (settings.sdiSandbox ? "in prova (OPENAPI_SANDBOX=true)." : "attivo.") : "spento, manca OPENAPI_TOKEN_SDI su Render."}
        </TechNote>
      ) : null}
      {settings?.sdiSandbox ? (
        <YStack gap="2">
          <Button alignSelf="flex-start" variant="secondary" disabled={pending} opacity={pending ? 0.6 : 1} onPress={() => void runSdiTest()}>
            Prova l&apos;invio di una fattura
          </Button>
          <Text fontSize={13} color={brand.grafite70}>
            Manda una fattura di prova da 1 € e dice com&apos;è andata. Prima salva i dati della società, posta certificata compresa.
          </Text>
          {sdiTest ? <SdiTestBox result={sdiTest} /> : null}
        </YStack>
      ) : null}
      {error ? <Text color={brand.urgenza}>{error}</Text> : null}
      {message ? <Text color={brand.cianografiaScuro}>{message}</Text> : null}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 12,
        }}
      >
        {FIELDS.map((f) => (
          <Field
            key={f.key}
            label={f.label}
            aria-label={f.label}
            hint={f.hint}
            value={draft[f.key] ?? ""}
            onChangeText={(value) => setDraft((current) => ({ ...current, [f.key]: value }))}
          />
        ))}
      </div>
      <Button variant="primary" alignSelf="flex-start" disabled={pending} opacity={pending ? 0.6 : 1} onPress={() => void saveSettings()}>
        Salva i dati della società
      </Button>
      {settings && settings.testFeeEntriesAfterFrom > 0 ? (
        // Collaudo dell'08/11/2026, E5-05: le prove non fanno mai fatture.
        <Text fontSize={13} color={brand.grafite70}>
          Dopo &quot;Fatture da&quot; ci sono {settings.testFeeEntriesAfterFrom === 1 ? "1 movimento" : `${settings.testFeeEntriesAfterFrom} movimenti`} di account di prova: non diventano fatture.
        </Text>
      ) : null}

      <XStack gap="3" alignItems="flex-end" flexWrap="wrap">
        <YStack width={200}>
          <Field label="Mese (AAAA-MM)" aria-label="Mese del giro da rifare" value={month} onChangeText={setMonth} />
        </YStack>
        <Button variant="secondary" disabled={pending} opacity={pending ? 0.6 : 1} onPress={() => setConfirm({ kind: "run" })}>
          Rifai il giro del mese
        </Button>
        <Button variant="secondary" disabled={pending} opacity={pending ? 0.6 : 1} onPress={() => void checkReconciliation()}>
          Controlla che i conti tornino
        </Button>
      </XStack>
      <Text fontSize={13} color={brand.grafite70}>
        Il giro parte da solo il 1° del mese. Alle 7 le fatture e i riepiloghi ai professionisti, alle 8 i conti ai commercialisti. Dal 2 al 15 ogni mattina recupera le fatture mancate e il 10 avvisa se ne manca ancora qualcuna. Se è saltato, rifallo da qui: quello già fatto non riparte. Il controllo dei conti arriva anche in notifica il 1° del mese.
      </Text>
      {reconciliation ? <ReconciliationBox data={reconciliation} /> : null}

      {invoices === null ? null : invoices.length === 0 ? (
        <Text color={brand.grafite70}>Nessuna fattura emessa finora.</Text>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Numero</th>
                <th>Professionista</th>
                <th>Tipo</th>
                <th>Data</th>
                <th>Totale</th>
                <th>Agenzia delle Entrate</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {invoices.map((row) => (
                <tr key={row.id}>
                  <td className="admin-cell-main">{row.number}</td>
                  <td>{row.recipientName || "—"}</td>
                  <td>{row.creditNote ? "Nota di credito" : INVOICE_SOURCE_LABEL[row.source]}</td>
                  <td>{new Date(row.issuedAt).toLocaleDateString("it-IT")}</td>
                  <td>
                    {row.creditNote ? "−" : ""}
                    {formatEurCents(row.totalEurCents)}
                  </td>
                  <td>
                    {SDI_LABEL[row.sdiStatus]}
                    {row.sdiMessage ? ` · ${row.sdiMessage}` : ""}
                  </td>
                  <td>
                    <XStack gap="2" flexWrap="wrap">
                      {row.hasXml ? (
                        <Button size="2" variant="secondary" onPress={() => void downloadXml(row.id)} aria-label={`Scarica il file della fattura ${row.number}`}>
                          Scarica
                        </Button>
                      ) : null}
                      {row.sdiStatus === "NOT_SENT" || row.sdiStatus === "REJECTED" ? (
                        <Button size="2" variant="secondary" onPress={() => setConfirm({ kind: "resend", id: row.id, number: row.number })}>
                          {settings?.sdiConfigured ? "Rimanda" : "Rifai"}
                        </Button>
                      ) : null}
                    </XStack>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {confirm ? (
        <AdminConfirmModal
          title={confirm.kind === "run" ? "Rifai il giro del mese" : settings?.sdiConfigured ? "Rimanda la fattura" : "Rifai la fattura"}
          description={
            confirm.kind === "run"
              ? `${monthlyInvoiceLate(month) ? `Attenzione: la fattura di ${month} andava emessa entro il 15 del mese dopo. Avrà la data dell'ultimo giorno di ${month} e il numero dopo le altre. Sentite prima il commercialista. ` : ""}Per ${month} fa le fatture${settings?.sdiConfigured ? " e le manda al fisco" : ""}. Poi manda i riepiloghi ai professionisti e ai loro commercialisti. Solo quello che manca: niente parte due volte. Una fattura emessa non si cancella, si corregge con una nota di credito.`
              : `${settings?.sdiConfigured ? "Manda di nuovo all'Agenzia delle Entrate la fattura" : "Rifà la fattura"} ${confirm.number} con i dati fiscali di oggi del professionista.`
          }
          confirmLabel={confirm.kind === "run" ? "Rifai il giro" : settings?.sdiConfigured ? "Rimanda" : "Rifai"}
          onClose={() => setConfirm(null)}
          onConfirm={() => (confirm.kind === "run" ? runMonth() : resend(confirm.id))}
        />
      ) : null}
    </YStack>
  );
}

/**
 * Quadratura del mese (docs/CHANGELOG.md §378): le trattenute del nostro
 * registro accanto a quelle che Stripe ha davvero incassato, e il costo vero
 * delle carte accanto alla nostra stima.
 */
/** Esito della prova d'invio, passo per passo. */
function SdiTestBox({ result }: { result: SdiSandboxTestResult }) {
  return (
    <YStack gap="2" padding="3" borderRadius={10} backgroundColor={result.ok ? brand.cianografiaVelo : brand.urgenzaVelo} role="status">
      <Text fontWeight="800" color={brand.grafite}>
        {result.ok ? "La prova è andata a buon fine." : "La prova si è fermata."}
      </Text>
      {result.steps.map((step) => (
        <Text key={step.label} color={brand.grafite}>
          {step.ok ? "✓" : "✗"} {step.label}
          {step.detail ? `: ${step.detail}` : ""}
        </Text>
      ))}
    </YStack>
  );
}

function ReconciliationBox({ data }: { data: FeeReconciliation }) {
  const rows: [string, number, number | null][] = [
    ["Trattenute incassate", data.ledger.holdsEurCents, data.stripe?.applicationFeesEurCents ?? null],
    ["Trattenute restituite", data.ledger.returnsEurCents, data.stripe?.applicationFeeRefundsEurCents ?? null],
    ["Costi delle carte", data.ledger.cardFeesEurCents, data.stripe?.stripeFeesEurCents ?? null],
  ];
  return (
    <YStack gap="2" padding="3" borderRadius={10} borderWidth={1} borderColor={data.alerts.length ? brand.urgenza : brand.filetto}>
      <Text fontWeight="800">I conti di {data.month} tornano?</Text>
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th />
              <th>Secondo noi</th>
              <th>Secondo il servizio dei pagamenti</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([label, ledger, stripe]) => (
              <tr key={label}>
                <td className="admin-cell-main">{label}</td>
                <td>{formatEurCents(ledger)}</td>
                <td>{stripe === null ? "—" : formatEurCents(stripe)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Text fontSize={13} color={brand.grafite70}>
        Costi pagati dai professionisti, come le contestazioni perse: {formatEurCents(data.ledger.costsEurCents)}.
        {data.stripe ? "" : " Il servizio dei pagamenti non è collegato: si vedono solo i nostri conti."}
      </Text>
      {data.alerts.length === 0 ? (
        <Text color={brand.cianografiaScuro}>Tutto torna.</Text>
      ) : (
        data.alerts.map((alert) => (
          <Text key={alert} color={brand.urgenza}>
            {alert}
          </Text>
        ))
      )}
    </YStack>
  );
}

/** Esito di "Rifai il giro del mese" in una riga. */
function monthRerunMessage(issued: number, notified: number, statements: number): string {
  if (issued + notified + statements === 0) return "Era già tutto fatto: niente di nuovo per quel mese.";
  const parts = [
    issued > 0 ? `${issued} ${issued === 1 ? "fattura emessa" : "fatture emesse"}` : null,
    notified > 0 ? `${notified} ${notified === 1 ? "riepilogo mandato" : "riepiloghi mandati"}` : null,
    statements > 0 ? `${statements} ${statements === 1 ? "estratto mandato" : "estratti mandati"} ai commercialisti` : null,
  ].filter(Boolean);
  return `${parts.join(", ")}.`;
}
