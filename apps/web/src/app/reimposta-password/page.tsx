import type { Metadata } from "next";
import { Suspense } from "react";
import { ReimpostaPasswordContent } from "./ReimpostaPasswordContent";
import { PageLoading } from "@/components/PageLoading";

export const metadata: Metadata = {
  title: "Nuova password",
  description: "Scegli una nuova password per il tuo account.",
};

export default function ReimpostaPasswordPage() {
  return (
    <Suspense fallback={<PageLoading variant="form" />}>
      <ReimpostaPasswordContent />
    </Suspense>
  );
}
