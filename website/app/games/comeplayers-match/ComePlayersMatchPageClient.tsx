"use client";

import Link from "next/link";
import { FaArrowLeft, FaGamepad } from "react-icons/fa6";
import ComePlayersMatchGame from "@/components/arcade/ComePlayersMatchGame";

export default function ComePlayersMatchPageClient() {
  return (
    <main className="min-h-screen bg-black text-white">
      <div className="flex min-h-14 items-center justify-between border-b border-yellow-400/20 bg-[#05090e] px-4">
        <Link href="/cpcommunity" className="inline-flex items-center gap-2 text-xs font-black text-slate-300 transition hover:text-yellow-300">
          <FaArrowLeft /> Back to Messages
        </Link>
        <span className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-[.14em] text-yellow-300">
          <FaGamepad /> ComePlayers Match
        </span>
      </div>
      <div className="h-[calc(100dvh-3.5rem)] min-h-[650px]">
        <ComePlayersMatchGame best={0} onScore={() => undefined} />
      </div>
    </main>
  );
}
