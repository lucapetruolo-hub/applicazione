"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { WITHHOLDING_RATE_PERCENT, courtesyAmountChanged, courtesyDetailsSchema, type CourtesyCopyView, type CourtesyDetailsInput } from "@professionisti/shared";
import { Button, Field, Text, XStack, YStack, brand, radiusDoc } from "@professionisti/ui";
import { ConsentCheckbox } from "@/components/ConsentCheckbox";
import { apiClient } from "@/lib/apiClient";
import { useAuth } from "@/lib/AuthContext";
import { AmountRow, DocumentPage, LoadingDocument, NoteBox, PartyBoxes, PdfButton, eur } from "../../_components/DocumentParts";

function day(iso: string): string {
  return new Date(iso).toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Rome" });
}

/** Quello che il professionista scrive sulla ricevuta, come lo tiene la pagina. */
type Draft = { customerName: string; customerTaxCode: string; withholding: boolean };

function draftOf(copy: CourtesyCopyView): Draft {
  return {
    customerName: copy.customerFields?.name ?? "",
    customerTaxCode: copy.customerFields?.taxCode ?? "",
    withholding: copy.withholding?.applies ?? true,
  };
}

/** Solo quello che è cambiato rispetto al documento salvato. */
function changesOf(copy: CourtesyCopyView, draft: Draft): CourtesyDetailsInput {
  const saved = draftOf(copy);
  const input: CourtesyDetailsInput = {};
  if (copy.customerFields && draft.customerName.trim() !== saved.customerName) input.customerName = draft.customerName.trim();
  if (copy.customerFields && draft.customerTaxCode.trim().toUpperCase() !== saved.customerTaxCode) input.customerTaxCode = draft.customerTaxCode.trim().toUpperCase();
  if (copy.withholding && draft.withholding !== saved.withholding) input.withholding = draft.withholding;
  return input;
}

/**
 * Ricevuta per prestazione occasionale (decisione dell'utente del
 * 27/10/2026, docs/CHANGELOG.md §378): la firma il professionista, noi non
 * mandiamo nulla all'Agenzia delle Entrate. Si prepara solo a lavoro
 * terminato, con il nome del cliente e la ritenuta
 * (docs/changelog/2026-10-30-documenti-fiscali.md). Chi ha la partita IVA fa
 * la fattura col suo programma e qui trova solo un avviso
 * (docs/changelog/2026-10-30-documenti-snelli.md).
 */
