// Copie piccole delle foto dei mestieri (public/category-photos/<mestiere>-<larghezza>.webp)
// per le schede della home, che prima scaricavano sempre la foto da 1536 px
// (collaudo N-08, docs/changelog/2026-10-30-velocita-telefono.md). Il loader
// delle immagini (src/lib/cloudinaryImageLoader.ts) sceglie la copia giusta.
// Da rifare quando si cambia una foto: `node scripts/riduci-foto-mestieri.mjs`.
import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

export const CATEGORY_PHOTO_WIDTHS = [480, 768, 1024];
const dir = fileURLToPath(new URL("../public/category-photos/", import.meta.url));

for (const file of readdirSync(dir).filter((name) => /^[a-z]+\.webp$/.test(name))) {
  for (const width of CATEGORY_PHOTO_WIDTHS) {
    const out = `${dir}${file.replace(".webp", `-${width}.webp`)}`;
    const info = await sharp(`${dir}${file}`).resize({ width, withoutEnlargement: true }).webp({ quality: 72 }).toFile(out);
    console.log(out.split("/").pop(), Math.round(info.size / 1024), "KB");
  }
}
