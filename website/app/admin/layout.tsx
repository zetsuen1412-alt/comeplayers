import type { ReactNode } from "react";
import AdminMobileNavigation from "./AdminMobileNavigation";

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <AdminMobileNavigation />
      {children}
    </>
  );
}