export default function CourtesyCopyPage() {
  const { bookingId } = useParams<{ bookingId: string }>();
  const { token } = useAuth();
  const [copy, setCopy] = useState<CourtesyCopyView | null | undefined>(undefined);
  const [error, setError] = useState<{ message: string; notYet: boolean } | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);

  useEffect(() => {
    if (!token || !bookingId) return;
    apiClient
      .courtesyCopy(token, bookingId)
      .then((result) => {
        setCopy(result);
        setDraft(draftOf(result));
      })
      .catch((e) => {
        setCopy(null);
        const message = e instanceof Error ? e.message : "Non riusciamo a preparare il documento.";
        // Prima di "Lavoro terminato", o con la partita IVA: un avviso, non un errore.
        setError({ message, notYet: /Lavoro terminato|partita IVA/.test(message) });
      });
  }, [token, bookingId]);

  /** Prima del PDF salva quello che è cambiato; se manca qualcosa si ferma e lo dice. */
  async function save(): Promise<CourtesyCopyView | null> {
    if (!token || !copy || !draft) return null;
    setFieldError(null);
    const input = changesOf(copy, draft);
    if (Object.keys(input).length === 0) return copy;
    const parsed = courtesyDetailsSchema.safeParse(input);
    if (!parsed.success) {
      const message = parsed.error.issues[0]?.message ?? "Controlla i dati.";
      setFieldError(message);
      throw new Error(message);
    }
    const updated = await apiClient.saveCourtesyDetails(token, bookingId, parsed.data);
    setCopy(updated);
    setDraft(draftOf(updated));
    return updated;
  }

  async function beforePdf() {
    const updated = await save();
    if (updated && updated.missing.length > 0) throw new Error(`Prima di scaricare scrivi ${joinMissing(updated.missing)}.`);
  }

  const back = { href: "/dashboard/richieste", label: "Richieste" };
  if (copy === undefined) return <LoadingDocument />;
  if (!copy || !draft) {
    return (
      <DocumentPage back={back} title="Ricevuta per il cliente">
        {error?.notYet ? (
          <NoteBox>
            <Text fontSize={16} color={brand.grafite} role="status">
              {error.message}
            </Text>
            <Link href="/dashboard/richieste" style={{ color: brand.cianografiaScuro, fontWeight: 700, fontSize: 16 }}>
              Torna ai lavori
            </Link>
          </NoteBox>
        ) : (
          <Text fontSize={16} color={brand.urgenza} role="alert">
            {error?.message ?? "Lavoro non trovato."}
          </Text>
        )}
      </DocumentPage>
    );
  }

  const amountChanged = courtesyAmountChanged(copy.pdfTotalEurCents ?? null, copy.totalEurCents);
  const set = (patch: Partial<Draft>) => {
    setDraft({ ...draft, ...patch });
    setFieldError(null);
  };
  // L'anteprima segue subito quello che scrive, prima di salvare.
  const customer = copy.customerFields
    ? {
        name: draft.customerName.trim(),
        lines: [draft.customerTaxCode.trim() ? `Codice fiscale ${draft.customerTaxCode.trim().toUpperCase()}` : null, ...copy.customer.lines.filter((line) => !line.startsWith("Codice fiscale "))].filter(
          (line): line is string => !!line,
        ),
      }
    : copy.customer;
  const withholding = copy.withholding && draft.withholding && copy.totalEurCents !== null ? copy.withholding : null;
  const withholdingAmount = withholding && copy.totalEurCents !== null ? Math.round((copy.totalEurCents * WITHHOLDING_RATE_PERCENT) / 100) : 0;
  const hasFields = !!copy.customerFields || !!copy.withholding;
  // Cosa manca ancora, tenendo conto del nome appena scritto e non ancora salvato.
  const nameMissing = "il nome del cliente";
  const missing = [
    ...copy.missing.filter((item) => item !== nameMissing || !customer.name),
    ...(copy.customerFields && !customer.name && !copy.missing.includes(nameMissing) ? [nameMissing] : []),
  ];

  return (
    <DocumentPage back={back} title="Ricevuta per prestazione occasionale">
      <div data-print-hide>
        <YStack gap="$3">
          {/* L'importo è cambiato dopo il PDF scaricato, per esempio per un rimborso (docs/CHANGELOG.md §381). */}
          {amountChanged ? (
            <NoteBox tone="sand">
              <Text fontSize={16} fontWeight="700" color={brand.grafite} role="status">
                L&apos;importo è cambiato: sul PDF che hai scaricato c&apos;era {eur(copy.pdfTotalEurCents ?? 0)}, ora è{" "}
                {copy.totalEurCents !== null ? eur(copy.totalEurCents) : "da scrivere"}. Scarica di nuovo il documento e dallo al cliente al posto di quello
                vecchio.
              </Text>
            </NoteBox>
          ) : null}
          <NoteBox>
            <Text fontSize={16} color={brand.grafite}>
              Stampala, firmala e dalla al cliente. Tienine una copia per te. Il numero lo diamo noi, uno dopo l&apos;altro ogni anno.
            </Text>
            {copy.invoiceRequested ? (
              <Text fontSize={16} color={brand.grafite}>
                Il cliente ti ha chiesto la ricevuta: i suoi dati sono già qui sotto.
              </Text>
            ) : null}
            {copy.hints.map((hint) => (
              <Text key={hint} fontSize={16} color={brand.grafite}>
                {hint}
              </Text>
            ))}
          </NoteBox>

          {hasFields ? (
            <YStack gap="$3" padding="$4" borderRadius={radiusDoc} borderWidth={1} borderColor={brand.filetto}>
              {copy.customerFields ? (
                <XStack gap="$3" flexWrap="wrap">
                  <YStack flexGrow={1} flexBasis={220}>
                    <Field
                      label="Nome e cognome del cliente"
                      accessibilityLabel="Nome e cognome del cliente"
                      value={draft.customerName}
                      onChangeText={(value) => set({ customerName: value })}
                      maxLength={120}
                      autoComplete="off"
                    />
                  </YStack>
                  <YStack flexGrow={1} flexBasis={220}>
                    <Field
                      label="Codice fiscale del cliente (facoltativo)"
                      accessibilityLabel="Codice fiscale del cliente"
                      value={draft.customerTaxCode}
                      onChangeText={(value) => set({ customerTaxCode: value.toUpperCase() })}
                      autoCapitalize="characters"
                      maxLength={16}
                      autoComplete="off"
                    />
                  </YStack>
                </XStack>
              ) : null}
              {copy.withholding ? (
                <ConsentCheckbox checked={draft.withholding} onToggle={() => set({ withholding: !draft.withholding })}>
                  Il cliente trattiene la ritenuta d&apos;acconto del 20%
                </ConsentCheckbox>
              ) : null}
              <XStack gap="$3" alignItems="center" flexWrap="wrap">
                <Button variant="secondary" alignSelf="flex-start" onPress={() => void save().catch(() => undefined)}>
                  Salva
                </Button>
                {fieldError ? (
                  <Text fontSize={16} color={brand.urgenza} role="alert">
                    {fieldError}
                  </Text>
                ) : null}
              </XStack>
            </YStack>
          ) : null}
        </YStack>
      </div>

      <XStack justifyContent="space-between" gap="$3" flexWrap="wrap">
        <Text fontSize={16} color={brand.grafite}>
          Numero: {copy.number ?? "______"}
        </Text>
        <Text fontSize={16} color={brand.grafite}>
          Data: {day(copy.date)}
        </Text>
      </XStack>

      <PartyBoxes from={copy.issuer} to={customer} toLabel="Ricevuto da" />

      <YStack>
        {copy.lines.map((line, index) => (
          <AmountRow key={`${index}-${line.description}`} label={line.description} value={copy.totalEurCents !== null ? eur(line.amountEurCents) : "______"} />
        ))}
        {withholding && copy.totalEurCents !== null ? (
          <YStack paddingTop="$2">
            <AmountRow label="Compenso lordo" value={eur(copy.totalEurCents)} divider={false} />
            <AmountRow label="Ritenuta d'acconto 20%" value={`−${eur(withholdingAmount)}`} divider={false} />
          </YStack>
        ) : null}
        <YStack borderTopWidth={2} borderColor={brand.grafite} marginTop="$2">
          <AmountRow
            label={withholding ? "Netto pagato" : "Totale"}
            detail={copy.paidHow}
            value={copy.totalEurCents !== null ? eur(copy.totalEurCents - withholdingAmount) : "______"}
            strong
            large
            divider={false}
          />
        </YStack>
      </YStack>

      {copy.notes.length > 0 ? (
        <YStack gap="$1">
          {copy.notes.map((note) => (
            <Text key={note} fontSize={15} color={brand.grafite70}>
              {note}
            </Text>
          ))}
        </YStack>
      ) : null}

      <Text fontSize={16} color={brand.grafite} paddingTop="$4">
        Firma ______________________
      </Text>

      <div data-print-hide>
        <YStack gap="$2">
          {missing.length > 0 ? (
            <Text fontSize={16} color={brand.grafite70}>
              Per scaricarlo manca {joinMissing(missing)}.
            </Text>
          ) : null}
          <PdfButton
            before={beforePdf}
            load={() => apiClient.courtesyCopyPdf(token ?? "", bookingId)}
            fileName={`ricevuta-${(copy.number ?? "").replace(/\//g, "-")}.pdf`}
          />
        </YStack>
      </div>
    </DocumentPage>
  );
}

/** "il nome del cliente e l'importo finale del lavoro". */
function joinMissing(items: string[]): string {
  return items.length <= 1 ? (items[0] ?? "") : `${items.slice(0, -1).join(", ")} e ${items[items.length - 1]}`;
}
