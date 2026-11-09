// Tipi di Avatar in un file a parte: li usano sia Avatar.tsx (app) sia
// Avatar.web.tsx (sito), che non possono importarsi a vicenda.
export type AvatarProps = {
  name: string;
  imageUrl?: string | null;
  size?: number;
};
