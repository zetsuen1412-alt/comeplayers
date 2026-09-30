"use client";

import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
// Keep marketplace chrome and the assistant out of focused community entry bundles.
// Default SSR remains enabled on the routes where these components are visible.
const MainHeader = dynamic(() => import("./MainHeader"));
const AlexiaPet = dynamic(() => import("./AlexiaPet"));

type ConditionalChromeProps = {
  children: ReactNode;
  footer: ReactNode;
};

export default function ConditionalChrome({
  children,
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

  const communityOwnsChrome = focusedMessagesRoute || cpCommunityRoute;

  return (
    <>
      {!immersiveRoute && !communityOwnsChrome ? <MainHeader /> : null}
      {children}
      {!homeRoute && !pathname.startsWith("/admin") &&
      !focusedPaymentRoute &&
      !focusedChatRoute &&
      !focusedMessagesRoute &&
      !cpCommunityRoute ? (
        <AlexiaPet />
      ) : null}
      {!immersiveRoute && !focusedChatRoute && !communityOwnsChrome && footer}
    </>
  );
}

