"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  INVOICE_SOURCE_LABEL,
  accountantSettingsSchema,
  accountingMonthLabel,
  courtesyYearTotals,
  formatEurCents,
  freePeriodSummary,
  type CourtesyDocumentSummary,
  type DocumentsOverview,
  type MissingClientDocument,
  type MySubscription,
} from "@professionisti/shared";
import { Button, EmptyState, Field, Surface, Text, XStack, YStack, brand, radiusDoc } from "@professionisti/ui";
import { FiscoArea } from "@/components/fisco/FiscoArea";
import { ConsentCheckbox } from "@/components/ConsentCheckbox";
import { LearnMore } from "@/components/LearnMore";
import { apiClient } from "@/lib/apiClient";
import { useAuth } from "@/lib/AuthContext";
import { downloadTextFile } from "@/components/admin/adminUi";
import { PdfButton, documentDate } from "./_components/DocumentParts";

/**
 * "Fatture e documenti" del professionista (decisioni dell'utente del
 * 27/10/2026, docs/CHANGELOG.md §378): le nostre fatture, l'estratto di ogni
 * mese e il commercialista a cui mandarlo. Scheda dell'area Fisco e pagamenti
 * (docs/changelog/2026-10-28-fisco-e-pagamenti-schede.md); ci si arriva anche
 * da Abbonamento.
 */
export default function DocumentsPage() {
  const { token, isLoading } = useAuth();
  const [data, setData] = useState<DocumentsOverview | null | undefined>(undefined);
  const [sub, setSub] = useState<MySubscription | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    apiClient
      .documentsOverview(token)
      .then(setData)
      .catch((e) => {
        setData(null);
        setError(e instanceof Error ? e.message : "Non riusciamo a caricare i documenti: riprova tra poco.");
      });
    apiClient
      .getMySubscription(token)
      .then(setSub)
      .catch(() => setSub(null));
  }, [token]);

  const free = sub ? freePeriodSummary(sub, new Date()) : null;

  return (
    <FiscoArea tab="documenti" heading="Fatture e documenti">
      <YStack gap="$5">
        <LearnMore fontSize={16} summary="Le nostre fatture e l'estratto di ogni mese, da scaricare o dare al commercialista.">
          <Text fontSize={16} color={brand.grafite70}>
            Ogni mese ti mandiamo una fattura con le trattenute sui pagamenti online, e una per l&apos;abbonamento quando lo paghi. Sono già
            pagate: passale al tuo commercialista, sono costi della tua attività.
          </Text>
          <Text fontSize={16} color={brand.grafite70}>
            L&apos;estratto del mese mette insieme quanto ti hanno pagato i clienti, quanto abbiamo trattenuto e i bonifici arrivati.
          </Text>
        </LearnMore>

        {free ? (
          <Link href="/dashboard/documenti/mese-gratuito" style={{ textDecoration: "none" }}>
            <Surface borderRadius={radiusDoc} padding="$4" gap="$1" backgroundColor={brand.cianografiaVelo}>
              <XStack justifyContent="space-between" alignItems="center" gap="$3" flexWrap="wrap">
                <Text fontSize={16} fontWeight="800" color={brand.grafite}>
                  Abbonamento di questo mese: 0 €
                </Text>
                <Text fontSize={16} fontWeight="700" color={brand.cianografiaScuro}>
                  Vedi il riepilogo →
                </Text>
              </XStack>
              <Text fontSize={16} color={brand.grafite70}>
                {free.label}
                {free.months > 1 ? `, mese ${free.month} di ${free.months}` : ""}.
              </Text>
            </Surface>
          </Link>
        ) : null}

        {isLoading || data === undefined ? (
          <YStack gap="$3" aria-busy>
            <YStack height={88} borderRadius="$3" backgroundColor={brand.gesso} />
            <YStack height={140} borderRadius="$3" backgroundColor={brand.gesso} />
          </YStack>
        ) : error || !data ? (
          <Text fontSize={16} color={brand.urgenza} role="alert">
            {error ?? "Non riusciamo a caricare i documenti: riprova tra poco."}
          </Text>
        ) : (
          <>
            <YStack gap="$3">
              <Text tag="h2" fontFamily="$heading" fontSize={22} fontWeight="800" color={brand.grafite}>
                Estratti del mese
              </Text>
              {data.months.length === 0 ? (
                <EmptyState icon="coins" title="Ancora nessun movimento" description="L'estratto compare dal primo pagamento di un cliente." />
              ) : (
                <Surface borderRadius={radiusDoc} padding="$2">
                  {data.months.map((month, index) => (
                    <Link key={month} href={`/dashboard/documenti/estratto/${month}`} style={{ textDecoration: "none" }}>
                      <XStack justifyContent="space-between" alignItems="center" padding="$3" borderTopWidth={index === 0 ? 0 : 1} borderColor={brand.filetto}>
                        <Text fontSize={16} fontWeight="700" color={brand.grafite} textTransform="capitalize">
                          {accountingMonthLabel(month)}
                        </Text>
                        <Text fontSize={16} fontWeight="700" color={brand.cianografiaScuro}>
                          Apri →
                        </Text>
                      </XStack>
                    </Link>
                  ))}
                </Surface>
              )}
            </YStack>

            <YStack gap="$3">
              <Text tag="h2" fontFamily="$heading" fontSize={22} fontWeight="800" color={brand.grafite}>
                Fatture
              </Text>
              {data.invoices.length === 0 ? (
                <Text fontSize={16} color={brand.grafite70}>
                  {data.invoicesActive ? "Ancora nessuna fattura: la prima arriva il mese dopo il primo pagamento online." : "Le nostre fatture partono con l'apertura del sito. Intanto qui trovi gli estratti."}
                </Text>
              ) : (
                <Surface borderRadius={radiusDoc} padding="$2">
                  {data.invoices.map((invoice, index) => (
                    <Link key={invoice.id} href={`/dashboard/documenti/fattura/${invoice.id}`} style={{ textDecoration: "none" }}>
                      <XStack justifyContent="space-between" alignItems="center" gap="$3" padding="$3" borderTopWidth={index === 0 ? 0 : 1} borderColor={brand.filetto}>
                        <YStack flex={1} minWidth={0} gap={2}>
                          <Text fontSize={16} fontWeight="700" color={brand.grafite}>
                            {invoice.creditNote ? "Nota di credito" : INVOICE_SOURCE_LABEL[invoice.source]}
                            {invoice.periodMonth ? `, ${accountingMonthLabel(invoice.periodMonth)}` : ""}
                          </Text>
                          <Text fontSize={13} color={brand.grafite70}>
                            {invoice.number} · {documentDate(invoice.issuedAt)}
                          </Text>
                        </YStack>
                        <Text fontSize={16} fontWeight="800" color={brand.grafite} fontVariant={["tabular-nums"]}>
                          {invoice.creditNote ? "−" : ""}
                          {formatEurCents(invoice.totalEurCents)}
                        </Text>
                      </XStack>
                    </Link>
                  ))}
                </Surface>
              )}
            </YStack>

            {data.missingDocuments?.length ? <MissingDocuments rows={data.missingDocuments} /> : null}

            {data.receipts || data.clientDocuments?.length ? <ClientDocuments token={token ?? ""} documents={data.clientDocuments ?? []} /> : null}

            {token ? <AccountantCard token={token} initial={data.accountant} /> : null}
          </>
        )}
      </YStack>
    </FiscoArea>
  );
}

