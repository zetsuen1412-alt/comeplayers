import Link from "next/link";
export const metadata = { title: "Return to ComePlayers", robots: { index: false, follow: false } };
export default async function PaymentReturn({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const topup = typeof params.topup === "string" && /^[0-9a-f-]{36}$/i.test(params.topup) ? params.topup : "";
  const order = typeof params.order === "string" && /^\d{1,15}$/.test(params.order) ? params.order : "";
  const appLink = topup ? `comeplayers://commerce?topup=${topup}` : order ? `comeplayers://commerce?order=${order}` : "comeplayers://commerce";
  return <main className="flex min-h-[70vh] items-center justify-center px-5"><section className="w-full max-w-md rounded-3xl border border-white/10 bg-slate-900 p-8 text-center text-white"><p className="text-xs font-bold uppercase tracking-widest text-yellow-300">ComePlayers</p><h1 className="mt-4 text-3xl font-bold">Continue in the app</h1><p className="mt-4 leading-7 text-slate-300">Return to ComePlayers to check your payment. Your balance and order update after the payment provider confirms the transaction.</p><a href={appLink} className="mt-7 block rounded-xl bg-yellow-300 px-5 py-4 font-bold text-slate-950">Open ComePlayers</a><p className="mt-5 text-sm text-slate-400">If the app does not open, switch back to it and tap Check payment.</p><Link href={topup ? "/wallet/topup" : "/orders"} className="mt-5 inline-block text-sm text-sky-300">Continue on the website</Link></section></main>;
}
