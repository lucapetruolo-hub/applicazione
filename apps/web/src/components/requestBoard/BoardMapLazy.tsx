"use client";

import dynamic from "next/dynamic";
import styles from "./BoardPage.module.css";

/** La mappa dei "Lavori cercati" solo nel browser (analisi/bacheca-mappa-piano.md). */
export const BoardMapLazy = dynamic(() => import("./BoardMapSection").then((mod) => mod.BoardMapSection), {
  ssr: false,
  loading: () => <div className={styles.mapBox} aria-hidden="true" />,
});
