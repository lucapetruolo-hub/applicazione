"use client";

import { useCallback, useEffect, useState } from "react";
import {
  INVOICE_SOURCE_LABEL,
  accountantSettingsSchema,
  accountingMonthLabel,
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
import { TechNote, downloadBlobFile, downloadTextFile, errorMessage } from "./adminUi";
import { AdminConfirmModal } from "./AdminConfirmModal";
import { ConsentCheckbox } from "@/components/ConsentCheckbox";
import Link from "@/components/IntentLink";

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
 * Admin → Fisco e fatture (docs/CHANGELOG.md §378). Dal riordino del
 * 24/11/2026 (docs/changelog/2026-11-24-fatture-del-mese-zip.md) in due
 * schede: `invoices` = "Fatture emesse" (le fatture col loro stato allo SdI,
 * il mese: giro, conti, zip); `company` = "Società e commercialista" (i dati
 * della società che le emette, l'invio allo SdI con la prova, il commercialista).
 */
export function AdminInvoicesSection({ token, view }: { token: string; view: "invoices" | "company" }) {
  const [settings, setSettings] = useState<PlatformInvoiceSettingsView | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [invoices, setInvoices] = useState<PlatformInvoiceAdminRow[] | null>(null);
  const [month, setMonth] = useState(lastMonth());
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Esito dei pulsanti del mese, scritto sotto quei pulsanti e non in cima alla pagina.
  const [monthNotice, setMonthNotice] = useState<{ text: string; error: boolean } | null>(null);
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
      setMonthNotice({ text: `${monthRerunMessage(issued, notified, statements)}${abroadNote}`, error: false });
      setConfirm(null);
      load();
    } finally {
      setPending(false);
    }
  }

  async function checkReconciliation() {
    setPending(true);
    setMonthNotice(null);
    try {
      setReconciliation(await apiClient.adminFeeReconciliation(token, month));
    } catch (e) {
      setMonthNotice({ text: errorMessage(e), error: true });
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

  // Lo zip del mese da girare al commercialista (docs/changelog/2026-11-24-fatture-del-mese-zip.md).
  async function downloadMonthZip() {
    setPending(true);
    setMonthNotice(null);
    try {
      downloadBlobFile(`fatture-${month}.zip`, await apiClient.adminInvoicesMonthZip(token, month));
      setMonthNotice({ text: `Fatture di ${month} scaricate. Dentro ci sono i file delle fatture, i PDF e un riepilogo.`, error: false });
    } catch (e) {
      setMonthNotice({ text: errorMessage(e), error: true });
    } finally {
      setPending(false);
    }
  }

  async function resend(id: string) {
    const row = await apiClient.adminResendInvoice(token, id);
    setInvoices((current) => current?.map((r) => (r.id === id ? row : r)) ?? null);
    setMessage(row.sdiStatus === "SENT" ? "Fattura mandata all'Agenzia delle Entrate." : (row.sdiMessage ?? "Fattura rifatta."));
    setConfirm(null);
  }

  if (view === "company") {
    return (
    <YStack gap="4">
      <H2 size="7">Dati della società</H2>
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

      {settings ? <CompanyAccountantBox token={token} initial={settings.accountant} /> : null}
    </YStack>
    );
  }

  return (
    <YStack gap="4">
      <H2 size="7">Fatture emesse</H2>
      {settings && !settings.ready ? (
        <Text color={brand.grafite70}>
          Mancano i dati della società: per ora i professionisti vedono solo gli estratti. Li scrivi in{" "}
          <Link href="/admin/finanza/societa">Società e commercialista</Link>.
        </Text>
      ) : null}
      {error ? <Text color={brand.urgenza}>{error}</Text> : null}
      {message ? <Text color={brand.cianografiaScuro}>{message}</Text> : null}

      <XStack gap="3" alignItems="flex-end" flexWrap="wrap">
        <YStack width={200}>
          <Field label="Mese (AAAA-MM)" aria-label="Mese" value={month} onChangeText={setMonth} />
        </YStack>
        <Button variant="secondary" disabled={pending} opacity={pending ? 0.6 : 1} onPress={() => setConfirm({ kind: "run" })}>
          Rifai il giro del mese
        </Button>
        <Button variant="secondary" disabled={pending} opacity={pending ? 0.6 : 1} onPress={() => void checkReconciliation()}>
          Controlla che i conti tornino
        </Button>
        <Button variant="secondary" disabled={pending} opacity={pending ? 0.6 : 1} onPress={() => void downloadMonthZip()}>
          Scarica le fatture del mese
        </Button>
      </XStack>
      {monthNotice ? (
        <Text role="status" color={monthNotice.error ? brand.urgenza : brand.cianografiaScuro}>
          {monthNotice.text}
        </Text>
      ) : null}
      <Text fontSize={13} color={brand.grafite70}>
        Il giro parte da solo il 1° del mese. Alle 7 le fatture e i riepiloghi ai professionisti, alle 8 i conti ai commercialisti. Dal 2 al 15 ogni mattina recupera le fatture mancate e il 10 avvisa se ne manca ancora qualcuna. Se è saltato, rifallo da qui: quello già fatto non riparte. Il controllo dei conti arriva anche in notifica il 1° del mese. Con &quot;Scarica le fatture del mese&quot; hai un solo file per il commercialista. Dentro c&apos;è ogni fattura del mese, anche in PDF, con un riepilogo per il foglio di calcolo.
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

/**
 * Commercialista della nostra società: con la spunta il 5 di ogni mese gli
 * arriva lo zip delle fatture del mese prima (decisione di Luca del 24/11/2026,
 * docs/changelog/2026-11-24-fatture-del-mese-zip.md).
 */
const SEND_RESULT: Record<string, string> = {
  sent: "mandate, gli arrivano tra poco.",
  off: "prima scrivi e salva l'email del commercialista.",
  empty: "nel mese non ci sono fatture, non è partito niente.",
  "too-big": "lo zip è troppo grande per un'email. Scaricalo e mandalo tu.",
  failed: "l'invio non è riuscito. Riprova tra poco.",
  already: "già mandate.",
};

function CompanyAccountantBox({ token, initial }: { token: string; initial: PlatformInvoiceSettingsView["accountant"] }) {
  const [month, setMonth] = useState(lastMonth());
  const [saved, setSaved] = useState(initial);
  const [email, setEmail] = useState(initial.email ?? "");
  const [enabled, setEnabled] = useState(initial.enabled);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);
  const [sendNote, setSendNote] = useState<{ text: string; error: boolean } | null>(null);
  const dirty = email.trim().toLowerCase() !== (saved.email ?? "") || enabled !== saved.enabled;

  async function save() {
    const parsed = accountantSettingsSchema.safeParse({ email: email.trim() || undefined, enabled });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Controlla l'email.");
      return;
    }
    setPending(true);
    setError(null);
    try {
      const result = await apiClient.adminUpdateCompanyAccountant(token, parsed.data);
      setSaved(result);
      setEmail(result.email ?? "");
      setEnabled(result.enabled);
      setDone(true);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setPending(false);
    }
  }

  async function sendNow() {
    setPending(true);
    setSendNote(null);
    try {
      const { result, accountant } = await apiClient.adminSendCompanyAccountantZip(token, month);
      setSaved(accountant);
      setSendNote({ text: `Fatture di ${month}: ${SEND_RESULT[result] ?? result}`, error: result !== "sent" });
    } catch (e) {
      setSendNote({ text: errorMessage(e), error: true });
    } finally {
      setPending(false);
    }
  }

  return (
    <YStack gap="3" padding="3" borderRadius={10} borderWidth={1} borderColor={brand.filetto}>
      <Text fontWeight="800">Commercialista della società</Text>
      <YStack maxWidth={480}>
        <Field
          label="Email del commercialista"
          aria-label="Email del commercialista della società"
          value={email}
          onChangeText={(value) => {
            setEmail(value);
            setDone(false);
          }}
          inputMode="email"
          autoComplete="email"
          error={error ?? undefined}
        />
      </YStack>
      <ConsentCheckbox
        checked={enabled}
        onToggle={() => {
          setEnabled((value) => !value);
          setDone(false);
        }}
      >
        Manda ogni mese le fatture al commercialista
      </ConsentCheckbox>
      <Text fontSize={13} color={brand.grafite70}>
        Il 5 del mese gli arriva lo zip delle fatture del mese prima, con il riepilogo.
        {saved.lastMonth ? ` Ultimo invio: ${accountingMonthLabel(saved.lastMonth)}.` : ""}
      </Text>
      <XStack gap="3" alignItems="center" flexWrap="wrap">
        <Button variant="secondary" alignSelf="flex-start" disabled={!dirty || pending} opacity={!dirty || pending ? 0.6 : 1} onPress={() => void save()}>
          Salva il commercialista
        </Button>
        {done && !dirty ? (
          <Text color={brand.cianografiaScuro} role="status">
            {saved.enabled ? "Fatto: gli arriva il 5 di ogni mese." : "Salvato."}
          </Text>
        ) : null}
      </XStack>
      <XStack gap="3" alignItems="flex-end" flexWrap="wrap">
        <YStack width={200}>
          <Field label="Mese da mandare (AAAA-MM)" aria-label="Mese da mandare al commercialista" value={month} onChangeText={setMonth} />
        </YStack>
        <Button variant="secondary" alignSelf="flex-start" disabled={!saved.email || dirty || pending} opacity={!saved.email || dirty || pending ? 0.6 : 1} onPress={() => void sendNow()}>
          Mandalo adesso
        </Button>
      </XStack>
      <Text fontSize={13} color={brand.grafite70}>
        Ogni invio resta nel <Link href="/admin/finanza/invii">Registro invii</Link>.
      </Text>
      {sendNote ? (
        <Text role="status" color={sendNote.error ? brand.urgenza : brand.cianografiaScuro}>
          {sendNote.text}
        </Text>
      ) : null}
    </YStack>
  );
}
