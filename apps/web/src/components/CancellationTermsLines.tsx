"use client";

import type { CancellationLine, CancellationTerms } from "@professionisti/shared";
import { Text, brand } from "@professionisti/ui";

/**
 * Le righe su annullamento e acconto, con i colori decisi da Luca l'11/11
 * (docs/changelog/2026-11-11-rosso-solo-errori.md): grigio per gli stati,
 * ocra scuro per l'acconto non rimborsabile, mai rosso. Le frasi vengono da
 * `cancellationTerms` (packages/shared), una sola fonte per tutto il sito
 * (docs/changelog/2026-11-13-annullare-una-fonte.md).
 */
export function CancellationTermsLines({
  terms,
  noticeSize = 16,
  moneySize = 13,
  testId,
}: {
  terms: CancellationTerms;
  noticeSize?: number;
  moneySize?: number;
  testId?: string;
}) {
  return (
    <>
      {terms.notice ? <Line line={terms.notice} size={noticeSize} testId={testId ? `${testId}-notice` : undefined} /> : null}
      {terms.money ? <Line line={terms.money} size={moneySize} testId={testId ? `${testId}-money` : undefined} /> : null}
    </>
  );
}

function Line({ line, size, testId }: { line: CancellationLine; size: number; testId?: string }) {
  const style =
    line.tone === "warning"
      ? { color: brand.ottoneScuro, fontWeight: "600" as const }
      : line.tone === "muted"
        ? { color: brand.grafite70 }
        : { color: brand.grafite };
  return (
    <Text fontSize={size} {...style} data-testid={testId}>
      {line.text}
    </Text>
  );
}
