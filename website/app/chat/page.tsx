import type { Metadata } from "next";
import ChatClient from "./ChatClient";

export const metadata: Metadata = {
  title: "Chat Toko",
  description:
    "Percakapan pembeli dan penjual tentang produk dan pesanan di ComePlayers.",
};

export default function ChatPage() {
  return <ChatClient />;
}
