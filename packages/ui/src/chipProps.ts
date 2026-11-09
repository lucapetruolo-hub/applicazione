import type { ReactNode } from "react";

export type ChipProps = {
  children: ReactNode;
  selected?: boolean;
  onPress?: () => void;
};