/**
 * Lavori pagati online ancora senza ricevuta (solo senza partita IVA)
 * (docs/changelog/2026-10-30-documenti-migliorie.md): una riga per lavoro che
 * porta alla pagina dove si prepara.
 */
function MissingDocuments({ rows }: { rows: MissingClientDocument[] }) {
  const count = rows.length === 1 ? "1 lavoro pagato online" : `${rows.length} lavori pagati online`;
  return (
    <Surface borderRadius={radiusDoc} padding="$4" gap="$2" borderWidth={1} borderColor={brand.ottone} backgroundColor={brand.calce}>
      <Text tag="h2" fontSize={18} fontWeight="800" color={brand.grafite}>
        {count} senza ricevuta
      </Text>
      <Text fontSize={16} color={brand.grafite70}>
        Prepara la ricevuta e dalla al cliente: ti serve per la dichiarazione dei redditi.
      </Text>
      <YStack>
        {rows.map((row, index) => (
          <Link key={row.bookingId} href={`/dashboard/documenti/cortesia/${row.bookingId}`} style={{ textDecoration: "none" }}>
            <XStack justifyContent="space-between" alignItems="center" gap="$3" paddingVertical="$2" borderTopWidth={index === 0 ? 0 : 1} borderColor={brand.filetto}>
              <YStack flex={1} minWidth={0} gap={2}>
                <Text fontSize={16} fontWeight="700" color={brand.grafite}>
                  {[row.jobLabel ?? "Lavoro", documentDate(row.date)].join(" del ")}
                </Text>
                {row.customerName ? (
                  <Text fontSize={13} color={brand.grafite70}>
                    {row.customerName} · {formatEurCents(row.amountEurCents)}
                  </Text>
                ) : null}
              </YStack>
              <Text fontSize={16} fontWeight="700" color={brand.cianografiaScuro}>
                Prepara →
              </Text>
            </XStack>
          </Link>
        ))}
      </YStack>
    </Surface>
  );
}

