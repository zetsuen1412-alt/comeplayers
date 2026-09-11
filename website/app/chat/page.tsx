import type { Metadata } from "next";
import ChatClient from "./ChatClient";

export const metadata: Metadata = {
  title: "Chat Customer & Seller | ComePlayers",
  description:
    "Secure transaction chat between ComePlayers customers and sellers.",
};

export default function ChatPage() {
  return <ChatClient />;
}
