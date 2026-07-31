import type { Metadata } from "next";
import { headers } from "next/headers";
import type { ReactNode } from "react";

import AdminAccessGate from "@/components/admin/AdminAccessGate";
import AdminSidebar from "@/components/admin/AdminSidebar";
import { isLocalAdminBypassHeaders } from "@/lib/server/adminAuth";

export const metadata: Metadata = {
  title: "Movie Buff CMS | Buff Games",
  description: "Manage the Movie Buff content library.",
};

export default async function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  const requestHeaders = await headers();
  const layout = (
    <div className="min-h-screen bg-black text-white">
      <AdminSidebar />

      <main className="min-h-screen lg:pl-72">
        {children}
      </main>
    </div>
  );

  if (isLocalAdminBypassHeaders(requestHeaders)) {
    return layout;
  }

  return <AdminAccessGate>{layout}</AdminAccessGate>;
}
