"use client";
import AdminOverview from "@/components/admin/AdminOverview";
import { useAdminWorkspace } from "@/components/admin/AdminWorkspace";

export default function AdminDashboardPage() {
  const workspace = useAdminWorkspace();
  return <AdminOverview {...workspace} />;
}
