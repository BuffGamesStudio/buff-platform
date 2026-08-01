import { headers } from "next/headers";

import AdminSourcesClient from "@/app/admin/sources/AdminSourcesClient";
import { isLocalAdminBypassHeaders } from "@/lib/server/adminAuth";
import {
  listContentSources,
  type ContentSourceSummary,
} from "@/lib/server/contentSources";

export default async function AdminSourcesPage() {
  const requestHeaders = await headers();
  const localBypass = isLocalAdminBypassHeaders(requestHeaders);

  if (!localBypass) {
    return (
      <AdminSourcesClient
        initialSources={[]}
        initialLoaded={false}
      />
    );
  }

  let initialSources: ContentSourceSummary[] = [];
  let initialError: string | null = null;

  try {
    initialSources = await listContentSources();
  } catch (error) {
    initialError =
      error instanceof Error
        ? error.message
        : "Source registry data could not be loaded.";
  }

  return (
    <AdminSourcesClient
      initialSources={initialSources}
      initialError={initialError}
      initialLoaded
    />
  );
}
