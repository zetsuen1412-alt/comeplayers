"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import AlexiaPet from "./AlexiaPet";

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
  const homeRoute = pathname === "/";
  const focusedPaymentRoute = pathname.startsWith("/payment/");
  const focusedChatRoute = pathname.startsWith("/chat");
  const focusedMessagesRoute = pathname.startsWith("/messages");
  const cpCommunityRoute = pathname.startsWith("/cpcommunity");
  const immersiveRoute =
    pathname === "/" || pathname.startsWith("/admin") || focusedPaymentRoute;

  return (
    <>
      {!immersiveRoute && header}
      {children}
      {!homeRoute && !pathname.startsWith("/admin/payroll") &&
      !focusedPaymentRoute &&
      !focusedChatRoute &&
      !focusedMessagesRoute &&
      !cpCommunityRoute ? (
        <AlexiaPet />
      ) : null}
      {!immersiveRoute && !focusedChatRoute && footer}
    </>
  );
}
