import type { Metadata } from "next";
import { Suspense } from "react";
import { ReimpostaPasswordContent } from "./ReimpostaPasswordContent";

export const metadata: Metadata = {
  title: "Nuova password",
  description: "Scegli una nuova password per il tuo account.",
};

export default function ReimpostaPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ReimpostaPasswordContent />
    </Suspense>
  );
}
