"use client";

import { useCallback, useEffect, useState } from "react";
import {
  INVOICE_SOURCE_LABEL,
  formatEurCents,
  platformInvoiceSettingsSchema,
  type FeeReconciliation,
  type InvoiceSdiStatusValue,
  type PlatformInvoiceAdminRow,
  type PlatformInvoiceSettingsInput,
  type PlatformInvoiceSettingsView,
} from "@professionisti/shared";
import { Button, Field, H2, Text, XStack, YStack, brand } from "@professionisti/ui";
import { apiClient } from "@/lib/apiClient";
import { downloadTextFile, errorMessage } from "./adminUi";

const SDI_LABEL: Record<InvoiceSdiStatusValue, string> = {
  NOT_SENT: "Da inviare",
  SENT: "Inviata",
  DELIVERED: "Consegnata",
  REJECTED: "Scartata",
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
  { key: "reaOffice", label: "Ufficio REA (sigla)" },
  { key: "reaNumber", label: "Numero REA" },
  { key: "shareCapital", label: "Capitale sociale" },
  { key: "pecEmail", label: "PEC" },
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
 * Admin → Finanza, "Le nostre fatture" (docs/CHANGELOG.md §372): i dati
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
  const [reconciliation, setReconciliation] = useState<FeeReconciliation | null>(null);

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

  async function runMonth() {
    setPending(true);
    setError(null);
    try {
      const { issued } = await apiClient.adminRunInvoiceMonth(token, month);
      setMessage(issued === 0 ? "Nessuna fattura nuova per quel mese." : `${issued} fatture emesse.`);
      load();
    } catch (e) {
      setError(errorMessage(e));
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

  async function downloadXml(id: string) {
    try {
      const file = await apiClient.adminInvoiceXml(token, id);
      downloadTextFile(file.fileName, file.xml, "application/xml;charset=utf-8");
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  async function resend(id: string) {
    try {
      const row = await apiClient.adminResendInvoice(token, id);
      setInvoices((current) => current?.map((r) => (r.id === id ? row : r)) ?? null);
      setMessage(row.sdiStatus === "SENT" ? "Fattura inviata allo SdI." : (row.sdiMessage ?? "XML rigenerato."));
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  return (
    <YStack gap="$4">
      <H2 size="$7">Le nostre fatture</H2>
      {settings ? (
        <Text color={brand.grafite70}>
          {settings.ready ? "Dati della società completi: le fatture partono." : "Mancano i dati della società: per ora i professionisti vedono solo gli estratti."}{" "}
          {settings.sdiConfigured ? "Invio allo SdI con Openapi attivo." : "Invio allo SdI spento (manca OPENAPI_TOKEN_SDI su Render): scarica l'XML e caricalo a mano."}
        </Text>
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
            accessibilityLabel={f.label}
            hint={f.hint}
            value={draft[f.key] ?? ""}
            onChangeText={(value) => setDraft((current) => ({ ...current, [f.key]: value }))}
          />
        ))}
      </div>
      <Button alignSelf="flex-start" disabled={pending} opacity={pending ? 0.6 : 1} onPress={() => void saveSettings()}>
        Salva i dati della società
      </Button>

      <XStack gap="$3" alignItems="flex-end" flexWrap="wrap">
        <YStack width={200}>
          <Field label="Mese (AAAA-MM)" accessibilityLabel="Mese delle trattenute da fatturare" value={month} onChangeText={setMonth} />
        </YStack>
        <Button variant="secondary" disabled={pending} opacity={pending ? 0.6 : 1} onPress={() => void runMonth()}>
          Emetti le fatture del mese
        </Button>
        <Button variant="secondary" disabled={pending} opacity={pending ? 0.6 : 1} onPress={() => void checkReconciliation()}>
          Controlla la quadratura
        </Button>
      </XStack>
      <Text fontSize={13} color={brand.grafite70}>
        Il giro parte da solo il 1° del mese alle 7. Rilanciarlo non crea fatture doppie. La quadratura arriva anche in notifica il 1° del mese.
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
                <th>SdI</th>
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
                    <XStack gap="$2" flexWrap="wrap">
                      {row.hasXml ? (
                        <Button size="$2" variant="secondary" onPress={() => void downloadXml(row.id)}>
                          XML
                        </Button>
                      ) : null}
                      {row.sdiStatus === "NOT_SENT" || row.sdiStatus === "REJECTED" ? (
                        <Button size="$2" variant="secondary" onPress={() => void resend(row.id)}>
                          {settings?.sdiConfigured ? "Rimanda" : "Rigenera"}
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
    </YStack>
  );
}

/**
 * Quadratura del mese (docs/CHANGELOG.md §372): le trattenute del nostro
 * registro accanto a quelle che Stripe ha davvero incassato, e il costo vero
 * delle carte accanto alla nostra stima.
 */
function ReconciliationBox({ data }: { data: FeeReconciliation }) {
  const rows: [string, number, number | null][] = [
    ["Trattenute incassate", data.ledger.holdsEurCents, data.stripe?.applicationFeesEurCents ?? null],
    ["Trattenute restituite", data.ledger.returnsEurCents, data.stripe?.applicationFeeRefundsEurCents ?? null],
    ["Costo delle carte", data.ledger.cardFeesEurCents, data.stripe?.stripeFeesEurCents ?? null],
  ];
  return (
    <YStack gap="$2" padding="$3" borderRadius={10} borderWidth={1} borderColor={data.alerts.length ? brand.urgenza : brand.filetto}>
      <Text fontWeight="800">Quadratura di {data.month}</Text>
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th />
              <th>Nostro registro</th>
              <th>Stripe</th>
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
        Costi ribaddebitati ai professionisti (es. contestazioni perse): {formatEurCents(data.ledger.costsEurCents)}.
        {data.stripe ? "" : " Stripe non è configurato: si vede solo il nostro registro."}
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
