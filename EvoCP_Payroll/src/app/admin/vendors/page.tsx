import { PageHeader } from "@/components/page-header";
import { vendorRows } from "@/lib/demo-data";
import { formatMoney } from "@/lib/money";

export default function VendorsPage(){return <><PageHeader eyebrow="Pasokan" title="Vendor" description="Biaya dan keandalan vendor dicatat terpisah dari persediaan dan pendapatan pelanggan."/><div className="cp-card overflow-x-auto"><table className="cp-table"><thead><tr><th>Vendor</th><th>PO terbuka</th><th>Hutang vendor</th><th>Keandalan</th><th>Rata-rata pengiriman</th></tr></thead><tbody>{vendorRows.map(v=><tr key={v.code}><td className="font-semibold">{v.name}<div className="font-mono text-xs text-zinc-500">{v.code}</div></td><td>{v.openPo}</td><td>{formatMoney(v.payableMinor)}</td><td>{v.reliability}%</td><td>{v.avgDelivery}</td></tr>)}</tbody></table></div></>}
