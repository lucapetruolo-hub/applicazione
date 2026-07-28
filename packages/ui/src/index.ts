export { tamaguiConfig } from "./config";
export type { AppTamaguiConfig } from "./config";
export { Button } from "./Button";
export { ProfessionalCard } from "./ProfessionalCard";
export { CategoryCard } from "./CategoryCard";
export { SearchBar } from "./SearchBar";
export type { SearchBarProps, ProfessionalSuggestion, SearchMode } from "./SearchBar";
export { Autocomplete } from "./Autocomplete";
export type { AutocompleteProps } from "./Autocomplete";
export { Hero } from "./Hero";
export type { HeroProps } from "./Hero";
export { IconFeature } from "./IconFeature";
export { CategoryChips } from "./CategoryChips";
export type { CategoryChip, CategoryChipsProps } from "./CategoryChips";
export { TestimonialCard } from "./TestimonialCard";
export type { TestimonialCardProps } from "./TestimonialCard";
export { Section } from "./Section";
export type { SectionProps, SectionTone } from "./Section";
export { Eyebrow } from "./Eyebrow";
export type { EyebrowProps } from "./Eyebrow";
export { brand, radiusDoc, radiusDocLg } from "./tokens";
export { Icon } from "./Icon";
export type { IconProps, IconName } from "./Icon";
export { Logo } from "./Logo";
export type { LogoProps } from "./Logo";
export { Surface } from "./Surface";
export { Chip } from "./Chip";
export type { ChipProps } from "./Chip";
export { Badge } from "./Badge";
export type { BadgeProps, BadgeVariant } from "./Badge";
export { Rating } from "./Rating";
export type { RatingProps } from "./Rating";
export { Field } from "./Field";
export type { FieldProps } from "./Field";
export { Avatar } from "./Avatar";
export type { AvatarProps } from "./Avatar";
export { EmptyState } from "./EmptyState";
export type { EmptyStateProps } from "./EmptyState";

// Tutte le primitive Tamagui usate da apps/web e apps/mobile vanno importate
// da qui, mai direttamente da "tamagui": apps/web e apps/mobile non
// dichiarano "tamagui" come propria dipendenza, solo packages/ui la
// dichiara. Importarla direttamente nelle app produce un'istanza del
// modulo diversa da quella in cui createTamagui() è stato eseguito (vedi
// CLAUDE.md §2), causando l'errore runtime "Can't find Tamagui configuration".
export {
  TamaguiProvider,
  Text,
  View,
  XStack,
  YStack,
  H1,
  H2,
  H3,
  Paragraph,
  Input,
  Card,
  Separator,
} from "tamagui";