/**
 * Ricevute date ai clienti (docs/CHANGELOG.md §381), col
 * totale dell'anno: le ricevute per prestazione occasionale vanno nella
 * dichiarazione dei redditi. Se l'importo è cambiato dopo il PDF, lo dice.
 */
function ClientDocuments({ token, documents }: { token: string; documents: CourtesyDocumentSummary[] }) {
  const totals = courtesyYearTotals(documents);
  const years = [...new Set(totals.map((row) => row.year))];
  return (
    <YStack gap="$3">
      <Text tag="h2" fontFamily="$heading" fontSize={22} fontWeight="800" color={brand.grafite}>
        Ricevute date ai clienti
      </Text>
      {documents.length === 0 ? (
        <Text fontSize={16} color={brand.grafite70}>
          Le ricevute che prepari per i clienti, dalla scheda del lavoro dopo &quot;Lavoro terminato&quot;, le trovi qui.
        </Text>
      ) : (
        <>
          <XStack gap="$3" flexWrap="wrap">
            {totals.map((row) => (
              <Surface key={`${row.year}-${row.kind}`} borderRadius={radiusDoc} padding="$4" gap={2} flexGrow={1} flexBasis={220}>
                <Text fontSize={13} fontWeight="800" color={brand.grafite70} textTransform="uppercase" letterSpacing={0.5}>
                  Ricevute {row.year}
                </Text>
                <Text fontFamily="$heading" fontSize={26} fontWeight="800" color={brand.grafite} fontVariant={["tabular-nums"]}>
                  {formatEurCents(row.totalEurCents)}
                </Text>
                <Text fontSize={15} color={brand.grafite70}>
                  {row.count === 1 ? "1 documento" : `${row.count} documenti`}
                  {row.missingAmounts > 0 ? `, ${row.missingAmounts} senza importo` : ""}
                </Text>
              </Surface>
            ))}
          </XStack>
          {totals.length > 0 ? (
            <Text fontSize={16} color={brand.grafite70}>
              Il totale delle ricevute dell&apos;anno va nella dichiarazione dei redditi: scarica il riepilogo per il tuo commercialista, oppure scrivi qui sotto la sua email e spunta &quot;Mandagli l&apos;estratto&quot;: a gennaio gli arriva anche il riepilogo.
            </Text>
          ) : null}
          {years.map((year) => (
            <YearDownloads key={year} token={token} year={year} />
          ))}
          <Surface borderRadius={radiusDoc} padding="$2">
            {documents.map((doc, index) => (
              <Link key={doc.bookingId} href={`/dashboard/documenti/cortesia/${doc.bookingId}`} style={{ textDecoration: "none" }}>
                <XStack justifyContent="space-between" alignItems="center" gap="$3" padding="$3" borderTopWidth={index === 0 ? 0 : 1} borderColor={brand.filetto}>
                  <YStack flex={1} minWidth={0} gap={2}>
                    <Text fontSize={16} fontWeight="700" color={brand.grafite}>
                      {doc.label}
                    </Text>
                    <Text fontSize={13} color={brand.grafite70}>
                      {[doc.customerName, doc.jobLabel].filter(Boolean).join(" · ") || "Lavoro"}
                    </Text>
                    {doc.amountChanged ? (
                      <Text fontSize={13} fontWeight="700" color={brand.ottoneScuro}>
                        L&apos;importo è cambiato dopo il PDF: scaricalo di nuovo e ridallo al cliente
                      </Text>
                    ) : doc.totalEurCents === null ? (
                      <Text fontSize={13} fontWeight="700" color={brand.ottoneScuro}>
                        Senza importo: chiudi il lavoro con il prezzo finale
                      </Text>
                    ) : null}
                  </YStack>
                  <Text fontSize={16} fontWeight="800" color={brand.grafite} fontVariant={["tabular-nums"]}>
                    {doc.totalEurCents !== null ? formatEurCents(doc.totalEurCents) : "—"}
                  </Text>
                </XStack>
              </Link>
            ))}
          </Surface>
        </>
      )}
    </YStack>
  );
}

