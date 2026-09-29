/** Chat screens own their message subscriptions and must keep local navigation state. */
export function shouldRefreshServerCatalog(pathname: string) {
  return !["/admin", "/messages", "/cpcommunity", "/comeplayers", "/chat", "/arcade"]
    .some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}
