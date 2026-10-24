import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { findComuneBySlug } from "@professionisti/shared";
import { PricesView, loadPrices, pricesMetadata } from "../prices";

// "Quanto costa" in una città, con i prezzi della sua provincia
// (docs/CHANGELOG.md §296): 404 sotto le soglie, come la pagina nazionale.
export const dynamic = "force-dynamic";

type PageParams = { categoria: string; citta: string };

async function load(params: PageParams) {
  const comune = findComuneBySlug(params.citta);
  return comune ? loadPrices(params.categoria, comune) : null;
}

export async function generateMetadata({ params }: { params: PageParams }): Promise<Metadata> {
  return pricesMetadata(await load(params));
}

export default async function CityPricesPage({ params }: { params: PageParams }) {
  const data = await load(params);
  if (!data) notFound();
  return <PricesView data={data} />;
}