/** Riepilogo dell'anno per il commercialista, in PDF e nel foglio di calcolo (docs/CHANGELOG.md §382). */
function YearDownloads({ token, year }: { token: string; year: number }) {
  const [csvError, setCsvError] = useState<string | null>(null);

  async function downloadCsv() {
    setCsvError(null);
    try {
      const file = await apiClient.clientDocumentsYearCsv(token, year);
      downloadTextFile(file.fileName, file.csv);
    } catch (e) {
      setCsvError(e instanceof Error ? e.message : "Non riusciamo a preparare il file: riprova tra poco.");
    }
  }

  return (
    <YStack gap="$2">
      <XStack gap="$3" flexWrap="wrap" alignItems="flex-start">
        <PdfButton label={`Scarica il riepilogo del ${year}`} load={() => apiClient.clientDocumentsYearPdf(token, year)} fileName={`documenti-clienti-${year}.pdf`} />
        <Button variant="secondary" onPress={() => void downloadCsv()}>
          Foglio di calcolo
        </Button>
      </XStack>
      {csvError ? (
        <Text fontSize={16} color={brand.urgenza} role="alert">
          {csvError}
        </Text>
      ) : null}
    </YStack>
  );
}

/** Il commercialista: l'estratto gli arriva per email il 1° del mese, solo con la spunta; a gennaio anche il riepilogo dell'anno (§390). */
function AccountantCard({ token, initial }: { token: string; initial: DocumentsOverview["accountant"] }) {
  const [email, setEmail] = useState(initial.email ?? "");
  const [enabled, setEnabled] = useState(initial.enabled);
  const [saved, setSaved] = useState(initial);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
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
      const result = await apiClient.updateAccountant(token, parsed.data);
      setSaved(result);
      setEmail(result.email ?? "");
      setEnabled(result.enabled);
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Non riusciamo a salvare: riprova tra poco.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Surface borderRadius={radiusDoc} padding="$5" gap="$3">
      <Text tag="h2" fontFamily="$heading" fontSize={22} fontWeight="800" color={brand.grafite}>
        Il tuo commercialista
      </Text>
      <LearnMore fontSize={16} summary="Cosa dargli: con la spunta qui sotto gli arriva quasi tutto da solo.">
        {/* Cosa dare al commercialista (docs/changelog/2026-10-30-documenti-migliorie.md). */}
        <YStack gap="$2">
          {[
            ["Ogni mese", "l'estratto, con i pagamenti dei clienti, le nostre trattenute e i bonifici, più le nostre fatture del mese in PDF."],
            ["A gennaio", "il riepilogo dell'anno delle ricevute che hai dato ai clienti, se lavori senza partita IVA."],
            ["Quando serve", "i dati DAC7 che comunichiamo all'Agenzia delle Entrate, da Fisco e pagamenti → Dati DAC7."],
            ["Da te", "le fatture che fai col tuo programma e le spese della tua attività: quelle noi non le vediamo."],
          ].map(([when, what]) => (
            <Text key={when} fontSize={16} color={brand.grafite70}>
              <Text fontWeight="800" color={brand.grafite}>
                {when}:
              </Text>{" "}
              {what}
            </Text>
          ))}
        </YStack>
      </LearnMore>
      <Field
        label="Email del commercialista"
        accessibilityLabel="Email del commercialista"
        value={email}
        onChangeText={(value) => {
          setEmail(value);
          setDone(false);
        }}
        inputMode="email"
        autoComplete="email"
        error={error ?? undefined}
      />
      <ConsentCheckbox
        checked={enabled}
        onToggle={() => {
          setEnabled((value) => !value);
          setDone(false);
        }}
      >
        Mandagli l&apos;estratto ogni mese e a gennaio il riepilogo dell&apos;anno, in PDF e nel foglio di calcolo
      </ConsentCheckbox>
      <XStack gap="$3" alignItems="center" flexWrap="wrap">
        <Button variant="primary" alignSelf="flex-start" disabled={!dirty || pending} opacity={!dirty || pending ? 0.6 : 1} onPress={() => void save()}>
          {pending ? "Salvataggio..." : "Salva"}
        </Button>
        {done && !dirty ? (
          <Text fontSize={16} color={brand.cianografiaScuro} role="status">
            {saved.enabled ? "Fatto: gli arriva il 1° di ogni mese." : "Salvato."}
          </Text>
        ) : null}
      </XStack>
    </Surface>
  );
}
