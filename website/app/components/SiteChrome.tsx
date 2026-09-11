"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import SiteFooter from "@/components/layout/SiteFooter";
import MainHeader from "./MainHeader";

export default function SiteChrome({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isPortal = pathname === "/";

  return (
    <>
      {!isPortal ? <MainHeader /> : null}
      {children}
      {!isPortal ? <SiteFooter /> : null}
    </>
  );
}
