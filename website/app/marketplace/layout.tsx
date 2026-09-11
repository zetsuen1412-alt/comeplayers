import type { ReactNode } from "react";
import MarketplaceEntryGate from "./MarketplaceEntryGate";

export default function MarketplaceLayout({ children }: { children: ReactNode }) {
  return <MarketplaceEntryGate>{children}</MarketplaceEntryGate>;
}
