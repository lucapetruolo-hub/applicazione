import type { Metadata } from "next";
import { PasswordDimenticataContent } from "./PasswordDimenticataContent";

export const metadata: Metadata = {
  title: "Password dimenticata",
  description: "Recupera l'accesso al tuo account.",
};

export default function PasswordDimenticataPage() {
  return <PasswordDimenticataContent />;
}
