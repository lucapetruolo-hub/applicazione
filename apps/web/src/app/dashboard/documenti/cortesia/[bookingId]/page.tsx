"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { courtesyAmountChanged, type CourtesyCopyView } from "@professionisti/shared";
import { Field, Text, XStack, YStack, brand } from "@professionisti/ui";
import { apiClient } from "@/lib/apiClient";
import { useAuth } from "@/lib/AuthContext";
import { AmountRow, DocumentPage, LoadingDocument, NoteBox, PartyBoxes, PdfButton, eur } from "../../_components/DocumentParts";

function day(iso: string): string {
  return new Date(iso).toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Rome" });
}

/**
 * Copia di cortesia del documento del lavoro (decisione dell'utente del
 * 27/10/2026, docs/CHANGELOG.md §377): la fattura vera la fa il
 * professionista col suo programma, la ricevuta per prestazione occasionale
 * la firma lui. Noi non mandiamo nulla all'Agenzia delle Entrate. Il numero
 * della ricevuta lo diamo noi, quello della fattura lo scrive lui e lo
 * teniamo per la prossima volta (§378).
 */
export default function CourtesyCopyPage() {
  const { bookingId } = useParams<{ bookingId: string }>();
  const { token } = useAuth();
  const [copy, setCopy] = useState<CourtesyCopyView | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [ownNumber, setOwnNumber] = useState("");

  useEffect(() => {
    if (!token || !bookingId) return;
    apiClient
      .courtesyCopy(token, bookingId)
      .then((result) => {
        setCopy(result);
        if (result.kind === "INVOICE") setOwnNumber(result.number ?? "");
      })
      .catch((e) => {
        setCopy(null);
        setError(e instanceof Error ? e.message : "Non riusciamo a preparare il documento.");
      });
  }, [token, bookingId]);

  /** Prima del PDF salva il numero della fattura, se è cambiato. */
  async function saveNumber() {
    if (!token || !copy || copy.kind !== "INVOICE" || ownNumber.trim() === (copy.number ?? "")) return;
    setCopy(await apiClient.setCourtesyNumber(token, bookingId, { number: ownNumber.trim() }));
  }

  const back = { href: "/dashboard/richieste", label: "Richieste" };
  if (copy === undefined) return <LoadingDocument />;
  if (!copy) {
    return (
      <DocumentPage back={back} title="Documento per il cliente">
        <Text fontSize={16} color={brand.urgenza} role="alert">
          {error ?? "Lavoro non trovato."}
        </Text>
      </DocumentPage>
    );
  }

  const receipt = copy.kind === "RECEIPT";
  const amountChanged = courtesyAmountChanged(copy.pdfTotalEurCents ?? null, copy.totalEurCents);
  return (
    <DocumentPage back={back} title={receipt ? "Ricevuta per prestazione occasionale" : "Copia di cortesia della fattura"}>
      <div data-print-hide>
        {/* L'importo è cambiato dopo il PDF scaricato, per esempio per un rimborso (docs/CHANGELOG.md §380). */}
        {amountChanged ? (
          <YStack paddingBottom="$3">
            <NoteBox tone="sand">
              <Text fontSize={16} fontWeight="700" color={brand.grafite} role="status">
                L&apos;importo è cambiato: sul PDF che hai scaricato c&apos;era {eur(copy.pdfTotalEurCents ?? 0)}, ora è{" "}
                {copy.totalEurCents !== null ? eur(copy.totalEurCents) : "da scrivere"}. Scarica di nuovo il documento e dallo al cliente al posto di quello
                vecchio.
              </Text>
            </NoteBox>
          </YStack>
        ) : null}
        <NoteBox>
          <Text fontSize={16} color={brand.grafite}>
            {receipt
              ? "Stampala, firmala e dalla al cliente. Tienine una copia per te. Il numero lo diamo noi, uno dopo l'altro ogni anno."
              : "La fattura vera la fai tu col tuo programma delle fatture, con il tuo numero: questa è la copia da dare al cliente. Noi non mandiamo nulla all'Agenzia delle Entrate."}
          </Text>
          {copy.vat ? (
            <Text fontSize={16} color={brand.grafite}>
              L&apos;IVA è calcolata al {copy.vat.ratePercent}%: se ne applichi un&apos;altra, scrivi la tua.
            </Text>
          ) : null}
          {copy.invoiceRequested ? (
            <Text fontSize={16} color={brand.grafite}>
              Il cliente ti ha chiesto la fattura: i suoi dati sono già qui sotto.
            </Text>
          ) : null}
        </NoteBox>
        {receipt ? null : (
          <YStack paddingTop="$3" maxWidth={320}>
            <Field
              label="Numero della tua fattura"
              accessibilityLabel="Numero della tua fattura"
              value={ownNumber}
              onChangeText={setOwnNumber}
              maxLength={30}
              autoComplete="off"
            />
          </YStack>
        )}
      </div>

      <XStack justifyContent="space-between" gap="$3" flexWrap="wrap">
        <Text fontSize={16} color={brand.grafite}>
          Numero: {(receipt ? copy.number : ownNumber.trim()) || "______"}
        </Text>
        <Text fontSize={16} color={brand.grafite}>
          Data: {day(copy.date)}
        </Text>
      </XStack>

      <PartyBoxes from={copy.issuer} to={copy.customer} toLabel={receipt ? "Ricevuto da" : "Per"} />

      <YStack>
        {copy.vat && copy.totalEurCents !== null ? (
          <>
            <AmountRow label={copy.description} value={eur(copy.vat.taxableEurCents)} />
            <YStack paddingTop="$2">
              <AmountRow label="Imponibile" value={eur(copy.vat.taxableEurCents)} divider={false} />
              <AmountRow label={`IVA ${copy.vat.ratePercent}%`} value={eur(copy.vat.vatEurCents)} divider={false} />
            </YStack>
          </>
        ) : (
          <AmountRow label={copy.description} value={copy.totalEurCents !== null ? eur(copy.totalEurCents) : "______"} />
        )}
        <YStack borderTopWidth={2} borderColor={brand.grafite} marginTop="$2">
          <AmountRow label="Totale" detail={copy.paidHow} value={copy.totalEurCents !== null ? eur(copy.totalEurCents) : "______"} strong large divider={false} />
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
        <PdfButton
          before={saveNumber}
          load={() => apiClient.courtesyCopyPdf(token ?? "", bookingId)}
          fileName={receipt ? `ricevuta-${(copy.number ?? "").replace(/\//g, "-")}.pdf` : `fattura-cortesia-${(ownNumber.trim() || day(copy.date)).replace(/[^\w-]+/g, "-")}.pdf`}
        />
      </div>
    </DocumentPage>
  );
}
