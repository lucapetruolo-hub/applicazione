"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { COURTESY_VAT_RATES, WITHHOLDING_RATE_PERCENT, courtesyAmountChanged, courtesyDetailsSchema, type CourtesyCopyView, type CourtesyDetailsInput, type CourtesyVatRate } from "@professionisti/shared";
import { Button, Field, Text, XStack, YStack, brand, radiusDoc } from "@professionisti/ui";
import { ConsentCheckbox } from "@/components/ConsentCheckbox";
import { ItalianDateInput } from "@/components/ItalianDateInput";
import { apiClient } from "@/lib/apiClient";
import { useAuth } from "@/lib/AuthContext";
import { AmountRow, DocumentPage, LoadingDocument, NoteBox, PartyBoxes, PdfButton, eur } from "../../_components/DocumentParts";

function day(iso: string): string {
  return new Date(iso).toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Rome" });
}

/** "2026-10-31" → "31/10/2026". */
function dayOfInput(value: string): string {
  const [year, month, date] = value.split("-");
  return year && month && date ? `${date}/${month}/${year}` : "";
}

/** Oggi in ora italiana, per il massimo del campo data ("2026-10-30"). */
function todayIso(): string {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Rome" });
}

/** Quello che il professionista scrive sulla copia, come lo tiene la pagina. */
type Draft = { number: string; date: string; customerName: string; customerTaxCode: string; vatRatePercent: CourtesyVatRate; withholding: boolean };

function draftOf(copy: CourtesyCopyView): Draft {
  return {
    number: copy.kind === "INVOICE" ? (copy.number ?? "") : "",
    date: copy.ownDate ?? "",
    customerName: copy.customerFields?.name ?? "",
    customerTaxCode: copy.customerFields?.taxCode ?? "",
    vatRatePercent: copy.vat?.ratePercent ?? 22,
    withholding: copy.withholding?.applies ?? true,
  };
}

/** Solo quello che è cambiato rispetto al documento salvato. */
function changesOf(copy: CourtesyCopyView, draft: Draft): CourtesyDetailsInput {
  const saved = draftOf(copy);
  const input: CourtesyDetailsInput = {};
  if (copy.kind === "INVOICE" && draft.number.trim() !== saved.number) input.number = draft.number.trim();
  if (copy.kind === "INVOICE" && draft.date !== saved.date) input.date = draft.date;
  if (copy.customerFields && draft.customerName.trim() !== saved.customerName) input.customerName = draft.customerName.trim();
  if (copy.customerFields && draft.customerTaxCode.trim().toUpperCase() !== saved.customerTaxCode) input.customerTaxCode = draft.customerTaxCode.trim().toUpperCase();
  if (copy.vat && draft.vatRatePercent !== saved.vatRatePercent) input.vatRatePercent = draft.vatRatePercent;
  if (copy.withholding && draft.withholding !== saved.withholding) input.withholding = draft.withholding;
  return input;
}

const dateInputStyle = { height: 50, padding: "0 12px", borderRadius: radiusDoc, border: `1px solid ${brand.bordoCampo}`, fontSize: 16, fontFamily: "inherit", color: brand.grafite, background: brand.calce, width: "100%" };

