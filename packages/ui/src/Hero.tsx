import type { ReactNode } from "react";
import { H1, Paragraph, YStack } from "tamagui";
import { SearchBar, type SearchBarProps } from "./SearchBar";

export type HeroProps = SearchBarProps & {
  title: string;
  subtitle: string;
  extra?: ReactNode;
};

export function Hero({ title, subtitle, extra, ...searchProps }: HeroProps) {
  return (
    <YStack
      width="100%"
      paddingVertical="$9"
      paddingHorizontal="$4"
      backgroundColor="$blue2"
      alignItems="center"
      gap="$5"
    >
      <YStack maxWidth={640} alignItems="center" gap="$2">
        <H1 textAlign="center" size="$10">
          {title}
        </H1>
        <Paragraph textAlign="center" color="$color10" size="$5">
          {subtitle}
        </Paragraph>
      </YStack>
      <YStack width="100%" maxWidth={680}>
        <SearchBar {...searchProps} />
      </YStack>
      {extra}
    </YStack>
  );
}
