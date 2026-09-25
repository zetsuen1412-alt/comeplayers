"use client";
import { useLiveQuery } from '@/lib/live/use-live-query';
import Link from "next/link";
import { useState } from "react";
import { FaWallet } from "react-icons/fa";
import { useCurrency } from "@/components/CurrencyProvider";
import { authenticatedFetchJson } from "@/lib/authenticatedFetch";

export default function WalletPaymentChoice({ selected, disabled, total, onSelect }: { selected: boolean; disabled: boolean; total: number; onSelect: () => void }) {
  const { formatIdrPrice } = useCurrency();
  const [wallet, setWallet] = useState<{ balance: string | number; status: string } | null>(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useLiveQuery(() => {
    let active = true;
    void authenticatedFetchJson<{ wallet: { balance: string | number; status: string } }>("/api/wallet/overview").then(data => { if (active) { setWallet(data.wallet); setError(""); } }).catch(() => { if (active) setError("Balance is temporarily unavailable."); });
    return () => { active = false; };
  }, [retry], {topics:'account'});
  const sufficient = wallet && Number(wallet.balance) >= total && wallet.status === "active";
  return <div style={{ border: selected ? "2px solid #00a7e4" : "1px solid #dae4f0", borderRadius: 14, padding: 18, margin: "18px 0", background: selected ? "#edfaff" : "#f9fbff", color: "#10233d" }}>
    <button type="button" onClick={onSelect} aria-pressed={selected} disabled={disabled || !sufficient} style={{ display: "flex", width: "100%", alignItems: "center", gap: 14, border: 0, background: "transparent", color: "inherit", textAlign: "left", cursor: disabled || !sufficient ? "not-allowed" : "pointer", opacity: disabled ? .6 : 1 }}><FaWallet size={24} color="#008ebc" /><span><strong>CPWallet</strong><span style={{ display: "block", fontSize: 13, marginTop: 5 }}>{wallet ? `Available: ${formatIdrPrice(wallet.balance)}` : error || "Loading balance…"}</span></span>{selected && <strong style={{ marginLeft: "auto", color: "#0087b9" }}>Selected</strong>}</button>
    {wallet && wallet.status !== "active" ? <p style={{ fontSize: 12 }}>Your CPWallet is frozen. Contact support for review.</p> : wallet && !sufficient ? <p style={{ fontSize: 12, marginBottom: 0 }}>Add {formatIdrPrice(Math.max(0, total - Number(wallet.balance)))} or more to pay this order. <Link href="/wallet/topup" target="_blank" rel="noopener noreferrer">Add funds</Link> · <button type="button" onClick={() => setRetry(value => value + 1)}>Refresh balance</button></p> : null}
    {error && <button type="button" onClick={() => setRetry(value => value + 1)}>Retry balance check</button>}
    {selected && <p style={{ fontSize: 12, marginBottom: 0 }}>Pay the full order total from your CPWallet. Your purchase stays protected by escrow.</p>}
  </div>;
}