/**
 * Copia di cortesia del documento del lavoro (decisione dell'utente del
 * 27/10/2026, docs/CHANGELOG.md §378): la fattura vera la fa il
 * professionista col suo programma, la ricevuta per prestazione occasionale
 * la firma lui. Noi non mandiamo nulla all'Agenzia delle Entrate. Dopo il
 * collaudo del 29/10/2026 (docs/changelog/2026-10-30-documenti-fiscali.md)
 * si prepara solo a lavoro terminato e prima di scaricarla si scrivono
 * numero e data della fattura, il nome del cliente, l'aliquota e la ritenuta.
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
        setError({ message, notYet: /Lavoro terminato/.test(message) });
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
      <DocumentPage back={back} title="Documento per il cliente">
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

  const receipt = copy.kind === "RECEIPT";
  const amountChanged = courtesyAmountChanged(copy.pdfTotalEurCents ?? null, copy.totalEurCents);
  const set = (patch: Partial<Draft>) => {
    setDraft({ ...draft, ...patch });
    setFieldError(null);
  };
  // L'anteprima segue subito quello che scrive, prima di salvare.
  const shownNumber = (receipt ? copy.number : draft.number.trim()) || "______";
  const shownDate = receipt ? day(copy.date) : dayOfInput(draft.date) || "______";
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
  const hasFields = !receipt || !!copy.customerFields || !!copy.withholding;
  // Cosa manca ancora, tenendo conto di quello appena scritto e non ancora salvato.
  const written: Record<string, boolean> = {
    "il numero della tua fattura": !!draft.number.trim(),
    "la data della tua fattura": !!draft.date,
    "il nome del cliente": !!customer.name,
  };
  const missing = [
    ...copy.missing.filter((item) => !written[item]),
    ...Object.entries(written)
      .filter(([item, ok]) => !ok && !copy.missing.includes(item) && (item === "il nome del cliente" ? !!copy.customerFields : !receipt))
      .map(([item]) => item),
  ];

  return (
    <DocumentPage back={back} title={receipt ? "Ricevuta per prestazione occasionale" : "Copia di cortesia della fattura"}>
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
              {receipt
                ? "Stampala, firmala e dalla al cliente. Tienine una copia per te. Il numero lo diamo noi, uno dopo l'altro ogni anno."
                : "La fattura vera la fai tu col tuo programma delle fatture: qui scrivi il suo numero e la sua data, così la copia è uguale. Noi non mandiamo nulla all'Agenzia delle Entrate."}
            </Text>
            {copy.invoiceRequested ? (
              <Text fontSize={16} color={brand.grafite}>
                Il cliente ti ha chiesto {receipt ? "la ricevuta" : "la fattura"}: i suoi dati sono già qui sotto.
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
              {!receipt ? (
                <XStack gap="$3" flexWrap="wrap">
                  <YStack flexGrow={1} flexBasis={200}>
                    <Field
                      label="Numero della tua fattura"
                      accessibilityLabel="Numero della tua fattura"
                      value={draft.number}
                      onChangeText={(value) => set({ number: value })}
                      maxLength={30}
                      autoComplete="off"
                    />
                  </YStack>
                  <YStack flexGrow={1} flexBasis={200} gap="$2">
                    <Text fontFamily="$body" fontSize={16} fontWeight="700" color={brand.grafite70}>
                      Data della tua fattura
                    </Text>
                    <ItalianDateInput ariaLabel="Data della tua fattura" value={draft.date} max={todayIso()} onChange={(value) => set({ date: value })} style={dateInputStyle} />
                  </YStack>
                </XStack>
              ) : null}
              {copy.vat ? (
                <YStack gap="$2">
                  <Text fontFamily="$body" fontSize={16} fontWeight="700" color={brand.grafite70} id="aliquota-iva">
                    Aliquota IVA
                  </Text>
                  <XStack gap="$2" flexWrap="wrap" role="radiogroup" aria-labelledby="aliquota-iva">
                    {COURTESY_VAT_RATES.map((rate) => (
                      <Button key={rate} size="$3" variant={draft.vatRatePercent === rate ? "primary" : "secondary"} role="radio" aria-checked={draft.vatRatePercent === rate} onPress={() => set({ vatRatePercent: rate })}>
                        {`${rate}%`}
                      </Button>
                    ))}
                  </XStack>
                  {draft.vatRatePercent !== copy.vat.ratePercent ? (
                    <Text fontSize={15} color={brand.grafite70}>
                      Imponibile e IVA si aggiornano quando salvi o scarichi il PDF.
                    </Text>
                  ) : null}
                </YStack>
              ) : null}
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
                      label={receipt ? "Codice fiscale del cliente (facoltativo)" : "Codice fiscale del cliente"}
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
          Numero: {shownNumber}
        </Text>
        <Text fontSize={16} color={brand.grafite}>
          Data: {shownDate}
        </Text>
      </XStack>

      <PartyBoxes from={copy.issuer} to={customer} toLabel={receipt ? "Ricevuto da" : "Per"} />

      <YStack>
        {copy.lines.map((line, index) => (
          <AmountRow key={`${index}-${line.description}`} label={line.description} value={copy.totalEurCents !== null ? eur(line.amountEurCents) : "______"} />
        ))}
        {copy.vat && copy.totalEurCents !== null ? (
          <YStack paddingTop="$2">
            <AmountRow label="Imponibile" value={eur(copy.vat.taxableEurCents)} divider={false} />
            <AmountRow label={`IVA ${copy.vat.ratePercent}%`} value={eur(copy.vat.vatEurCents)} divider={false} />
          </YStack>
        ) : null}
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

      {receipt ? (
        <Text fontSize={16} color={brand.grafite} paddingTop="$4">
          Firma ______________________
        </Text>
      ) : (
        <Text fontSize={15} color={brand.grafite70}>
          Copia di cortesia: il documento valido è la fattura elettronica inviata all&apos;Agenzia delle Entrate.
        </Text>
      )}

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
            fileName={receipt ? `ricevuta-${(copy.number ?? "").replace(/\//g, "-")}.pdf` : `fattura-cortesia-${(draft.number.trim() || day(copy.date)).replace(/[^\w-]+/g, "-")}.pdf`}
          />
        </YStack>
      </div>
    </DocumentPage>
  );
}

/** "il numero, la data e il nome del cliente". */
function joinMissing(items: string[]): string {
  return items.length <= 1 ? (items[0] ?? "") : `${items.slice(0, -1).join(", ")} e ${items[items.length - 1]}`;
}
