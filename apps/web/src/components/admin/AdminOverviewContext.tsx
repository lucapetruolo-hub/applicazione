"use client";

import { createContext, useContext } from "react";
import type { AdminOverview } from "@professionisti/api-client";

/** Contatori dell'area admin condivisi tra menu e pagine (docs/CHANGELOG.md §144). */
export const AdminOverviewContext = createContext<{ overview: AdminOverview | null; refresh: () => void }>({
  overview: null,
  refresh: () => {},
});

export function useAdminOverview() {
  return useContext(AdminOverviewContext);
}
