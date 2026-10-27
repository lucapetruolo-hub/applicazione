"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  accountingMonthLabel,
  platformInvoiceNote,
  platformInvoiceOriginalNote,
  platformInvoiceSubtitle,
  platformInvoiceTechnicalNotes,
  type PlatformInvoiceLine,
  type PlatformInvoiceView,
} from "@professionisti/shared";
import { Button, Text, XStack, YStack, brand } from "@professionisti/ui";
import { LearnMore } from "@/components/LearnMore";
import { downloadTextFile } from "@/components/admin/adminUi";
import { apiClient } from "@/lib/apiClient";
import { useAuth } from "@/lib/AuthContext";
import { AmountRow, BigTotal, DocumentPage, GroupHeading, LoadingDocument, NoteBox, PartyBoxes, PdfButton, eur } from "../../_components/DocumentParts";

/** Righe raggruppate per lavoro, nell'ordine in cui arrivano. */
function groupLines(lines: PlatformInvoiceLine[]): { group: string | null; lines: PlatformInvoiceLine[] }[] {
  const groups: { group: string | null; lines: PlatformInvoiceLine[] }[] = [];
  for (const line of lines) {
    const key = line.group ?? null;
    const last = groups[groups.length - 1];
    if (last && last.group === key) last.lines.push(line);
    else groups.push({ group: key, lines: [line] });
  }
  return groups;
}

/**
 * Una nostra fattura al professionista (docs/CHANGELOG.md §377), come
 * nell'anteprima approvata: totale in cima, "Da" e "Per", righe per lavoro,
 * imponibile e IVA. "Scarica PDF" lo prepara il server (§378), "Scarica
 * XML" dà la fattura elettronica per il commercialista.
 */
