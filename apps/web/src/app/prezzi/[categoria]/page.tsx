import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PricesView, loadPrices, pricesMetadata } from "./prices";

// "Quanto costa" in tutta Italia (docs/CHANGELOG.md §296): 404 sotto le soglie.
export const dynamic = "force-dynamic";

type PageParams = { categoria: string };

export async function generateMetadata({ params }: { params: PageParams }): Promise<Metadata> {
  return pricesMetadata(await loadPrices(params.categoria));
}

export default async function CategoryPricesPage({ params }: { params: PageParams }) {
  const data = await loadPrices(params.categoria);
  if (!data) notFound();
  return <PricesView data={data} />;
}
