import type { ReactNode } from "react";
import AdminWorkspace from "@/components/admin/AdminWorkspace";
import "./admin.css";

export const metadata = { title: "Administration", robots: { index: false, follow: false } };

export default function AdminLayout({ children }: { children: ReactNode }) {
  return <AdminWorkspace>{children}</AdminWorkspace>;
}
