import type { Metadata } from "next";
import { SicurezzaContent } from "./SicurezzaContent";

export const metadata: Metadata = {
  title: "Sicurezza e truffe",
  description: "Come usare la chat in sicurezza e riconoscere i tentativi di truffa e phishing.",
};

export default function SicurezzaPage() {
  return <SicurezzaContent />;
}
