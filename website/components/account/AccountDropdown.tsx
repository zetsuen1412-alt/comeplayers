"use client";

import Link from "next/link";
import { useState } from "react";
import { useCurrency } from "@/components/CurrencyProvider";
import { supabase } from "@/lib/supabase";

type AccountDropdownProps = {
  balance?: number;
};

export default function AccountDropdown({ balance = 0 }: AccountDropdownProps) {
  const { formatPrice } = useCurrency();
  const [open, setOpen] = useState(false);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.href = "/";
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex h-10 w-10 items-center justify-center rounded-full bg-cyan-400 font-black text-black"
      >
        U
      </button>

      {open ? (
        <div className="absolute right-0 z-50 mt-3 w-80 max-w-[calc(100vw-1.5rem)] rounded-2xl border border-white/10 bg-[#0b1220] p-4 shadow-2xl shadow-black">
          <div className="mb-4 flex items-center justify-between text-sm">
            <span className="text-slate-300">Available Balance</span>
            <strong>{formatPrice(balance)}</strong>
          </div>

          <Link
            href="/wallet/topup"
            className="mb-4 block rounded-xl bg-cyan-400 px-4 py-3 text-center text-sm font-bold text-black"
          >
            Top Up Wallet
          </Link>

          <nav className="space-y-1 text-sm">
            <Link className="block rounded-lg px-3 py-2 hover:bg-white/10" href="/buyer/orders">
              Purchase Orders
            </Link>
            <Link className="block rounded-lg px-3 py-2 hover:bg-white/10" href="/seller">
              Selling
            </Link>
            <Link className="block rounded-lg px-3 py-2 hover:bg-white/10" href="/account">
              Account
            </Link>
            <Link className="block rounded-lg px-3 py-2 hover:bg-white/10" href="/account/connects">
              Social Connect
            </Link>
            <Link className="block rounded-lg px-3 py-2 hover:bg-white/10" href="/account/security">
              Privacy & Security
            </Link>
            <Link className="block rounded-lg px-3 py-2 hover:bg-white/10" href="/account/verification">
              Verification
            </Link>
            <button
              type="button"
              onClick={handleLogout}
              className="block w-full rounded-lg px-3 py-2 text-left text-red-300 hover:bg-red-500/10"
            >
              Log Out
            </button>
          </nav>
        </div>
      ) : null}
    </div>
  );
}
