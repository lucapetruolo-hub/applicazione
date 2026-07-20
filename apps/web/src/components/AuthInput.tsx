"use client";

import type { ComponentProps, ReactNode } from "react";
import { Input, XStack } from "@professionisti/ui";

type AuthInputProps = ComponentProps<typeof Input> & {
  icon: ReactNode;
  rightElement?: ReactNode;
};

/** Campo di input con icona a sinistra ed elemento opzionale a destra (es. toggle occhio password). */
export function AuthInput({ icon, rightElement, size, ...inputProps }: AuthInputProps) {
  return (
    <XStack
      alignItems="center"
      borderWidth={1}
      borderColor="$borderColor"
      borderRadius="$4"
      backgroundColor="white"
      paddingHorizontal="$3"
      gap="$2"
    >
      {icon}
      <Input flex={1} size={size} borderWidth={0} backgroundColor="transparent" {...inputProps} />
      {rightElement}
    </XStack>
  );
}
