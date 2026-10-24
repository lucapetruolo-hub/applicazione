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

export async function generateMetadata(props: { params: Promise<PageParams> }): Promise<Metadata> {
  return pricesMetadata(await load(await props.params));
}

export default async function CityPricesPage(props: { params: Promise<PageParams> }) {
  const data = await load(await props.params);
  if (!data) notFound();
  return <PricesView data={data} />;
}
