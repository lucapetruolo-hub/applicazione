"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { accountingMonthLabel, isAccountingMonth, type MonthlyStatement, type MonthlyStatementRow } from "@professionisti/shared";
import { Button, Text, XStack, YStack, brand } from "@professionisti/ui";
import { downloadTextFile } from "@/components/admin/adminUi";
import { apiClient } from "@/lib/apiClient";
import { useAuth } from "@/lib/AuthContext";
import { DocumentPage, LoadingDocument, NoteBox, PdfButton, eur } from "../../_components/DocumentParts";

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("it-IT", { day: "numeric", month: "short", timeZone: "Europe/Rome" }).replace(".", "");
}

const amount = (cents: number) => (cents === 0 ? "—" : eur(cents));

/**
 * Estratto del mese (docs/CHANGELOG.md §378), come nell'anteprima approvata:
 * i quattro totali, una riga per lavoro, i soldi ancora bloccati e il file
 * per il commercialista.
 */
export default function StatementPage() {
  const { mese } = useParams<{ mese: string }>();
  const { token } = useAuth();
  const [statement, setStatement] = useState<MonthlyStatement | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [csvError, setCsvError] = useState<string | null>(null);

  const validMonth = !!mese && isAccountingMonth(mese);

  useEffect(() => {
    if (!token || !mese || !validMonth) return;
    apiClient
      .documentsStatement(token, mese)
      .then(setStatement)
      .catch((e) => {
        setStatement(null);
        setError(e instanceof Error ? e.message : "Non riusciamo a caricare l'estratto.");
      });
  }, [token, mese, validMonth]);

  async function downloadCsv() {
    if (!token || !mese) return;
    setCsvError(null);
    try {
      const file = await apiClient.documentsStatementCsv(token, mese);
      downloadTextFile(file.fileName, file.csv);
    } catch (e) {
      setCsvError(e instanceof Error ? e.message : "Non riusciamo a preparare il file: riprova tra poco.");
    }
  }

  const back = { href: "/dashboard/documenti", label: "Fatture e documenti" };
  if (validMonth && statement === undefined) return <LoadingDocument />;
  if (!statement) {
    return (
      <DocumentPage back={back} title="Estratto">
        <Text fontSize={16} color={brand.urgenza} role="alert">
          {!validMonth ? "Mese non valido." : (error ?? "Estratto non trovato.")}
        </Text>
      </DocumentPage>
    );
  }

  const tiles = [
    { label: "Pagato online", value: statement.totals.onlineEurCents },
    { label: "Pagato a te", value: statement.totals.directEurCents },
    { label: "Trattenute", value: statement.totals.feesEurCents },
    { label: "Bonifici arrivati", value: statement.totals.payoutsArrivedEurCents },
  ];

  return (
    <DocumentPage back={back} title={capitalize(accountingMonthLabel(statement.month))} subtitle="Quanto ti hanno pagato i clienti, quanto abbiamo trattenuto e i bonifici.">
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12 }}>
        {tiles.map((tile) => (
          <YStack key={tile.label} backgroundColor={brand.gesso} borderRadius={10} padding="$3" gap={2}>
            <Text fontSize={13} color={brand.grafite70}>
              {tile.label}
            </Text>
            <Text fontSize={22} fontWeight="800" color={brand.grafite} fontVariant={["tabular-nums"]}>
              {eur(tile.value)}
            </Text>
          </YStack>
        ))}
      </div>

      {statement.rows.length === 0 ? (
        <Text fontSize={16} color={brand.grafite70}>
          Nessun movimento in questo mese.
        </Text>
      ) : (
        <>
          {/* Computer: tabella. Telefono: una scheda per lavoro. */}
          <YStack display="none" $gtSm={{ display: "flex" }}>
            <XStack paddingVertical="$2" borderBottomWidth={2} borderColor={brand.filetto} gap="$2">
              <HeaderCell width={56}>Data</HeaderCell>
              <HeaderCell flex={1}>Lavoro</HeaderCell>
              <HeaderCell width={90} right>
                Online
              </HeaderCell>
              <HeaderCell width={80} right>
                Diretto
              </HeaderCell>
              <HeaderCell width={96} right>
                Trattenute
              </HeaderCell>
              <HeaderCell width={150} right>
                Bonifico
              </HeaderCell>
            </XStack>
            {statement.rows.map((row) => (
              <XStack key={row.jobPaymentId ?? "altro"} paddingVertical="$3" borderBottomWidth={1} borderColor={brand.filetto} gap="$2" alignItems="flex-start">
                <Text width={56} fontSize={15} color={brand.grafite}>
                  {shortDate(row.date)}
                </Text>
                <JobCell row={row} />
                <NumberCell width={90}>{amount(row.onlineEurCents)}</NumberCell>
                <NumberCell width={80}>{amount(row.directEurCents)}</NumberCell>
                <NumberCell width={96}>{amount(row.feesEurCents)}</NumberCell>
                <YStack width={150} alignItems="flex-end" gap={2}>
                  <Text fontSize={15} color={brand.grafite} fontVariant={["tabular-nums"]}>
                    {row.payoutEurCents !== null ? eur(row.payoutEurCents) : "—"}
                  </Text>
                  <Text fontSize={13} color={brand.grafite70} textAlign="right">
                    {row.payoutNote}
                  </Text>
                </YStack>
              </XStack>
            ))}
          </YStack>
          <YStack $gtSm={{ display: "none" }}>
            {statement.rows.map((row) => (
              <YStack key={row.jobPaymentId ?? "altro"} paddingVertical="$3" borderBottomWidth={1} borderColor={brand.filetto} gap="$1">
                <XStack gap="$2" alignItems="baseline">
                  <Text fontSize={15} color={brand.grafite70}>
                    {shortDate(row.date)}
                  </Text>
                  <JobCell row={row} />
                </XStack>
                <Text fontSize={15} color={brand.grafite} fontVariant={["tabular-nums"]}>
                  {[
                    row.onlineEurCents ? `Online ${eur(row.onlineEurCents)}` : null,
                    row.directEurCents ? `Diretto ${eur(row.directEurCents)}` : null,
                    row.feesEurCents ? `Trattenute ${eur(row.feesEurCents)}` : null,
                    row.payoutEurCents !== null ? `Bonifico ${eur(row.payoutEurCents)}` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </Text>
                <Text fontSize={13} color={brand.grafite70}>
                  {row.payoutNote}
                </Text>
              </YStack>
            ))}
          </YStack>
        </>
      )}

      {statement.blockedEurCents > 0 ? (
        <NoteBox tone="sand">
          <Text fontSize={16} color={brand.grafite}>
            Ancora bloccati: {eur(statement.blockedEurCents)}. Partono quando i clienti confermano i lavori.
          </Text>
        </NoteBox>
      ) : null}

      <NoteBox>
        <Text fontSize={16} color={brand.grafite}>
          {statement.feeInvoice ? (
            <>
              Le trattenute del mese sono nella fattura{" "}
              <Link href={`/dashboard/documenti/fattura/${statement.feeInvoice.id}`} style={{ color: brand.cianografiaScuro, fontWeight: 700 }}>
                {statement.feeInvoice.number}
              </Link>
              .{" "}
            </>
          ) : statement.totals.feesEurCents !== 0 ? (
            "La fattura delle trattenute arriva il 1° del mese dopo. "
          ) : null}
          {statement.documentHint}
        </Text>
      </NoteBox>

      <div data-print-hide>
        <YStack gap="$2">
          <XStack gap="$3" flexWrap="wrap">
            <Button variant="primary" onPress={() => void downloadCsv()}>Scarica per il commercialista</Button>
            <PdfButton variant="secondary" load={() => apiClient.documentsStatementPdf(token ?? "", statement.month)} fileName={`estratto-${statement.month}.pdf`} />
          </XStack>
          <Text fontSize={16} color={brand.grafite70}>
            Il file per il commercialista è un foglio di calcolo con una riga per movimento.
          </Text>
          {csvError ? (
            <Text fontSize={16} color={brand.urgenza} role="alert">
              {csvError}
            </Text>
          ) : null}
        </YStack>
      </div>
    </DocumentPage>
  );
}

function HeaderCell({ children, width, flex, right }: { children: string; width?: number; flex?: number; right?: boolean }) {
  return (
    <Text width={width} flex={flex} fontSize={13} fontWeight="800" color={brand.grafite70} textTransform="uppercase" textAlign={right ? "right" : "left"}>
      {children}
    </Text>
  );
}

function NumberCell({ children, width }: { children: string; width: number }) {
  return (
    <Text width={width} fontSize={15} color={brand.grafite} textAlign="right" fontVariant={["tabular-nums"]}>
      {children}
    </Text>
  );
}

function JobCell({ row }: { row: MonthlyStatementRow }) {
  return (
    <YStack flex={1} minWidth={0} gap={2}>
      <Text fontSize={15} color={brand.grafite}>
        {row.job}
      </Text>
      {row.client ? (
        <Text fontSize={13} color={brand.grafite70}>
          {row.client}
        </Text>
      ) : null}
    </YStack>
  );
}
