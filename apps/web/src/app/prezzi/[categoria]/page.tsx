import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PricesView, loadPrices, pricesMetadata } from "./prices";

// "Quanto costa" in tutta Italia (docs/CHANGELOG.md §296): 404 sotto le soglie.
export const dynamic = "force-dynamic";

type PageParams = { categoria: string };

export async function generateMetadata(props: { params: Promise<PageParams> }): Promise<Metadata> {
  const params = await props.params;
  return pricesMetadata(await loadPrices(params.categoria));
}

export default async function CategoryPricesPage(props: { params: Promise<PageParams> }) {
  const params = await props.params;
  const data = await loadPrices(params.categoria);
  if (!data) notFound();
  return <PricesView data={data} />;
}
