import type { Metadata } from "next";
import ChatClient from "./ChatClient";

export const metadata: Metadata = {
  title: "Chat",
  description:
    "Percakapan pribadi dan obrolan transaksi Anda di ComePlayers.",
};

export default function ChatPage() {
  return <ChatClient />;
}
