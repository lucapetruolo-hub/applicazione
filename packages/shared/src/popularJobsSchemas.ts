import { z } from "zod";
import "./zod";

/** Admin → "Lavori più cercati in home" (docs/changelog/2026-11-07-lavori-piu-cercati-home.md). */
export const popularJobInputSchema = z.object({
  service: z.string().trim().min(3).max(120),
  categorySlug: z.string().trim().min(2).max(40),
});
export type PopularJobInput = z.infer<typeof popularJobInputSchema>;

export const movePopularJobSchema = z.object({
  service: z.string().trim().min(3).max(120),
  direction: z.enum(["up", "down"]),
});
export type MovePopularJobInput = z.infer<typeof movePopularJobSchema>;
