import { PageHeader } from "@/components/page-header";
import { employees } from "@/lib/demo-data";
import { translateWorkforceStatus } from "@/lib/labels";

export default function WorkforcePage(){return <><PageHeader eyebrow="Jadwal & kapasitas" title="Tenaga kerja" description="Ketersediaan, tim, keahlian, dan kapasitas membantu penugasan. Status online di browser tidak dianggap sebagai bukti ketersediaan kerja."/><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{employees.map(e=><div key={e.id} className="cp-card p-5"><div className="font-semibold">{e.name}</div><div className="mt-1 text-xs text-zinc-500">{e.code} · {e.team}</div><div className="mt-5 flex items-end justify-between"><div><div className="text-xs text-zinc-500">Beban kerja</div><div className="text-2xl font-semibold">{e.utilization}%</div></div><div className="rounded-full border border-zinc-700 px-2 py-1 text-xs uppercase">{translateWorkforceStatus(e.workforceStatus)}</div></div></div>)}</div></>}
