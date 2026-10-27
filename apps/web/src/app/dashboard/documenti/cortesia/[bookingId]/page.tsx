"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import type { CourtesyCopyView } from "@professionisti/shared";
import { Button, Text, XStack, YStack, brand } from "@professionisti/ui";
import { apiClient } from "@/lib/apiClient";
import { useAuth } from "@/lib/AuthContext";
import { AmountRow, DocumentPage, LoadingDocument, NoteBox, PartyBoxes, eur } from "../../_components/DocumentParts";

function day(iso: string): string {
  return new Date(iso).toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Rome" });
}

/**
 * Copia di cortesia del documento del lavoro (decisione dell'utente del
 * 27/10/2026, docs/CHANGELOG.md §372): la fattura vera la fa il
 * professionista col suo programma, la ricevuta per prestazione occasionale
 * la firma lui. Noi non mandiamo nulla all'Agenzia delle Entrate.
 */
export default function CourtesyCopyPage() {
  const { bookingId } = useParams<{ bookingId: string }>();
  const { token } = useAuth();
  const [copy, setCopy] = useState<CourtesyCopyView | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token || !bookingId) return;
    apiClient
      .courtesyCopy(token, bookingId)
      .then(setCopy)
      .catch((e) => {
        setCopy(null);
        setError(e instanceof Error ? e.message : "Non riusciamo a preparare il documento.");
      });
  }, [token, bookingId]);

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
  return (
    <DocumentPage back={back} title={receipt ? "Ricevuta per prestazione occasionale" : "Copia di cortesia della fattura"}>
      <div data-print-hide>
        <NoteBox>
          <Text fontSize={16} color={brand.grafite}>
            {receipt
              ? "Stampala, scrivi il numero, firmala e dalla al cliente. Tienine una copia per te."
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
      </div>

      <XStack justifyContent="space-between" gap="$3" flexWrap="wrap">
        <Text fontSize={16} color={brand.grafite}>
          Numero: ______
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
        <Button alignSelf="flex-start" onPress={() => window.print()}>
          Stampa o salva in PDF
        </Button>
      </div>
    </DocumentPage>
  );
}
