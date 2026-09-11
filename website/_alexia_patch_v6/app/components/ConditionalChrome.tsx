"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

type ConditionalChromeProps = {
  children: ReactNode;
  header: ReactNode;
  footer: ReactNode;
};

export default function ConditionalChrome({
  children,
  header,
  footer,
}: ConditionalChromeProps) {
  const pathname = usePathname();
  const immersiveHome = pathname === "/";

  return (
    <>
      {!immersiveHome && header}
      {children}
      {!immersiveHome && footer}
    </>
  );
}
