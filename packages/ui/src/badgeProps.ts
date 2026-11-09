import type { ReactNode } from "react";

export type BadgeVariant = "verificato" | "pro" | "urgente" | "nuovo";

export type BadgeProps = {
  variant: BadgeVariant;
  children: ReactNode;
};