export default function InvoicePage() {
  const { id } = useParams<{ id: string }>();
  const { token } = useAuth();
  const [invoice, setInvoice] = useState<PlatformInvoiceView | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [xmlError, setXmlError] = useState<string | null>(null);

  useEffect(() => {
    if (!token || !id) return;
    apiClient
      .documentsInvoice(token, id)
      .then(setInvoice)
      .catch((e) => {
        setInvoice(null);
        setError(e instanceof Error ? e.message : "Non riusciamo a caricare la fattura.");
      });
  }, [token, id]);

  async function downloadXml() {
    if (!token || !invoice) return;
    setXmlError(null);
    try {
      const file = await apiClient.documentsInvoiceXml(token, invoice.id);
      downloadTextFile(file.fileName, file.xml, "application/xml;charset=utf-8");
    } catch (e) {
      setXmlError(e instanceof Error ? e.message : "Il file non è pronto: riprova tra poco.");
    }
  }

  const back = { href: "/dashboard/documenti", label: "Fatture e documenti" };
  if (invoice === undefined) return <LoadingDocument />;
  if (!invoice) {
    return (
      <DocumentPage back={back} title="Fattura">
        <Text fontSize={16} color={brand.urgenza} role="alert">
          {error ?? "Fattura non trovata."}
        </Text>
      </DocumentPage>
    );
  }

  const jobFees = invoice.source === "JOB_FEES";
  const percent = jobFees && !invoice.creditNote && invoice.onlinePaidEurCents ? (invoice.totalEurCents / invoice.onlinePaidEurCents) * 100 : null;
  const hasRecipientCode = invoice.recipient.lines.some((line) => line.startsWith("Codice destinatario") || line.startsWith("PEC"));

  return (
    <DocumentPage back={back} title={`${invoice.creditNote ? "Nota di credito" : "Fattura"} n. ${invoice.number}`} subtitle={platformInvoiceSubtitle(invoice)}>
      <BigTotal
        label={invoice.creditNote ? "Totale restituito" : jobFees ? "Totale trattenuto" : "Totale pagato"}
        value={eur(invoice.totalEurCents)}
        badge={invoice.creditNote ? "Nota di credito" : jobFees ? "Già trattenuta" : "Già pagata"}
      >
        <Text fontSize={16} color={brand.grafite70}>
          {percent !== null && invoice.onlinePaidEurCents
            ? `Su ${eur(invoice.onlinePaidEurCents)} pagati online dai clienti (${percent.toLocaleString("it-IT", { maximumFractionDigits: 1 })}%). `
            : ""}
          {platformInvoiceNote({ ...invoice, vatRecoverable: null })}
        </Text>
      </BigTotal>

      <PartyBoxes from={invoice.issuer} to={invoice.recipient} />

      <YStack>
        {groupLines(invoice.lines).map((group, index) => (
          <YStack key={`${group.group ?? "righe"}-${index}`}>
            {group.group ? <GroupHeading title={group.group} /> : null}
            {group.lines.map((line, lineIndex) => (
              <AmountRow key={`${line.description}-${lineIndex}`} label={line.description} detail={line.detail} value={eur(line.taxableEurCents)} />
            ))}
          </YStack>
        ))}
        <YStack paddingTop="$2">
          <AmountRow label="Imponibile" value={eur(invoice.taxableEurCents)} divider={false} />
          <AmountRow label={`IVA ${invoice.vatRatePercent}%`} value={eur(invoice.vatEurCents)} divider={false} />
          {invoice.roundingEurCents !== 0 ? <AmountRow label="Arrotondamento" value={eur(invoice.roundingEurCents)} divider={false} /> : null}
          <YStack borderTopWidth={2} borderColor={brand.grafite} marginTop="$2">
            <AmountRow label="Totale" value={eur(invoice.totalEurCents)} strong large divider={false} />
          </YStack>
        </YStack>
      </YStack>

      {invoice.vatRecoverable !== null || jobFees ? (
        <NoteBox>
          <Text fontSize={16} color={brand.grafite}>
            {invoice.vatRecoverable === false
              ? "Senza partita IVA, o nel regime forfettario, l'IVA è un costo: non si recupera. "
              : invoice.vatRecoverable === true
                ? "L'IVA la recuperi nella tua dichiarazione IVA. "
                : ""}
            {jobFees && invoice.periodMonth ? (
              <>
                Le stesse cifre le trovi, lavoro per lavoro, nell&apos;
                <Link href={`/dashboard/documenti/estratto/${invoice.periodMonth}`} style={{ color: brand.cianografiaScuro, fontWeight: 700 }}>
                  estratto di {accountingMonthLabel(invoice.periodMonth).split(" ")[0]}
                </Link>
                .
              </>
            ) : null}
          </Text>
        </NoteBox>
      ) : null}

      <YStack gap="$2" borderTopWidth={1} borderColor={brand.filetto} paddingTop="$3">
        <LearnMore fontSize={16} summary="Dati per il commercialista">
          {platformInvoiceTechnicalNotes(invoice).map((line) => (
            <Text key={line} fontSize={16} color={brand.grafite70}>
              {line}
            </Text>
          ))}
        </LearnMore>
        <Text fontSize={16} color={brand.grafite70}>
          {platformInvoiceOriginalNote(hasRecipientCode)}
        </Text>
      </YStack>

      <div data-print-hide>
        <YStack gap="$2">
          <XStack gap="$3" flexWrap="wrap">
            <PdfButton load={() => apiClient.documentsInvoicePdf(token ?? "", invoice.id)} fileName={`${invoice.creditNote ? "nota-di-credito" : "fattura"}-${invoice.number.replace(/\//g, "-")}.pdf`} />
            <Button variant="secondary" onPress={() => void downloadXml()}>
              Scarica XML
            </Button>
          </XStack>
          {xmlError ? (
            <Text fontSize={16} color={brand.urgenza} role="alert">
              {xmlError}
            </Text>
          ) : null}
        </YStack>
      </div>
    </DocumentPage>
  );
}
